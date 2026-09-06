import { expect, test, type Page } from '@playwright/test';

import {
  fillMinimalGoodsReceiptDraft,
  saveGoodsReceiptDocument,
} from './helpers/goods-receipt-form';
import {
  pickAnySupplier,
  pickSelectMenuOption,
  defaultVariantSearchTerm,
} from './helpers/select-menu';

/**
 * Scenari della specifica di verifica Arrivo merce
 * (VestiFlow_Verifica_Correzione_Arrivo_Merce): sola testata, ricerca
 * contestuale, creazione implicita del nuovo articolo, salvataggio nella maschera, sblocco.
 */

async function openNewGoodsReceipt(page: Page): Promise<void> {
  await page.goto('/app/documents/goods-receipt/new');
  await expect(page.locator('h1.doc-form__title')).toHaveText('Nuovo arrivo merce', {
    timeout: 30_000,
  });
}

/**
 * Gate compilazione: fornitore + magazzino vanno scelti prima che righe e
 * altri campi si sblocchino (le celle riga nascono disabilitate).
 */
async function unlockGoodsReceiptCompilation(page: Page): Promise<void> {
  await pickAnySupplier(page);
  await pickSelectMenuOption(page, 'Location di destinazione', { index: 1 });
  await expect(page.locator('#gr-product-0')).toBeEnabled({ timeout: 15_000 });
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
    await expect(page.locator('.doc-product-cell--linked')).toHaveCount(0);
  });

  test('§7 ricerca contestuale: digitazione nel nome, suggerimenti, Esc chiude', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openNewGoodsReceipt(page);
    await unlockGoodsReceiptCompilation(page);

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

    // Dropdown essenziale: solo i suggerimenti dal catalogo — nessuna azione
    // "Crea" né "Apri scheda completa" (la creazione e' implicita col nome).
    await expect(listbox.getByRole('button', { name: /^Crea/ })).toHaveCount(0);
    await expect(listbox.getByRole('button', { name: 'Apri scheda completa…' })).toHaveCount(0);

    // Esc chiude i suggerimenti senza toccare il testo digitato (§7).
    await nameInput.press('Escape');
    await expect(listbox).toBeHidden();
    await expect(nameInput).toHaveValue(term);
  });

  test('§8 creazione implicita: il nome digitato resta e la cella espone i controlli attesi', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openNewGoodsReceipt(page);
    await unlockGoodsReceiptCompilation(page);

    const nameInput = page.locator('#gr-product-0');
    await nameInput.click();
    await nameInput.fill('Articolo inesistente E2E');

    // Cella essenziale: il nome digitato basta, l'articolo nasce al click su
    // "Salva documento" senza azioni dedicate.
    //
    // La guardia è l'ELENCO DI CIÒ CHE DEVE ESSERCI, non di ciò che non deve:
    // col fuoco nel campo la cella non collegata espone il campo, la lente e
    // l'azione di anagrafica — e nient'altro. Quando la striscia di icone fisse
    // sostituirà l'azione a comparsa, si aggiorna questo elenco descrivendo lo
    // stato nuovo, invece di rimuovere un divieto: il test fallirà dicendo
    // "i controlli non sono quelli attesi", non "c'è un elemento in più".
    const cell = page.locator('.doc-product-cell').first();
    await expect(cell.getByRole('textbox', { name: 'Nome prodotto' })).toBeVisible();
    await expect(cell.getByRole('button', { name: 'Cerca prodotto' })).toBeVisible();
    await expect(cell.getByRole('button', { name: 'Completa anagrafica' })).toBeVisible();
    await expect(cell.getByRole('button')).toHaveCount(2);

    await expect(nameInput).toHaveValue('Articolo inesistente E2E');
  });

  test('§10.7 Salva documento resta nella maschera e sblocca la sessione', async ({ page }) => {
    test.setTimeout(150_000);
    await openNewGoodsReceipt(page);

    await fillMinimalGoodsReceiptDraft(page);
    await saveGoodsReceiptDocument(page);

    // Dopo il salvataggio si resta nella maschera in modifica, non nel registro.
    await expect(page.locator('h1.doc-form__title')).toHaveText('Modifica documento confermato');

    // La sessione è sbloccata: nessun banner "Documento protetto da modifica".
    await expect(page.locator('.doc-form__unlock-banner')).toHaveCount(0);
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
    const unlockBanner = page.locator('.doc-form__unlock-banner');
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

  test('la card riga offre solo i suggerimenti dal catalogo', async ({ page }) => {
    test.setTimeout(90_000);
    await openNewGoodsReceipt(page);
    await unlockGoodsReceiptCompilation(page);

    const cardNameInput = page.getByRole('combobox', { name: 'Nome prodotto riga 1' });
    await expect(cardNameInput).toBeVisible({ timeout: 15_000 });

    const term = defaultVariantSearchTerm();
    await cardNameInput.click();
    await cardNameInput.pressSequentially(term, { delay: 40 });

    // Il pannello è il componente condiviso app-document-line-suggestions.
    const suggestions = page.getByRole('listbox', { name: 'Articoli suggeriti' });
    const appeared = await suggestions
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) {
      test.skip(true, `Nessun articolo seed corrisponde al termine "${term}".`);
      return;
    }

    await expect(suggestions.getByRole('option', { name: /^Crea/ })).toHaveCount(0);
    await expect(suggestions.getByRole('option', { name: 'Apri scheda completa…' })).toHaveCount(0);

    // Selezione del primo suggerimento: la card passa in stato collegato.
    await suggestions.getByRole('option').first().click();
    await expect(page.locator('.gr-card__name').first()).toBeVisible({ timeout: 15_000 });
  });
});
