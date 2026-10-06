import { describe, expect, it } from 'vitest';
import {
  addFrame, addTag, celKey, createDocument, decodeBase64, documentFromJson, documentToJson,
  encodeBase64, lospecJsonUrl, parseGplPalette, parseHexPalette, parseLospecJson, serializeGplPalette, setPixels,
} from '../src';

describe('serialization', () => {
  it('round-trips a document', () => {
    let d = createDocument({ name: 'hero', width: 3, height: 2 });
    const L = d.layers[0].id;
    d = addFrame(d).doc;
    d = setPixels(d, L, d.frames[1].id, [{ x: 2, y: 1, color: 0x12345678 }]);
    d = addTag(d, { name: 'idle', from: 0, to: 1, direction: 'pingpong' }).doc;
    const back = documentFromJson(documentToJson(d));
    expect(back.name).toBe('hero');
    expect(back.palette).toEqual(d.palette);
    expect(back.layers).toEqual(d.layers);
    expect(back.frames).toEqual(d.frames);
    expect(back.tags).toEqual(d.tags);
    expect(Array.from(back.cels[celKey(L, d.frames[1].id)])).toEqual(Array.from(d.cels[celKey(L, d.frames[1].id)]));
    expect(back.cels[celKey(L, d.frames[0].id)]).toBeUndefined();
  });

  it('keeps Godot export settings', () => {
    const d = { ...createDocument({ width: 2, height: 2 }), godot: { dir: '/game/sprites', columns: 4, spacing: 0, autoplay: 'idle' } };
    expect(documentFromJson(documentToJson(d)).godot).toEqual(d.godot);
    expect(documentFromJson(documentToJson(createDocument({ width: 2, height: 2 }))).godot).toBeUndefined();
  });

  it('rejects foreign or corrupt files', () => {
    expect(() => documentFromJson('{}')).toThrow(/Not an EasyPixel file/);
    expect(() => documentFromJson('not json')).toThrow();
  });

  it('base64 round-trips every length', () => {
    for (let n = 0; n < 10; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
      expect(Array.from(decodeBase64(encodeBase64(bytes)))).toEqual(Array.from(bytes));
    }
    expect(encodeBase64(new Uint8Array([104, 105]))).toBe('aGk=');
  });
});

describe('lospec', () => {
  it('builds JSON URLs from slugs, names and URLs', () => {
    expect(lospecJsonUrl('endesga-32')).toBe('https://lospec.com/palette-list/endesga-32.json');
    expect(lospecJsonUrl('  Endesga 32 ')).toBe('https://lospec.com/palette-list/endesga-32.json');
    expect(lospecJsonUrl('https://lospec.com/palette-list/resurrect-64')).toBe('https://lospec.com/palette-list/resurrect-64.json');
    expect(() => lospecJsonUrl('  ')).toThrow();
  });

  it('parses palette JSON', () => {
    const p = parseLospecJson('{"name":"Twilight 5","author":"Star","colors":["fbbbad","ee8695","4a7a96","333f58","292831"]}');
    expect(p.name).toBe('Twilight 5');
    expect(p.colors).toEqual([0xfbbbadff, 0xee8695ff, 0x4a7a96ff, 0x333f58ff, 0x292831ff]);
    expect(() => parseLospecJson('<html>')).toThrow(/did not return/);
    expect(() => parseLospecJson('{"colors":[]}')).toThrow(/no colors/);
  });
});

describe('palette files', () => {
  it('parses .hex and .gpl', () => {
    expect(parseHexPalette('ff0000\n00ff00\n\n')).toEqual([0xff0000ff, 0x00ff00ff]);
    const gpl = serializeGplPalette([0xff0000ff, 0x0000ffff]);
    expect(gpl.startsWith('GIMP Palette')).toBe(true);
    expect(parseGplPalette(gpl)).toEqual([0xff0000ff, 0x0000ffff]);
  });
});
