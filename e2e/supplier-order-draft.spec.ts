import { expect, test } from '@playwright/test';

import { fillSupplierOrderForm, saveSupplierOrder } from './helpers/supplier-order-form';

test.describe('Ordine fornitore — creazione (Confermato)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/orders');
    await expect(page.locator('h1.po-list__title')).toHaveText('Ordini Fornitori', {
      timeout: 30_000,
    });
  });

  test('salva ordine fornitore (nasce Confermato)', async ({ page }) => {
    test.setTimeout(120_000);

    const createButton = page.getByRole('button', { name: 'Nuovo ordine' });
    if (!(await createButton.isVisible())) {
      test.skip(true, 'Utente E2E senza permesso ordini fornitori.');
      return;
    }

    await fillSupplierOrderForm(page);
    const reference = await saveSupplierOrder(page);

    await page.goto('/app/orders');
    await expect(page.getByText(reference, { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('blocca salvataggio se manca fornitore', async ({ page }) => {
    const createButton = page.getByRole('button', { name: 'Nuovo ordine' });
    if (!(await createButton.isVisible())) {
      test.skip(true, 'Utente E2E senza permesso ordini fornitori.');
      return;
    }

    await createButton.click();
    await expect(page).toHaveURL(/\/app\/orders\/new/);

    await page.getByRole('button', { name: 'Salva ordine' }).click();
    await expect(page.getByText('Seleziona un fornitore.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/orders\/new/);
  });
});
