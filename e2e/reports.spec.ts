import { expect, test } from '@playwright/test';

import { waitForReportsReady } from './helpers/page-ready';

test.describe('Report', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/reports');
    await expect(page.locator('h1.reports__title')).toHaveText('Report', { timeout: 30_000 });
  });

  test('carica KPI e pannelli operativi', async ({ page }) => {
    await waitForReportsReady(page);

    await expect(page.getByText('Valore magazzino', { exact: true })).toBeVisible();
    await expect(page.getByText('Fatturato', { exact: true })).toBeVisible();
    await expect(page.getByText('Giacenze per location', { exact: true })).toBeVisible();
    await expect(page.getByText('Vendite per stato pagamento', { exact: true })).toBeVisible();
  });

  test('mostra tabelle report o skeleton durante il caricamento', async ({ page }) => {
    const kpis = page.locator('.reports__kpis');
    const skeleton = page.locator('app-table-skeleton');
    const error = page.locator('app-error-state');

    await expect(kpis.or(skeleton).or(error)).toBeVisible({ timeout: 30_000 });
  });
});
