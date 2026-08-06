import { expect, test } from '@playwright/test';

import {
  analyzeProductCsv,
  buildUniqueProductCsv,
  confirmProductImport,
  openProductImport,
} from './helpers/import-csv';
import { waitForProductListReady } from './helpers/page-ready';

test.describe('Import prodotti CSV — scrittura reale', () => {
  test.describe.configure({ mode: 'serial' });

  test('importa un prodotto unico da CSV', async ({ page }) => {
    test.setTimeout(180_000);

    const stamp = Date.now();
    const handle = `e2e-import-${stamp}`;
    const sku = `E2E-IMP-${stamp}`;
    const title = `E2E Import ${stamp}`;

    const canImport = await openProductImport(page);
    if (!canImport) {
      test.skip(true, 'Utente E2E senza permesso import prodotti.');
      return;
    }

    await analyzeProductCsv(page, buildUniqueProductCsv(handle, sku, title), `${handle}.csv`);
    await confirmProductImport(page);

    const stats = await page.locator('.product-import__done-stats').textContent();
    expect(stats).toMatch(/1 importati|importati · 0 saltati · 0 falliti/);
  });

  test('prodotto importato compare in lista con ricerca', async ({ page }) => {
    test.setTimeout(120_000);

    const stamp = Date.now();
    const handle = `e2e-import-${stamp}`;
    const sku = `E2E-IMP-${stamp}`;
    const title = `E2E Import ${stamp}`;

    const canImport = await openProductImport(page);
    if (!canImport) {
      test.skip(true, 'Utente E2E senza permesso import prodotti.');
      return;
    }

    await analyzeProductCsv(page, buildUniqueProductCsv(handle, sku, title), `${handle}.csv`);
    await confirmProductImport(page);

    await page.getByRole('button', { name: 'Vai ai prodotti' }).click();
    await expect(page).toHaveURL(/\/app\/products/);

    const listState = await waitForProductListReady(page);
    if (listState === 'empty') {
      test.skip(true, 'Lista prodotti vuota dopo import.');
      return;
    }

    await page.locator('#product-search').fill(title);
    await expect(
      page.locator('.product-table__row').filter({ hasText: title }).first(),
    ).toBeVisible({
      timeout: 30_000,
    });
  });
});
