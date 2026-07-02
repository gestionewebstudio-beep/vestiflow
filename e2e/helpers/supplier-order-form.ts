import { expect, type Page } from '@playwright/test';

import { confirmOpenDialog } from './confirm-dialog';
import {
  pickSelectMenuOption,
  pickSeedSupplier,
  pickVariantWithSearch,
  defaultVariantSearchTerm,
} from './select-menu';

export async function fillSupplierOrderDraftForm(page: Page): Promise<void> {
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

  await pickSelectMenuOption(page, 'Location di destinazione', { index: 1 });
  await pickVariantWithSearch(page, defaultVariantSearchTerm());

  await page.locator('#po-qty-0').fill('2');
  await page.locator('#po-cost-0').fill('12,50');
}

export async function saveSupplierOrderDraft(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Salva bozza' }).click();
  await expect(page).toHaveURL(/\/app\/orders\/(?!new(?:\/|$))[^/]+$/, { timeout: 30_000 });

  await expect(page.locator('h1.po-detail__title')).toBeVisible({ timeout: 30_000 });
  const reference = ((await page.locator('h1.po-detail__title').textContent()) ?? '').trim();
  expect(reference.length).toBeGreaterThan(0);

  await expect(page.getByText('Bozza', { exact: true })).toBeVisible();
  return reference;
}

export async function sendSupplierOrderFromDetail(page: Page): Promise<void> {
  const sendButton = page.getByRole('button', { name: 'Invia ordine' });
  await expect(sendButton).toBeVisible({ timeout: 15_000 });
  await sendButton.click();
  await confirmOpenDialog(page, 'Invia ordine');
  await expect(page.getByText('Inviato', { exact: true })).toBeVisible({ timeout: 15_000 });
}

export async function registerGoodsReceiptFromOrderDetail(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Registra arrivo merce' }).click();
  await confirmOpenDialog(page, 'Crea bozza documento');
  await expect(page).toHaveURL(/\/app\/documents\/[^/]+\/edit$/, { timeout: 30_000 });
  await expect(page.locator('h1.gr-form__title')).toContainText('arrivo merce', {
    timeout: 15_000,
  });
  await expect(page.getByText("Collegato all'ordine fornitore")).toBeVisible();
}
