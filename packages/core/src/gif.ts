/**
 * Minimal animated GIF89a encoder (global palette, LZW, per-frame delays,
 * transparency, looping). Pixel art rarely needs more than 255 colors; when it
 * does, extra colors are mapped to the nearest of the 255 most used ones.
 */
import { playbackFor } from './animation';
import { compositeFrame } from './composite';
import type { SpriteDocument, Tag } from './document';
import type { PixelRegion } from './pixels';
import { scaleRegion } from './spritesheet';

export interface GifFrame {
  image: PixelRegion;
  /** Milliseconds (GIF stores hundredths of a second; minimum 20 ms). */
  delay: number;
}

export interface GifOptions {
  /** 0 = loop forever (default), n = play n+1 times, -1 = play once. */
  loop?: number;
}

const rgbKey = (d: Uint8ClampedArray, i: number) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];

function buildPalette(frames: GifFrame[]): { colors: number[]; indexOf: (rgb: number) => number; transparent: boolean } {
  const counts = new Map<number, number>();
  let transparent = false;
  for (const { image } of frames) {
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) {
        transparent = true;
        continue;
      }
      const k = rgbKey(d, i);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const max = transparent ? 255 : 256;
  const colors = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([c]) => c);
  const offset = transparent ? 1 : 0;
  const exact = new Map(colors.map((c, i) => [c, i + offset]));
  const cache = new Map<number, number>();
  const indexOf = (rgb: number) => {
    const hit = exact.get(rgb) ?? cache.get(rgb);
    if (hit !== undefined) return hit;
    let best = 0;
    let bestDist = Infinity;
    colors.forEach((c, i) => {
      const dr = ((c >> 16) & 255) - ((rgb >> 16) & 255);
      const dg = ((c >> 8) & 255) - ((rgb >> 8) & 255);
      const db = (c & 255) - (rgb & 255);
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    cache.set(rgb, best + offset);
    return best + offset;
  };
  return { colors: transparent ? [0, ...colors] : colors, indexOf, transparent };
}

/** GIF-flavoured LZW (variable code size, clear code when the table is full). */
export function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const out: number[] = [];
  let bits = 0;
  let bitCount = 0;
  const emit = (code: number, size: number) => {
    bits |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) {
      out.push(bits & 255);
      bits >>>= 8;
      bitCount -= 8;
    }
  };
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let table = new Map<number, number>();
  emit(clear, codeSize);
  if (indices.length === 0) {
    emit(eoi, codeSize);
    if (bitCount > 0) out.push(bits & 255);
    return Uint8Array.from(out);
  }
  let current = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (current << 8) | k;
    const found = table.get(key);
    if (found !== undefined) {
      current = found;
      continue;
    }
    emit(current, codeSize);
    if (next === 4096) {
      emit(clear, codeSize);
      table = new Map();
      next = eoi + 1;
      codeSize = minCodeSize + 1;
    } else {
      if (next >= 1 << codeSize) codeSize++;
      table.set(key, next++);
    }
    current = k;
  }
  emit(current, codeSize);
  emit(eoi, codeSize);
  if (bitCount > 0) out.push(bits & 255);
  return Uint8Array.from(out);
}

export function encodeGif(frames: GifFrame[], opts: GifOptions = {}): Uint8Array {
  if (frames.length === 0) throw new Error('No frames to encode');
  const { width, height } = frames[0].image;
  if (frames.some((f) => f.image.width !== width || f.image.height !== height)) throw new Error('All GIF frames must have the same size');

  const { colors, indexOf, transparent } = buildPalette(frames);
  let tableBits = 1;
  while (1 << tableBits < Math.max(2, colors.length)) tableBits++;
  const tableSize = 1 << tableBits;
  const minCodeSize = Math.max(2, tableBits);

  const bytes: number[] = [];
  const u16 = (n: number) => bytes.push(n & 255, (n >> 8) & 255);
  const str = (s: string) => {
    for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
  };

  str('GIF89a');
  u16(width);
  u16(height);
  bytes.push(0x80 | ((tableBits - 1) << 4) | (tableBits - 1), 0, 0); // global table, background 0, aspect 0
  for (let i = 0; i < tableSize; i++) {
    const c = colors[i] ?? 0;
    bytes.push((c >> 16) & 255, (c >> 8) & 255, c & 255);
  }

  const loop = opts.loop ?? 0;
  if (loop >= 0) {
    bytes.push(0x21, 0xff, 0x0b);
    str('NETSCAPE2.0');
    bytes.push(0x03, 0x01);
    u16(loop);
    bytes.push(0x00);
  }

  for (const frame of frames) {
    const delay = Math.max(2, Math.round(frame.delay / 10));
    // Graphic control: disposal 2 (restore to background) so transparent frames don't pile up.
    bytes.push(0x21, 0xf9, 0x04, (2 << 2) | (transparent ? 1 : 0));
    u16(delay);
    bytes.push(transparent ? 0 : 0, 0x00);

    bytes.push(0x2c);
    u16(0);
    u16(0);
    u16(width);
    u16(height);
    bytes.push(0x00);

    const d = frame.image.data;
    const indices = new Uint8Array(width * height);
    for (let p = 0, i = 0; p < indices.length; p++, i += 4) {
      indices[p] = d[i + 3] < 128 ? 0 : indexOf(rgbKey(d, i));
    }
    bytes.push(minCodeSize);
    const data = lzwEncode(indices, minCodeSize);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.subarray(i, i + 255);
      bytes.push(chunk.length, ...chunk);
    }
    bytes.push(0x00);
  }
  bytes.push(0x3b);
  return Uint8Array.from(bytes);
}

/** Animated GIF of a tag (or all frames), honouring frame durations and direction. */
export function documentToGif(doc: SpriteDocument, tag?: Tag | null, scale = 1): Uint8Array {
  const pb = playbackFor(doc, tag);
  const frames = pb.sequence.map((index, step) => ({
    image: scaleRegion({ width: doc.width, height: doc.height, data: compositeFrame(doc, index) }, scale),
    delay: pb.durations[step],
  }));
  return encodeGif(frames, { loop: pb.loop ? 0 : -1 });
}
