import { expect, test, type Page } from '@playwright/test';
import { clickPixel, ready, screenOf } from './helpers';

async function tags(page: Page) {
  return page.evaluate(() =>
    (window as any).__easypixel.getState().doc.tags.map((t: any) => ({
      name: t.name,
      from: t.from,
      to: t.to,
      direction: t.direction,
      loop: t.loop,
    })),
  );
}

/** Builds 4 frames, each with one pixel at x = frame index. */
async function fourFrames(page: Page) {
  for (let i = 0; i < 4; i++) {
    if (i > 0) await page.getByTestId('add-frame').click();
    await clickPixel(page, i, 0);
  }
}

test.beforeEach(async ({ page }) => {
  await ready(page);
});

test('creates an animation from a shift+click frame range and edits it', async ({ page }) => {
  await fourFrames(page);
  const cells = page.getByTestId('frames').locator('button');
  await cells.nth(1).click();
  await cells.nth(3).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('frames').locator('.in-range')).toHaveCount(3);

  await page.getByTestId('new-tag').click();
  await page.getByTestId('tag-name').fill('walk');
  await page.getByRole('button', { name: 'Crear' }).click();
  expect(await tags(page)).toEqual([{ name: 'walk', from: 1, to: 3, direction: 'forward', loop: true }]);
  await expect(page.getByTestId('tags').getByRole('button', { name: /walk/ })).toBeVisible();

  // Double click opens the editor
  await page.getByTestId('tags').getByRole('button', { name: /walk/ }).dblclick();
  await page.getByRole('button', { name: 'Ping-pong' }).click();
  await page.getByRole('button', { name: 'Aceptar' }).click();
  expect((await tags(page))[0].direction).toBe('pingpong');

  // Undo restores the previous tag state
  await page.keyboard.press('Control+z');
  expect((await tags(page))[0].direction).toBe('forward');
});

test('rejects duplicated animation names', async ({ page }) => {
  await page.getByTestId('new-tag').click();
  await page.getByTestId('tag-name').fill('idle');
  await page.getByRole('button', { name: 'Crear' }).click();
  await page.getByTestId('new-tag').click();
  await page.getByTestId('tag-name').fill('idle');
  await expect(page.getByRole('button', { name: 'Crear' })).toBeDisabled();
});

test('plays the selected animation in the preview', async ({ page }) => {
  await fourFrames(page);
  await page.getByTestId('frames').locator('button').nth(2).click();
  await page.getByTestId('frames').locator('button').nth(3).click({ modifiers: ['Shift'] });
  await page.getByTestId('new-tag').click();
  await page.getByTestId('tag-name').fill('run');
  await page.getByRole('button', { name: 'Crear' }).click();

  await page.keyboard.press('p');
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    seen.add((await page.getByTestId('preview-canvas').getAttribute('data-frame'))!);
    await page.waitForTimeout(40);
  }
  // Only frames of the "run" animation (indices 2 and 3) are played.
  expect([...seen].sort()).toEqual(['2', '3']);
  await page.keyboard.press('p');
  await expect(page.getByTestId('play')).toHaveText('▶');
});

test('shows the previous frame as onion skin', async ({ page }) => {
  await clickPixel(page, 5, 5);
  await page.getByTestId('add-frame').click();
  const p = await screenOf(page, 5, 5);
  const read = () =>
    page.evaluate(([x, y]) => {
      const canvas = document.querySelector('[data-testid=canvas]') as HTMLCanvasElement;
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const d = canvas.getContext('2d')!.getImageData(Math.round((x - r.left) * dpr), Math.round((y - r.top) * dpr), 1, 1).data;
      return [d[0], d[1], d[2]];
    }, [p.x, p.y]);
  await page.waitForTimeout(50);
  const without = await read();
  await page.getByTestId('onion-skin').check();
  await page.waitForTimeout(50);
  const withOnion = await read();
  expect(withOnion).not.toEqual(without);
  // Red tint for the previous frame
  expect(withOnion[0]).toBeGreaterThan(withOnion[2]);
});
