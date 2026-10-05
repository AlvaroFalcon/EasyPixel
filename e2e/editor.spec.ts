import { expect, test } from '@playwright/test';
import { clickPixel, docInfo, dragPixels, pixelAt, ready } from './helpers';

const BLACK = '#000000ff';
const EMPTY = '#00000000';

test.beforeEach(async ({ page }) => {
  await ready(page);
});

test('draws with the pencil and undoes / redoes', async ({ page }) => {
  await clickPixel(page, 3, 4);
  expect(await pixelAt(page, 3, 4)).toBe(BLACK);
  await dragPixels(page, [0, 0], [5, 0]);
  expect(await pixelAt(page, 5, 0)).toBe(BLACK);

  await page.keyboard.press('Control+z');
  expect(await pixelAt(page, 5, 0)).toBe(EMPTY);
  expect(await pixelAt(page, 3, 4)).toBe(BLACK);
  await page.keyboard.press('Control+y');
  expect(await pixelAt(page, 5, 0)).toBe(BLACK);
  await expect(page.getByTestId('doc-title').locator('.dirty-dot')).toBeVisible();
});

test('erases with the right tool and picks palette colors', async ({ page }) => {
  // Pick a palette color (index 8 of PICO-8 is #ff004d).
  await page.getByTestId('palette').locator('button').nth(8).click();
  await clickPixel(page, 1, 1);
  expect(await pixelAt(page, 1, 1)).toBe('#ff004dff');
  await page.keyboard.press('e');
  await clickPixel(page, 1, 1);
  expect(await pixelAt(page, 1, 1)).toBe(EMPTY);
});

test('draws rectangles and fills them with the bucket', async ({ page }) => {
  await page.getByTestId('tool-rect').click();
  await dragPixels(page, [2, 2], [8, 8]);
  expect(await pixelAt(page, 2, 2)).toBe(BLACK);
  expect(await pixelAt(page, 8, 5)).toBe(BLACK);
  expect(await pixelAt(page, 5, 5)).toBe(EMPTY);

  await page.getByTestId('palette').locator('button').nth(11).click(); // #00e436
  await page.getByTestId('tool-bucket').click();
  await clickPixel(page, 5, 5);
  expect(await pixelAt(page, 5, 5)).toBe('#00e436ff');
  // Fill stays inside the rectangle
  expect(await pixelAt(page, 0, 0)).toBe(EMPTY);
  expect((await docInfo(page)).undoLabel).toBe('Cubo de relleno');
});

test('moves a selection', async ({ page }) => {
  await clickPixel(page, 1, 1);
  await page.keyboard.press('m');
  await dragPixels(page, [0, 0], [2, 2]); // select 3x3
  await dragPixels(page, [1, 1], [11, 1]); // move right by 10
  await page.keyboard.press('Enter');
  expect(await pixelAt(page, 1, 1)).toBe(EMPTY);
  expect(await pixelAt(page, 11, 1)).toBe(BLACK);
  // Moving is a single undo step
  await page.keyboard.press('Control+z');
  expect(await pixelAt(page, 1, 1)).toBe(BLACK);
  expect(await pixelAt(page, 11, 1)).toBe(EMPTY);
});

test('manages layers and frames', async ({ page }) => {
  await clickPixel(page, 0, 0);
  await page.getByTestId('add-layer').click();
  expect((await docInfo(page)).layers).toBe(2);
  await expect(page.getByTestId('layers').locator('li')).toHaveCount(2);

  await page.getByTestId('duplicate-frame').click();
  await page.getByTestId('add-frame').click();
  const info = await docInfo(page);
  expect(info.frames).toBe(3);
  expect(info.frameIndex).toBe(2);
  await expect(page.getByTestId('frame-counter')).toHaveText('3 / 3');
  await page.keyboard.press(',');
  await expect(page.getByTestId('frame-counter')).toHaveText('2 / 3');
});

test('creates a new sprite from the dialog', async ({ page }) => {
  await page.getByRole('button', { name: 'Archivo' }).click();
  await page.getByRole('menuitem', { name: /Nuevo sprite/ }).click();
  await page.getByTestId('new-name').fill('hero');
  await page.getByRole('button', { name: '16×16' }).click();
  await page.getByRole('button', { name: 'Crear' }).click();
  const info = await docInfo(page);
  expect(info.width).toBe(16);
  expect(info.height).toBe(16);
  await expect(page.getByTestId('doc-title')).toContainText('hero');
});

test('saves a project file that can be opened again', async ({ page }) => {
  await clickPixel(page, 2, 3);
  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('sprite.epx.json');
  const path = await download.path();

  await page.getByRole('button', { name: 'Archivo' }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: /Abrir/ }).click();
  await (await chooserPromise).setFiles(path!);
  await expect(page.getByTestId('notice')).toContainText('Abierto');
  expect(await pixelAt(page, 2, 3)).toBe(BLACK);
});
