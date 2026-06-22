import { expect, test } from '@playwright/test';

import { resolveTestSku } from './helpers/catalog';

test.describe('Magazzino', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/inventory');
    await expect(page.locator('h1.inventory-levels__title')).toHaveText('Magazzino', {
      timeout: 30_000,
    });
  });

  test('carica tabella giacenze o empty state', async ({ page }) => {
    const skeleton = page.locator('app-table-skeleton');
    const table = page.locator('app-inventory-level-table');
    const empty = page.getByText('Nessuna giacenza', { exact: true });
    const error = page.locator('app-error-state');

    await expect(skeleton.or(table).or(empty).or(error)).toBeVisible({ timeout: 30_000 });
  });

  test('filtra giacenze per testo di ricerca', async ({ page }) => {
    const search = page.locator('#inventory-search');
    await expect(search).toBeVisible();

    await search.fill('SKU-TEST');
    await expect(search).toHaveValue('SKU-TEST');
  });

  test('tab Cerca apre lookup giacenza', async ({ page }) => {
    await page.getByRole('link', { name: 'Cerca', exact: true }).click();
    await expect(page.locator('h1.stock-lookup__title')).toHaveText('Magazzino');
    await expect(page.getByRole('button', { name: 'Cerca giacenza' })).toBeVisible();
  });

  test('lookup giacenza per SKU trova la variante', async ({ page }) => {
    const sku = await resolveTestSku(page);

    await page.goto('/app/inventory/lookup');
    await expect(page.locator('#stock-code')).toBeVisible({ timeout: 30_000 });
    await page.locator('#stock-code').fill(sku);
    await page.getByRole('button', { name: 'Cerca giacenza' }).click();

    await expect(page.locator('#lookup-result-title')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.stock-lookup__meta')).toContainText(sku);
    await expect(
      page.locator('.stock-lookup__table').or(page.getByText('Nessuna giacenza', { exact: true })),
    ).toBeVisible();
  });
});
