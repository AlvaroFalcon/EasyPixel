import { parseHex, type Color } from './color';

/**
 * Pixel data of one layer in one frame: RGBA bytes, row-major, width * height * 4.
 * Same memory layout as ImageData, so the renderer can blit it directly.
 *
 * Cel buffers are treated as immutable once they are part of a document:
 * edits copy the buffer first (copy-on-write) so older documents kept in the
 * undo history are never affected.
 */
export type CelData = Uint8ClampedArray<ArrayBuffer>;

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0..1 */
  opacity: number;
}

export interface Frame {
  id: string;
  /** Display time in milliseconds. */
  duration: number;
}

export type TagDirection = 'forward' | 'reverse' | 'pingpong';

/** A named animation: a contiguous range of frames (like Aseprite tags). */
export interface Tag {
  id: string;
  name: string;
  /** Inclusive frame indices. */
  from: number;
  to: number;
  direction: TagDirection;
  loop: boolean;
}

/** Remembered Godot export target, so re-exporting is one click (saved in the project file). */
export interface GodotExportSettings {
  /** Absolute folder inside a Godot project. */
  dir: string;
  columns?: number;
  spacing?: number;
  scale?: number;
  autoplay?: string;
}

export interface SpriteDocument {
  name: string;
  width: number;
  height: number;
  palette: Color[];
  /** Bottom-most layer first. */
  layers: Layer[];
  frames: Frame[];
  tags: Tag[];
  /** Keyed by celKey(layerId, frameId). A missing entry means a fully transparent cel. */
  cels: Record<string, CelData>;
  godot?: GodotExportSettings;
}

export const DEFAULT_FRAME_DURATION = 100;
export const MAX_CANVAS_SIZE = 1024;

export function celKey(layerId: string, frameId: string): string {
  return `${layerId}/${frameId}`;
}

let idCounter = 0;
/** Short unique id, readable enough to be used from the MCP API. */
export function newId(prefix: string): string {
  idCounter = (idCounter + 1) % 1296;
  const rand = Math.floor(Math.random() * 36 ** 5).toString(36).padStart(5, '0');
  return `${prefix}_${rand}${idCounter.toString(36).padStart(2, '0')}`;
}

export function createCel(width: number, height: number): CelData {
  return new Uint8ClampedArray(width * height * 4);
}

export function createLayer(name: string): Layer {
  return { id: newId('layer'), name, visible: true, locked: false, opacity: 1 };
}

export function createFrame(duration = DEFAULT_FRAME_DURATION): Frame {
  return { id: newId('frame'), duration };
}

export interface CreateDocumentOptions {
  name?: string;
  width: number;
  height: number;
  palette?: Color[];
}

export const DEFAULT_PALETTE: Color[] = [
  '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
  '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
].map(parseHex);

export function assertCanvasSize(width: number, height: number): void {
  for (const [label, v] of [['width', width], ['height', height]] as const) {
    if (!Number.isInteger(v) || v < 1 || v > MAX_CANVAS_SIZE) {
      throw new Error(`Canvas ${label} must be an integer between 1 and ${MAX_CANVAS_SIZE} (got ${v})`);
    }
  }
}

export function createDocument(opts: CreateDocumentOptions): SpriteDocument {
  assertCanvasSize(opts.width, opts.height);
  return {
    name: opts.name ?? 'sprite',
    width: opts.width,
    height: opts.height,
    palette: [...(opts.palette ?? DEFAULT_PALETTE)],
    layers: [createLayer('Layer 1')],
    frames: [createFrame()],
    tags: [],
    cels: {},
  };
}

export function getCel(doc: SpriteDocument, layerId: string, frameId: string): CelData | undefined {
  return doc.cels[celKey(layerId, frameId)];
}

export function layerIndex(doc: SpriteDocument, layerId: string): number {
  const i = doc.layers.findIndex((l) => l.id === layerId);
  if (i < 0) throw new Error(`Layer not found: ${layerId}`);
  return i;
}

export function frameIndex(doc: SpriteDocument, frameId: string): number {
  const i = doc.frames.findIndex((f) => f.id === frameId);
  if (i < 0) throw new Error(`Frame not found: ${frameId}`);
  return i;
}

export function inBounds(doc: { width: number; height: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < doc.width && y < doc.height;
}
