import { describe, expect, it } from 'vitest';
import {
  addFrame, addLayer, addTag, celKey, clearCel, compositeFrame, copyRegion, createDocument,
  duplicateFrame, duplicateLayer, flipCel, getPixel, mergeLayerDown, moveLayer, pasteRegion,
  removeFrame, removeLayer, replaceColor, resizeCanvas, setPixels, shiftCel, updateLayer, updateTag,
} from '../src';

const RED = 0xff0000ff;
const BLUE = 0x0000ffff;

function base() {
  return createDocument({ width: 4, height: 4 });
}

describe('pixel ops', () => {
  it('does not mutate the previous document (copy-on-write)', () => {
    const d0 = base();
    const L = d0.layers[0].id, F = d0.frames[0].id;
    const d1 = setPixels(d0, L, F, [{ x: 1, y: 1, color: RED }]);
    const d2 = setPixels(d1, L, F, [{ x: 2, y: 2, color: BLUE }]);
    expect(d0.cels[celKey(L, F)]).toBeUndefined();
    expect(getPixel(d1.cels[celKey(L, F)], 4, 2, 2)).toBe(0);
    expect(getPixel(d2.cels[celKey(L, F)], 4, 1, 1)).toBe(RED);
    expect(getPixel(d2.cels[celKey(L, F)], 4, 2, 2)).toBe(BLUE);
  });

  it('ignores out-of-bounds writes and drops empty cels', () => {
    const d0 = base();
    const L = d0.layers[0].id, F = d0.frames[0].id;
    const d1 = setPixels(d0, L, F, [{ x: 9, y: 9, color: RED }]);
    expect(d1.cels[celKey(L, F)]).toBeUndefined();
    const d2 = clearCel(setPixels(d0, L, F, [{ x: 0, y: 0, color: RED }]), L, F);
    expect(d2.cels[celKey(L, F)]).toBeUndefined();
  });

  it('refuses to edit locked layers', () => {
    const d0 = base();
    const L = d0.layers[0].id, F = d0.frames[0].id;
    const locked = updateLayer(d0, L, { locked: true });
    expect(() => setPixels(locked, L, F, [{ x: 0, y: 0, color: RED }])).toThrow(/locked/);
  });

  it('copies and pastes regions', () => {
    let d = base();
    const L = d.layers[0].id, F = d.frames[0].id;
    d = setPixels(d, L, F, [{ x: 0, y: 0, color: RED }, { x: 1, y: 0, color: BLUE }]);
    const region = copyRegion(d, L, F, { x: 0, y: 0, width: 2, height: 1 })!;
    d = pasteRegion(d, L, F, region, 2, 3);
    const cel = d.cels[celKey(L, F)];
    expect(getPixel(cel, 4, 2, 3)).toBe(RED);
    expect(getPixel(cel, 4, 3, 3)).toBe(BLUE);
  });

  it('flips and shifts', () => {
    let d = base();
    const L = d.layers[0].id, F = d.frames[0].id;
    d = setPixels(d, L, F, [{ x: 0, y: 1, color: RED }]);
    expect(getPixel(flipCel(d, L, F, 'horizontal').cels[celKey(L, F)], 4, 3, 1)).toBe(RED);
    expect(getPixel(flipCel(d, L, F, 'vertical').cels[celKey(L, F)], 4, 0, 2)).toBe(RED);
    expect(getPixel(shiftCel(d, L, F, -1, 0, true).cels[celKey(L, F)], 4, 3, 1)).toBe(RED);
    expect(shiftCel(d, L, F, -1, 0, false).cels[celKey(L, F)]).toBeUndefined();
  });

  it('resizes the canvas keeping content anchored', () => {
    let d = base();
    const L = d.layers[0].id, F = d.frames[0].id;
    d = setPixels(d, L, F, [{ x: 0, y: 0, color: RED }]);
    const bigger = resizeCanvas(d, 8, 8, 'center');
    expect(bigger.width).toBe(8);
    expect(getPixel(bigger.cels[celKey(L, F)], 8, 2, 2)).toBe(RED);
    const tl = resizeCanvas(d, 2, 2, 'top-left');
    expect(getPixel(tl.cels[celKey(L, F)], 2, 0, 0)).toBe(RED);
  });

  it('replaces colors everywhere', () => {
    let d = base();
    const L = d.layers[0].id, F = d.frames[0].id;
    d = setPixels(d, L, F, [{ x: 0, y: 0, color: RED }, { x: 1, y: 0, color: RED }]);
    d = replaceColor(d, RED, BLUE);
    expect(getPixel(d.cels[celKey(L, F)], 4, 1, 0)).toBe(BLUE);
  });
});

describe('layers', () => {
  it('adds, moves, duplicates, removes', () => {
    let d = base();
    const first = d.layers[0];
    const added = addLayer(d);
    d = added.doc;
    expect(d.layers.map((l) => l.name)).toEqual(['Layer 1', 'Layer 2']);
    d = moveLayer(d, added.layer.id, 0);
    expect(d.layers[0].id).toBe(added.layer.id);
    d = setPixels(d, first.id, d.frames[0].id, [{ x: 0, y: 0, color: RED }]);
    const dup = duplicateLayer(d, first.id);
    expect(dup.doc.cels[celKey(dup.layer.id, d.frames[0].id)]).toBe(d.cels[celKey(first.id, d.frames[0].id)]);
    d = removeLayer(dup.doc, dup.layer.id);
    expect(d.layers).toHaveLength(2);
    expect(() => removeLayer(removeLayer(d, first.id), added.layer.id)).toThrow();
  });

  it('composites visible layers with opacity and merges down', () => {
    let d = base();
    const bottom = d.layers[0];
    const { doc, layer: top } = addLayer(d);
    d = doc;
    const F = d.frames[0].id;
    d = setPixels(d, bottom.id, F, [{ x: 0, y: 0, color: BLUE }]);
    d = setPixels(d, top.id, F, [{ x: 0, y: 0, color: RED }, { x: 1, y: 0, color: RED }]);
    expect(getPixel(compositeFrame(d, 0), 4, 0, 0)).toBe(RED);
    const hidden = updateLayer(d, top.id, { visible: false });
    expect(getPixel(compositeFrame(hidden, 0), 4, 0, 0)).toBe(BLUE);
    const merged = mergeLayerDown(d, top.id);
    expect(merged.layers).toHaveLength(1);
    expect(getPixel(merged.cels[celKey(bottom.id, F)], 4, 1, 0)).toBe(RED);
  });
});

describe('frames and tags', () => {
  it('duplicates frames sharing cel data and keeps tags in sync', () => {
    let d = base();
    const L = d.layers[0].id;
    d = setPixels(d, L, d.frames[0].id, [{ x: 0, y: 0, color: RED }]);
    d = addFrame(d).doc; // 2 frames
    d = addTag(d, { name: 'walk', from: 0, to: 0 }).doc;
    d = addTag(d, { name: 'jump', from: 1, to: 1 }).doc;
    const dup = duplicateFrame(d, d.frames[0].id);
    d = dup.doc;
    expect(d.frames).toHaveLength(3);
    expect(d.cels[celKey(L, dup.frame.id)]).toBe(d.cels[celKey(L, d.frames[0].id)]);
    expect(d.tags.find((t) => t.name === 'walk')).toMatchObject({ from: 0, to: 1 });
    expect(d.tags.find((t) => t.name === 'jump')).toMatchObject({ from: 2, to: 2 });

    d = removeFrame(d, d.frames[2].id);
    expect(d.tags.map((t) => t.name)).toEqual(['walk']);
    d = removeFrame(d, d.frames[0].id);
    expect(d.tags[0]).toMatchObject({ from: 0, to: 0 });
    expect(() => removeFrame(d, d.frames[0].id)).toThrow();
  });

  it('applies defaults when optional fields are explicitly undefined', () => {
    const d = base();
    const { doc, tag } = addTag(d, { name: 'idle', from: 0, to: 0, direction: undefined, loop: undefined });
    expect(tag).toMatchObject({ direction: 'forward', loop: true });
    const updated = updateTag(doc, tag.id, { loop: undefined, name: undefined });
    expect(updated.tags[0]).toMatchObject({ name: 'idle', loop: true });
    expect(updateLayer(d, d.layers[0].id, { visible: undefined }).layers[0].visible).toBe(true);
  });

  it('validates tag ranges and names', () => {
    const d = base();
    expect(() => addTag(d, { name: 'x', from: 0, to: 3 })).toThrow();
    const ok = addTag(d, { name: 'x', from: 0, to: 0 }).doc;
    expect(() => addTag(ok, { name: 'x', from: 0, to: 0 })).toThrow(/already exists/);
  });
});
