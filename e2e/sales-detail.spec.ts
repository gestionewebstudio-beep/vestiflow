import { expect, test } from '@playwright/test';

import { openFirstSalesOrder } from './helpers/sales-detail';

test.describe('Dettaglio vendita', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/sales');
    await expect(page.locator('h1.sales-list__title')).toHaveText('Vendite', { timeout: 30_000 });
  });

  test('mostra pannelli dati ordine, articoli e totali', async ({ page }) => {
    const orderNumber = await openFirstSalesOrder(page);
    if (!orderNumber) {
      test.skip(true, 'Nessuna vendita nel tenant di test.');
      return;
    }

    await expect(page.locator('#sales-general')).toBeVisible();
    await expect(page.locator('#sales-lines')).toBeVisible();
    await expect(page.locator('.sales-detail__totals')).toBeVisible();
    await expect(page.getByText('Subtotale', { exact: true })).toBeVisible();
    await expect(page.getByText('Totale', { exact: true })).toBeVisible();
  });

  test('mostra badge stato finanziario e fulfillment', async ({ page }) => {
    const orderNumber = await openFirstSalesOrder(page);
    if (!orderNumber) {
      test.skip(true, 'Nessuna vendita nel tenant di test.');
      return;
    }

    const badges = page.locator('.sales-detail__badges app-badge');
    await expect(badges).toHaveCount(2);
  });

  test('tabella articoli ha almeno una riga', async ({ page }) => {
    const orderNumber = await openFirstSalesOrder(page);
    if (!orderNumber) {
      test.skip(true, 'Nessuna vendita nel tenant di test.');
      return;
    }

    await expect(page.locator('app-sales-order-lines-table tbody tr').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('vendita è read-only senza azioni di modifica', async ({ page }) => {
    const orderNumber = await openFirstSalesOrder(page);
    if (!orderNumber) {
      test.skip(true, 'Nessuna vendita nel tenant di test.');
      return;
    }

    await expect(
      page.getByRole('button', { name: /Salva|Modifica|Elimina|Annulla ordine/i }),
    ).toHaveCount(0);
  });

  test('id inesistente mostra empty state', async ({ page }) => {
    await page.goto('/app/sales/00000000-0000-4000-8000-000000000000');

    await expect(page.getByText('Vendita non trovata', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'Torna alle vendite' })).toBeVisible();
  });
});
