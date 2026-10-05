import type { CelData } from './document';
import { getPixel, rectFromPoints, type Point } from './pixels';

/** Bresenham line, both ends included. */
export function linePoints(a: Point, b: Point): Point[] {
  const points: Point[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    points.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return points;
}

export function rectPoints(a: Point, b: Point, filled: boolean): Point[] {
  const r = rectFromPoints(a, b);
  const points: Point[] = [];
  for (let y = r.y; y < r.y + r.height; y++) {
    for (let x = r.x; x < r.x + r.width; x++) {
      const edge = y === r.y || y === r.y + r.height - 1 || x === r.x || x === r.x + r.width - 1;
      if (filled || edge) points.push({ x, y });
    }
  }
  return points;
}

/**
 * Ellipse inscribed in the box spanned by two corners. A pixel belongs to the
 * filled ellipse when its center is inside; the outline is the set of filled
 * pixels with at least one 4-neighbour outside, which yields a clean 1px line
 * at any size (including even widths and tiny 2x2 / 3x3 boxes).
 */
export function ellipsePoints(a: Point, b: Point, filled: boolean): Point[] {
  const r = rectFromPoints(a, b);
  const rx = r.width / 2;
  const ry = r.height / 2;
  const cx = r.x + rx;
  const cy = r.y + ry;
  const inside = (x: number, y: number): boolean => {
    if (x < r.x || y < r.y || x >= r.x + r.width || y >= r.y + r.height) return false;
    const nx = (x + 0.5 - cx) / rx;
    const ny = (y + 0.5 - cy) / ry;
    return nx * nx + ny * ny <= 1;
  };
  const points: Point[] = [];
  for (let y = r.y; y < r.y + r.height; y++) {
    for (let x = r.x; x < r.x + r.width; x++) {
      if (!inside(x, y)) continue;
      if (filled || !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) {
        points.push({ x, y });
      }
    }
  }
  return points;
}

/**
 * Pixels reached by a bucket fill starting at (x, y): all pixels with exactly
 * the same color, 4-connected when `contiguous`, or anywhere in the cel otherwise.
 */
export function floodFillPoints(
  data: CelData | undefined,
  width: number,
  height: number,
  x: number,
  y: number,
  contiguous = true,
): Point[] {
  if (x < 0 || y < 0 || x >= width || y >= height) return [];
  const target = getPixel(data, width, x, y);
  const points: Point[] = [];
  if (!contiguous) {
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        if (getPixel(data, width, px, py) === target) points.push({ x: px, y: py });
      }
    }
    return points;
  }
  const seen = new Uint8Array(width * height);
  const stack: number[] = [y * width + x];
  seen[y * width + x] = 1;
  while (stack.length) {
    const idx = stack.pop()!;
    const px = idx % width;
    const py = (idx - px) / width;
    points.push({ x: px, y: py });
    const visit = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
      const n = ny * width + nx;
      if (seen[n]) return;
      seen[n] = 1;
      if (getPixel(data, width, nx, ny) === target) stack.push(n);
    };
    visit(px - 1, py);
    visit(px + 1, py);
    visit(px, py - 1);
    visit(px, py + 1);
  }
  return points;
}

/** Adds the mirrored copies of each point (deduplicated) for symmetric drawing. */
export function mirrorPoints(
  points: Point[],
  width: number,
  height: number,
  mirrorX: boolean,
  mirrorY: boolean,
): Point[] {
  if (!mirrorX && !mirrorY) return points;
  const seen = new Set<number>();
  const out: Point[] = [];
  const add = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const k = y * width + x;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ x, y });
  };
  for (const p of points) {
    add(p.x, p.y);
    if (mirrorX) add(width - 1 - p.x, p.y);
    if (mirrorY) add(p.x, height - 1 - p.y);
    if (mirrorX && mirrorY) add(width - 1 - p.x, height - 1 - p.y);
  }
  return out;
}
