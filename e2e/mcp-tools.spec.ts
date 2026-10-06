import { expect, test, type Page } from '@playwright/test';
import { pixelAt, ready } from './helpers';

/** Runs an MCP tool through the renderer executor (same code path Electron uses). */
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

test('Claude creates a sprite, draws, animates and can be undone', async ({ page }) => {
  let r = await tool(page, 'create_sprite', { name: 'coin', width: 8, height: 8, palette: ['#000000', '#ffd700'] });
  expect(r.isError).toBeFalsy();
  await expect(page.getByTestId('tabs').getByRole('tab')).toHaveCount(1); // replaced the untouched blank tab

  r = await tool(page, 'draw_grid', { rows: ['..0000..', '.011110.', '01111110'] });
  expect(textOf(r)).toContain('Drew 24 pixels');
  expect(await pixelAt(page, 2, 1)).toBe('#ffd700ff');
  expect(await pixelAt(page, 0, 0)).toBe('#00000000');

  r = await tool(page, 'add_frame', { duplicate: true });
  r = await tool(page, 'transform', { operation: 'flip_horizontal' });
  r = await tool(page, 'create_animation', { name: 'spin', from: 0, to: 1 });
  const state = JSON.parse(textOf(await tool(page, 'get_editor_state')));
  expect(state.active.frames).toHaveLength(2);
  expect(state.active.animations[0]).toMatchObject({ name: 'spin', from: 0, to: 1 });
  await expect(page.getByTestId('tags').getByRole('button', { name: /spin/ })).toBeVisible();

  // Claude's edits are marked in the history and the user can undo them.
  const label = await page.evaluate(() => (window as any).__easypixel.getState().history.present);
  expect(label).toMatchObject({ label: 'create_animation', source: 'claude' });
  await page.keyboard.press('Control+z');
  expect(JSON.parse(textOf(await tool(page, 'get_editor_state'))).active.animations).toHaveLength(0);
});

test('returns images and grids Claude can inspect', async ({ page }) => {
  await tool(page, 'create_sprite', { name: 'dot', width: 4, height: 4, palette: 'pico-8' });
  await tool(page, 'draw_pixels', { pixels: [{ x: 1, y: 2, color: 8 }] });
  const img = await tool(page, 'get_frame_image', { scale: 10 });
  const image = img.content.find((c) => c.type === 'image')!;
  expect(image.data!.length).toBeGreaterThan(100);
  expect(textOf(img)).toContain('40x40px');
  const grid = JSON.parse(textOf(await tool(page, 'get_frame_grid', {})));
  expect(grid.rows).toEqual(['....', '....', '.8..', '....']);
  expect(grid.legend).toEqual({ '8': '#ff004d' });
});

test('reports helpful errors instead of failing silently', async ({ page }) => {
  let r = await tool(page, 'draw_grid', { rows: ['Z'] });
  expect(r.isError).toBe(true);
  expect(textOf(r)).toMatch(/not palette indices/);
  r = await tool(page, 'draw_pixels', { pixels: [{ x: 0, y: 0, color: 1 }], layer: 'missing' });
  expect(textOf(r)).toMatch(/Layer "missing" not found/);
  r = await tool(page, 'create_sprite', { name: 'x', width: 8, height: 8, palette: 'nope' });
  expect(textOf(r)).toMatch(/Unknown palette preset/);
  r = await tool(page, 'select_sprite', { sprite_id: 'sprite_999' });
  expect(r.isError).toBe(true);
});

test('keeps user work: new sprites from Claude open in another tab', async ({ page }) => {
  // The user draws something first
  const canvas = page.getByTestId('canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await tool(page, 'create_sprite', { name: 'enemy', width: 16, height: 16 });
  const tabs = page.getByTestId('tabs').getByRole('tab');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(1)).toContainText('enemy');
  await expect(tabs.nth(1).locator('.claude-mark')).toBeVisible();
  await tabs.nth(0).click();
  const state = JSON.parse(textOf(await tool(page, 'get_editor_state')));
  expect(state.sprites.map((s: { name: string }) => s.name)).toEqual(['sprite', 'enemy']);
  expect(state.sprites[0].active).toBe(true);
});
