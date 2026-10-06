import { describe, expect, it } from 'vitest';
import {
  addLayer, createDocument, flattenOnBackground, getPixel, gridToPixels, overlayPixelGrid,
  pixelsToGrid, resolveColor, resolveFrame, resolveLayer, setPixels, summarizeDocument,
} from '../src';

const PAL = [0x000000ff, 0xffffffff, 0xff0000ff];

describe('grids', () => {
  it('maps palette index chars and transparency', () => {
    const w = gridToPixels({ rows: ['01', '2.'], x: 3, y: 4 }, PAL);
    expect(w).toEqual([
      { x: 3, y: 4, color: 0x000000ff },
      { x: 4, y: 4, color: 0xffffffff },
      { x: 3, y: 5, color: 0xff0000ff },
      { x: 4, y: 5, color: 0 },
    ]);
    expect(gridToPixels({ rows: ['.1'], transparent: 'skip' }, PAL)).toEqual([{ x: 1, y: 0, color: 0xffffffff }]);
  });

  it('supports legends with hex colors and palette indices', () => {
    const w = gridToPixels({ rows: ['ab'], legend: { a: '#00ff00', b: 2 } }, PAL);
    expect(w.map((p) => p.color)).toEqual([0x00ff00ff, 0xff0000ff]);
  });

  it('explains unknown characters', () => {
    expect(() => gridToPixels({ rows: ['09'] }, PAL)).toThrow(/"9".*palette has 3 colors: 012/);
    expect(() => gridToPixels({ rows: ['x'], legend: { a: 1 } }, PAL)).toThrow(/not in legend/);
    expect(() => gridToPixels({ rows: ['a'], legend: { a: 7 } }, PAL)).toThrow(/out of range/);
  });

  it('round-trips through pixelsToGrid, giving spare chars to off-palette colors', () => {
    const data = new Uint8ClampedArray(3 * 4);
    const region = { width: 3, height: 1, data };
    data.set([255, 0, 0, 255, 0, 0, 0, 0, 1, 2, 3, 255]);
    const g = pixelsToGrid(region, PAL);
    expect(g.rows).toEqual(['2.3']);
    expect(g.legend).toEqual({ '2': '#ff0000', '3': '#010203' });
    const back = gridToPixels({ rows: g.rows, legend: g.legend }, PAL);
    expect(back.map((p) => p.color)).toEqual([0xff0000ff, 0, 0x010203ff]);
  });
});

describe('references', () => {
  it('resolves layers by id, name and index, frames and colors', () => {
    let d = createDocument({ width: 2, height: 2 });
    const { doc, layer } = addLayer(d, 'Outline');
    d = doc;
    expect(resolveLayer(d, 'outline', 'x')).toBe(layer.id);
    expect(resolveLayer(d, 1, 'x')).toBe(layer.id);
    expect(resolveLayer(d, '0', 'x')).toBe(d.layers[0].id);
    expect(resolveLayer(d, undefined, 'fallback')).toBe('fallback');
    expect(() => resolveLayer(d, 'nope', 'x')).toThrow(/"Layer 1", "Outline"/);
    expect(resolveFrame(d, undefined, 0)).toBe(0);
    expect(() => resolveFrame(d, 1, 0)).toThrow(/0-based/);
    expect(resolveColor('#ff0000', PAL)).toBe(0xff0000ff);
    expect(resolveColor(1, PAL)).toBe(0xffffffff);
    expect(resolveColor('transparent', PAL)).toBe(0);
  });

  it('summarizes documents', () => {
    let d = createDocument({ name: 'hero', width: 2, height: 2, palette: PAL });
    d = setPixels(d, d.layers[0].id, d.frames[0].id, [{ x: 0, y: 0, color: 1 }]);
    const s = summarizeDocument(d);
    expect(s.palette[2]).toEqual({ index: 2, char: '2', color: '#ff0000' });
    expect(s.frames[0].nonEmptyLayers).toEqual(['Layer 1']);
  });
});

describe('image helpers', () => {
  it('flattens on a background and overlays a grid', () => {
    const region = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 0]) };
    expect(Array.from(flattenOnBackground(region, '#ffffff').data)).toEqual([255, 255, 255, 255]);
    const big = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(200) };
    const g = overlayPixelGrid(big, 4);
    expect(getPixel(g.data, 8, 0, 0)).not.toBe(getPixel(big.data, 8, 0, 0));
    expect(getPixel(g.data, 8, 1, 1)).toBe(getPixel(big.data, 8, 1, 1));
  });
});
