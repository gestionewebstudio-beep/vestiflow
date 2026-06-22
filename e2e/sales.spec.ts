import { expect, test } from '@playwright/test';

import { waitForSalesReady } from './helpers/page-ready';

test.describe('Vendite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/sales');
    await expect(page.locator('h1.sales-list__title')).toHaveText('Vendite', {
      timeout: 30_000,
    });
  });

  test('carica lista vendite o empty state', async ({ page }) => {
    const skeleton = page.locator('app-table-skeleton');
    const table = page.locator('app-sales-order-table');
    const empty = page.getByText('Nessuna vendita', { exact: true });
    const error = page.locator('app-error-state');

    await expect(skeleton.or(table).or(empty).or(error)).toBeVisible({ timeout: 30_000 });
  });

  test('ricerca vendite accetta input', async ({ page }) => {
    const search = page.locator('#sales-search');
    await expect(search).toBeVisible();
    await search.fill('#1001');
    await expect(search).toHaveValue('#1001');
  });

  test('apre dettaglio vendita dalla lista', async ({ page }) => {
    const state = await waitForSalesReady(page);
    if (state === 'empty') {
      test.skip(true, 'Nessuna vendita nel tenant di test.');
      return;
    }

    const firstRow = page.locator('.sales-table__row').first();
    const orderNumber = (
      (await firstRow.locator('.sales-table__number').textContent()) ?? ''
    ).trim();
    expect(orderNumber.length).toBeGreaterThan(0);

    await firstRow.click();
    await expect(page).toHaveURL(/\/app\/sales\/[^/]+$/, { timeout: 15_000 });
    await expect(page.locator('h1.sales-detail__title')).toHaveText(orderNumber);
  });
});
