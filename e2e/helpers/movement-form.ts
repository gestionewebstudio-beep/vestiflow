import { expect, type Page } from '@playwright/test';

import { pickSelectMenuOption } from './select-menu';

export async function openMovementFormForSku(page: Page, sku: string): Promise<void> {
  await page.goto('/app/inventory/lookup');
  await page.locator('#stock-code').fill(sku);
  await page.getByRole('button', { name: 'Cerca giacenza' }).click();
  await expect(page.locator('#lookup-result-title')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('link', { name: 'Registra movimento' }).click();
  await expect(page).toHaveURL(/\/app\/inventory\/movements\/new/, { timeout: 15_000 });
  await expect(page.locator('h1.movement-form__title')).toHaveText('Registra movimento');
}

export async function selectMovementType(page: Page, typeLabel: string): Promise<void> {
  await pickSelectMenuOption(page, 'Tipo movimento', { name: typeLabel });
}

export async function pickFirstLocation(page: Page): Promise<void> {
  await pickSelectMenuOption(page, 'Location');
  await expect(page.getByRole('button', { name: 'Location', exact: true })).not.toHaveText(
    'Seleziona…',
  );
}

export async function goToMovementReview(page: Page, quantity = '1'): Promise<void> {
  await page.locator('#mov-quantity').fill(quantity);
  await page.getByRole('button', { name: 'Continua' }).click();
}

export async function confirmMovement(page: Page): Promise<void> {
  await expect(page.locator('h2.movement-form__review-title')).toHaveText('Riepilogo movimento', {
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Conferma movimento' }).click();
  await expect(page).toHaveURL(/\/app\/inventory\/movements\/?$/, { timeout: 30_000 });
  await expect(page.locator('h1.stock-movements__title')).toHaveText('Movimenti di magazzino');
}

export async function expectMovementInHistory(
  page: Page,
  sku: string,
  typeLabel: string,
  reason?: string,
): Promise<void> {
  const row = page.locator('.movement-table__row').filter({ hasText: sku }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByText(typeLabel, { exact: true })).toBeVisible();
  if (reason) {
    await expect(row).toContainText(reason);
  }
}
