import { expect, test } from '@playwright/test';

import { confirmGoodsReceiptOnForm } from './helpers/goods-receipt-form';
import {
  createGoodsReceiptFromOrderDetail,
  fillSupplierOrderForm,
  saveSupplierOrder,
} from './helpers/supplier-order-form';

test.describe('Ordine fornitore — aggancio ad arrivo merce (Concluso)', () => {
  test('crea ordine Confermato, lo include in un arrivo merce e lo vede Concluso', async ({
    page,
  }) => {
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

    // Flusso 3 del prompt: arrivo merce creato direttamente dall'ordine.
    await createGoodsReceiptFromOrderDetail(page);
    await confirmGoodsReceiptOnForm(page);

    // L'aggancio marca l'ordine Concluso e il collegamento è visibile.
    await page.goto('/app/orders');
    await page.getByText(reference, { exact: true }).click();
    await expect(page.getByText('Concluso', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Arrivo merce collegato', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
