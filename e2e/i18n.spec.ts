import { expect, test } from '@playwright/test';
import { ready } from './helpers';

test('switches the UI language and remembers it', async ({ page }) => {
  await ready(page);
  await expect(page.getByRole('button', { name: 'Archivo' })).toBeVisible();
  await page.getByRole('button', { name: 'Ver', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Idioma: English' }).click();

  await expect(page.getByRole('button', { name: 'File' })).toBeVisible();
  await expect(page.getByTestId('frames').locator('..').locator('..')).toContainText('Onion skin');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');

  // The choice is remembered across reloads
  await page.reload();
  await expect(page.getByRole('button', { name: 'File' })).toBeVisible();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Language: Español' }).click();
  await expect(page.getByRole('button', { name: 'Archivo' })).toBeVisible();
});

test.describe('on an English system', () => {
  test.use({ locale: 'en-US' });
  test('starts in English', async ({ page }) => {
    await ready(page);
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  });
});
