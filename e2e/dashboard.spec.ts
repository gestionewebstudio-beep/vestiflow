import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { expectPageHeading } from './helpers/navigation';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/dashboard');
    await expect(page.locator('h1.dashboard__title')).toBeVisible({ timeout: 30_000 });
  });

  test('mostra KPI operativi', async ({ page }) => {
    await expect(page.locator('.dashboard__kpis')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Prodotti', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Pezzi disponibili', { exact: true })).toBeVisible();
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
    await expect(page.locator('.dashboard__kpis')).toBeVisible({ timeout: 30_000 });

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );

    expect(blocking.map((v) => v.id)).toEqual([]);
  });
});

test.describe('Navigazione sidebar', () => {
  test('percorre le sezioni operative principali', async ({ page }) => {
    await page.goto('/app/dashboard');
    await expect(page.locator('h1.dashboard__title')).toBeVisible({ timeout: 30_000 });

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
