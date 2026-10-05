import { describe, expect, it } from 'vitest';
import { alpha, blend, parseHex, rgba, toHex, TRANSPARENT } from '../src';

describe('color', () => {
  it('parses and formats hex colors', () => {
    expect(parseHex('#ff0000')).toBe(0xff0000ff);
    expect(parseHex('f00')).toBe(0xff0000ff);
    expect(parseHex('#ff000080')).toBe(0xff000080);
    expect(toHex(0xff0000ff)).toBe('#ff0000');
    expect(toHex(0xff000080)).toBe('#ff000080');
    expect(() => parseHex('nope')).toThrow();
  });

  it('packs rgba as unsigned', () => {
    expect(rgba(255, 255, 255, 255)).toBe(0xffffffff);
    expect(alpha(rgba(1, 2, 3, 4))).toBe(4);
  });

  it('blends source-over', () => {
    expect(blend(TRANSPARENT, 0xff0000ff)).toBe(0xff0000ff);
    expect(blend(0x0000ffff, 0xff0000ff, 0.5)).toBe(rgba(128, 0, 128, 255));
    expect(blend(0x0000ffff, TRANSPARENT)).toBe(0x0000ffff);
  });
});
