import { expect, type Page } from '@playwright/test';

import { pickSelectMenuOption, pickAnySupplier, defaultVariantSearchTerm } from './select-menu';

/**
 * Ricerca contestuale dal campo Nome prodotto della riga (§7) e selezione
 * del primo suggerimento. Ritorna false se non compaiono suggerimenti
 * (es. tenant senza articoli seed che corrispondono al termine).
 */
export async function searchAndPickLineVariant(
  page: Page,
  term: string,
  lineIndex = 0,
): Promise<boolean> {
  const input = page.locator(`#gr-product-${lineIndex}`);
  await input.click();
  await input.fill(term);

  const listbox = page.getByRole('listbox', { name: 'Suggerimenti prodotto' });
  const appeared = await listbox
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) {
    return false;
  }

  await listbox.getByRole('option').first().click();
  await expect(page.locator('.gr-product-cell--linked').first()).toBeVisible({ timeout: 15_000 });
  return true;
}

/**
 * Creazione implicita di un nuovo articolo dalla riga: basta digitare il
 * nome nel campo Nome prodotto (nessuna azione "Crea" dedicata) — l'articolo
 * nasce al click su "Salva documento".
 */
export async function createLineArticleExplicit(page: Page, lineIndex = 0): Promise<string> {
  const sku = `E2E-GR-${Date.now()}`;
  const name = `Articolo E2E ${sku}`;
  const nameInput = page.locator(`#gr-product-${lineIndex}`);
  await nameInput.click();
  await nameInput.fill(name);
  await page.locator(`#gr-sku-${lineIndex}`).fill(sku);
  return sku;
}

/** Compila fornitore, location e prima riga per un arrivo merce manuale. */
export async function fillMinimalGoodsReceiptDraft(page: Page): Promise<void> {
  await pickAnySupplier(page);
  await pickSelectMenuOption(page, 'Location di destinazione', { index: 1 });

  const picked = await searchAndPickLineVariant(page, defaultVariantSearchTerm());
  if (!picked) {
    await createLineArticleExplicit(page);
  }

  await page.locator('#gr-qty-0').fill('2');
  // Sulle righe collegate a un articolo il costo è bloccato (arriva
  // dall'anagrafica): si compila solo se il campo è editabile.
  const cost = page.locator('#gr-cost-0');
  if (await cost.isEnabled()) {
    await cost.fill('10,00');
  }
}

/** Chiude il dialog di aggiornamento prezzi fornitore se compare (§9.3). */
export async function dismissSupplierPriceDialogIfVisible(page: Page): Promise<void> {
  const dismiss = page.getByRole('button', { name: 'Non aggiornare' });
  const visible = await dismiss
    .waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (visible) {
    await dismiss.click();
  }
}

/**
 * "Salva documento" (§10.7): salva e resta nella maschera. Il nuovo documento
 * riceve un id e la rotta passa in modalità edit.
 */
export async function saveGoodsReceiptDocument(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Salva documento' }).click();
  await dismissSupplierPriceDialogIfVisible(page);

  await expect(page).toHaveURL(/\/app\/documents\/[^/]+\/edit$/, { timeout: 30_000 });
  await expect(page.getByText('Confermato', { exact: true })).toBeVisible({ timeout: 30_000 });
}

/** Salva l'arrivo merce (flusso nuovo) con eventuale ricezione parziale. */
export async function confirmGoodsReceiptOnForm(
  page: Page,
  options?: { partialQty?: number },
): Promise<void> {
  if (options?.partialQty != null) {
    await page.locator('#gr-qty-0').fill(String(options.partialQty));
  }

  await saveGoodsReceiptDocument(page);
  await expect(page.locator('h1.gr-form__title')).toHaveText('Modifica documento confermato', {
    timeout: 15_000,
  });
}
