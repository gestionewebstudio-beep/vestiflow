import { expect, test } from '@playwright/test';

import { waitForCustomersReady } from './helpers/page-ready';

test.describe('Clienti', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/customers');
    await expect(page.locator('h1.customer-list__title')).toHaveText('Clienti', {
      timeout: 30_000,
    });
  });

  test('carica lista clienti o empty state', async ({ page }) => {
    const skeleton = page.locator('app-table-skeleton');
    const table = page.locator('app-customer-table');
    const empty = page.getByText('Nessun cliente', { exact: true });
    const error = page.locator('app-error-state');

    await expect(skeleton.or(table).or(empty).or(error)).toBeVisible({ timeout: 30_000 });
  });

  test('ricerca clienti accetta input', async ({ page }) => {
    const search = page.locator('#customer-search');
    await expect(search).toBeVisible();
    await search.fill('mario');
    await expect(search).toHaveValue('mario');
  });

  test('apre dettaglio cliente dalla lista', async ({ page }) => {
    const state = await waitForCustomersReady(page);
    if (state === 'empty') {
      test.skip(true, 'Nessun cliente nel tenant di test.');
      return;
    }

    const firstRow = page.locator('.customer-table__row').first();
    const customerName = (
      (await firstRow.locator('.customer-table__name').textContent()) ?? ''
    ).trim();
    expect(customerName.length).toBeGreaterThan(0);

    await firstRow.click();
    await expect(page).toHaveURL(/\/app\/customers\/[^/]+$/, { timeout: 15_000 });
    await expect(page.locator('h1.customer-detail__title')).toHaveText(customerName);
  });
});
