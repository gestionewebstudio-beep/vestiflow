import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { apriImpostazioni } from './helpers/impostazioni-fixtures';
import { test } from './helpers/isolated-test';

/**
 * IL PULSANTE «ALLINEA GIACENZE SU SHOPIFY», guardato a schermo.
 *
 * ⭐ **Nessuna API, nessun database, nessuno Shopify.** La fixture isolata
 *    risponde 404 a ogni chiamata non dichiarata qui: tutto ciò che il browser
 *    riceve è scritto in questo file.
 *
 * ⚠️ È l'unico modo di verificare la RESA VISIVA: le prove di componente
 *    misurano il comportamento, non come si vede.
 *
 * ⛔ **Le risposte rispettano il contratto vero degli endpoint**, non una forma
 *    verosimile: una risposta inventata proverebbe che la schermata regge a un
 *    contratto che non esiste.
 */

const SCATTI = 'test-results/allinea';

function nonAllineata(indice: number, motivo: string) {
  return {
    variantId: `var-${indice}`,
    locationId: 'loc-1',
    articolo: `Maglia cotone ${indice}`,
    codiceArticolo: `ART-${String(indice).padStart(4, '0')}`,
    variante: 'M · Rosso',
    sku: `SKU-${indice}`,
    sede: 'Magazzino Napoli',
    motivo,
    dettaglio: 'Frase estesa che spiega il motivo.',
  };
}

const MOTIVI = [
  'livello_non_disponibile',
  'divergenza_accertata',
  'scrittura_esito_incerto',
  'errore_di_lettura',
  'collegamento_escluso',
];

/** 25 anomalie: due pagine da venti e cinque. */
const VENTICINQUE = Array.from({ length: 25 }, (_, i) =>
  nonAllineata(i + 1, MOTIVI[i % MOTIVI.length]!),
);

function blocco(sovrascrivi: Record<string, unknown> = {}) {
  return {
    aligned: true,
    totale: 300,
    esaminate: 200,
    allineate: 12,
    giaAllineate: 188,
    nonAllineate: [],
    prossimo: { locationId: 'loc-1', variantId: 'var-200' },
    fine: false,
    ...sovrascrivi,
  };
}

/** Quello che il browser MANDA a ogni blocco: serve a controllare il cursore. */

interface Richiesta {
  readonly corpo: unknown;
}

/**
 * La RIGA di un’anomalia nella tabella del motore (`docs/26` A3).
 *
 * ⚠️ Il testo di una cella sta DUE volte nel DOM — nella riga di tabella e
 *    nella card, che sotto `lg` la sostituisce e porta `aria-hidden` — quindi
 *    `getByText` in modalità stretta ne trova due. Si guarda la riga, che è
 *    una sola, e il confine di parola dopo il numero tiene «Maglia cotone 1»
 *    lontana da «Maglia cotone 10».
 */
const riga = (page: Page, articolo: string) =>
  page.locator('tbody tr.data-table__row').filter({ hasText: new RegExp(`${articolo}\\b`) });

async function apriPannello(page: Page): Promise<void> {
  // ⭐ Il pannello ha una pagina propria dall’11/09/2026: Impostazioni → Shopify — e dal
  //    13/09 (`docs/29` §5) è a schede: «Allinea giacenze» sta in «Operazioni», che qui
  //    si apre dalla rotta. Senza scheda, la pagina sceglie quella dello stato.
  await apriImpostazioni(page, [], '/app/settings/shopify/operazioni');
  await expect(page.getByText('demo.myshopify.com')).toBeVisible({ timeout: 45_000 });
}

const pulsante = (page: Page) => page.getByRole('button', { name: /Allinea giacenze su Shopify/i });

async function mostraPulsante(page: Page) {
  const comando = pulsante(page);
  await comando.scrollIntoViewIfNeeded();
  await expect(comando).toBeVisible();
  return comando;
}

test('⭐ giro completo: avanzamento, cursore, elenco paginato', async ({ page }) => {
  const richieste: Richiesta[] = [];
  let sbloccaSecondo: (() => void) | null = null;
  const secondoInAttesa = new Promise<void>((risolvi) => (sbloccaSecondo = risolvi));

  await page.route('**/api/v1/shopify/sync/inventory/align', async (route: Route) => {
    richieste.push({ corpo: route.request().postDataJSON() });
    if (richieste.length === 1) {
      await route.fulfill({ status: 200, json: blocco() });
      return;
    }
    // ⭐ Il secondo blocco si fa ASPETTARE: è l'unico modo di guardare lo stato
    //    «in corso» a schermo invece di dedurlo.
    await secondoInAttesa;
    await route.fulfill({
      status: 200,
      json: blocco({
        esaminate: 100,
        allineate: 8,
        giaAllineate: 67,
        nonAllineate: VENTICINQUE,
        prossimo: null,
        fine: true,
      }),
    });
  });

  await apriPannello(page);
  const comando = await mostraPulsante(page);
  await page.screenshot({ path: `${SCATTI}/01-prima-del-clic.png` });

  await comando.click();

  // ── 1 · AVANZAMENTO, e nessuna percentuale inventata ────────────────────
  const stato = page.getByText(/Controllo in corso/);
  await expect(stato).toBeVisible({ timeout: 20_000 });
  await expect(stato).toContainText('200');
  await expect(stato).toContainText('300');
  await expect(stato).not.toContainText('%');

  // ── 2 · il pulsante è SPENTO mentre gira ────────────────────────────────
  await expect(comando).toBeDisabled();
  await page.screenshot({ path: `${SCATTI}/02-in-corso.png` });

  // ── 3 · il SECONDO blocco porta il cursore ricevuto dal primo ───────────
  await expect.poll(() => richieste.length).toBe(2);
  expect(richieste[0]?.corpo).toEqual({ prossimo: null });
  expect(richieste[1]?.corpo).toEqual({
    prossimo: { locationId: 'loc-1', variantId: 'var-200' },
  });

  sbloccaSecondo?.();

  // ── 4 · concluso: riepilogo e pulsante di nuovo acceso ──────────────────
  await expect(page.getByText(/Controllo completato/)).toBeVisible({ timeout: 20_000 });
  await expect(comando).toBeEnabled();
  // ⚠️ `exact` obbligatorio: «Allineate» aggancia anche «Non allineate».
  await expect(page.getByText('Allineate', { exact: true })).toBeVisible();
  await expect(page.getByText('Già corrette', { exact: true })).toBeVisible();
  await expect(page.getByText('Non allineate', { exact: true })).toBeVisible();

  // ── 5 · l'elenco porta TUTTE le anomalie, in un riquadro che scorre ─────
  await expect(riga(page, 'Maglia cotone 1')).toBeVisible();
  await expect(riga(page, 'Maglia cotone 25')).toBeAttached();
  // ⛔ Nessun comando di impaginazione: non c'e' niente da sfogliare.
  await expect(page.getByRole('button', { name: /Successiva/i })).toHaveCount(0);
  await page.screenshot({ path: `${SCATTI}/03-elenco-intero.png` });

  // ⭐ E l'ultima riga si RAGGIUNGE scorrendo il riquadro.
  await riga(page, 'Maglia cotone 25').scrollIntoViewIfNeeded();
  await expect(riga(page, 'Maglia cotone 25')).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/04-elenco-in-fondo.png` });
});

test('⛔ interruzione: «Controllo incompleto» e risultati parziali conservati', async ({
  page,
}) => {
  let chiamate = 0;
  await page.route('**/api/v1/shopify/sync/inventory/align', async (route: Route) => {
    chiamate += 1;
    if (chiamate === 1) {
      await route.fulfill({
        status: 200,
        json: blocco({ nonAllineate: VENTICINQUE.slice(0, 3) }),
      });
      return;
    }
    // ⭐ La catena si spezza al secondo blocco.
    await route.fulfill({ status: 503, json: { message: 'canale non raggiungibile' } });
  });

  await apriPannello(page);
  const comando = await mostraPulsante(page);
  await comando.click();

  await expect(page.getByText(/Controllo incompleto/)).toBeVisible({ timeout: 20_000 });
  // ⛔ Non si dichiara concluso quello che non lo è.
  await expect(page.getByText(/Controllo completato/)).toBeHidden();
  // ⭐ L'elenco è dichiarato PARZIALE, e ciò che era stato raccolto resta.
  await expect(page.getByText(/parziale/)).toBeVisible();
  await expect(riga(page, 'Maglia cotone 1')).toBeVisible();
  await expect(riga(page, 'Maglia cotone 3')).toBeVisible();
  // ⭐ E il pulsante torna acceso: si può ripremere.
  await expect(comando).toBeEnabled();
  await page.screenshot({ path: `${SCATTI}/05-interrotto.png`, fullPage: false });
});

test('⭐ un clic NUOVO riparte senza cursore, e azzera l elenco di prima', async ({ page }) => {
  const richieste: Richiesta[] = [];
  let giro = 0;
  await page.route('**/api/v1/shopify/sync/inventory/align', async (route: Route) => {
    richieste.push({ corpo: route.request().postDataJSON() });
    giro += 1;
    await route.fulfill({
      status: 200,
      json: blocco({
        esaminate: 300,
        prossimo: null,
        fine: true,
        // Il primo giro trova tre anomalie, il secondo nessuna.
        nonAllineate: giro === 1 ? VENTICINQUE.slice(0, 3) : [],
      }),
    });
  });

  await apriPannello(page);
  const comando = await mostraPulsante(page);

  await comando.click();
  await expect(riga(page, 'Maglia cotone 1')).toBeVisible({ timeout: 20_000 });

  await expect(comando).toBeEnabled();
  await comando.click();

  // ⭐ **L'elenco di prima NON sopravvive**: è un controllo nuovo.
  await expect(riga(page, 'Maglia cotone 1')).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(/Controllo completato/)).toBeVisible();

  // ⛔ **E la seconda pressione riparte SENZA cursore.**
  expect(richieste).toHaveLength(2);
  expect(richieste[0]?.corpo).toEqual({ prossimo: null });
  expect(richieste[1]?.corpo).toEqual({ prossimo: null });
  await page.screenshot({ path: `${SCATTI}/06-nuovo-clic.png` });
});

/**
 * ⭐ **L’elenco è sul MOTORE comune** (`docs/26` A3): era un `<ul>` con quattro
 *    `<span>` per riga, e con trecento righe cercare una sede o un motivo era
 *    scorrere. Qui si verifica ciò che il `<ul>` non aveva: ordinamento,
 *    filtro a valori sul Motivo, il dettaglio come colonna, la card sul
 *    telefono — e le due misure dell’11/09 (`docs/26` §5.1).
 */
test('⭐ le non allineate ORDINANO e FILTRANO per motivo, col dettaglio in colonna', async ({
  page,
}) => {
  await page.route('**/api/v1/shopify/sync/inventory/align', (route: Route) =>
    route.fulfill({
      status: 200,
      json: blocco({
        esaminate: 300,
        prossimo: null,
        fine: true,
        nonAllineate: [
          nonAllineata(2, 'divergenza_accertata'),
          nonAllineata(1, 'livello_non_disponibile'),
          { ...nonAllineata(3, 'errore_di_lettura'), sede: 'Negozio centro' },
        ],
      }),
    }),
  );
  await apriPannello(page);
  const comando = await mostraPulsante(page);
  await comando.click();

  const tabella = page.getByRole('table', { name: 'Coppie non allineate' });
  const righe = tabella.locator('tbody tr.data-table__row');
  await expect(righe).toHaveCount(3, { timeout: 20_000 });

  // ⭐ Il dettaglio, che stava nel `title`, si LEGGE in colonna.
  await expect(righe.first()).toContainText('Frase estesa che spiega il motivo.');

  // ── Ordinamento testuale sull’Articolo: 1, 2, 3 ─────────────────────────
  await expect(righe.first()).toContainText('Maglia cotone 2');
  await tabella.getByRole('button', { name: 'Ordina per Articolo' }).click();
  await expect(righe.nth(0)).toContainText('Maglia cotone 1');
  await expect(righe.nth(2)).toContainText('Maglia cotone 3');

  // ── Filtro a VALORI sul Motivo: la domanda che con trecento righe conta ──
  await page.getByRole('button', { name: /^Filtri/ }).click();
  await tabella.getByRole('button', { name: 'Filtra per Motivo' }).click();

  // ── Le due misure: pannello del filtro non ritagliato (ora, che è aperto),
  //    riga ≤ 26px. ⚠️ Si misura PRIMA di scegliere: la scelta accorcia
  //    l’elenco, la pagina scorre e il pannello fisso si chiude per contratto
  //    (D1) — misurarlo dopo trovava un pannello che non c’era più.
  await expect(page.getByRole('listbox')).toBeVisible();
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
  expect(misura?.altezzaRiga).toBeLessThanOrEqual(26);
  expect(misura?.pannelloDentro).toBe(true);

  await page.getByRole('option', { name: 'Errore di lettura', exact: true }).click();
  await expect(righe).toHaveCount(1);
  await expect(righe.first()).toContainText('Negozio centro');
  await page.screenshot({ path: `${SCATTI}/07-motore-filtrato.png`, fullPage: true });

  // Spento «Filtri», il filtro si azzera.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Filtri/ }).click();
  await expect(righe).toHaveCount(3);
});

test('⭐ e sul telefono ogni anomalia è una card: articolo, motivo, parole', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.route('**/api/v1/shopify/sync/inventory/align', (route: Route) =>
    route.fulfill({
      status: 200,
      json: blocco({
        esaminate: 300,
        prossimo: null,
        fine: true,
        nonAllineate: [nonAllineata(1, 'scrittura_esito_incerto')],
      }),
    }),
  );
  await apriPannello(page);
  const comando = await mostraPulsante(page);
  await comando.click();

  // Sotto `lg` il testo sta due volte nel DOM (card + cella `.sr-only`): si
  // guarda la card, che è la veste del telefono.
  const parole = page.locator('.list-card__words').filter({ hasText: 'Frase estesa' });
  await expect(parole).toBeVisible({ timeout: 20_000 });
  await expect(parole).toContainText('M · Rosso');
  await expect(parole).toContainText('Magazzino Napoli');
  const ancora = page
    .locator('.list-card__anchor')
    .filter({ hasText: 'Scrittura con esito incerto' });
  await expect(ancora).toBeVisible();

  // ⭐ E i filtri ci sono anche qui (`docs/26` D1): il pannello del telaio,
  //    riusato in un blocco delle Impostazioni.
  await page.getByRole('button', { name: 'Filtri', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Filtri' })).toBeVisible();
  await page.getByRole('button', { name: 'Filtra per Motivo' }).click();
  await page.getByRole('option', { name: 'Scrittura con esito incerto', exact: true }).click();
  await page.getByRole('button', { name: 'Vedi risultati', exact: true }).click();
  await expect(page.locator('tbody tr.data-table__row')).toHaveCount(1);

  const eccesso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(eccesso).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SCATTI}/08-telefono.png`, fullPage: true });
});
