import { expect, type Page } from '@playwright/test';

import { pickSelectMenuOption } from './select-menu';

export async function fillSupplierOrderDraftForm(page: Page): Promise<void> {
  const createButton = page.getByRole('button', { name: 'Nuovo ordine' });
  if (!(await createButton.isVisible())) {
    throw new Error('Utente E2E senza permesso creazione ordini fornitore.');
  }

  await createButton.click();
  await expect(page).toHaveURL(/\/app\/orders\/new/);

  const supplierMenu = page.getByRole('button', { name: 'Fornitore', exact: true });
  await expect(supplierMenu).toBeVisible({ timeout: 15_000 });

  const supplierOptions = page.getByRole('listbox', { name: 'Fornitore' });
  await supplierMenu.click();
  const optionCount = await supplierOptions.getByRole('option').count();
  await page.keyboard.press('Escape');

  if (optionCount <= 1) {
    await page.getByRole('button', { name: 'Nuovo fornitore' }).click();
    const supplierName = `E2E Fornitore ${Date.now()}`;
    await page.locator('#po-new-supplier-name').fill(supplierName);
    await page.getByRole('button', { name: 'Salva fornitore' }).click();
    await expect(page.getByRole('button', { name: 'Fornitore', exact: true })).not.toHaveText(
      'Seleziona un fornitore…',
      { timeout: 15_000 },
    );
  } else {
    await pickSelectMenuOption(page, 'Fornitore', { index: 1 });
  }

  await pickSelectMenuOption(page, 'Location di destinazione', { index: 1 });
  await pickSelectMenuOption(page, 'Variante', { index: 1 });

  await page.locator('#po-qty-0').fill('2');
  await page.locator('#po-cost-0').fill('12,50');
}

export async function saveSupplierOrderDraft(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Salva bozza' }).click();
  await expect(page).toHaveURL(/\/app\/orders\/[^/]+$/, { timeout: 30_000 });

  const reference = ((await page.locator('h1.po-detail__title').textContent()) ?? '').trim();
  expect(reference.length).toBeGreaterThan(0);

  await expect(page.getByText('Bozza', { exact: true })).toBeVisible();
  return reference;
}
