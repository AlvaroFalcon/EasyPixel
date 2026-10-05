import type { Page } from '@playwright/test';

export interface DocInfo {
  width: number;
  height: number;
  layers: number;
  frames: number;
  frameIndex: number;
  zoom: number;
  pan: { x: number; y: number };
  undoLabel: string;
}

export async function docInfo(page: Page): Promise<DocInfo> {
  return page.evaluate(() => {
    const s = (window as any).__easypixel.getState();
    return {
      width: s.doc.width,
      height: s.doc.height,
      layers: s.doc.layers.length,
      frames: s.doc.frames.length,
      frameIndex: s.frameIndex,
      zoom: s.zoom,
      pan: s.pan,
      undoLabel: s.history.present.label,
    };
  });
}

/** Hex color ("#rrggbbaa") of a pixel of the active layer in the active frame. */
export async function pixelAt(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ([x, y]) => {
      const s = (window as any).__easypixel.getState();
      const frame = s.doc.frames[s.frameIndex];
      const cel = s.doc.cels[`${s.layerId}/${frame.id}`];
      if (!cel) return '#00000000';
      const i = (y * s.doc.width + x) * 4;
      return '#' + [cel[i], cel[i + 1], cel[i + 2], cel[i + 3]].map((v: number) => v.toString(16).padStart(2, '0')).join('');
    },
    [x, y],
  );
}

/** Screen position of the center of sprite pixel (x, y). */
export async function screenOf(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const { zoom, pan } = await docInfo(page);
  return { x: box.x + pan.x + (x + 0.5) * zoom, y: box.y + pan.y + (y + 0.5) * zoom };
}

export async function clickPixel(page: Page, x: number, y: number, button: 'left' | 'right' = 'left'): Promise<void> {
  const p = await screenOf(page, x, y);
  await page.mouse.click(p.x, p.y, { button });
}

export async function dragPixels(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const a = await screenOf(page, ...from);
  const b = await screenOf(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

export async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__easypixel?.getState().pan !== null);
}
