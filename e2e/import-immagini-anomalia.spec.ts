import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { test } from './helpers/isolated-test';

/**
 * L'AVVISO DELLE IMMAGINI NON SCARICATE, guardato a schermo.
 *
 * ⭐ **Nessuna API, nessun database, nessuno Shopify.** La fixture isolata
 *    risponde 404 a ogni chiamata non dichiarata qui: tutto ciò che il browser
 *    riceve è scritto in questo file.
 *
 * ⚠️ È l'unico modo di verificare la RESA VISIVA: le prove di componente e di
 *    servizio misurano il comportamento, non come si vede. E qui il punto è
 *    proprio quello — un'anomalia che l'operatore deve NOTARE su una riga che
 *    dice «importato».
 *
 * ⛔ **Le risposte rispettano il contratto vero dell'endpoint**: la stessa forma
 *    che `ProductsImportService.importCsv` restituisce — `imported`, `skipped`,
 *    `failed`, `articleCodesGenerated`, `products[]` con `status` e `message`.
 */

const IMPORT = '/app/products/import';
const SCATTI = 'test-results/import-immagini';

/**
 * ⛔ La forma è quella di `ImportPreviewApiRow` in `product-import.mapper.ts`:
 *    `dto.variants` è un ELENCO e `rowNumbers` è obbligatorio. La prima stesura
 *    li aveva inventati — `variants: 1`, niente `rowNumbers` — e la schermata
 *    rispondeva «Anteprima import non riuscita»: una risposta verosimile prova
 *    un contratto che non esiste. Misurato a schermo l’11/09/2026.
 */
const ANTEPRIMA = {
  summary: { total: 2, ready: 2, warnings: 0, errors: 0, alreadyImported: 0 },
  products: [
    {
      handle: 'maglia-cotone',
      // ⭐ DIECI varianti contro due: «10» viene prima di «2» se il confronto è
      //    testuale, dopo se è numerico. È la prova che `numeroDi` è collegato.
      dto: {
        name: 'Maglia in cotone',
        variants: Array.from({ length: 10 }, (_, i) => ({ sku: `MAG-${i}` })),
      },
      issues: [],
      rowNumbers: [2, 3, 4],
      alreadyImported: false,
    },
    {
      handle: 'pantalone-lino',
      dto: { name: 'Pantalone in lino', variants: [{ sku: 'PNT-46' }, { sku: 'PNT-48' }] },
      issues: [],
      rowNumbers: [5],
      alreadyImported: false,
    },
  ],
};

/**
 * Il rapporto: un articolo entrato PULITO e uno entrato con un'anomalia sulle
 * immagini. La coppia è voluta — l'avviso si giudica accanto a una riga che non
 * ce l'ha, non da solo.
 */
const RAPPORTO = {
  imported: 2,
  skipped: 0,
  failed: 0,
  articleCodesGenerated: 2,
  products: [
    {
      handle: 'maglia-cotone',
      productId: 'prod-1',
      name: 'Maglia in cotone',
      status: 'imported',
      articleCode: '00001',
      articleCodeGenerated: true,
      message: 'Immagini non scaricate (1 su 3): https://cdn.esempio.test/2.png (risposta 404)',
    },
    {
      handle: 'pantalone-lino',
      productId: 'prod-2',
      name: 'Pantalone in lino',
      status: 'imported',
      articleCode: '00002',
      articleCodeGenerated: true,
    },
  ],
};

async function preparaSchermata(page: Page): Promise<void> {
  await page.route('**/api/v1/products/import/preview', (route: Route) =>
    route.fulfill({ status: 200, json: ANTEPRIMA }),
  );
  await page.route('**/api/v1/products/import', (route: Route) =>
    route.fulfill({ status: 200, json: RAPPORTO }),
  );
  await page.goto(IMPORT);
  await expect(page.getByRole('heading', { name: 'Importa prodotti da CSV' })).toBeVisible({
    timeout: 45_000,
  });
}

test("⭐ l'anomalia sulle immagini si vede nel rapporto, accanto a una riga pulita", async ({
  page,
}) => {
  await preparaSchermata(page);

  // Il file non viene letto da nessuno: lo legge il server, che qui è finto.
  await page.locator('#product-csv-file').setInputFiles({
    name: 'catalogo.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Handle,Title\nmaglia-cotone,Maglia in cotone\n'),
  });

  await page.getByRole('button', { name: /Analizza/i }).click();
  await page.getByRole('button', { name: /Importa 2 prodotti/i }).click();

  const riga = page.getByRole('row', { name: /Maglia in cotone/ });
  await expect(riga).toBeVisible();
  await expect(riga).toContainText('Immagini non scaricate (1 su 3)');
  // ⭐ Il motivo e il link sono nel messaggio: senza, l'operatore sa che manca
  //    qualcosa e non quale immagine né perché.
  await expect(riga).toContainText('risposta 404');
  await expect(riga).toContainText('2.png');

  // ⛔ E l'articolo risulta IMPORTATO: un'immagine caduta non è un fallimento.
  await expect(riga).toContainText('Importato');

  // La riga senza anomalie mostra il trattino: il confronto è ciò che rende
  // l'avviso leggibile a colpo d'occhio.
  const pulita = page.getByRole('row', { name: /Pantalone in lino/ });
  await expect(pulita).toContainText('—');

  await page.screenshot({ path: `${SCATTI}/rapporto-import.png`, fullPage: true });
});

test('⭐ le due tabelle ORDINANO e FILTRANO come ogni elenco: testo e numeri', async ({ page }) => {
  await preparaSchermata(page);
  await page.locator('#product-csv-file').setInputFiles({
    name: 'catalogo.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Handle,Title\nmaglia-cotone,Maglia in cotone\n'),
  });
  await page.getByRole('button', { name: /Analizza/i }).click();

  const righe = page.locator('tbody tr.data-table__row');
  await expect(righe).toHaveCount(2);

  // ── Ordinamento NUMERICO sull’anteprima ──────────────────────────────
  // Crescente: 2 varianti prima di 10. Un confronto testuale metterebbe
  // «10» davanti a «2» e la prima riga resterebbe la Maglia.
  await page.getByRole('button', { name: 'Ordina per Varianti' }).click();
  await expect(righe.first()).toContainText('Pantalone in lino');
  // ⚠️ Dopo il primo clic il pulsante si CHIAMA con il verso attivo — l’etichetta
  //    dice lo stato, non l’azione — e «Ordina per» non lo trova più.
  await page.getByRole('button', { name: 'Varianti: ordinamento crescente' }).click();
  await expect(righe.first()).toContainText('Maglia in cotone');

  // ── Filtro di colonna sull’anteprima ─────────────────────────────────
  // «Filtri» accende i controlli nelle intestazioni; spento, li azzera.
  await page.getByRole('button', { name: /^Filtri/ }).click();
  await page.getByRole('button', { name: 'Filtra per Prodotto' }).click();
  await page.getByLabel('Cerca fra i valori di Prodotto').fill('lino');
  await expect(righe).toHaveCount(1);
  await expect(righe.first()).toContainText('Pantalone in lino');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Filtri/ }).click();
  await expect(righe).toHaveCount(2);

  // ── Ordinamento TESTUALE sul rapporto ────────────────────────────────
  await page.getByRole('button', { name: /Importa 2 prodotti/i }).click();
  const rapporto = page.getByRole('table', { name: /Esito dell/ });
  const righeEsito = rapporto.locator('tbody tr.data-table__row');
  await expect(righeEsito).toHaveCount(2);
  await expect(righeEsito.first()).toContainText('Maglia in cotone');
  await rapporto.getByRole('button', { name: 'Ordina per Prodotto' }).click();
  await rapporto.getByRole('button', { name: 'Prodotto: ordinamento crescente' }).click();
  await expect(righeEsito.first()).toContainText('Pantalone in lino');

  // ── E il filtro sul rapporto trova il Dettaglio con l’anomalia ───────
  await page.getByRole('button', { name: /^Filtri/ }).click();
  await rapporto.getByRole('button', { name: 'Filtra per Dettaglio' }).click();
  await page.getByLabel('Cerca fra i valori di Dettaglio').fill('non scaricate');
  await expect(righeEsito).toHaveCount(1);
  await expect(righeEsito.first()).toContainText('Maglia in cotone');

  // ── Due difetti MISURATI l’11/09/2026, e tenuti fermi qui ─────────────
  // 1. La riga di dati era alta 245px: il motore stirava al 100% anche una
  //    tabella SENZA totali, e senza la riga di riempimento l’avanzo andava
  //    alle righe. 2. Il pannello del filtro era ritagliato dalla regione di
  //    scorrimento, alta 60px perché la pagina non dava altezza al motore.
  //    Nessuna delle due falliva: `toHaveCount` conta righe nel DOM.
  const misura = await page.evaluate(() => {
    const riga = document.querySelector('tbody tr.data-table__row');
    const pannello = document.querySelector('.select-menu__panel');
    if (!riga || !pannello) {
      return null;
    }
    const p = pannello.getBoundingClientRect();
    const sopra = document.elementFromPoint(p.x + p.width / 2, p.y + p.height / 2);
    return {
      altezzaRiga: Math.round(riga.getBoundingClientRect().height),
      pannelloDentro: pannello.contains(sopra),
    };
  });
  expect(misura).not.toBeNull();
  // `--table-row-h` è 25px: una riga più alta ha preso spazio che non è suo.
  expect(misura?.altezzaRiga).toBeLessThanOrEqual(26);
  expect(misura?.pannelloDentro).toBe(true);

  await page.screenshot({ path: `${SCATTI}/rapporto-import-filtrato.png`, fullPage: true });
});

test('⭐ e su schermo stretto il Dettaglio resta leggibile', async ({ page }) => {
  // ⚠️ La tabella del rapporto diventa a card sotto `lg`: un messaggio lungo è
  //    proprio il caso in cui una card si rompe o taglia il testo.
  await page.setViewportSize({ width: 390, height: 780 });
  await preparaSchermata(page);

  await page.locator('#product-csv-file').setInputFiles({
    name: 'catalogo.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Handle,Title\nmaglia-cotone,Maglia in cotone\n'),
  });
  await page.getByRole('button', { name: /Analizza/i }).click();
  await page.getByRole('button', { name: /Importa 2 prodotti/i }).click();

  // ⭐ Sotto `lg` il testo sta DUE volte nel DOM, per costruzione: nella card
  //    che si vede e nella cella vera, nascosta con `.sr-only` per lo screen
  //    reader (`regole-stile-ui`). Si guarda la card: è la veste del telefono.
  const parole = page.locator('.list-card__words').filter({ hasText: /Immagini non scaricate/ });
  await expect(parole).toBeVisible();
  await expect(parole).toContainText('(1 su 3)');

  // ⛔ Nessuno scorrimento orizzontale: è vietato (regole-architettura, A11y).
  const eccesso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(eccesso).toBeLessThanOrEqual(1);

  // ⭐ **I filtri funzionano anche qui, sul telefono** (`docs/26` D1): «Filtri»
  //    apre il pannello laterale del telaio — riusato, non copiato — con una
  //    voce per colonna filtrabile. Prima accendeva controlli in intestazioni
  //    che sotto `lg` non esistono, e non faceva niente.
  await page.getByRole('button', { name: 'Filtri', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Filtri' })).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/rapporto-import-mobile-pannello.png` });
  await page.getByRole('button', { name: 'Filtra per Dettaglio' }).click();
  await page.getByLabel('Cerca fra i valori di Dettaglio').fill('non scaricate');
  await page.getByRole('button', { name: 'Vedi risultati', exact: true }).click();
  await expect(page.locator('tbody tr.data-table__row')).toHaveCount(1);
  // Il conteggio è VISIBILE sul pulsante; il nome accessibile resta «Filtri».
  await expect(page.getByRole('button', { name: 'Filtri', exact: true })).toContainText('(1)');
  await page.screenshot({ path: `${SCATTI}/rapporto-import-mobile-filtrato.png`, fullPage: true });

  // «Azzera filtri» nel pannello rimette tutte le righe.
  await page.getByRole('button', { name: 'Filtri', exact: true }).click();
  await page.getByRole('button', { name: 'Azzera filtri' }).click();
  await page.getByRole('button', { name: 'Vedi risultati', exact: true }).click();
  await expect(page.locator('tbody tr.data-table__row')).toHaveCount(2);

  await page.screenshot({ path: `${SCATTI}/rapporto-import-mobile.png`, fullPage: true });
});
