import { rgba, TRANSPARENT, type Color } from './color';
import type { CelData } from './document';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getPixel(data: CelData | undefined, width: number, x: number, y: number): Color {
  if (!data) return TRANSPARENT;
  const i = (y * width + x) * 4;
  return rgba(data[i], data[i + 1], data[i + 2], data[i + 3]);
}

/** Writes a pixel in place. Callers must own `data` (see copy-on-write in ops.ts). */
export function putPixel(data: CelData, width: number, x: number, y: number, c: Color): void {
  const i = (y * width + x) * 4;
  data[i] = (c >>> 24) & 255;
  data[i + 1] = (c >>> 16) & 255;
  data[i + 2] = (c >>> 8) & 255;
  data[i + 3] = c & 255;
}

export function isCelEmpty(data: CelData | undefined): boolean {
  if (!data) return true;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
  return true;
}

/** Clamps a rect to the canvas; returns null when nothing is left. */
export function clampRect(r: Rect, width: number, height: number): Rect | null {
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(width, r.x + r.width);
  const y1 = Math.min(height, r.y + r.height);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Rect spanning two corner points (inclusive). */
export function rectFromPoints(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(a.x - b.x) + 1, height: Math.abs(a.y - b.y) + 1 };
}

/** A detached block of pixels (used for selections and clipboard). */
export interface PixelRegion {
  width: number;
  height: number;
  data: CelData;
}

export function extractRegion(data: CelData | undefined, celWidth: number, r: Rect): PixelRegion {
  const out = new Uint8ClampedArray(r.width * r.height * 4);
  if (data) {
    for (let y = 0; y < r.height; y++) {
      const src = ((r.y + y) * celWidth + r.x) * 4;
      out.set(data.subarray(src, src + r.width * 4), y * r.width * 4);
    }
  }
  return { width: r.width, height: r.height, data: out };
}
