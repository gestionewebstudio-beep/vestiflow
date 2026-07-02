import { expect, type Page } from '@playwright/test';

import { confirmOpenDialog } from './confirm-dialog';
import {
  pickSelectMenuOption,
  pickAnySupplier,
  pickVariantWithSearch,
  defaultVariantSearchTerm,
} from './select-menu';

async function addGoodsReceiptLineViaQuickCreate(page: Page): Promise<void> {
  const sku = `E2E-GR-${Date.now()}`;
  await page.getByRole('button', { name: 'Crea articolo rapido' }).first().click();
  await page.locator('#gr-qp-name-0').fill(`Articolo E2E ${sku}`);
  await page.locator('#gr-qp-sku-0').fill(sku);
  await page.locator('#gr-qp-cost-0').fill('10,00');
  await page.getByRole('button', { name: 'Salva e usa nel documento' }).click();
  await expect(page.getByRole('button', { name: 'Variante', exact: true }).first()).not.toHaveText(
    /Cerca SKU/i,
    { timeout: 20_000 },
  );
}

/** Compila fornitore, location e prima riga per un arrivo merce manuale. */
export async function fillMinimalGoodsReceiptDraft(page: Page): Promise<void> {
  await pickAnySupplier(page);
  await pickSelectMenuOption(page, 'Location di destinazione', { index: 1 });

  try {
    await pickVariantWithSearch(page, defaultVariantSearchTerm());
  } catch {
    await addGoodsReceiptLineViaQuickCreate(page);
  }

  await page.locator('#gr-qty-0').fill('2');
  await page.locator('#gr-cost-0').fill('10,00');
}

export async function saveGoodsReceiptDraft(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Salva bozza' }).click();
  await expect(page).toHaveURL(/\/app\/documents\/(?!goods-receipt(?:\/|$))[^/]+$/, {
    timeout: 30_000,
  });
  await expect(page.getByText('Bozza', { exact: true })).toBeVisible({ timeout: 15_000 });
}

/** Chiude dialog prezzo fornitore se compare dopo la conferma. */
export async function dismissSupplierPriceDialogIfVisible(page: Page): Promise<void> {
  const dismiss = page.getByRole('button', { name: 'Non aggiornare' });
  const visible = await dismiss.isVisible().catch(() => false);
  if (visible) {
    await dismiss.click();
  }
}

/** Conferma documento arrivo merce (bozza) con eventuale ricezione parziale. */
export async function confirmGoodsReceiptOnForm(
  page: Page,
  options?: { partialQty?: number },
): Promise<void> {
  if (options?.partialQty != null) {
    await page.locator('#gr-qty-0').fill(String(options.partialQty));
  }

  await page.getByRole('button', { name: 'Conferma e carica magazzino' }).click();
  await confirmOpenDialog(page, 'Conferma e carica');

  await dismissSupplierPriceDialogIfVisible(page);

  await expect(page.getByText('Confermato', { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('h1.gr-form__title')).toContainText('documento confermato', {
    timeout: 15_000,
  });
}
