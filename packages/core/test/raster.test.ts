import { describe, expect, it } from 'vitest';
import { ellipsePoints, floodFillPoints, linePoints, mirrorPoints, putPixel, rectPoints } from '../src';

const key = (ps: { x: number; y: number }[]) => ps.map((p) => `${p.x},${p.y}`).sort();

describe('raster', () => {
  it('draws lines including both ends', () => {
    expect(linePoints({ x: 0, y: 0 }, { x: 3, y: 0 })).toHaveLength(4);
    expect(linePoints({ x: 0, y: 0 }, { x: 3, y: 3 })).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 },
    ]);
    expect(linePoints({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }]);
  });

  it('draws rectangles', () => {
    expect(rectPoints({ x: 0, y: 0 }, { x: 2, y: 2 }, false)).toHaveLength(8);
    expect(rectPoints({ x: 2, y: 2 }, { x: 0, y: 0 }, true)).toHaveLength(9);
  });

  it('draws symmetric ellipses within the box', () => {
    const pts = ellipsePoints({ x: 0, y: 0 }, { x: 7, y: 7 }, false);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(7);
      expect(pts.some((q) => q.x === 7 - p.x && q.y === p.y)).toBe(true);
    }
    const filled = ellipsePoints({ x: 0, y: 0 }, { x: 7, y: 7 }, true);
    expect(filled.length).toBeGreaterThan(pts.length);
    expect(ellipsePoints({ x: 0, y: 0 }, { x: 0, y: 0 }, false)).toEqual([{ x: 0, y: 0 }]);
  });

  it('flood fills contiguous regions only', () => {
    const w = 4, h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    // vertical wall at x = 1
    for (let y = 0; y < h; y++) putPixel(data, w, 1, y, 0xffffffff);
    expect(floodFillPoints(data, w, h, 0, 0)).toHaveLength(4);
    expect(floodFillPoints(data, w, h, 3, 3)).toHaveLength(8);
    expect(floodFillPoints(data, w, h, 0, 0, false)).toHaveLength(12);
    expect(floodFillPoints(undefined, w, h, 0, 0)).toHaveLength(16);
  });

  it('mirrors points', () => {
    expect(key(mirrorPoints([{ x: 0, y: 0 }], 4, 4, true, true))).toEqual(key([
      { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }, { x: 3, y: 3 },
    ]));
  });
});
