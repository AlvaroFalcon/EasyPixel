import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { clickPixel, ready } from './helpers';

async function tool(page: Page, name: string, args: Record<string, unknown> = {}) {
  return page.evaluate(
    ([name, args]) => (window as any).__easypixel.executeTool({ id: 1, tool: name, args }),
    [name, args] as const,
  ) as Promise<{ content: { type: string; text?: string; data?: string }[]; isError?: boolean }>;
}
const textOf = (r: { content: { type: string; text?: string }[] }) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');

test.beforeEach(async ({ page }) => {
  await ready(page);
});

test('previews the sprite in 3D and exports .glb and .vox files', async ({ page }) => {
  await clickPixel(page, 1, 1);
  await clickPixel(page, 2, 1);
  await page.getByRole('button', { name: 'Archivo' }).click();
  await page.getByRole('menuitem', { name: /voxel 3D/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(page.getByTestId('voxel-canvas')).toBeVisible();
  // Two pixels, extruded: cropped to 2×1 and the default thickness.
  await page.getByTestId('voxel-mode-extrude').click();
  await expect(page.getByTestId('voxel-info')).toContainText(/^2×1×\d+ /);

  const info = (await page.getByTestId('voxel-info').textContent())!;
  const depth = Number(/^2×1×(\d+)/.exec(info)![1]);
  await page.getByTestId('voxel-depth').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('voxel-info')).toContainText(`2×1×${depth + 2} voxels · ${2 * (depth + 2)} llenos`);

  let download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Exportar' }).click();
  let file = await download;
  expect(file.suggestedFilename()).toBe('sprite.glb');
  expect(readFileSync((await file.path())!).subarray(0, 4).toString('latin1')).toBe('glTF');

  await page.getByRole('button', { name: 'Archivo' }).click();
  await page.getByRole('menuitem', { name: /voxel 3D/ }).click();
  await page.getByTestId('voxel-format-vox').check();
  download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Exportar' }).click();
  file = await download;
  expect(file.suggestedFilename()).toBe('sprite.vox');
  expect(readFileSync((await file.path())!).subarray(0, 4).toString('latin1')).toBe('VOX ');
});

test('MCP: voxel preview, export and region inspection', async ({ page }) => {
  await tool(page, 'create_sprite', { name: 'block', width: 64, height: 64, palette: 'pico-8' });
  await tool(page, 'draw_shape', { shape: 'rect', from: { x: 40, y: 40 }, to: { x: 43, y: 43 }, color: 8, filled: true });

  const preview = await tool(page, 'get_voxel_preview', { mode: 'extrude', depth: 2 });
  expect(preview.isError).toBeFalsy();
  expect(preview.content.find((c) => c.type === 'image')!.data!.length).toBeGreaterThan(500);
  expect(textOf(preview)).toContain('4×4×2 voxels');

  const grid = JSON.parse(textOf(await tool(page, 'get_frame_grid', { region: { x: 39, y: 39, width: 6, height: 2 } })));
  expect(grid).toMatchObject({ x: 39, y: 39, rows: ['......', '.8888.'] });
  const image = await tool(page, 'get_frame_image', { region: { x: 40, y: 40, width: 4, height: 4 }, scale: 8 });
  expect(textOf(image)).toContain('32x32px');

  const download = page.waitForEvent('download');
  const r = await tool(page, 'export_voxel', { path: '/tmp/block.vox', mode: 'inflate', depth: 4 });
  expect(r.isError).toBeFalsy();
  expect((await download).suggestedFilename()).toBe('block.vox');
  expect((await tool(page, 'export_voxel', { path: '/tmp/block.obj', mode: 'extrude' })).isError).toBe(true);
});
