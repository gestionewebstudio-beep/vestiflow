import { expect, test } from '@playwright/test';

import { assertNoSeriousA11yViolations } from './helpers/a11y';
import { expectPageHeading } from './helpers/navigation';
import { waitForDashboardReady } from './helpers/page-ready';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/dashboard');
    await waitForDashboardReady(page);
  });

  test('mostra KPI operativi', async ({ page }) => {
    await expect(page.locator('.dashboard__kpis')).toBeVisible();
    await expect(page.getByText('Performance commerciale', { exact: true })).toBeVisible();
    await expect(page.getByText('Fatturato', { exact: true })).toBeVisible();
    await expect(page.getByText('Prodotti a catalogo', { exact: true })).toBeVisible();
  });

  test('sidebar principale è navigabile', async ({ page }) => {
    await expect(page.locator('nav.app-sidebar')).toBeVisible();
    await expect(
      page.locator('nav.app-sidebar').getByRole('link', { name: 'Prodotti' }),
    ).toBeVisible();
    await expect(
      page.locator('nav.app-sidebar').getByRole('link', { name: 'Magazzino' }),
    ).toBeVisible();
    await expect(
      page.locator('nav.app-sidebar').getByRole('link', { name: 'Ordini Fornitori' }),
    ).toBeVisible();
  });

  test('dashboard senza violazioni a11y serious/critical', async ({ page }) => {
    await page.getByRole('button', { name: 'Tema chiaro' }).click();
    await assertNoSeriousA11yViolations(page, { include: 'main' });
  });
});

test.describe('Navigazione sidebar', () => {
  test('percorre le sezioni operative principali', async ({ page }) => {
    await page.goto('/app/dashboard');
    await waitForDashboardReady(page);

    await page.locator('nav.app-sidebar').getByRole('link', { name: 'Prodotti' }).click();
    await expectPageHeading(page, 'h1.product-list__title', 'Prodotti');

    await page.locator('nav.app-sidebar').getByRole('link', { name: 'Magazzino' }).click();
    await expectPageHeading(page, 'h1.stock-lookup__title', 'Magazzino');

    await page.locator('nav.app-sidebar').getByRole('link', { name: 'Ordini Fornitori' }).click();
    await expectPageHeading(page, 'h1.po-list__title', 'Ordini Fornitori');

    await page.locator('nav.app-sidebar').getByRole('link', { name: 'Dashboard' }).click();
    await expectPageHeading(page, 'h1.dashboard__title', 'Dashboard');
  });
});
