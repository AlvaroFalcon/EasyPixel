import { parseHex, toHex } from './color';
import {
  assertCanvasSize,
  celKey,
  DEFAULT_FRAME_DURATION,
  type CelData,
  type Frame,
  type GodotExportSettings,
  type Layer,
  type SpriteDocument,
  type Tag,
  type TagDirection,
} from './document';

/**
 * EasyPixel project file (".epx.json"). Plain JSON so it diffs reasonably in
 * git and can be read by Claude; pixel data is base64 RGBA per cel.
 */
export const FILE_FORMAT = 'easypixel';
export const FILE_VERSION = 1;
export const FILE_EXTENSION = '.epx.json';

export interface SpriteFileV1 {
  format: typeof FILE_FORMAT;
  version: 1;
  name: string;
  width: number;
  height: number;
  palette: string[];
  layers: Layer[];
  frames: Frame[];
  tags: Tag[];
  cels: { layer: string; frame: string; data: string }[];
  godot?: GodotExportSettings;
}

export function serializeDocument(doc: SpriteDocument): SpriteFileV1 {
  const cels: SpriteFileV1['cels'] = [];
  for (const layer of doc.layers) {
    for (const frame of doc.frames) {
      const data = doc.cels[celKey(layer.id, frame.id)];
      if (data) cels.push({ layer: layer.id, frame: frame.id, data: encodeBase64(data) });
    }
  }
  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    palette: doc.palette.map((c) => toHex(c)),
    layers: doc.layers.map((l) => ({ ...l })),
    frames: doc.frames.map((f) => ({ ...f })),
    tags: doc.tags.map((t) => ({ ...t })),
    cels,
    ...(doc.godot ? { godot: { ...doc.godot } } : {}),
  };
}

export function documentToJson(doc: SpriteDocument): string {
  return JSON.stringify(serializeDocument(doc), null, 2);
}

export function documentFromJson(text: string): SpriteDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`Not a valid JSON file: ${(e as Error).message}`);
  }
  return deserializeDocument(raw);
}

export function deserializeDocument(raw: unknown): SpriteDocument {
  const f = raw as Partial<SpriteFileV1>;
  if (!f || typeof f !== 'object' || f.format !== FILE_FORMAT) throw new Error('Not an EasyPixel file');
  if (f.version !== FILE_VERSION) throw new Error(`Unsupported EasyPixel file version: ${f.version}`);
  const width = Number(f.width);
  const height = Number(f.height);
  assertCanvasSize(width, height);
  if (!Array.isArray(f.layers) || f.layers.length === 0) throw new Error('File has no layers');
  if (!Array.isArray(f.frames) || f.frames.length === 0) throw new Error('File has no frames');

  const layers: Layer[] = f.layers.map((l, i) => ({
    id: String(l.id),
    name: String(l.name ?? `Layer ${i + 1}`),
    visible: l.visible !== false,
    locked: l.locked === true,
    opacity: typeof l.opacity === 'number' ? Math.min(1, Math.max(0, l.opacity)) : 1,
  }));
  const frames: Frame[] = f.frames.map((fr) => ({
    id: String(fr.id),
    duration: typeof fr.duration === 'number' && fr.duration >= 1 ? Math.round(fr.duration) : DEFAULT_FRAME_DURATION,
  }));
  const directions: TagDirection[] = ['forward', 'reverse', 'pingpong'];
  const tags: Tag[] = (Array.isArray(f.tags) ? f.tags : [])
    .map((t) => ({
      id: String(t.id),
      name: String(t.name),
      from: Number(t.from),
      to: Number(t.to),
      direction: directions.includes(t.direction) ? t.direction : 'forward',
      loop: t.loop !== false,
    }))
    .filter((t) => Number.isInteger(t.from) && Number.isInteger(t.to) && t.from >= 0 && t.from <= t.to && t.to < frames.length);

  const layerIds = new Set(layers.map((l) => l.id));
  const frameIds = new Set(frames.map((fr) => fr.id));
  const cels: Record<string, CelData> = {};
  for (const c of Array.isArray(f.cels) ? f.cels : []) {
    if (!layerIds.has(c.layer) || !frameIds.has(c.frame)) continue;
    const data = decodeBase64(c.data);
    if (data.length !== width * height * 4) {
      throw new Error(`Cel ${c.layer}/${c.frame} has ${data.length} bytes, expected ${width * height * 4}`);
    }
    cels[celKey(c.layer, c.frame)] = new Uint8ClampedArray(data);
  }

  return {
    name: String(f.name ?? 'sprite'),
    width,
    height,
    palette: (Array.isArray(f.palette) ? f.palette : []).map((c) => parseHex(String(c))),
    layers,
    frames,
    tags,
    cels,
    ...(parseGodot(f.godot) ? { godot: parseGodot(f.godot) } : {}),
  };
}

function parseGodot(raw: unknown): GodotExportSettings | undefined {
  const g = raw as Partial<GodotExportSettings> | undefined;
  if (!g || typeof g !== 'object' || typeof g.dir !== 'string' || !g.dir) return undefined;
  const int = (v: unknown, min: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min ? v : undefined);
  const out: GodotExportSettings = { dir: g.dir };
  if (int(g.columns, 1)) out.columns = int(g.columns, 1);
  if (int(g.spacing, 0) !== undefined) out.spacing = int(g.spacing, 0);
  if (int(g.scale, 1)) out.scale = int(g.scale, 1);
  if (typeof g.autoplay === 'string') out.autoplay = g.autoplay;
  if (g.mode === 'sprite' || g.mode === 'tileset') out.mode = g.mode;
  if (int(g.tileWidth, 1)) out.tileWidth = int(g.tileWidth, 1);
  if (int(g.tileHeight, 1)) out.tileHeight = int(g.tileHeight, 1);
  return out;
}

// Portable base64 (works in browsers, Node and Electron without Buffer/atob).
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(128);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

export function encodeBase64(bytes: Uint8Array | Uint8ClampedArray): string {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    out += ALPHABET[b0 >> 2] + ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < len ? ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < len ? ALPHABET[b2 & 63] : '=';
  }
  return out;
}

export function decodeBase64(text: string): Uint8Array {
  const clean = String(text).replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n0 = LOOKUP[clean.charCodeAt(i)];
    const n1 = LOOKUP[clean.charCodeAt(i + 1)];
    const n2 = i + 2 < clean.length ? LOOKUP[clean.charCodeAt(i + 2)] : 0;
    const n3 = i + 3 < clean.length ? LOOKUP[clean.charCodeAt(i + 3)] : 0;
    out[o++] = (n0 << 2) | (n1 >> 4);
    if (i + 2 < clean.length) out[o++] = ((n1 & 15) << 4) | (n2 >> 2);
    if (i + 3 < clean.length) out[o++] = ((n2 & 3) << 6) | n3;
  }
  return out.subarray(0, o);
}
