import { expect, test } from '@playwright/test';
import { clickPixel, ready } from './helpers';

test('exports spritesheet, SpriteFrames and scene for Godot', async ({ page }) => {
  await ready(page);
  await clickPixel(page, 1, 1);
  await page.getByTestId('duplicate-frame').click();
  await page.getByTestId('new-tag').click();
  await page.getByTestId('tag-name').fill('idle');
  await page.getByRole('button', { name: 'Crear' }).click();

  await page.getByRole('button', { name: 'Archivo' }).click();
  await page.getByRole('menuitem', { name: /Exportar a Godot/ }).click();
  await expect(page.getByRole('dialog')).toContainText('sprite.tres');
  await expect(page.getByRole('dialog')).toContainText('hframes=2, vframes=1');

  const downloads: string[] = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  const tres = page.waitForEvent('download', (d) => d.suggestedFilename() === 'sprite.tres');
  await page.getByRole('button', { name: 'Exportar' }).click();
  const content = await (await tres).createReadStream().then(async (s) => {
    let text = '';
    for await (const chunk of s) text += chunk;
    return text;
  });
  expect(content).toContain('[gd_resource type="SpriteFrames"');
  expect(content).toContain('"name": &"idle"');
  await expect.poll(() => downloads.sort()).toEqual(['sprite.png', 'sprite.tres', 'sprite.tscn']);
  await page.screenshot({ path: test.info().outputPath('after-export.png') });
});
