import { expect, test } from '@playwright/test';

import { confirmGoodsReceiptOnForm } from './helpers/goods-receipt-form';
import {
  registerGoodsReceiptFromOrderDetail,
  sendSupplierOrderFromDetail,
} from './helpers/supplier-order-form';

test.describe('Ordine fornitore — invio e registrazione arrivo merce', () => {
  test('invia bozza seed e registra arrivo merce parziale via documento', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto('/app/orders');
    await expect(page.locator('h1.po-list__title')).toHaveText('Ordini Fornitori', {
      timeout: 30_000,
    });

    const draftRef = page.getByText('PO-2026-0003', { exact: true });
    if (!(await draftRef.isVisible())) {
      test.skip(true, 'Seed PO-2026-0003 non presente (DB non seeded).');
      return;
    }

    await draftRef.click();
    await expect(page.locator('h1.po-detail__title')).toContainText('PO-2026-0003');

    const sendButton = page.getByRole('button', { name: 'Invia ordine' });
    if (!(await sendButton.isVisible())) {
      test.skip(true, 'Utente E2E senza permesso invio ordini.');
      return;
    }

    await sendSupplierOrderFromDetail(page);
    await registerGoodsReceiptFromOrderDetail(page);
    await confirmGoodsReceiptOnForm(page, { partialQty: 3 });

    await page.goto('/app/orders');
    await page.getByText('PO-2026-0003', { exact: true }).click();
    await expect(page.getByText('Ricevuto parziale', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
