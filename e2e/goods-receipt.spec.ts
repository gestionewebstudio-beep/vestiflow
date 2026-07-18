import { expect, test } from '@playwright/test';

import {
  confirmGoodsReceiptOnForm,
  fillMinimalGoodsReceiptDraft,
  saveGoodsReceiptDocument,
} from './helpers/goods-receipt-form';
import {
  createGoodsReceiptFromOrderDetail,
  fillSupplierOrderForm,
  saveSupplierOrder,
} from './helpers/supplier-order-form';

test.describe('Arrivo merce (documenti)', () => {
  test('salva arrivo merce manuale dal registro documenti', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/app/documents');
    await expect(page.locator('h1.doc-list__title')).toHaveText('Documenti', { timeout: 30_000 });

    const newButton = page.getByRole('button', { name: 'Nuovo arrivo merce' });
    if (!(await newButton.isVisible())) {
      test.skip(true, 'Utente E2E senza permesso gestione documenti.');
      return;
    }

    await newButton.click();
    await expect(page).toHaveURL(/\/app\/documents\/goods-receipt\/new/);
    await expect(page.locator('h1.gr-form__title')).toHaveText('Nuovo arrivo merce');

    await fillMinimalGoodsReceiptDraft(page);
    await saveGoodsReceiptDocument(page);
  });

  test('column picker righe: Ripristina colonne', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/app/documents/goods-receipt/new');
    await expect(page.locator('h1.gr-form__title')).toHaveText('Nuovo arrivo merce', {
      timeout: 30_000,
    });

    const columnsButton = page.getByRole('button', { name: 'Colonne' });
    if (!(await columnsButton.isVisible())) {
      test.skip(true, 'Form arrivo merce non disponibile per questo utente.');
      return;
    }

    await columnsButton.click();
    await expect(page.getByRole('dialog', { name: 'Personalizza colonne' })).toBeVisible();

    const firstCheckbox = page
      .locator('.table-column-picker__check input[type="checkbox"]')
      .first();
    const wasChecked = await firstCheckbox.isChecked();
    await firstCheckbox.click();
    await expect(firstCheckbox).toBeChecked({ checked: !wasChecked });

    await page.getByRole('button', { name: 'Ripristina colonne' }).click();
    await expect(firstCheckbox).toBeChecked({ checked: wasChecked });
  });

  test('flusso completo: ordine confermato → arrivo merce → ordine Concluso', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto('/app/orders');
    await expect(page.locator('h1.po-list__title')).toHaveText('Ordini Fornitori', {
      timeout: 30_000,
    });

    const createButton = page.getByRole('button', { name: 'Nuovo ordine' });
    if (!(await createButton.isVisible())) {
      test.skip(true, 'Utente E2E senza permesso ordini fornitori.');
      return;
    }

    await fillSupplierOrderForm(page).catch((error: unknown) => {
      if (error instanceof Error && error.message.includes('SKIP_NO_SEED_SUPPLIER')) {
        test.skip(
          true,
          'Tenant senza fornitore seed Confezioni Sud SRL (eseguire prisma db seed).',
        );
      }
      throw error;
    });
    const reference = await saveSupplierOrder(page);

    await createGoodsReceiptFromOrderDetail(page);

    await confirmGoodsReceiptOnForm(page, { partialQty: 1 });

    // L'aggancio all'arrivo merce conclude l'ordine (anche a ricezione parziale).
    await page.goto('/app/orders');
    await page.getByText(reference, { exact: true }).click();
    await expect(page.getByText('Concluso', { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});
