/**
 * Pure document operations. Every function returns a new SpriteDocument and
 * never mutates its input; untouched layers, frames and cels are shared with
 * the previous document. This is what makes undo/redo a simple list of
 * documents (see history.ts), for edits made by the user and by Claude alike.
 */
import { TRANSPARENT, type Color } from './color';
import {
  assertCanvasSize,
  celKey,
  createCel,
  createFrame,
  createLayer,
  frameIndex,
  layerIndex,
  newId,
  type CelData,
  type Frame,
  type Layer,
  type SpriteDocument,
  type Tag,
} from './document';
import { clampRect, extractRegion, isCelEmpty, putPixel, type PixelRegion, type Point, type Rect } from './pixels';

// ---------------------------------------------------------------------------
// Pixels
// ---------------------------------------------------------------------------

export interface PixelWrite extends Point {
  color: Color;
}

/** Returns a copy of the cel (or a new empty one) that the caller may mutate. */
export function cloneCel(doc: SpriteDocument, layerId: string, frameId: string): CelData {
  const existing = doc.cels[celKey(layerId, frameId)];
  return existing ? new Uint8ClampedArray(existing) : createCel(doc.width, doc.height);
}

/** Replaces a cel's data. Empty cels are dropped to keep documents small. */
export function withCel(doc: SpriteDocument, layerId: string, frameId: string, data: CelData): SpriteDocument {
  const key = celKey(layerId, frameId);
  const cels = { ...doc.cels };
  if (isCelEmpty(data)) delete cels[key];
  else cels[key] = data;
  return { ...doc, cels };
}

function assertEditable(doc: SpriteDocument, layerId: string, frameId: string): void {
  const layer = doc.layers[layerIndex(doc, layerId)];
  frameIndex(doc, frameId);
  if (layer.locked) throw new Error(`Layer "${layer.name}" is locked`);
}

/** Writes pixels (replace mode, no blending). Out-of-bounds pixels are ignored. */
export function setPixels(
  doc: SpriteDocument,
  layerId: string,
  frameId: string,
  pixels: Iterable<PixelWrite>,
): SpriteDocument {
  assertEditable(doc, layerId, frameId);
  const data = cloneCel(doc, layerId, frameId);
  for (const p of pixels) {
    if (p.x < 0 || p.y < 0 || p.x >= doc.width || p.y >= doc.height) continue;
    putPixel(data, doc.width, p.x, p.y, p.color);
  }
  return withCel(doc, layerId, frameId, data);
}

/** Paints the same color on a set of points. */
export function paintPoints(
  doc: SpriteDocument,
  layerId: string,
  frameId: string,
  points: Iterable<Point>,
  color: Color,
): SpriteDocument {
  const writes: PixelWrite[] = [];
  for (const p of points) writes.push({ x: p.x, y: p.y, color });
  return setPixels(doc, layerId, frameId, writes);
}

export function clearCel(doc: SpriteDocument, layerId: string, frameId: string, rect?: Rect): SpriteDocument {
  assertEditable(doc, layerId, frameId);
  if (!rect) return withCel(doc, layerId, frameId, createCel(doc.width, doc.height));
  const r = clampRect(rect, doc.width, doc.height);
  if (!r) return doc;
  const data = cloneCel(doc, layerId, frameId);
  for (let y = r.y; y < r.y + r.height; y++) {
    data.fill(0, (y * doc.width + r.x) * 4, (y * doc.width + r.x + r.width) * 4);
  }
  return withCel(doc, layerId, frameId, data);
}

/**
 * Stamps a region at (x, y). With `skipTransparent`, transparent source pixels
 * leave the destination untouched (how pasted/moved selections behave).
 */
export function pasteRegion(
  doc: SpriteDocument,
  layerId: string,
  frameId: string,
  region: PixelRegion,
  x: number,
  y: number,
  skipTransparent = true,
): SpriteDocument {
  assertEditable(doc, layerId, frameId);
  const data = cloneCel(doc, layerId, frameId);
  for (let ry = 0; ry < region.height; ry++) {
    const ty = y + ry;
    if (ty < 0 || ty >= doc.height) continue;
    for (let rx = 0; rx < region.width; rx++) {
      const tx = x + rx;
      if (tx < 0 || tx >= doc.width) continue;
      const si = (ry * region.width + rx) * 4;
      if (skipTransparent && region.data[si + 3] === 0) continue;
      const di = (ty * doc.width + tx) * 4;
      data[di] = region.data[si];
      data[di + 1] = region.data[si + 1];
      data[di + 2] = region.data[si + 2];
      data[di + 3] = region.data[si + 3];
    }
  }
  return withCel(doc, layerId, frameId, data);
}

export function copyRegion(doc: SpriteDocument, layerId: string, frameId: string, rect: Rect): PixelRegion | null {
  const r = clampRect(rect, doc.width, doc.height);
  if (!r) return null;
  return extractRegion(doc.cels[celKey(layerId, frameId)], doc.width, r);
}

export function flipCel(
  doc: SpriteDocument,
  layerId: string,
  frameId: string,
  axis: 'horizontal' | 'vertical',
): SpriteDocument {
  assertEditable(doc, layerId, frameId);
  const src = doc.cels[celKey(layerId, frameId)];
  if (!src) return doc;
  const { width: w, height: h } = doc;
  const out = createCel(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = axis === 'horizontal' ? w - 1 - x : x;
      const sy = axis === 'vertical' ? h - 1 - y : y;
      const si = (sy * w + sx) * 4;
      out.set(src.subarray(si, si + 4), (y * w + x) * 4);
    }
  }
  return withCel(doc, layerId, frameId, out);
}

/** Moves the cel content by (dx, dy); pixels wrap around when `wrap` is set. */
export function shiftCel(
  doc: SpriteDocument,
  layerId: string,
  frameId: string,
  dx: number,
  dy: number,
  wrap = false,
): SpriteDocument {
  assertEditable(doc, layerId, frameId);
  const src = doc.cels[celKey(layerId, frameId)];
  if (!src) return doc;
  const { width: w, height: h } = doc;
  const out = createCel(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let tx = x + dx;
      let ty = y + dy;
      if (wrap) {
        tx = ((tx % w) + w) % w;
        ty = ((ty % h) + h) % h;
      } else if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      const si = (y * w + x) * 4;
      out.set(src.subarray(si, si + 4), (ty * w + tx) * 4);
    }
  }
  return withCel(doc, layerId, frameId, out);
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

export type Anchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';

/** Changes the canvas size keeping the content anchored (no scaling). */
export function resizeCanvas(doc: SpriteDocument, width: number, height: number, anchor: Anchor = 'center'): SpriteDocument {
  assertCanvasSize(width, height);
  const col = anchor.includes('left') ? 0 : anchor.includes('right') ? 2 : 1;
  const row = anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? 2 : 1;
  const ox = Math.floor(((width - doc.width) * col) / 2);
  const oy = Math.floor(((height - doc.height) * row) / 2);
  const cels: Record<string, CelData> = {};
  for (const [key, src] of Object.entries(doc.cels)) {
    const out = createCel(width, height);
    for (let y = 0; y < doc.height; y++) {
      const ty = y + oy;
      if (ty < 0 || ty >= height) continue;
      for (let x = 0; x < doc.width; x++) {
        const tx = x + ox;
        if (tx < 0 || tx >= width) continue;
        const si = (y * doc.width + x) * 4;
        out.set(src.subarray(si, si + 4), (ty * width + tx) * 4);
      }
    }
    if (!isCelEmpty(out)) cels[key] = out;
  }
  return { ...doc, width, height, cels };
}

export function renameDocument(doc: SpriteDocument, name: string): SpriteDocument {
  return { ...doc, name };
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

export function addLayer(doc: SpriteDocument, name?: string, index?: number): { doc: SpriteDocument; layer: Layer } {
  const layer = createLayer(name ?? nextName(doc.layers.map((l) => l.name), 'Layer'));
  const layers = [...doc.layers];
  layers.splice(index ?? layers.length, 0, layer);
  return { doc: { ...doc, layers }, layer };
}

export function removeLayer(doc: SpriteDocument, layerId: string): SpriteDocument {
  if (doc.layers.length <= 1) throw new Error('A sprite needs at least one layer');
  layerIndex(doc, layerId);
  const cels = { ...doc.cels };
  for (const f of doc.frames) delete cels[celKey(layerId, f.id)];
  return { ...doc, layers: doc.layers.filter((l) => l.id !== layerId), cels };
}

export function updateLayer(
  doc: SpriteDocument,
  layerId: string,
  patch: Partial<Omit<Layer, 'id'>>,
): SpriteDocument {
  const i = layerIndex(doc, layerId);
  const layers = [...doc.layers];
  const next = { ...layers[i], ...patch };
  next.opacity = Math.min(1, Math.max(0, next.opacity));
  layers[i] = next;
  return { ...doc, layers };
}

export function moveLayer(doc: SpriteDocument, layerId: string, toIndex: number): SpriteDocument {
  const from = layerIndex(doc, layerId);
  const to = Math.max(0, Math.min(doc.layers.length - 1, toIndex));
  if (from === to) return doc;
  const layers = [...doc.layers];
  const [layer] = layers.splice(from, 1);
  layers.splice(to, 0, layer);
  return { ...doc, layers };
}

export function duplicateLayer(doc: SpriteDocument, layerId: string): { doc: SpriteDocument; layer: Layer } {
  const i = layerIndex(doc, layerId);
  const src = doc.layers[i];
  const layer: Layer = { ...src, id: newId('layer'), name: `${src.name} copy` };
  const layers = [...doc.layers];
  layers.splice(i + 1, 0, layer);
  const cels = { ...doc.cels };
  // Cel buffers are immutable, so the copy can share them.
  for (const f of doc.frames) {
    const data = doc.cels[celKey(layerId, f.id)];
    if (data) cels[celKey(layer.id, f.id)] = data;
  }
  return { doc: { ...doc, layers, cels }, layer };
}

/** Composites `layerId` onto the layer right below it and removes it. */
export function mergeLayerDown(doc: SpriteDocument, layerId: string): SpriteDocument {
  const i = layerIndex(doc, layerId);
  if (i === 0) throw new Error('There is no layer below to merge into');
  const top = doc.layers[i];
  const bottom = doc.layers[i - 1];
  let next = doc;
  for (const f of doc.frames) {
    const src = doc.cels[celKey(top.id, f.id)];
    if (!src || !top.visible) continue;
    const dst = cloneCel(next, bottom.id, f.id);
    blendInto(dst, src, top.opacity);
    next = withCel(next, bottom.id, f.id, dst);
  }
  return removeLayer(next, top.id);
}

/** Source-over composition of `src` into `dst` (in place). */
export function blendInto(dst: CelData, src: CelData, opacity: number): void {
  for (let i = 0; i < dst.length; i += 4) {
    const sa = (src[i + 3] / 255) * opacity;
    if (sa <= 0) continue;
    const da = dst[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    for (let c = 0; c < 3; c++) {
      dst[i + c] = Math.round((src[i + c] * sa + dst[i + c] * da * (1 - sa)) / oa);
    }
    dst[i + 3] = Math.round(oa * 255);
  }
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/** Keeps tag ranges pointing at the same frames after inserting a frame at `index`. */
function shiftTagsForInsert(tags: Tag[], index: number): Tag[] {
  return tags.map((t) => ({
    ...t,
    from: t.from >= index ? t.from + 1 : t.from,
    to: t.to >= index ? t.to + 1 : t.to,
  }));
}

function shiftTagsForRemove(tags: Tag[], index: number): Tag[] {
  return tags
    .filter((t) => !(t.from === index && t.to === index))
    .map((t) => ({
      ...t,
      from: t.from > index ? t.from - 1 : t.from,
      to: t.to >= index ? t.to - 1 : t.to,
    }));
}

export function addFrame(doc: SpriteDocument, index?: number, duration?: number): { doc: SpriteDocument; frame: Frame } {
  const at = index ?? doc.frames.length;
  const frame = createFrame(duration ?? doc.frames[Math.max(0, at - 1)]?.duration);
  const frames = [...doc.frames];
  frames.splice(at, 0, frame);
  return { doc: { ...doc, frames, tags: shiftTagsForInsert(doc.tags, at) }, frame };
}

/** Inserts a copy of the frame (all layers) right after it. */
export function duplicateFrame(doc: SpriteDocument, frameId: string): { doc: SpriteDocument; frame: Frame } {
  const i = frameIndex(doc, frameId);
  const frame = createFrame(doc.frames[i].duration);
  const frames = [...doc.frames];
  frames.splice(i + 1, 0, frame);
  const cels = { ...doc.cels };
  for (const l of doc.layers) {
    const data = doc.cels[celKey(l.id, frameId)];
    if (data) cels[celKey(l.id, frame.id)] = data;
  }
  // The copy lands inside any tag that ends at the source frame.
  const tags = shiftTagsForInsert(doc.tags, i + 1).map((t) => (t.to === i ? { ...t, to: i + 1 } : t));
  return { doc: { ...doc, frames, cels, tags }, frame };
}

export function removeFrame(doc: SpriteDocument, frameId: string): SpriteDocument {
  if (doc.frames.length <= 1) throw new Error('A sprite needs at least one frame');
  const i = frameIndex(doc, frameId);
  const cels = { ...doc.cels };
  for (const l of doc.layers) delete cels[celKey(l.id, frameId)];
  return {
    ...doc,
    frames: doc.frames.filter((f) => f.id !== frameId),
    cels,
    tags: shiftTagsForRemove(doc.tags, i),
  };
}

export function moveFrame(doc: SpriteDocument, frameId: string, toIndex: number): SpriteDocument {
  const from = frameIndex(doc, frameId);
  const to = Math.max(0, Math.min(doc.frames.length - 1, toIndex));
  if (from === to) return doc;
  const frames = [...doc.frames];
  const [frame] = frames.splice(from, 1);
  frames.splice(to, 0, frame);
  return { ...doc, frames };
}

export function setFrameDuration(doc: SpriteDocument, frameId: string, duration: number): SpriteDocument {
  if (!Number.isFinite(duration) || duration < 1) throw new Error('Frame duration must be >= 1 ms');
  const i = frameIndex(doc, frameId);
  const frames = [...doc.frames];
  frames[i] = { ...frames[i], duration: Math.round(duration) };
  return { ...doc, frames };
}

// ---------------------------------------------------------------------------
// Tags (named animations)
// ---------------------------------------------------------------------------

function assertTagRange(doc: SpriteDocument, from: number, to: number): void {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to >= doc.frames.length) {
    throw new Error(`Invalid frame range ${from}..${to} (sprite has ${doc.frames.length} frames)`);
  }
}

export function addTag(
  doc: SpriteDocument,
  tag: Omit<Tag, 'id' | 'direction' | 'loop'> & Partial<Pick<Tag, 'direction' | 'loop'>>,
): { doc: SpriteDocument; tag: Tag } {
  assertTagRange(doc, tag.from, tag.to);
  if (doc.tags.some((t) => t.name === tag.name)) throw new Error(`An animation named "${tag.name}" already exists`);
  const created: Tag = { direction: 'forward', loop: true, ...tag, id: newId('anim') };
  return { doc: { ...doc, tags: [...doc.tags, created] }, tag: created };
}

export function updateTag(doc: SpriteDocument, tagId: string, patch: Partial<Omit<Tag, 'id'>>): SpriteDocument {
  const i = doc.tags.findIndex((t) => t.id === tagId);
  if (i < 0) throw new Error(`Animation not found: ${tagId}`);
  const next = { ...doc.tags[i], ...patch };
  assertTagRange(doc, next.from, next.to);
  if (patch.name && doc.tags.some((t) => t.id !== tagId && t.name === patch.name)) {
    throw new Error(`An animation named "${patch.name}" already exists`);
  }
  const tags = [...doc.tags];
  tags[i] = next;
  return { ...doc, tags };
}

export function removeTag(doc: SpriteDocument, tagId: string): SpriteDocument {
  return { ...doc, tags: doc.tags.filter((t) => t.id !== tagId) };
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export function setPalette(doc: SpriteDocument, palette: Color[]): SpriteDocument {
  return { ...doc, palette: [...palette] };
}

export function addPaletteColor(doc: SpriteDocument, color: Color): SpriteDocument {
  if (doc.palette.includes(color)) return doc;
  return { ...doc, palette: [...doc.palette, color] };
}

export function updatePaletteColor(doc: SpriteDocument, index: number, color: Color): SpriteDocument {
  if (index < 0 || index >= doc.palette.length) throw new Error(`Palette index out of range: ${index}`);
  const palette = [...doc.palette];
  palette[index] = color;
  return { ...doc, palette };
}

export function removePaletteColor(doc: SpriteDocument, index: number): SpriteDocument {
  return { ...doc, palette: doc.palette.filter((_, i) => i !== index) };
}

/** Replaces every occurrence of `from` with `to` in all cels (useful after editing a palette entry). */
export function replaceColor(doc: SpriteDocument, from: Color, to: Color): SpriteDocument {
  if (from === to) return doc;
  const fr = (from >>> 24) & 255, fg = (from >>> 16) & 255, fb = (from >>> 8) & 255, fa = from & 255;
  const cels: Record<string, CelData> = {};
  for (const [key, src] of Object.entries(doc.cels)) {
    let out: CelData | null = null;
    for (let i = 0; i < src.length; i += 4) {
      const matches = from === TRANSPARENT ? src[i + 3] === 0 : src[i] === fr && src[i + 1] === fg && src[i + 2] === fb && src[i + 3] === fa;
      if (!matches) continue;
      out ??= new Uint8ClampedArray(src);
      out[i] = (to >>> 24) & 255;
      out[i + 1] = (to >>> 16) & 255;
      out[i + 2] = (to >>> 8) & 255;
      out[i + 3] = to & 255;
    }
    if (!out) cels[key] = src;
    else if (!isCelEmpty(out)) cels[key] = out;
  }
  return { ...doc, cels };
}

// ---------------------------------------------------------------------------

function nextName(existing: string[], base: string): string {
  let n = existing.length + 1;
  while (existing.includes(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}
