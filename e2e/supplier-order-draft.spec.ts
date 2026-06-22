import { expect, test } from '@playwright/test';

import { fillSupplierOrderDraftForm, saveSupplierOrderDraft } from './helpers/supplier-order-form';

test.describe('Ordine fornitore — bozza', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/orders');
    await expect(page.locator('h1.po-list__title')).toHaveText('Ordini Fornitori', {
      timeout: 30_000,
    });
  });

  test('salva ordine fornitore come bozza', async ({ page }) => {
    test.setTimeout(120_000);

    const createButton = page.getByRole('button', { name: 'Nuovo ordine' });
    if (!(await createButton.isVisible())) {
      test.skip(true, 'Utente E2E senza permesso ordini fornitori.');
      return;
    }

    await fillSupplierOrderDraftForm(page);
    const reference = await saveSupplierOrderDraft(page);

    await page.goto('/app/orders');
    await expect(page.getByText(reference, { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('blocca invio se manca fornitore', async ({ page }) => {
    const createButton = page.getByRole('button', { name: 'Nuovo ordine' });
    if (!(await createButton.isVisible())) {
      test.skip(true, 'Utente E2E senza permesso ordini fornitori.');
      return;
    }

    await createButton.click();
    await expect(page).toHaveURL(/\/app\/orders\/new/);

    await page.getByRole('button', { name: 'Crea e invia' }).click();
    await expect(page.getByText('Seleziona un fornitore.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/orders\/new/);
  });
});
