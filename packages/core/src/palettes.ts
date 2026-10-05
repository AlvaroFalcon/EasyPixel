import { parseHex, toHex, tryParseHex, type Color } from './color';

export interface PalettePreset {
  id: string;
  name: string;
  colors: Color[];
}

const preset = (id: string, name: string, hex: string): PalettePreset => ({
  id,
  name,
  colors: hex.trim().split(/\s+/).map(parseHex),
});

export const PALETTE_PRESETS: PalettePreset[] = [
  preset(
    'pico-8',
    'PICO-8',
    `000000 1d2b53 7e2553 008751 ab5236 5f574f c2c3c7 fff1e8
     ff004d ffa300 ffec27 00e436 29adff 83769c ff77a8 ffccaa`,
  ),
  preset(
    'sweetie-16',
    'Sweetie 16',
    `1a1c2c 5d275d b13e53 ef7d57 ffcd75 a7f070 38b764 257179
     29366f 3b5dc9 41a6f6 73eff7 f4f4f4 94b0c2 566c86 333c57`,
  ),
  preset(
    'endesga-32',
    'Endesga 32',
    `be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633
     e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e
     124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466
     262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569`,
  ),
  preset('gameboy', 'Game Boy', '0f380f 306230 8bac0f 9bbc0f'),
  preset('1bit', '1-bit', '000000 ffffff'),
];

/** Parses Lospec ".hex" files: one "rrggbb" per line. */
export function parseHexPalette(text: string): Color[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(';') && !line.startsWith('//'))
    .map((line) => tryParseHex(line))
    .filter((c): c is Color => c !== null);
}

/** Parses GIMP ".gpl" palettes ("R G B [name]" lines after the header). */
export function parseGplPalette(text: string): Color[] {
  const colors: Color[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s|$)/.exec(line);
    if (!m) continue;
    const [r, g, b] = [m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)));
    colors.push(parseHex([r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')));
  }
  return colors;
}

/** Detects the format from the content / file name. */
export function parsePaletteFile(text: string, fileName = ''): Color[] {
  if (fileName.toLowerCase().endsWith('.gpl') || text.trimStart().startsWith('GIMP Palette')) {
    return parseGplPalette(text);
  }
  return parseHexPalette(text);
}

export function serializeHexPalette(colors: Color[]): string {
  return colors.map((c) => toHex(c).slice(1, 7)).join('\n') + '\n';
}

export function serializeGplPalette(colors: Color[], name = 'EasyPixel'): string {
  const lines = ['GIMP Palette', `Name: ${name}`, '#'];
  for (const c of colors) {
    const r = (c >>> 24) & 255, g = (c >>> 16) & 255, b = (c >>> 8) & 255;
    lines.push(`${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${toHex(c).slice(1, 7)}`);
  }
  return lines.join('\n') + '\n';
}
