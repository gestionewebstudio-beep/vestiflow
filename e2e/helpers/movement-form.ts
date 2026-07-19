import { expect, type Page } from '@playwright/test';

import { pickSelectMenuOption } from './select-menu';

export type MovementTypeLabel = 'Carico' | 'Scarico' | 'Rettifica' | 'Trasferimento';

/** Dal tab Movimenti: click sul bottone del tipo → form già impostato. */
export async function openMovementFormOfType(
  page: Page,
  typeLabel: MovementTypeLabel,
): Promise<void> {
  await page.goto('/app/inventory/movements');
  await expect(page.locator('h1.stock-movements__title')).toHaveText('Movimenti di magazzino', {
    timeout: 30_000,
  });
  await page.getByRole('button', { name: typeLabel, exact: true }).click();
  await expect(page).toHaveURL(/\/app\/inventory\/movements\/new\?type=/, { timeout: 15_000 });
  await expect(page.locator('h1.movement-form__title')).toHaveText(
    `Registra ${typeLabel.toLowerCase()}`,
  );
}

/** Deep-link da Cerca giacenza (?variantId=): form Carico con l'articolo in lista. */
export async function openMovementFormForSku(page: Page, sku: string): Promise<void> {
  await page.goto('/app/inventory/lookup');
  await page.locator('#stock-code').fill(sku);
  await page.getByRole('button', { name: 'Cerca giacenza' }).click();
  await expect(page.locator('#lookup-result-title')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('link', { name: 'Registra movimento' }).click();
  await expect(page).toHaveURL(/\/app\/inventory\/movements\/new/, { timeout: 15_000 });
  await expect(page.locator('h1.movement-form__title')).toHaveText(/Registra carico/);
  // Deep-link ?variantId=: l'articolo compare già nella lista righe.
  await expect(page.locator('.movement-form__lines-table tbody tr')).toHaveCount(1, {
    timeout: 15_000,
  });
}

/** Ricerca inline in fondo alla lista: aggiunge il primo risultato per SKU. */
export async function addArticleBySku(page: Page, sku: string): Promise<void> {
  await page.getByLabel('Cerca articolo per codice articolo, nome, SKU o EAN').fill(sku);
  const firstResult = page.locator('.movement-form__result').first();
  await expect(firstResult).toBeVisible({ timeout: 15_000 });
  await firstResult.getByRole('button', { name: /Aggiungi/ }).click();
  await expect(page.locator('.movement-form__lines-table tbody tr')).toHaveCount(1, {
    timeout: 15_000,
  });
}

export async function pickFirstLocation(page: Page): Promise<void> {
  await pickSelectMenuOption(page, 'Location');
  await expect(page.getByRole('button', { name: 'Location', exact: true })).not.toHaveText(
    'Seleziona…',
  );
}

/** Seleziona origine e destinazione distinte; false se il tenant ha una sola location. */
export async function pickTransferLocations(page: Page): Promise<boolean> {
  await pickSelectMenuOption(page, 'Location', { index: 1 });

  await page.getByRole('button', { name: 'Location di destinazione', exact: true }).click();
  const destList = page.getByRole('listbox', { name: 'Location di destinazione' });
  const destOptions = destList.getByRole('option');

  if ((await destOptions.count()) < 3) {
    await page.keyboard.press('Escape');
    return false;
  }

  await destOptions.nth(2).click();
  return true;
}

/** Imposta la quantità (o la nuova giacenza per le rettifiche) della prima riga. */
export async function setFirstLineQuantity(page: Page, quantity = '1'): Promise<void> {
  await page.locator('.movement-form__line-input').first().fill(quantity);
}

/** Salva → conferma dal dialog di riepilogo → atterra sullo storico movimenti. */
export async function confirmMovement(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Salva' }).click();
  await page.getByRole('button', { name: 'Registra', exact: true }).click();

  const submitError = page.locator('.movement-form__submit-error');
  await Promise.race([
    expect(page).toHaveURL(/\/app\/inventory\/movements\/?$/, { timeout: 30_000 }),
    submitError.waitFor({ state: 'visible', timeout: 30_000 }).then(async () => {
      const message = (await submitError.textContent())?.trim() ?? 'errore sconosciuto';
      throw new Error(`Conferma movimento fallita: ${message}`);
    }),
  ]);

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
