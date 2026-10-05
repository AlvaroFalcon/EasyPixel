import { compositeFrame } from './composite';
import { celKey, createDocument, createFrame, type SpriteDocument } from './document';
import { isCelEmpty, type PixelRegion } from './pixels';
import type { Color } from './color';

export interface SheetOptions {
  /** Frames per row. Defaults to all frames in a single row. */
  columns?: number;
  /** Pixels between frames. */
  spacing?: number;
  /** Pixels around the whole sheet. */
  margin?: number;
  /** Frame indices to include (default: all, in order). */
  frames?: number[];
}

export interface SheetLayout {
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  spacing: number;
  margin: number;
  width: number;
  height: number;
  /** One entry per included frame, in order. */
  cells: { frameIndex: number; x: number; y: number }[];
}

/**
 * Grid layout compatible with Godot's Sprite2D hframes/vframes and with
 * AtlasTexture regions (every cell has the same size).
 */
export function layoutSpritesheet(doc: SpriteDocument, opts: SheetOptions = {}): SheetLayout {
  const frames = opts.frames ?? doc.frames.map((_, i) => i);
  for (const i of frames) {
    if (!Number.isInteger(i) || i < 0 || i >= doc.frames.length) throw new Error(`Frame index out of range: ${i}`);
  }
  const spacing = Math.max(0, Math.floor(opts.spacing ?? 0));
  const margin = Math.max(0, Math.floor(opts.margin ?? 0));
  const count = Math.max(1, frames.length);
  const columns = Math.max(1, Math.min(count, Math.floor(opts.columns ?? count)));
  const rows = Math.ceil(count / columns);
  const cells = frames.map((frameIndex, n) => ({
    frameIndex,
    x: margin + (n % columns) * (doc.width + spacing),
    y: margin + Math.floor(n / columns) * (doc.height + spacing),
  }));
  return {
    frameWidth: doc.width,
    frameHeight: doc.height,
    columns,
    rows,
    spacing,
    margin,
    width: margin * 2 + columns * doc.width + (columns - 1) * spacing,
    height: margin * 2 + rows * doc.height + (rows - 1) * spacing,
    cells,
  };
}

export function renderSpritesheet(doc: SpriteDocument, layout: SheetLayout): PixelRegion {
  const data = new Uint8ClampedArray(layout.width * layout.height * 4);
  for (const cell of layout.cells) {
    const frame = compositeFrame(doc, cell.frameIndex);
    for (let y = 0; y < doc.height; y++) {
      const src = y * doc.width * 4;
      data.set(frame.subarray(src, src + doc.width * 4), ((cell.y + y) * layout.width + cell.x) * 4);
    }
  }
  return { width: layout.width, height: layout.height, data };
}

/** Nearest-neighbour upscale by an integer factor. */
export function scaleRegion(region: PixelRegion, factor: number): PixelRegion {
  const f = Math.max(1, Math.floor(factor));
  if (f === 1) return region;
  const width = region.width * f;
  const height = region.height * f;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (Math.floor(y / f) * region.width + Math.floor(x / f)) * 4;
      data.set(region.data.subarray(si, si + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

export interface SliceOptions {
  frameWidth: number;
  frameHeight: number;
  spacing?: number;
  margin?: number;
  /** Skip fully transparent cells (common at the end of a sheet). */
  skipEmpty?: boolean;
}

/** Cuts a sheet image into equally sized frames, row by row. */
export function sliceSpritesheet(image: PixelRegion, opts: SliceOptions): PixelRegion[] {
  const { frameWidth: fw, frameHeight: fh } = opts;
  if (!Number.isInteger(fw) || !Number.isInteger(fh) || fw < 1 || fh < 1) throw new Error('Invalid frame size');
  const spacing = opts.spacing ?? 0;
  const margin = opts.margin ?? 0;
  const out: PixelRegion[] = [];
  for (let y = margin; y + fh <= image.height - margin; y += fh + spacing) {
    for (let x = margin; x + fw <= image.width - margin; x += fw + spacing) {
      const data = new Uint8ClampedArray(fw * fh * 4);
      for (let row = 0; row < fh; row++) {
        const src = ((y + row) * image.width + x) * 4;
        data.set(image.data.subarray(src, src + fw * 4), row * fw * 4);
      }
      if (opts.skipEmpty && isCelEmpty(data)) continue;
      out.push({ width: fw, height: fh, data });
    }
  }
  return out;
}

/** Builds a one-layer document from frame images of equal size. */
export function documentFromFrames(name: string, frames: PixelRegion[], palette?: Color[]): SpriteDocument {
  if (frames.length === 0) throw new Error('No frames to import');
  const { width, height } = frames[0];
  const doc = createDocument({ name, width, height, palette });
  const layer = doc.layers[0];
  const docFrames = frames.map((_, i) => (i === 0 ? doc.frames[0] : createFrame()));
  const cels: SpriteDocument['cels'] = {};
  frames.forEach((f, i) => {
    if (f.width !== width || f.height !== height) throw new Error('All frames must have the same size');
    if (!isCelEmpty(f.data)) cels[celKey(layer.id, docFrames[i].id)] = new Uint8ClampedArray(f.data);
  });
  return { ...doc, frames: docFrames, cels };
}

/** Distinct opaque colors used in a region, in order of first appearance (max `limit`). */
export function extractColors(region: PixelRegion, limit = 256): Color[] {
  const seen = new Set<number>();
  const d = region.data;
  for (let i = 0; i < d.length && seen.size < limit; i += 4) {
    if (d[i + 3] === 0) continue;
    seen.add(((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0);
  }
  return [...seen];
}
