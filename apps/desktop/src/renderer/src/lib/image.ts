import type { PixelRegion } from '@easypixel/core';

/** Decodes PNG/any browser-supported image bytes into RGBA pixels. */
export async function decodeImage(bytes: Uint8Array): Promise<PixelRegion> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: img.width, height: img.height, data: img.data };
}

export async function encodePng(region: PixelRegion): Promise<Uint8Array> {
  const canvas = regionToCanvas(region);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  return new Uint8Array(await blob.arrayBuffer());
}

export function regionToCanvas(region: PixelRegion, canvas = document.createElement('canvas')): HTMLCanvasElement {
  canvas.width = region.width;
  canvas.height = region.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(region.data), region.width, region.height), 0, 0);
  return canvas;
}
