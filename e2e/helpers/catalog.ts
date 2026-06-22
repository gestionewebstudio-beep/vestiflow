import { expect, type Page } from '@playwright/test';

import { waitForDashboardReady, waitForProductListReady } from './page-ready';

export async function resolveTestSku(page: Page): Promise<string> {
  const fromEnv = process.env.E2E_TEST_SKU?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  await page.goto('/app/dashboard');
  await waitForDashboardReady(page);

  const dashboardSku = page.locator('.low-stock__sku').first();
  if (await dashboardSku.isVisible()) {
    const sku = (await dashboardSku.textContent())?.trim() ?? '';
    if (sku) {
      return sku;
    }
  }

  const listState = await waitForProductListReady(page);
  if (listState === 'empty') {
    throw new Error(
      'Catalogo vuoto: imposta E2E_TEST_SKU in .env oppure aggiungi prodotti al tenant di test.',
    );
  }

  const firstRow = page.locator('.product-table__row').first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();

  await expect(page.locator('h1.product-detail__title')).toBeVisible({ timeout: 30_000 });

  const skuCell = page.locator('.variant-table__sku').first();
  await expect(skuCell).toBeVisible({ timeout: 30_000 });

  const sku = (await skuCell.textContent())?.trim() ?? '';
  if (!sku) {
    throw new Error('Impossibile leggere lo SKU dalla pagina dettaglio prodotto.');
  }

  return sku;
}
