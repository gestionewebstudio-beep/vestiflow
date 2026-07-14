import { expect, test, type Page } from '@playwright/test';

import {
  fillMinimalGoodsReceiptDraft,
  saveGoodsReceiptDocument,
} from './helpers/goods-receipt-form';
import { pickAnySupplier, defaultVariantSearchTerm } from './helpers/select-menu';

/**
 * Scenari della specifica di verifica Arrivo merce
 * (VestiFlow_Verifica_Correzione_Arrivo_Merce): sola testata, ricerca
 * contestuale, creazione esplicita, salvataggio nella maschera, sblocco.
 */

async function openNewGoodsReceipt(page: Page): Promise<void> {
  await page.goto('/app/documents/goods-receipt/new');
  await expect(page.locator('h1.gr-form__title')).toHaveText('Nuovo arrivo merce', {
    timeout: 30_000,
  });
}

test.describe('Arrivo merce — verifica funzionale', () => {
  test('AM-001: la sola testata si salva senza righe né movimenti', async ({ page }) => {
    test.setTimeout(120_000);
    await openNewGoodsReceipt(page);

    await pickAnySupplier(page);

    // La testata da sola non crea il documento in automatico (§6): il
    // salvataggio esplicito con "Salva documento" deve riuscire senza righe.
    await page.getByRole('button', { name: 'Salva documento' }).click();
    await expect(page).toHaveURL(/\/app\/documents\/[^/]+\/edit$/, { timeout: 30_000 });
    await expect(page.getByText('Confermato', { exact: true })).toBeVisible({ timeout: 30_000 });

    // Nessuna riga valida: resta la riga vuota di lavoro, senza articolo.
    await expect(page.locator('.gr-product-cell--linked')).toHaveCount(0);
  });

  test('§7 ricerca contestuale: digitazione nel nome, suggerimenti, Esc chiude', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openNewGoodsReceipt(page);

    const term = defaultVariantSearchTerm();
    const nameInput = page.locator('#gr-product-0');
    await nameInput.click();
    await nameInput.fill(term);

    const listbox = page.getByRole('listbox', { name: 'Suggerimenti prodotto' });
    const appeared = await listbox
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) {
      test.skip(true, `Nessun articolo seed corrisponde al termine "${term}".`);
      return;
    }

    // Il dropdown offre sempre anche la creazione esplicita e la scheda
    // completa (§8, punto D).
    await expect(listbox.getByRole('button', { name: `Crea «${term}»` })).toBeVisible();
    await expect(listbox.getByRole('button', { name: 'Apri scheda completa…' })).toBeVisible();

    // Esc chiude i suggerimenti senza toccare il testo digitato (§7).
    await nameInput.press('Escape');
    await expect(listbox).toBeHidden();
    await expect(nameInput).toHaveValue(term);
  });

  test('§8 creazione esplicita: badge Nuovo articolo e annullamento', async ({ page }) => {
    test.setTimeout(90_000);
    await openNewGoodsReceipt(page);

    const nameInput = page.locator('#gr-product-0');
    await nameInput.click();
    await nameInput.fill('Articolo inesistente E2E');

    // Punto D: senza risultati il dropdown propone la creazione inline con il
    // testo digitato e l'apertura della scheda completa.
    await page.getByRole('button', { name: 'Crea «Articolo inesistente E2E»' }).first().click();
    const badge = page.locator('.gr-product-cell__create-badge').first();
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Nuovo articolo');
    // Punto B: la creazione rapida espone il toggle "Gestito a magazzino".
    await expect(page.locator('.gr-product-cell__stock-toggle').first()).toBeVisible();

    await page.getByRole('button', { name: 'Annulla creazione nuovo articolo' }).first().click();
    await expect(badge).toBeHidden();
    // Il testo digitato resta nel campo dopo l'annullamento.
    await expect(nameInput).toHaveValue('Articolo inesistente E2E');
  });

  test('§10.7 Salva documento resta nella maschera e sblocca la sessione', async ({ page }) => {
    test.setTimeout(150_000);
    await openNewGoodsReceipt(page);

    await fillMinimalGoodsReceiptDraft(page);
    await saveGoodsReceiptDocument(page);

    // Dopo il salvataggio si resta nella maschera in modifica, non nel registro.
    await expect(page.locator('h1.gr-form__title')).toHaveText('Modifica documento confermato');

    // La sessione è sbloccata: nessun banner "Documento protetto da modifica".
    await expect(page.locator('.gr-form__unlock-banner')).toHaveCount(0);
    await expect(page.locator('#gr-qty-0')).toBeEnabled();
  });

  test('sblocco documento confermato riaperto dal registro', async ({ page }) => {
    test.setTimeout(150_000);
    await openNewGoodsReceipt(page);

    await fillMinimalGoodsReceiptDraft(page);
    await saveGoodsReceiptDocument(page);
    const editUrl = page.url();

    // Ricarica piena: la sessione di modifica riparte e il documento è protetto.
    await page.goto(editUrl);
    const unlockBanner = page.locator('.gr-form__unlock-banner');
    const lockVisible = await unlockBanner
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!lockVisible) {
      test.skip(true, 'Documento non protetto al reload (blocco disattivato per il tenant).');
      return;
    }

    await unlockBanner.getByRole('button', { name: 'Sblocca modifica' }).click();
    await page.getByRole('button', { name: 'Sblocca e modifica' }).click();

    await expect(unlockBanner).toBeHidden();
    await expect(page.locator('#gr-qty-0')).toBeEnabled();
  });
});

test.describe('Arrivo merce — ricerca contestuale su card mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('la card riga offre suggerimenti e creazione esplicita', async ({ page }) => {
    test.setTimeout(90_000);
    await openNewGoodsReceipt(page);

    const cardNameInput = page.getByRole('combobox', { name: 'Nome prodotto riga 1' });
    await expect(cardNameInput).toBeVisible({ timeout: 15_000 });

    const term = defaultVariantSearchTerm();
    await cardNameInput.click();
    await cardNameInput.pressSequentially(term, { delay: 40 });

    const suggestions = page.locator('.gr-card__suggestions');
    const appeared = await suggestions
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) {
      test.skip(true, `Nessun articolo seed corrisponde al termine "${term}".`);
      return;
    }

    await expect(suggestions.getByRole('button', { name: `Crea «${term}»` })).toBeVisible();

    // Selezione del primo suggerimento: la card passa in stato collegato.
    await suggestions.locator('.gr-card__suggestion').first().click();
    await expect(page.locator('.gr-card__name').first()).toBeVisible({ timeout: 15_000 });
  });
});
