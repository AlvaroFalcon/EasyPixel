import { describe, expect, it } from 'vitest';
import {
  addFrame, createDocument, documentFromFrames, extractColors, getPixel, layoutSpritesheet,
  renderSpritesheet, scaleRegion, setPixels, sliceSpritesheet,
} from '../src';

const RED = 0xff0000ff;

function threeFrames() {
  let d = createDocument({ width: 2, height: 2 });
  d = addFrame(d).doc;
  d = addFrame(d).doc;
  d.frames.forEach((f, i) => {
    d = setPixels(d, d.layers[0].id, f.id, [{ x: i % 2, y: 0, color: RED - i * 0x100 }]);
  });
  return d;
}

describe('spritesheet', () => {
  it('lays out a grid with spacing and margin', () => {
    const l = layoutSpritesheet(threeFrames(), { columns: 2, spacing: 1, margin: 2 });
    expect(l).toMatchObject({ columns: 2, rows: 2, width: 2 + 2 + 1 + 2 + 2, height: 9 });
    expect(l.cells[2]).toEqual({ frameIndex: 2, x: 2, y: 5 });
  });

  it('renders and slices back to the same frames', () => {
    const d = threeFrames();
    const sheet = renderSpritesheet(d, layoutSpritesheet(d, { columns: 2, spacing: 1, margin: 1 }));
    const frames = sliceSpritesheet(sheet, { frameWidth: 2, frameHeight: 2, spacing: 1, margin: 1, skipEmpty: true });
    expect(frames).toHaveLength(3);
    const back = documentFromFrames('x', frames);
    expect(back.frames).toHaveLength(3);
    expect(getPixel(back.cels[`${back.layers[0].id}/${back.frames[1].id}`], 2, 1, 0)).toBe(RED - 0x100);
  });

  it('scales with nearest neighbour and extracts colors', () => {
    const d = threeFrames();
    const sheet = renderSpritesheet(d, layoutSpritesheet(d));
    const big = scaleRegion(sheet, 3);
    expect(big.width).toBe(sheet.width * 3);
    expect(getPixel(big.data, big.width, 2, 2)).toBe(RED);
    expect(extractColors(sheet)).toEqual([RED, RED - 0x100, RED - 0x200]);
  });
});
