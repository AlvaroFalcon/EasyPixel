import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Download } from '@playwright/test';
import { clickPixel, ready } from './helpers';

const SLIME_PNG = join(__dirname, '../examples/slime/slime.png');

async function bytesOf(download: Download): Promise<Buffer> {
  return readFileSync((await download.path())!);
}

test.beforeEach(async ({ page }) => {
  await ready(page);
});

test('exports an animated GIF of the selected animation', async ({ page }) => {
  await clickPixel(page, 1, 1);
  await page.getByTestId('duplicate-frame').click();
  await page.keyboard.press('Control+e');
  await page.getByTestId('export-gif').check();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('sprite.gif');
  const bytes = await bytesOf(file);
  expect(bytes.subarray(0, 6).toString()).toBe('GIF89a');
  expect(bytes[bytes.length - 1]).toBe(0x3b);
});

test('shows a reference image with adjustable opacity', async ({ page }) => {
  await page.getByRole('button', { name: 'Ver', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: /Imagen de referencia/ }).click();
  await (await chooser).setFiles(SLIME_PNG);
  const panel = page.getByTestId('reference-panel');
  await expect(panel).toContainText('slime.png');
  await panel.getByRole('slider').first().fill('80');
  await expect(panel).toContainText('80%');
  await panel.getByTitle('Quitar referencia').click();
  await expect(panel).toHaveCount(0);
});

test('saves palettes to the library and reuses them', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.getByTitle('Más opciones de paleta').click();
  await page.getByRole('menuitem', { name: /Guardar en mis paletas/ }).click();
  await page.getByTestId('palette-name').fill('Mi paleta');
  await page.getByRole('button', { name: 'Aceptar' }).click();
  const select = page.locator('.preset-select');
  await expect(select.locator('optgroup[label="Mis paletas"] option')).toHaveText(['Mi paleta (16)']);
  // Survives a reload (local library)
  await page.reload();
  await expect(page.locator('.preset-select optgroup[label="Mis paletas"] option')).toHaveCount(1);
});

test('draws a tile grid and exports a Godot TileSet', async ({ page }) => {
  await page.getByRole('button', { name: 'Ver', exact: true }).click();
  await page.getByRole('menuitem', { name: /Rejilla de tiles: 16×16/ }).click();
  expect(await page.evaluate(() => (window as any).__easypixel.getState().tileGrid)).toBe(16);

  await clickPixel(page, 20, 3);
  await page.getByRole('button', { name: 'Archivo' }).click();
  await page.getByRole('menuitem', { name: /Exportar a Godot/ }).click();
  await page.getByTestId('godot-tileset').click();
  await page.getByTestId('tile-w').fill('12');
  await expect(page.getByRole('dialog')).toContainText('debe ser múltiplo');
  await page.getByTestId('tile-w').fill('16');
  const tres = page.waitForEvent('download', (d) => d.suggestedFilename() === 'sprite_tileset.tres');
  await page.getByRole('button', { name: 'Exportar' }).click();
  const text = (await bytesOf(await tres)).toString();
  expect(text).toContain('[gd_resource type="TileSet"');
  expect(text).toContain('1:0/0 = 0'); // the pixel at (20, 3) lives in tile (1, 0)
  expect(text).not.toContain('0:0/0 = 0');
});
