import { expect, test } from '@playwright/test';

import {
  buildPendingInvoiceDocumentsPath,
  expectPendingInvoiceDocumentsView,
  waitForAccountantRegisterReady,
  waitForDocumentsListReady,
} from './helpers/accountant-register';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

test.describe('CI smoke (mock auth)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/dashboard');
    await expect(page.locator('h1.dashboard__title')).toHaveText('Dashboard', { timeout: 45_000 });
  });

  test('shell applicativa e sidebar dopo login mock', async ({ page }) => {
    await expect(page.locator('h1.dashboard__title')).toHaveText('Dashboard');
    await expect(page.locator('app-sidebar')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Prodotti' })).toBeVisible();
  });

  test('wizard nuovo prodotto — step dati generali e opzioni', async ({ page }) => {
    await page.goto('/app/products/new');
    await expect(page.locator('h1.product-form__title')).toHaveText('Anagrafica prodotto', {
      timeout: 30_000,
    });

    await page.locator('#product-name').fill('Prodotto CI Smoke');
    await page.locator('#product-brand').fill('Brand Test');
    await page.locator('#product-category').fill('Abbigliamento');

    await page.getByRole('button', { name: 'Avanti' }).click();
    await expect(page.getByRole('button', { name: 'Opzioni' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    await expect(page.getByText('Definisci le opzioni che generano le varianti')).toBeVisible();
  });

  test('lista prodotti degrada senza errore bloccante se API non disponibile', async ({ page }) => {
    await page.goto('/app/products');
    await expect(page.locator('h1.product-list__title')).toHaveText('Prodotti', {
      timeout: 30_000,
    });

    const skeleton = page.locator('app-table-skeleton');
    const table = page.locator('app-product-table');
    const empty = page.getByText('Nessun prodotto', { exact: true });
    const error = page.locator('app-error-state');

    await expect(skeleton.or(table).or(empty).or(error)).toBeVisible({ timeout: 30_000 });
  });

  test('lista documenti DDT da fatturare — filtri URL, banner e checkbox', async ({ page }) => {
    const today = todayIsoDate();
    await page.goto(buildPendingInvoiceDocumentsPath(today, today));
    await waitForDocumentsListReady(page);
    await expectPendingInvoiceDocumentsView(page);
  });

  test('registro commercialista → DDT da fatturare apre filtri corretti', async ({ page }) => {
    await waitForAccountantRegisterReady(page);

    const error = page.locator('app-error-state');
    if (await error.isVisible()) {
      test.skip(true, 'API registro commercialista non disponibile con auth mock');
    }

    await expect(page.getByRole('link', { name: 'DDT da fatturare →' })).toBeVisible();
    await page.getByRole('link', { name: 'DDT da fatturare →' }).click();
    await waitForDocumentsListReady(page);
    await expectPendingInvoiceDocumentsView(page);
  });
});
