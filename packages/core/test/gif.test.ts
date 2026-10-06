import { describe, expect, it } from 'vitest';
import { addFrame, addTag, createDocument, documentToGif, encodeGif, lzwEncode, setFrameDuration, setPixels } from '../src';

/** Reference GIF LZW decoder (independent from the encoder). */
function lzwDecode(data: Uint8Array, minCodeSize: number, count: number): number[] {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let size = minCodeSize + 1;
  let dict: number[][] = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < clear; i++) dict[i] = [i];
    dict[clear] = [];
    dict[eoi] = [];
    size = minCodeSize + 1;
  };
  reset();
  const out: number[] = [];
  let pos = 0;
  let prev: number[] | null = null;
  const read = () => {
    let code = 0;
    for (let i = 0; i < size; i++, pos++) code |= ((data[pos >> 3] >> (pos & 7)) & 1) << i;
    return code;
  };
  while (out.length < count + 1) {
    const code = read();
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else entry = [...prev!, prev![0]];
    out.push(...entry);
    if (prev) dict.push([...prev, entry[0]]);
    prev = entry;
    if (dict.length === 1 << size && size < 12) size++;
  }
  return out;
}

function parseGif(bytes: Uint8Array) {
  const u16 = (i: number) => bytes[i] | (bytes[i + 1] << 8);
  expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a');
  const width = u16(6), height = u16(8);
  const tableSize = 2 << (bytes[10] & 7);
  const palette: number[] = [];
  for (let i = 0; i < tableSize; i++) palette.push((bytes[13 + i * 3] << 16) | (bytes[14 + i * 3] << 8) | bytes[15 + i * 3]);
  let p = 13 + tableSize * 3;
  const frames: { delay: number; transparent: boolean; pixels: number[] }[] = [];
  let loop = -1;
  let delay = 0, transparent = false;
  while (bytes[p] !== 0x3b) {
    if (bytes[p] === 0x21 && bytes[p + 1] === 0xff) {
      loop = u16(p + 16);
      p += 19;
    } else if (bytes[p] === 0x21 && bytes[p + 1] === 0xf9) {
      transparent = (bytes[p + 3] & 1) === 1;
      delay = u16(p + 4);
      p += 8;
    } else if (bytes[p] === 0x2c) {
      p += 10;
      const min = bytes[p++];
      const chunks: number[] = [];
      while (bytes[p] !== 0) {
        chunks.push(...bytes.slice(p + 1, p + 1 + bytes[p]));
        p += bytes[p] + 1;
      }
      p++;
      frames.push({ delay, transparent, pixels: lzwDecode(Uint8Array.from(chunks), min, width * height).slice(0, width * height) });
    } else throw new Error(`Unexpected byte ${bytes[p]} at ${p}`);
  }
  return { width, height, palette, frames, loop };
}

describe('gif', () => {
  it('LZW round-trips long and repetitive data (including table resets)', () => {
    const data = Uint8Array.from({ length: 20000 }, (_, i) => (i * 7 + (i >> 5)) % 13);
    expect(lzwDecode(lzwEncode(data, 4), 4, data.length).slice(0, data.length)).toEqual(Array.from(data));
    const flat = new Uint8Array(5000).fill(3);
    expect(lzwDecode(lzwEncode(flat, 2), 2, flat.length).slice(0, flat.length)).toEqual(Array.from(flat));
  });

  it('encodes frames with transparency, delays and looping', () => {
    const img = (color: number[]) => {
      const data = new Uint8ClampedArray(4 * 4 * 4);
      for (let i = 0; i < 16; i++) if (i % 2) data.set(color, i * 4);
      return { width: 4, height: 4, data };
    };
    const gif = parseGif(
      encodeGif([
        { image: img([255, 0, 0, 255]), delay: 100 },
        { image: img([0, 0, 255, 255]), delay: 250 },
      ]),
    );
    expect(gif).toMatchObject({ width: 4, height: 4, loop: 0 });
    expect(gif.frames.map((f) => f.delay)).toEqual([10, 25]);
    expect(gif.frames[0].transparent).toBe(true);
    const f0 = gif.frames[0].pixels.map((i) => (i === 0 ? null : gif.palette[i]));
    expect(f0.slice(0, 4)).toEqual([null, 0xff0000, null, 0xff0000]);
    expect(gif.palette[gif.frames[1].pixels[1]]).toBe(0x0000ff);
  });

  it('exports a document animation with its timing and direction', () => {
    let d = createDocument({ width: 2, height: 2 });
    d = addFrame(d).doc;
    d = addFrame(d).doc;
    d.frames.forEach((f, i) => {
      d = setPixels(d, d.layers[0].id, f.id, [{ x: 0, y: 0, color: (0x10 * (i + 1)) * 0x1000000 + 0xff }]);
    });
    d = setFrameDuration(d, d.frames[2].id, 300);
    const { tag, doc } = addTag(d, { name: 'bounce', from: 0, to: 2, direction: 'pingpong', loop: false });
    const gif = parseGif(documentToGif(doc, tag, 3));
    expect(gif.width).toBe(6);
    expect(gif.loop).toBe(-1); // no loop extension
    expect(gif.frames.map((f) => f.delay)).toEqual([10, 10, 30, 10]);
  });
});
