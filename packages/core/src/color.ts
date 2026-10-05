/**
 * Colors are packed as unsigned 32-bit integers in 0xRRGGBBAA order.
 * Packed numbers are cheap to compare and store, and map directly to
 * the "#rrggbbaa" hex notation used in files and the MCP API.
 */
export type Color = number;

export const TRANSPARENT: Color = 0x00000000;

export function rgba(r: number, g: number, b: number, a = 255): Color {
  return (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;
}

export function red(c: Color): number {
  return (c >>> 24) & 255;
}
export function green(c: Color): number {
  return (c >>> 16) & 255;
}
export function blue(c: Color): number {
  return (c >>> 8) & 255;
}
export function alpha(c: Color): number {
  return c & 255;
}

export function isTransparent(c: Color): boolean {
  return alpha(c) === 0;
}

/** Accepts "#rgb", "#rgba", "#rrggbb" and "#rrggbbaa" (leading "#" optional). */
export function parseHex(input: string): Color {
  let hex = input.trim().replace(/^#/, '');
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (hex.length === 6) hex += 'ff';
  if (hex.length !== 8 || !/^[0-9a-fA-F]{8}$/.test(hex)) {
    throw new Error(`Invalid color: "${input}"`);
  }
  return parseInt(hex, 16) >>> 0;
}

export function tryParseHex(input: string): Color | null {
  try {
    return parseHex(input);
  } catch {
    return null;
  }
}

/** "#rrggbb" when opaque, "#rrggbbaa" otherwise. */
export function toHex(c: Color, forceAlpha = false): string {
  const full = (c >>> 0).toString(16).padStart(8, '0');
  return '#' + (forceAlpha || alpha(c) !== 255 ? full : full.slice(0, 6));
}

/** CSS color string usable in canvas / style attributes. */
export function toCss(c: Color): string {
  return `rgba(${red(c)}, ${green(c)}, ${blue(c)}, ${+(alpha(c) / 255).toFixed(3)})`;
}

/** Source-over blend of `src` on top of `dst`, with an extra opacity factor (0..1) on src. */
export function blend(dst: Color, src: Color, opacity = 1): Color {
  const sa = (alpha(src) / 255) * opacity;
  if (sa <= 0) return dst;
  const da = alpha(dst) / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return TRANSPARENT;
  const mix = (s: number, d: number) => Math.round((s * sa + d * da * (1 - sa)) / oa);
  return rgba(
    mix(red(src), red(dst)),
    mix(green(src), green(dst)),
    mix(blue(src), blue(dst)),
    Math.round(oa * 255),
  );
}
