import {
  celKey,
  compositeFrame,
  ellipsePoints,
  floodFillPoints,
  getPixel,
  inBounds,
  linePoints,
  mirrorPoints,
  paintPoints,
  rectFromPoints,
  rectPoints,
  TRANSPARENT,
  type Color,
  type Point,
  type Rect,
  type SpriteDocument,
} from '@easypixel/core';
import { t } from '../strings';
import {
  cancelPreview,
  commit,
  commitPreview,
  liftSelection,
  moveFloating,
  notify,
  preview,
  setSelection,
  settleFloating,
  useEditor,
  type ToolId,
} from './editor';

/**
 * Pointer-driven tool behaviour. The canvas forwards pointer events in sprite
 * coordinates; strokes and shapes are previewed live and committed as a single
 * undo step on pointer up.
 */

export interface PointerInfo {
  /** Sprite pixel under the pointer (may be outside the canvas). */
  p: Point;
  /** 0 = left/primary color, 2 = right/secondary color. */
  button: number;
  shift: boolean;
  alt: boolean;
}

type Session =
  | { kind: 'stroke'; base: SpriteDocument; points: Point[]; color: Color; label: string }
  | { kind: 'shape'; base: SpriteDocument; start: Point; color: Color; tool: 'line' | 'rect' | 'ellipse' }
  | { kind: 'eyedropper'; button: number }
  | { kind: 'select'; start: Point }
  | { kind: 'move'; start: Point; origin: Point };

let session: Session | null = null;

const get = useEditor.getState;

export const TOOL_ORDER: ToolId[] = ['pencil', 'eraser', 'bucket', 'line', 'rect', 'ellipse', 'eyedropper', 'select', 'pan'];

export const TOOL_SHORTCUTS: Record<string, ToolId> = {
  b: 'pencil',
  e: 'eraser',
  g: 'bucket',
  l: 'line',
  u: 'rect',
  o: 'ellipse',
  i: 'eyedropper',
  m: 'select',
  h: 'pan',
};

export function isDrawing(): boolean {
  return session !== null;
}

function activeIds() {
  const s = get();
  return { layerId: s.layerId, frameId: s.doc.frames[s.frameIndex].id };
}

function colorFor(button: number): Color {
  const s = get();
  return button === 2 ? s.secondary : s.primary;
}

/** Drawing is clipped to the selection when there is one. */
function clipToSelection(points: Point[]): Point[] {
  const sel = get().selection;
  if (!sel || get().floating) return points;
  return points.filter((p) => p.x >= sel.x && p.y >= sel.y && p.x < sel.x + sel.width && p.y < sel.y + sel.height);
}

/** Removes the middle pixel of "L" corners so freehand lines stay 1px thin. */
export function pixelPerfect(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(p);
    if (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      const corner = (a.x === b.x || a.y === b.y) && (c.x === b.x || c.y === b.y) && a.x !== c.x && a.y !== c.y;
      if (corner) out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/** Expands each point to a square brush and applies mirroring. */
function brushFootprint(points: Point[]): Point[] {
  const { brushSize, mirrorX, mirrorY, doc } = get();
  let out = points;
  if (brushSize > 1) {
    const off = Math.floor((brushSize - 1) / 2);
    const seen = new Set<string>();
    out = [];
    for (const p of points) {
      for (let dy = 0; dy < brushSize; dy++) {
        for (let dx = 0; dx < brushSize; dx++) {
          const q = { x: p.x - off + dx, y: p.y - off + dy };
          const k = `${q.x},${q.y}`;
          if (!seen.has(k)) {
            seen.add(k);
            out.push(q);
          }
        }
      }
    }
  }
  return mirrorPoints(out, doc.width, doc.height, mirrorX, mirrorY);
}

function renderStroke(s: Extract<Session, { kind: 'stroke' }>): void {
  const { pixelPerfect: pp, brushSize } = get();
  const path = pp && brushSize === 1 ? pixelPerfect(s.points) : s.points;
  const { layerId, frameId } = activeIds();
  try {
    preview(paintPoints(s.base, layerId, frameId, clipToSelection(brushFootprint(path)), s.color));
  } catch (e) {
    session = null;
    cancelPreview();
    notify((e as Error).message, 'error');
  }
}

function constrain(start: Point, p: Point, tool: 'line' | 'rect' | 'ellipse'): Point {
  const dx = p.x - start.x;
  const dy = p.y - start.y;
  if (tool === 'line') {
    // Snap to horizontal, vertical or 45°.
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx > ady * 2) return { x: p.x, y: start.y };
    if (ady > adx * 2) return { x: start.x, y: p.y };
    const d = Math.max(adx, ady);
    return { x: start.x + Math.sign(dx) * d, y: start.y + Math.sign(dy) * d };
  }
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + (Math.sign(dx) || 1) * d, y: start.y + (Math.sign(dy) || 1) * d };
}

function renderShape(s: Extract<Session, { kind: 'shape' }>, p: Point, shift: boolean): void {
  const end = shift ? constrain(s.start, p, s.tool) : p;
  const filled = get().shapeFilled;
  const pts =
    s.tool === 'line'
      ? linePoints(s.start, end)
      : s.tool === 'rect'
        ? rectPoints(s.start, end, filled)
        : ellipsePoints(s.start, end, filled);
  const { layerId, frameId } = activeIds();
  const { mirrorX, mirrorY, doc } = get();
  try {
    preview(paintPoints(s.base, layerId, frameId, clipToSelection(mirrorPoints(pts, doc.width, doc.height, mirrorX, mirrorY)), s.color));
  } catch (e) {
    session = null;
    cancelPreview();
    notify((e as Error).message, 'error');
  }
}

function pickColor(p: Point, button: number): void {
  const { doc, frameIndex } = get();
  if (!inBounds(doc, p.x, p.y)) return;
  const color = getPixel(compositeFrame(doc, frameIndex), doc.width, p.x, p.y);
  useEditor.setState(button === 2 ? { secondary: color } : { primary: color });
}

function insideRect(p: Point, r: Rect | null): boolean {
  return !!r && p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;
}

export function pointerDown(info: PointerInfo, tool: ToolId = get().tool): void {
  const { p, button } = info;
  if (session) return;

  // Alt + click picks a color with any drawing tool.
  if (info.alt && tool !== 'select' && tool !== 'pan') tool = 'eyedropper';

  switch (tool) {
    case 'pencil':
    case 'eraser': {
      settleFloating();
      const color = tool === 'eraser' ? TRANSPARENT : colorFor(button);
      const s: Session = {
        kind: 'stroke',
        base: get().history.present.doc,
        points: [p],
        color,
        label: t.tools[tool],
      };
      session = s;
      renderStroke(s);
      break;
    }
    case 'line':
    case 'rect':
    case 'ellipse': {
      settleFloating();
      const s: Session = { kind: 'shape', base: get().history.present.doc, start: p, color: colorFor(button), tool };
      session = s;
      renderShape(s, p, info.shift);
      break;
    }
    case 'bucket': {
      const { doc, layerId, fillContiguous } = get();
      if (!inBounds(doc, p.x, p.y)) return;
      const { frameId } = activeIds();
      const color = colorFor(button);
      commit((d) => {
        const pts = floodFillPoints(d.cels[celKey(layerId, frameId)], d.width, d.height, p.x, p.y, fillContiguous);
        return paintPoints(d, layerId, frameId, clipToSelection(pts), color);
      }, t.tools.bucket);
      break;
    }
    case 'eyedropper':
      session = { kind: 'eyedropper', button };
      pickColor(p, button);
      break;
    case 'select': {
      const s = get();
      if (s.floating && insideRect(p, s.selection)) {
        session = { kind: 'move', start: p, origin: { x: s.floating.x, y: s.floating.y } };
      } else if (!s.floating && insideRect(p, s.selection) && liftSelection()) {
        session = { kind: 'move', start: p, origin: { x: s.selection!.x, y: s.selection!.y } };
      } else {
        settleFloating();
        session = { kind: 'select', start: p };
        setSelection(rectFromPoints(p, p));
      }
      break;
    }
    case 'pan':
      break;
  }
}

export function pointerMove(info: PointerInfo): void {
  const s = session;
  if (!s) return;
  const { p } = info;
  switch (s.kind) {
    case 'stroke': {
      const last = s.points[s.points.length - 1];
      if (last.x === p.x && last.y === p.y) return;
      s.points.push(...linePoints(last, p).slice(1));
      renderStroke(s);
      break;
    }
    case 'shape':
      renderShape(s, p, info.shift);
      break;
    case 'eyedropper':
      pickColor(p, s.button);
      break;
    case 'select':
      setSelection(rectFromPoints(s.start, p));
      break;
    case 'move':
      moveFloating(s.origin.x + p.x - s.start.x, s.origin.y + p.y - s.start.y);
      break;
  }
}

export function pointerUp(): void {
  const s = session;
  session = null;
  if (!s) return;
  switch (s.kind) {
    case 'stroke':
      commitPreview(s.label);
      break;
    case 'shape':
      commitPreview(t.tools[s.tool]);
      break;
    case 'select': {
      // A plain click (no drag) clears the selection.
      const sel = get().selection;
      if (sel && sel.width === 1 && sel.height === 1) setSelection(null);
      break;
    }
    default:
      break;
  }
}

/** Aborts an in-progress stroke/shape (e.g. Escape pressed mid-drag). */
export function cancelSession(): boolean {
  if (!session) return false;
  if (session.kind === 'stroke' || session.kind === 'shape') cancelPreview();
  session = null;
  return true;
}
