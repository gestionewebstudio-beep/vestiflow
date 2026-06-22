import { expect, test } from '@playwright/test';

import { resolveTestSku } from './helpers/catalog';
import { waitForDashboardReady, waitForProductListReady } from './helpers/page-ready';

test.describe('Flussi P0 su mobile', () => {
  test('dashboard mostra KPI e sidebar navigabile', async ({ page }) => {
    await page.goto('/app/dashboard');
    await waitForDashboardReady(page);

    await expect(page.locator('.dashboard__kpis')).toBeVisible();
    await expect(page.locator('nav.app-sidebar')).toBeVisible();
  });

  test('lista prodotti è consultabile', async ({ page }) => {
    await waitForProductListReady(page);

    const search = page.locator('#product-search');
    await expect(search).toBeVisible();
    await search.fill('test');
    await expect(search).toHaveValue('test');
  });

  test('lookup giacenza per SKU', async ({ page }) => {
    const sku = await resolveTestSku(page);

    await page.goto('/app/inventory/lookup');
    await expect(page.locator('#stock-code')).toBeVisible({ timeout: 30_000 });
    await page.locator('#stock-code').fill(sku);
    await page.getByRole('button', { name: 'Cerca giacenza' }).click();

    await expect(page.locator('#lookup-result-title')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.stock-lookup__meta')).toContainText(sku);
  });
});
