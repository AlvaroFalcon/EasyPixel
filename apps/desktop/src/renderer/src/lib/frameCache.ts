import { celKey, compositeFrame, type SpriteDocument } from '@easypixel/core';

/**
 * Flattened frame images shared by the canvas, onion skin, thumbnails and the
 * animation preview. An entry is rebuilt only when one of the frame's cels or
 * the layer setup changed, so drawing on frame 3 doesn't recomposite frame 7.
 */
interface Entry {
  deps: unknown[];
  canvas: HTMLCanvasElement;
  tinted: Map<string, HTMLCanvasElement>;
}

const cache = new Map<string, Entry>();
let knownFrames: SpriteDocument['frames'] | null = null;

function depsOf(doc: SpriteDocument, frameId: string): unknown[] {
  return [doc.width, doc.height, doc.layers, ...doc.layers.map((l) => doc.cels[celKey(l.id, frameId)])];
}

function sameDeps(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function prune(doc: SpriteDocument): void {
  if (knownFrames === doc.frames) return;
  knownFrames = doc.frames;
  const alive = new Set(doc.frames.map((f) => f.id));
  for (const id of cache.keys()) if (!alive.has(id)) cache.delete(id);
}

export function frameCanvas(doc: SpriteDocument, frameIndex: number): HTMLCanvasElement {
  prune(doc);
  const frame = doc.frames[frameIndex];
  const deps = depsOf(doc, frame.id);
  let entry = cache.get(frame.id);
  if (!entry || !sameDeps(entry.deps, deps)) {
    const canvas = entry?.canvas ?? document.createElement('canvas');
    canvas.width = doc.width;
    canvas.height = doc.height;
    canvas.getContext('2d')!.putImageData(new ImageData(compositeFrame(doc, frameIndex), doc.width, doc.height), 0, 0);
    entry = { deps, canvas, tinted: new Map() };
    cache.set(frame.id, entry);
  }
  return entry.canvas;
}

/** The frame image with a translucent color wash (used to tell onion-skin frames apart). */
export function tintedFrameCanvas(doc: SpriteDocument, frameIndex: number, tint: string): HTMLCanvasElement {
  const base = frameCanvas(doc, frameIndex);
  const entry = cache.get(doc.frames[frameIndex].id)!;
  let tinted = entry.tinted.get(tint);
  if (!tinted) {
    tinted = document.createElement('canvas');
    tinted.width = base.width;
    tinted.height = base.height;
    const ctx = tinted.getContext('2d')!;
    ctx.drawImage(base, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, tinted.width, tinted.height);
    entry.tinted.set(tint, tinted);
  }
  return tinted;
}
