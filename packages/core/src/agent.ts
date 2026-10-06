/**
 * Helpers for AI agents (the MCP server): a compact text representation of
 * pixels ("grids") that language models can read and write reliably, plus a
 * JSON-friendly description of a document.
 */
import { parseHex, toHex, tryParseHex, type Color } from './color';
import { celKey, type SpriteDocument } from './document';
import type { PixelWrite } from './ops';
import { getPixel, type PixelRegion } from './pixels';

/** Characters used for palette indices in grids: index 0 → '0', 10 → 'a', 36 → 'A'. */
export const GRID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const GRID_TRANSPARENT = '.';

export type LegendValue = string | number;

export interface GridInput {
  rows: string[];
  /**
   * Optional char → color map. Values are hex colors ("#rrggbb", "#rrggbbaa")
   * or palette indices. Without a legend, chars are palette indices (GRID_CHARS).
   */
  legend?: Record<string, LegendValue>;
  /** Top-left position of the grid on the canvas. */
  x?: number;
  y?: number;
  /** What '.' (and spaces) do: 'erase' writes transparent pixels, 'skip' leaves pixels untouched. */
  transparent?: 'erase' | 'skip';
}

function legendColor(value: LegendValue, palette: Color[], char: string): Color | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value >= palette.length) {
      throw new Error(`Legend "${char}": palette index ${value} out of range (palette has ${palette.length} colors)`);
    }
    return palette[value];
  }
  const v = value.trim().toLowerCase();
  if (v === 'transparent' || v === 'none' || v === '') return null;
  const c = tryParseHex(v);
  if (c === null) throw new Error(`Legend "${char}": invalid color "${value}" (use "#rrggbb", "#rrggbbaa", a palette index or "transparent")`);
  return c;
}

/** Converts a text grid into pixel writes. Throws with a helpful message on unknown characters. */
export function gridToPixels(input: GridInput, palette: Color[]): PixelWrite[] {
  const ox = input.x ?? 0;
  const oy = input.y ?? 0;
  const skip = (input.transparent ?? 'erase') === 'skip';
  const map = new Map<string, Color | null>();
  if (input.legend) {
    for (const [char, value] of Object.entries(input.legend)) {
      if ([...char].length !== 1) throw new Error(`Legend keys must be single characters (got "${char}")`);
      map.set(char, legendColor(value, palette, char));
    }
  }
  const writes: PixelWrite[] = [];
  const unknown = new Set<string>();
  input.rows.forEach((row, ry) => {
    [...row].forEach((char, rx) => {
      let color: Color | null | undefined;
      if (map.has(char)) color = map.get(char);
      else if (char === GRID_TRANSPARENT || char === ' ') color = null;
      else if (!input.legend) {
        const index = GRID_CHARS.indexOf(char);
        color = index >= 0 && index < palette.length ? palette[index] : undefined;
      }
      if (color === undefined) {
        unknown.add(char);
        return;
      }
      if (color === null) {
        if (skip) return;
        color = 0;
      }
      writes.push({ x: ox + rx, y: oy + ry, color });
    });
  });
  if (unknown.size > 0) {
    const chars = [...unknown].map((c) => `"${c}"`).join(', ');
    throw new Error(
      input.legend
        ? `Characters not in legend: ${chars}`
        : `Characters ${chars} are not palette indices (palette has ${palette.length} colors: ${GRID_CHARS.slice(0, palette.length)}). Use a legend for custom colors.`,
    );
  }
  return writes;
}

export interface GridOutput {
  rows: string[];
  /** char → hex color for every char used (palette chars and extra colors). */
  legend: Record<string, string>;
}

/** Inverse of gridToPixels: palette colors use their index char, other colors get spare chars. */
export function pixelsToGrid(region: PixelRegion, palette: Color[]): GridOutput {
  const charOf = new Map<Color, string>();
  palette.slice(0, GRID_CHARS.length).forEach((c, i) => {
    if (!charOf.has(c)) charOf.set(c, GRID_CHARS[i]);
  });
  const spare = [...GRID_CHARS.slice(Math.min(palette.length, GRID_CHARS.length)), ...'!#$%&*+:;<=>?@^~'];
  const legend: Record<string, string> = {};
  const rows: string[] = [];
  for (let y = 0; y < region.height; y++) {
    let row = '';
    for (let x = 0; x < region.width; x++) {
      const c = getPixel(region.data, region.width, x, y);
      if ((c & 255) === 0) {
        row += GRID_TRANSPARENT;
        continue;
      }
      let char = charOf.get(c);
      if (!char) {
        char = spare.shift() ?? '?';
        charOf.set(c, char);
      }
      legend[char] = toHex(c);
      row += char;
    }
    rows.push(row);
  }
  return { rows, legend };
}

export interface DocumentSummary {
  name: string;
  width: number;
  height: number;
  palette: { index: number; char: string; color: string }[];
  layers: { index: number; id: string; name: string; visible: boolean; locked: boolean; opacity: number }[];
  frames: { index: number; id: string; durationMs: number; nonEmptyLayers: string[] }[];
  animations: { id: string; name: string; from: number; to: number; direction: string; loop: boolean }[];
}

/** Everything an agent needs to reason about a sprite, with 0-based indices. */
export function summarizeDocument(doc: SpriteDocument): DocumentSummary {
  return {
    name: doc.name,
    width: doc.width,
    height: doc.height,
    palette: doc.palette.map((c, index) => ({ index, char: GRID_CHARS[index] ?? '', color: toHex(c) })),
    layers: doc.layers.map((l, index) => ({ index, id: l.id, name: l.name, visible: l.visible, locked: l.locked, opacity: l.opacity })),
    frames: doc.frames.map((f, index) => ({
      index,
      id: f.id,
      durationMs: f.duration,
      nonEmptyLayers: doc.layers.filter((l) => doc.cels[celKey(l.id, f.id)]).map((l) => l.name),
    })),
    animations: doc.tags.map((t) => ({ id: t.id, name: t.name, from: t.from, to: t.to, direction: t.direction, loop: t.loop })),
  };
}

/** Resolves a layer given as id, exact name, or index (number or numeric string). */
export function resolveLayer(doc: SpriteDocument, ref: string | number | undefined, fallbackId: string): string {
  if (ref === undefined || ref === '') return fallbackId;
  if (typeof ref === 'number' || /^\d+$/.test(ref)) {
    const layer = doc.layers[Number(ref)];
    if (!layer) throw new Error(`Layer index ${ref} out of range (sprite has ${doc.layers.length} layers, 0-based)`);
    return layer.id;
  }
  const layer = doc.layers.find((l) => l.id === ref) ?? doc.layers.find((l) => l.name === ref) ?? doc.layers.find((l) => l.name.toLowerCase() === ref.toLowerCase());
  if (!layer) throw new Error(`Layer "${ref}" not found. Layers: ${doc.layers.map((l) => `"${l.name}"`).join(', ')}`);
  return layer.id;
}

/** Resolves a 0-based frame index. */
export function resolveFrame(doc: SpriteDocument, index: number | undefined, fallback: number): number {
  const i = index ?? fallback;
  if (!Number.isInteger(i) || i < 0 || i >= doc.frames.length) {
    throw new Error(`Frame index ${i} out of range (sprite has ${doc.frames.length} frames, 0-based)`);
  }
  return i;
}

/** Parses a color given as hex string or palette index. */
export function resolveColor(value: LegendValue, palette: Color[]): Color {
  const c = legendColor(value, palette, String(value));
  return c ?? 0;
}

/** Flattens a region onto a solid background (agents see transparent PNGs inconsistently). */
export function flattenOnBackground(region: PixelRegion, background: string): PixelRegion {
  if (background === 'transparent') return region;
  const bg = parseHex(background);
  const br = (bg >>> 24) & 255, bgG = (bg >>> 16) & 255, bb = (bg >>> 8) & 255;
  const data = new Uint8ClampedArray(region.data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = region.data[i + 3] / 255;
    data[i] = Math.round(region.data[i] * a + br * (1 - a));
    data[i + 1] = Math.round(region.data[i + 1] * a + bgG * (1 - a));
    data[i + 2] = Math.round(region.data[i + 2] * a + bb * (1 - a));
    data[i + 3] = 255;
  }
  return { width: region.width, height: region.height, data };
}

/**
 * Draws a 1px grid line between sprite pixels of an image already upscaled by
 * `scale`, plus a stronger line every `major` pixels, so the model can count
 * coordinates. Works in place on a copy.
 */
export function overlayPixelGrid(region: PixelRegion, scale: number, major = 8): PixelRegion {
  if (scale < 4) return region;
  const data = new Uint8ClampedArray(region.data);
  const { width, height } = region;
  const darken = (i: number, k: number) => {
    data[i] = Math.round(data[i] * k);
    data[i + 1] = Math.round(data[i + 1] * k);
    data[i + 2] = Math.round(data[i + 2] * k);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onX = x % scale === 0;
      const onY = y % scale === 0;
      if (!onX && !onY) continue;
      const isMajor = (onX && (x / scale) % major === 0) || (onY && (y / scale) % major === 0);
      darken((y * width + x) * 4, isMajor ? 0.55 : 0.82);
    }
  }
  return { width, height, data };
}
