import { compositeFrame, type SpriteDocument } from '@easypixel/core';
import { useEffect, useRef } from 'react';
import { useEditor, type EditorState } from '../store/editor';
import { pointerDown, pointerMove, pointerUp } from '../store/tools';
import { fitToView, stepZoom, viewport } from '../store/view';

/** Space bar held = temporary hand tool. */
let spaceHeld = false;

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** Caches the flattened current frame so redraws that only move the view are cheap. */
function useFrameCache() {
  const cache = useRef<{ doc: SpriteDocument | null; frame: number; canvas: HTMLCanvasElement }>({
    doc: null,
    frame: -1,
    canvas: document.createElement('canvas'),
  });
  return (doc: SpriteDocument, frame: number): HTMLCanvasElement => {
    const c = cache.current;
    if (c.doc !== doc || c.frame !== frame) {
      c.doc = doc;
      c.frame = frame;
      c.canvas.width = doc.width;
      c.canvas.height = doc.height;
      const data = compositeFrame(doc, frame);
      c.canvas.getContext('2d')!.putImageData(new ImageData(data, doc.width, doc.height), 0, 0);
    }
    return c.canvas;
  };
}

function checkerPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 16;
  const t = tile.getContext('2d')!;
  t.fillStyle = '#d6d6dc';
  t.fillRect(0, 0, 16, 16);
  t.fillStyle = '#a9a9b3';
  t.fillRect(0, 0, 8, 8);
  t.fillRect(8, 8, 8, 8);
  return ctx.createPattern(tile, 'repeat')!;
}

function draw(canvas: HTMLCanvasElement, s: EditorState, frameCanvas: HTMLCanvasElement, checker: CanvasPattern): void {
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  const { doc, zoom, pan } = s;
  if (!pan) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  const w = doc.width * zoom;
  const h = doc.height * zoom;

  ctx.save();
  ctx.translate(pan.x, pan.y);
  ctx.fillStyle = checker;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frameCanvas, pan.x, pan.y, w, h);

  const px = 1 / dpr;
  // Pixel grid
  if (s.showGrid && zoom >= 6) {
    ctx.beginPath();
    for (let x = 1; x < doc.width; x++) {
      const gx = Math.round((pan.x + x * zoom) * dpr) / dpr + px / 2;
      ctx.moveTo(gx, pan.y);
      ctx.lineTo(gx, pan.y + h);
    }
    for (let y = 1; y < doc.height; y++) {
      const gy = Math.round((pan.y + y * zoom) * dpr) / dpr + px / 2;
      ctx.moveTo(pan.x, gy);
      ctx.lineTo(pan.x + w, gy);
    }
    ctx.strokeStyle = 'rgba(40, 40, 60, 0.18)';
    ctx.lineWidth = px;
    ctx.stroke();
  }

  // Canvas border
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(pan.x - 0.5, pan.y - 0.5, w + 1, h + 1);

  // Mirror axes
  if (s.mirrorX || s.mirrorY) {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(255, 90, 160, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (s.mirrorX) {
      ctx.moveTo(pan.x + w / 2, pan.y - 8);
      ctx.lineTo(pan.x + w / 2, pan.y + h + 8);
    }
    if (s.mirrorY) {
      ctx.moveTo(pan.x - 8, pan.y + h / 2);
      ctx.lineTo(pan.x + w + 8, pan.y + h / 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Selection (marching-ants style, static)
  if (s.selection) {
    const r = s.selection;
    const rx = pan.x + r.x * zoom + 0.5;
    const ry = pan.y + r.y * zoom + 0.5;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000';
    ctx.strokeRect(rx, ry, r.width * zoom - 1, r.height * zoom - 1);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(rx, ry, r.width * zoom - 1, r.height * zoom - 1);
    ctx.restore();
  }

  // Brush cursor
  if (s.cursor && s.tool !== 'pan' && s.tool !== 'select') {
    const size = s.tool === 'pencil' || s.tool === 'eraser' ? s.brushSize : 1;
    const off = Math.floor((size - 1) / 2);
    const cx = pan.x + (s.cursor.x - off) * zoom;
    const cy = pan.y + (s.cursor.y - off) * zoom;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.strokeRect(cx - 0.5, cy - 0.5, size * zoom + 1, size * zoom + 1);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeRect(cx + 0.5, cy + 0.5, size * zoom - 1, size * zoom - 1);
  }
}

export function CanvasView() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCache = useFrameCache();
  const tool = useEditor((s) => s.tool);

  // Rendering: redraw on any store change, at most once per animation frame.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const checker = checkerPattern(canvas.getContext('2d')!);
    let raf = 0;
    const render = () => {
      raf = 0;
      const s = useEditor.getState();
      if (!s.pan) {
        fitToView();
        return;
      }
      draw(canvas, s, frameCache(s.doc, s.frameIndex), checker);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(render);
    };
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      viewport.width = rect.width;
      viewport.height = rect.height;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      schedule();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    const unsubscribe = useEditor.subscribe(schedule);
    return () => {
      unsubscribe();
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Pointer handling
  useEffect(() => {
    const canvas = canvasRef.current!;
    let panning: { startX: number; startY: number; panX: number; panY: number } | null = null;

    const toSprite = (e: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      const { zoom, pan } = useEditor.getState();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      return {
        screen: { x: sx, y: sy },
        p: { x: Math.floor((sx - (pan?.x ?? 0)) / zoom), y: Math.floor((sy - (pan?.y ?? 0)) / zoom) },
      };
    };

    const onDown = (e: PointerEvent) => {
      const { tool, pan } = useEditor.getState();
      canvas.setPointerCapture(e.pointerId);
      if (e.button === 1 || spaceHeld || tool === 'pan') {
        panning = { startX: e.clientX, startY: e.clientY, panX: pan?.x ?? 0, panY: pan?.y ?? 0 };
        canvas.classList.add('panning');
        return;
      }
      if (e.button !== 0 && e.button !== 2) return;
      pointerDown({ p: toSprite(e).p, button: e.button, shift: e.shiftKey, alt: e.altKey });
    };

    const onMove = (e: PointerEvent) => {
      if (panning) {
        useEditor.setState({
          pan: { x: panning.panX + e.clientX - panning.startX, y: panning.panY + e.clientY - panning.startY },
        });
        return;
      }
      const { p } = toSprite(e);
      const s = useEditor.getState();
      const inside = p.x >= 0 && p.y >= 0 && p.x < s.doc.width && p.y < s.doc.height;
      const cursor = inside ? p : null;
      if (cursor?.x !== s.cursor?.x || cursor?.y !== s.cursor?.y) useEditor.setState({ cursor });
      pointerMove({ p, button: e.button, shift: e.shiftKey, alt: e.altKey });
    };

    const onUp = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (panning) {
        panning = null;
        canvas.classList.remove('panning');
        return;
      }
      pointerUp();
    };

    const onLeave = () => useEditor.setState({ cursor: null });

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        stepZoom(e.deltaY < 0 ? 1 : -1, toSprite(e).screen);
      } else {
        const { pan } = useEditor.getState();
        if (pan) useEditor.setState({ pan: { x: pan.x - e.deltaX, y: pan.y - e.deltaY } });
      }
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target)) {
        spaceHeld = true;
        canvas.classList.add('pan-ready');
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeld = false;
        canvas.classList.remove('pan-ready');
      }
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className={`canvas tool-${tool}`} data-testid="canvas" />
    </div>
  );
}
