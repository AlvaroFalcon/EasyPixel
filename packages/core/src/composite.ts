import { celKey, createCel, type CelData, type SpriteDocument } from './document';
import { blendInto } from './ops';

export interface CompositeOptions {
  /** Include layers whose `visible` flag is off. */
  includeHidden?: boolean;
  /** Restrict the composition to these layer ids. */
  layerIds?: string[];
}

/** Flattens all visible layers of a frame into a single RGBA buffer. */
export function compositeFrame(doc: SpriteDocument, frameIndex: number, opts: CompositeOptions = {}): CelData {
  const frame = doc.frames[frameIndex];
  if (!frame) throw new Error(`Frame index out of range: ${frameIndex}`);
  const out = createCel(doc.width, doc.height);
  for (const layer of doc.layers) {
    if (!opts.includeHidden && !layer.visible) continue;
    if (opts.layerIds && !opts.layerIds.includes(layer.id)) continue;
    const data = doc.cels[celKey(layer.id, frame.id)];
    if (data) blendInto(out, data, layer.opacity);
  }
  return out;
}
