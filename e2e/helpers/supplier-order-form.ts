import { expect, type Page } from '@playwright/test';

import { confirmOpenDialog } from './confirm-dialog';
import {
  pickSeedSupplier,
  pickSelectMenuOption,
  pickVariantWithSearch,
  defaultVariantSearchTerm,
} from './select-menu';

/**
 * Compila un nuovo ordine fornitore (prompt 2026-07): testata senza sede
 * (l'ordine non tocca il magazzino), riga con articolo, quantità e costo.
 */
export async function fillSupplierOrderForm(page: Page): Promise<void> {
  const createButton = page.getByRole('button', { name: 'Nuovo ordine' });
  if (!(await createButton.isVisible())) {
    throw new Error('Utente E2E senza permesso creazione ordini fornitore.');
  }

  await createButton.click();
  await expect(page).toHaveURL(/\/app\/orders\/new/);

  const hasSeedSupplier = await pickSeedSupplier(page);
  if (!hasSeedSupplier) {
    throw new Error('SKIP_NO_SEED_SUPPLIER: Confezioni Sud SRL non trovato nel tenant.');
  }

  await pickVariantWithSearch(page, defaultVariantSearchTerm());

  await page.locator('#po-qty-0').fill('2');
  await page.locator('#po-cost-0').fill('12,50');
}

/** Salva l'ordine (nasce Confermato) e ritorna il riferimento dal dettaglio. */
export async function saveSupplierOrder(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Salva ordine' }).click();
  await expect(page).toHaveURL(/\/app\/orders\/(?!new(?:\/|$))[^/]+$/, { timeout: 30_000 });

  await expect(page.locator('h1.po-detail__title')).toBeVisible({ timeout: 30_000 });
  const reference = ((await page.locator('h1.po-detail__title').textContent()) ?? '').trim();
  expect(reference.length).toBeGreaterThan(0);

  await expect(page.getByText('Confermato', { exact: true })).toBeVisible();
  return reference;
}

/**
 * «Crea arrivo merce» dal dettaglio ordine (flusso 3): apre il form Arrivo
 * merce con l'ordine incluso (righe residue copiate, aggancio nel payload).
 */
export async function createGoodsReceiptFromOrderDetail(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Crea arrivo merce' }).click();
  await confirmOpenDialog(page, 'Crea arrivo merce');
  await expect(page).toHaveURL(/\/app\/documents\/goods-receipt\/new/, { timeout: 30_000 });
  await expect(page.locator('h1.gr-form__title')).toContainText('arrivo merce', {
    timeout: 15_000,
  });
  await expect(page.getByText('Ordine fornitore incluso:')).toBeVisible({ timeout: 15_000 });
  // L'ordine non ha più una sede: il magazzino di carico si sceglie qui.
  await pickSelectMenuOption(page, 'Location di destinazione', { index: 1 });
}
