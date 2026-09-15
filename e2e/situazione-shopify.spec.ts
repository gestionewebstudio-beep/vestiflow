import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { apriImpostazioni } from './helpers/impostazioni-fixtures';
import { test } from './helpers/isolated-test';
import {
  CONNESSIONE_ATTIVA,
  CONNESSIONE_SANA,
  percorsoAttivato,
} from './helpers/situazione-shopify-fixtures';

/**
 * LA SITUAZIONE ATTUALE della sincronizzazione Shopify, guardata a schermo
 * (`docs/27` §4-bis, 13/09/2026): a prima connessione conclusa, in cima stanno
 * i quattro fatti e i PROBLEMI aperti — raggruppati per causa, con conseguenza
 * e azione, e l'elenco sul motore comune — mentre il percorso è uno storico
 * richiudibile, chiuso. Desktop e telefono.
 *
 * ⭐ I numeri sono quelli del collaudo del 13/09: 2 ordini col permesso mancante,
 *    75 coppie con la lettura fallita, 7 non stoccate, 1 articolo con SKU
 *    ambiguo, l'ambito mancante e 2 notifiche non registrate. A schermo devono
 *    diventare SEI cause, non 87 righe da leggere.
 *
 * ⛔ Nessuna API, nessuno Shopify: risposte nella forma vera del DTO.
 */
const SCATTI = 'test-results/situazione-shopify';

/** Il percorso CONCLUSO, con l'esito di allora e la situazione di oggi. */

async function instrada(page: Page) {
  const setup = percorsoAttivato();
  await page.route('**/api/v1/shopify/setup', (route: Route) =>
    route.fulfill({ status: 200, json: setup }),
  );
  await page.route('**/api/v1/shopify/setup/**', (route: Route) =>
    route.fulfill({ status: 200, json: setup }),
  );
  await apriImpostazioni(page, [], '/app/settings/shopify', CONNESSIONE_ATTIVA);
  await expect(page.getByText('demo.myshopify.com').first()).toBeVisible({ timeout: 45_000 });
}

/** Un blocco di «Allinea giacenze» che chiude il perimetro al primo giro. */
const BLOCCO_ALLINEA = {
  totale: 4,
  esaminate: 4,
  allineate: 3,
  giaAllineate: 1,
  nonAllineate: [],
  prossimo: null,
  fine: true,
};

/** La connessione SANA: tutti i permessi, tutte le notifiche registrate. */

async function instradaSenzaProblemi(page: Page) {
  const setup = {
    ...percorsoAttivato(),
    situazione: { calcolataAt: '2026-09-13T03:40:00.000Z', problemi: [] },
  };
  await page.route('**/api/v1/shopify/setup', (route: Route) =>
    route.fulfill({ status: 200, json: setup }),
  );
  await page.route('**/api/v1/shopify/setup/**', (route: Route) =>
    route.fulfill({ status: 200, json: setup }),
  );
  await apriImpostazioni(page, [], '/app/settings/shopify', CONNESSIONE_SANA);
  await expect(page.getByText('demo.myshopify.com').first()).toBeVisible({ timeout: 45_000 });
}

/** Nessuno scorrimento orizzontale: la pagina non deve sbordare, a nessuna larghezza. */
async function nessunoSbordo(page: Page) {
  const larghezze = await page.evaluate(() => {
    const contenuto = document.querySelector('.shell__content');
    return {
      documento: document.documentElement.scrollWidth,
      finestra: window.innerWidth,
      // ⛔ La regione del contenuto RITAGLIA (overflow hidden): ciò che la supera non fa
      //    scorrere la pagina, sparisce. Misurato sul telefono il 14/09/2026: i fatti delle
      //    notifiche larghi 422px su 390, tagliati, col documento a posto.
      contenuto: contenuto ? contenuto.scrollWidth : 0,
      contenutoVisibile: contenuto ? contenuto.clientWidth : 0,
    };
  });
  expect(larghezze.documento).toBeLessThanOrEqual(larghezze.finestra);
  expect(larghezze.contenuto, JSON.stringify(larghezze)).toBeLessThanOrEqual(
    larghezze.contenutoVisibile + 1,
  );
}

const schede = (page: Page) => page.getByRole('navigation', { name: 'Aree di Shopify' });

/**
 * ⭐ Le CINQUE SCHEDE, divise per uso (`docs/29` §3, deciso dal proprietario il
 *    13/09/2026): Prima connessione · Sincronizzazione automatica · Operazioni manuali ·
 *    Problemi ed esiti · Connessione e sedi. Qui la matrice di verifica chiesta al
 *    §3: scrivania normale e ampia, telefono verticale e orizzontale, zoom 200% e
 *    tastiera, nomi lunghi, zero e molti problemi, caricamento, errore, comando in
 *    corso; i permessi limitati stanno in `impostazioni-shopify.spec`, la prima
 *    connessione in corso e conclusa in `prima-connessione.spec`.
 */
test('⭐ con problemi, scrivania: si apre la sincronizzazione; ogni scheda ha le sue righe; i rimandi vanno alla scheda giusta senza eseguire', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await instrada(page);
  await expect(page).toHaveURL(/\/shopify\/sincronizzazione/);

  // ── Sopra la card: la riga del negozio, poi le schede con stato e conteggio (il mock) ──
  await expect(page.getByText('demo.myshopify.com').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Integrazione Shopify' })).toHaveCount(0);
  const nav = schede(page);
  await expect(nav.getByRole('link', { name: 'Problemi ed esiti 87' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Prima connessione conclusa' })).toBeVisible();
  await expect(
    nav.getByRole('link', { name: 'Sincronizzazione automatica da verificare' }),
  ).toBeVisible();
  // Il breadcrumb nomina la scheda, non il segmento grezzo.
  await expect(page.getByRole('navigation', { name: 'Percorso di navigazione' })).toContainText(
    'Sincronizzazione automatica',
  );

  // ── Sincronizzazione automatica: un flusso per riga, stato e perché vicini alla descrizione ──
  const flussi = page.getByRole('region', { name: /Aggiornamenti automatici/ }).getByRole('list');
  await expect(flussi.getByRole('listitem')).toHaveCount(4);
  // ⭐ Ogni flusso ha il SUO stato: le notifiche mancanti sono dei fulfillment order, quindi
  //    «da verificare» sono gli Ordini; le Quantità sono «limitate» dagli ordini senza sede;
  //    catalogo e clienti restano attivi.
  const ordini = flussi.getByRole('listitem').filter({ hasText: /^Ordini/ });
  await expect(ordini).toContainText('da verificare');
  // ⛔ Mancano PER il permesso: la riga indica prima la nuova autorizzazione e rimanda ai
  //    permessi, non a «Registra» (proprietario, 14/09/2026). I nomi tecnici delle
  //    notifiche stanno nel dettaglio «una per una», non sul flusso.
  await expect(ordini).toContainText('manca il permesso «Sede degli ordini»');
  await expect(ordini.getByRole('button', { name: /Vai ai permessi/ })).toBeVisible();
  await expect(ordini).not.toContainText('fulfillment_orders/moved');
  // ⭐ L'avviso è UN banner (14/09/2026): dice la FUNZIONE interessata in italiano, non il
  //    nome del topic; col permesso mancante indica la nuova autorizzazione e NON propone
  //    «Registra», che fallirebbe.
  const avviso = page.getByRole('alert').filter({ hasText: /Mancano 2 notifiche/ });
  await expect(avviso).toContainText('quelle per la sede assegnata agli ordini');
  await expect(avviso).toContainText('serve una nuova autorizzazione');
  await expect(avviso).not.toContainText('fulfillment_orders/moved');
  await expect(avviso.getByRole('button', { name: /Vai a Connessione e sedi/ })).toBeVisible();
  await expect(avviso.getByRole('button', { name: /Registra le notifiche mancanti/ })).toHaveCount(
    0,
  );
  const quantita = flussi.getByRole('listitem').filter({ hasText: 'Quantità' });
  await expect(quantita).toContainText('limitato');
  await expect(flussi.getByRole('listitem').filter({ hasText: 'Clienti' })).toContainText('attivo');
  await expect(page.getByRole('heading', { name: /Notifiche dal negozio/ })).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/01-sincronizzazione-desktop.png` });
  // Le notifiche sono i fatti a colonne, sempre visibili («8 su 10 · 2 mancanti»); «Verifica
  // ora» sta a destra del titolo; i nomi tecnici nel dettaglio richiudibile.
  await expect(page.getByText('Ultimo evento ricevuto', { exact: true })).toBeVisible();
  await expect(page.getByText('8 su 10 · 2 mancanti')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verifica ora' })).toBeVisible();
  await expect(page.getByText('fulfillment_orders/moved', { exact: true })).toBeHidden();
  await page.getByText('Dettagli tecnici delle notifiche').click();
  await expect(page.getByText('fulfillment_orders/moved', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/02-notifiche-aperte-desktop.png` });

  // ── Problemi ed esiti: cause con effetto e azione, niente nomi troncati, tono per «da valutare» ──
  await nav.getByRole('link', { name: 'Problemi ed esiti 87' }).click();
  await expect(page).toHaveURL(/\/shopify\/problemi/);
  const problemi = page.getByRole('region', { name: /Problemi aperti/ });
  // ⭐ Le cause in una TABELLA (14/09/2026): una riga per causa — quante, effetto, azione.
  const tabellaCause = problemi.getByRole('table', { name: 'Le cause dei problemi aperti' });
  const cause = tabellaCause.locator('tbody').getByRole('row');
  await expect(cause).toHaveCount(6);
  await expect(cause.nth(3)).toContainText('75');
  await expect(tabellaCause.getByRole('columnheader', { name: 'Effetto' })).toBeVisible();
  await expect(problemi.locator('.problemi__causa-riga--valutare')).toHaveCount(1);
  await expect(problemi.locator('.problemi__dove--shopify').first()).toContainText('Su Shopify');
  // La tabella: articolo e variante larghi, l'azione breve e premibile.
  const tabella = problemi.getByRole('table', {
    name: 'Problemi aperti della sincronizzazione Shopify',
  });
  await expect(tabella.getByRole('columnheader', { name: 'Articolo / ordine' })).toBeVisible();
  await expect(tabella.getByRole('columnheader', { name: 'Variante' })).toBeVisible();
  await expect(tabella.getByRole('link', { name: '#1010' })).toHaveAttribute(
    'href',
    '/app/sales/ordine-0',
  );
  // Gli esiti delle operazioni, con la data.
  await expect(page.getByRole('heading', { name: /Esiti delle operazioni/ })).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/03-problemi-desktop.png` });

  // ── Il rimando porta a Operazioni manuali, evidenzia «Allinea» e NON lo esegue ──
  let chiamate = 0;
  await page.route('**/api/v1/shopify/sync/inventory/align**', (route: Route) => {
    chiamate += 1;
    return route.fulfill({ status: 200, json: BLOCCO_ALLINEA });
  });
  await problemi
    .getByRole('button', { name: /Vai ad Allinea giacenze \(tutti gli articoli, tutte le sedi\)/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/shopify\/operazioni/);
  await expect(page.locator('.shopify-integration__evidenziato')).toBeVisible();
  expect(chiamate).toBe(0);
  // Le quattro operazioni: effetto, perimetro, esito, pulsante — sulla stessa griglia.
  const operazioni = page.getByRole('region', { name: /Operazioni avviate manualmente/ });
  await expect(operazioni.getByRole('listitem')).toHaveCount(4);
  // ⭐ Quando serve e che cosa modifica, verificati contro docs/24 §9.2 (14/09/2026).
  await expect(operazioni.getByText(/su tutto il catalogo del negozio/)).toBeVisible();
  await expect(
    operazioni.getByText(/Non tocca nome e categoria VestiFlow, prezzi di vendita e quantità/),
  ).toBeVisible();
  await expect(
    operazioni.getByRole('listitem', { name: 'Allinea giacenze su Shopify' }),
  ).toContainText('fermo');
  await page.screenshot({ path: `${SCATTI}/04-operazioni-desktop.png` });

  // ── Connessione e sedi: negozio, accesso, sedi con «Su Shopify» e «Sede VestiFlow», disconnessione ──
  await nav.getByRole('link', { name: 'Connessione e sedi' }).click();
  await expect(page.getByRole('heading', { name: 'Negozio', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Su Shopify' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Sede VestiFlow' })).toBeVisible();
  // ⭐ Quattro gruppi distinti (14/09/2026): negozio, permessi, sedi, operazioni sensibili.
  await expect(page.getByRole('heading', { name: /Permessi su Shopify/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Operazioni sensibili/ })).toBeVisible();
  // (La connessione qui non ha errori: «Azzera le segnalazioni» e la sua conseguenza
  //  visibile sono provati nella prova di componente del pannello.)
  // ⛔ La purga è spenta finché l'API la rifiuta, e il motivo sta accanto al pulsante.
  const purga = page.getByRole('button', { name: 'Disconnetti e rimuovi dati' });
  await expect(purga).toBeDisabled();
  await expect(purga).toHaveAccessibleDescription(/l'API rifiuta la rimozione/);
  await page.screenshot({ path: `${SCATTI}/05-connessione-desktop.png` });

  // ── Prima connessione conclusa: consultabile, comandi spenti con il motivo ──
  await nav.getByRole('link', { name: 'Prima connessione conclusa' }).click();
  const percorso = page.getByRole('region', { name: 'Prima connessione', exact: true });
  await expect(percorso.getByText(/conclusa il/)).toBeVisible();
  await expect(
    percorso.getByText('allineamento delle quantità fermo', { exact: true }),
  ).toBeVisible();
  // ⛔ Conclusa, nessun comando: niente «Attiva» spento (proprietario, 14/09/2026).
  await expect(percorso.getByRole('button', { name: 'Attiva la sincronizzazione' })).toHaveCount(0);
  await expect(percorso.getByText('Direzione iniziale')).toBeVisible();
  await expect(percorso.getByRole('button', { name: '87 problemi aperti oggi ›' })).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/06-prima-connessione-desktop.png` });
  await nessunoSbordo(page);
});

test('⭐ senza problemi: gli aggiornamenti sono attivi (verde), nessun rimando inutile, «Nessun problema aperto»', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await instradaSenzaProblemi(page);

  // Con notifiche e permessi a posto e nessun problema: la scheda dice «attiva», in verde.
  await expect(
    schede(page).getByRole('link', { name: 'Sincronizzazione automatica attiva' }),
  ).toBeVisible();
  await schede(page).getByRole('link', { name: 'Problemi ed esiti 0' }).click();
  const problemi = page.getByRole('region', { name: /Problemi aperti/ });
  await expect(problemi).toContainText('Nessun problema aperto: la sincronizzazione lavora.');
  // Nessuna tabella di problemi né di cause: resta solo quella degli esiti precedenti.
  await expect(problemi.getByRole('table', { name: 'Le cause dei problemi aperti' })).toHaveCount(
    0,
  );
  await expect(problemi.locator('app-shopify-problemi').getByRole('table')).toHaveCount(0);
  await page.screenshot({ path: `${SCATTI}/07-senza-problemi-desktop.png` });
});

test('scrivania AMPIA (1800): le righe non si stirano, stato e comando restano vicini alla descrizione', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 900 });
  await instrada(page);
  await schede(page).getByRole('link', { name: 'Operazioni manuali' }).click();
  const riga = page.getByRole('listitem', { name: 'Allinea giacenze su Shopify' });
  const scatole = await riga.evaluate((el) => {
    const testo = el.querySelector('.shopify-integration__riga-testo')!.getBoundingClientRect();
    const pulsante = el.querySelector('.shopify-integration__riga-azione')!.getBoundingClientRect();
    return { fineTesto: testo.right, inizioPulsante: pulsante.left, larghezzaRiga: el.clientWidth };
  });
  // Il pulsante non è all'estremo destro di una riga da 1.500px: sta dopo lo stato.
  expect(scatole.inizioPulsante - scatole.fineTesto).toBeLessThan(400);
  await page.screenshot({ path: `${SCATTI}/08-operazioni-desktop-ampio.png` });
  await nessunoSbordo(page);
});

test('telefono VERTICALE (390): schede a scorrimento, righe impilate, card complete senza mouse', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await instrada(page);
  await nessunoSbordo(page);
  await page.screenshot({ path: `${SCATTI}/09-sincronizzazione-telefono.png` });

  await schede(page).getByRole('link', { name: 'Problemi ed esiti 87' }).click();
  const problemi = page.getByRole('region', { name: /Problemi aperti/ });
  await expect(
    problemi
      .getByRole('table', { name: 'Le cause dei problemi aperti' })
      .locator('tbody')
      .getByRole('row'),
  ).toHaveCount(6);
  await nessunoSbordo(page);
  // ⭐ Le card sono COMPATTE (chi è, e la causa): effetto e azione stanno una volta nel
  //    gruppo — non ripetuti in 87 card da 150px (proprietario, 13/09/2026).
  const card = problemi.locator('.list-card__words').first();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText('Permessi Shopify mancanti');
  await expect(card).not.toContainText('Disconnetti e Connetti Shopify');
  const altezze = await problemi
    .locator('.data-table__row')
    .evaluateAll((righe) => righe.slice(0, 10).map((r) => r.getBoundingClientRect().height));
  expect(Math.max(...altezze)).toBeLessThan(90);
  await page.screenshot({ path: `${SCATTI}/10-problemi-telefono-card.png` });

  await schede(page).getByRole('link', { name: 'Operazioni manuali' }).click();
  await page.locator('#settings-shopify-sync-giacenze').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SCATTI}/11-operazioni-telefono.png` });
});

test('telefono ORIZZONTALE (844×390): la pagina resta leggibile e non sborda', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await instrada(page);
  await nessunoSbordo(page);
  await page.screenshot({ path: `${SCATTI}/12-sincronizzazione-telefono-orizzontale.png` });
  await schede(page).getByRole('link', { name: 'Problemi ed esiti 87' }).click();
  await nessunoSbordo(page);
  await page.screenshot({ path: `${SCATTI}/13-problemi-telefono-orizzontale.png` });
});

test.describe('EMULAZIONE dello zoom 200% del browser', () => {
  // ⚠️ Playwright non imposta lo zoom del browser, e questa prova NON lo prova: riproduce
  //    la sua GEOMETRIA — una finestra CSS da 640×450 con rapporto di pixel 2, che è ciò
  //    che una finestra da 1280×900 diventa al 200% — così le regole di larghezza e la
  //    resa a densità doppia si esercitano. Lo zoom vero (Ctrl+) passa dal browser e può
  //    differire (resa dei caratteri, barre di scorrimento, tasti a scorciatoia): si
  //    controlla a mano (`DA-FARE`, controlli visivi). Un `zoom: 2` sul documento non
  //    cambia le regole di larghezza e mostrava un guasto inesistente; la sola finestra
  //    stretta non esercita la densità (proprietario, 13/09/2026, due precisazioni).
  test.use({ viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 });

  test('emulazione dello zoom 200% e tastiera: le schede si raggiungono col Tab e si aprono con Invio', async ({
    page,
  }) => {
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
    expect(await page.evaluate(() => window.innerWidth)).toBe(640);
    await instrada(page);
    await nessunoSbordo(page);
    // Dal titolo della pagina, il Tab arriva alle schede; Invio apre quella a fuoco.
    await page.getByRole('link', { name: 'Prima connessione conclusa' }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: /Sincronizzazione automatica/ })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Operazioni manuali' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/shopify\/operazioni/);
    await expect(page.getByRole('button', { name: 'Allinea giacenze su Shopify' })).toBeVisible();
    await page.screenshot({ path: `${SCATTI}/14-zoom-200-tastiera.png` });
  });
});

test('nomi LUNGHI: la tabella taglia a colonna senza sbordare, la card mostra tutto', async ({
  page,
}) => {
  const lungo =
    'Articolo con un nome davvero molto lungo che non finisce mai, edizione limitata autunno inverno 2026 (SHOPIFY-51705810747687)';
  const sedeLunga = 'Magazzino centrale distribuzione Nord-Est (ex deposito stagionale)';
  const setup = percorsoAttivato();
  const problemi = setup.situazione.problemi.map((p, indice) =>
    indice === 4 ? { ...p, nome: lungo, sede: sedeLunga } : p,
  );
  const conNomiLunghi = { ...setup, situazione: { ...setup.situazione, problemi } };
  await page.route('**/api/v1/shopify/setup', (route: Route) =>
    route.fulfill({ status: 200, json: conNomiLunghi }),
  );
  await page.route('**/api/v1/shopify/setup/**', (route: Route) =>
    route.fulfill({ status: 200, json: conNomiLunghi }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await apriImpostazioni(page, [], '/app/settings/shopify/problemi', CONNESSIONE_ATTIVA);
  await expect(page.getByText('demo.myshopify.com').first()).toBeVisible({ timeout: 45_000 });
  await nessunoSbordo(page);
  const tabella = page.getByRole('table', {
    name: 'Problemi aperti della sincronizzazione Shopify',
  });
  await expect(tabella.getByRole('link', { name: lungo })).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/15-nomi-lunghi-desktop.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await nessunoSbordo(page);
  const card = page.locator('.list-card__what', { hasText: 'edizione limitata' });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  // ⛔ «Visibile» non basta: con la sede nell'ANCORA — che per grammatica non si stringe —
  //    una sede dal nome lungo lasciava al nome dell'articolo 43px, e la card non diceva
  //    più di chi parla (misurato sul telefono il 14/09/2026). Il nome tiene la prima riga
  //    quasi intera; la sede è una parola e sta nella fascia sotto.
  //    Si misura il gruppo che RITAGLIA (`__ident`), non lo span del nome: quello riporta
  //    la larghezza intera anche quando ne resta a vista una fetta.
  const misura = await card.evaluate((el) => {
    const gruppo = el.closest('.list-card__ident') as HTMLElement;
    const testa = el.closest('.list-card__head') as HTMLElement;
    return {
      gruppo: gruppo.getBoundingClientRect().width,
      testa: testa.getBoundingClientRect().width,
    };
  });
  expect(misura.gruppo, JSON.stringify(misura)).toBeGreaterThan(misura.testa * 0.8);
  await expect(page.locator('.list-card__words', { hasText: sedeLunga })).toHaveCount(1);
  await page.screenshot({ path: `${SCATTI}/16-nomi-lunghi-telefono.png` });
});

test('caricamento ed errore: lo scheletro prima, lo stato di errore con «Riprova» se la connessione non arriva', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // La connessione arriva con un ritardo: nel frattempo lo scheletro, non una pagina vuota.
  let rispondi: (() => void) | null = null;
  const attesa = new Promise<void>((resolve) => {
    rispondi = resolve;
  });
  await page.route('**/api/v1/shopify/connection', async (route: Route) => {
    await attesa;
    await route.fulfill({ status: 500, json: { message: 'Servizio non raggiungibile' } });
  });
  for (const [rotta, corpo] of [
    ['**/api/v1/tenant/company', {}],
    ['**/api/v1/tenant/feature-settings', {}],
    ['**/api/v1/inventory/locations', []],
    ['**/api/v1/unit-of-measure-options', []],
    ['**/api/v1/vat-codes', []],
    ['**/api/v1/shopify/setup', percorsoAttivato()],
  ] as const) {
    await page.route(rotta, (route: Route) =>
      route.fulfill({ status: 200, json: corpo as object }),
    );
  }
  await page.goto('/app/settings/shopify');
  await expect(page.locator('app-table-skeleton').first()).toBeVisible({ timeout: 45_000 });
  await page.screenshot({ path: `${SCATTI}/17-caricamento-desktop.png` });
  rispondi!();
  await expect(page.getByRole('button', { name: 'Riprova' })).toBeVisible({ timeout: 45_000 });
  await page.screenshot({ path: `${SCATTI}/18-errore-desktop.png` });
});

test('comando in corso: avanzamento e attesa sulla riga, pulsante spento, nessun invito a ripetere', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let sblocca: (() => void) | null = null;
  const attesa = new Promise<void>((resolve) => {
    sblocca = resolve;
  });
  await page.route('**/api/v1/shopify/sync/inventory/align**', async (route: Route) => {
    await attesa;
    await route.fulfill({ status: 200, json: BLOCCO_ALLINEA });
  });
  await instradaSenzaProblemi(page);
  await schede(page).getByRole('link', { name: 'Operazioni manuali' }).click();
  const pulsante = page.getByRole('button', { name: 'Allinea giacenze su Shopify' });
  await pulsante.click();
  const riga = page.getByRole('listitem', { name: 'Allinea giacenze su Shopify' });
  await expect(pulsante).toBeDisabled();
  await expect(riga).toContainText('in corso');
  await page.screenshot({ path: `${SCATTI}/19-comando-in-corso-desktop.png` });
  sblocca!();
  await expect(riga.getByRole('status')).toContainText('Controllo completato', { timeout: 20_000 });
  await expect(riga).toContainText('completata');
  await expect(pulsante).toBeEnabled();
  await page.screenshot({ path: `${SCATTI}/20-comando-concluso-desktop.png` });
});

/**
 * ⭐ Gli AIUTI «?» (proprietario, 14/09/2026): le spiegazioni dei titoli stanno in un
 *    pulsante col tooltip condiviso — mouse, tastiera e tocco. Visibile resta ciò che
 *    serve per decidere. La bolla ha `pointer-events: none` (è un tooltip): la prova non
 *    chiede chi sta sotto il suo centro, ma che sia visibile e che non esca da nessun
 *    antenato che ritaglia né dallo schermo.
 */
async function bollaDi(page: Page, nome: string) {
  return page.evaluate((nome) => {
    const pulsante = [...document.querySelectorAll('button.hover-tooltip__icona')].find(
      (b) => b.getAttribute('aria-label') === nome,
    );
    if (!pulsante) {
      return null;
    }
    const bolla = document.getElementById(pulsante.getAttribute('aria-describedby') ?? '')!;
    const stile = getComputedStyle(bolla);
    const r = bolla.getBoundingClientRect();
    let ritagliata = false;
    for (let an = bolla.parentElement; an; an = an.parentElement) {
      const o = getComputedStyle(an);
      if (o.overflowX !== 'visible' || o.overflowY !== 'visible') {
        const a = an.getBoundingClientRect();
        if (
          r.left < a.left - 0.5 ||
          r.right > a.right + 0.5 ||
          r.top < a.top - 0.5 ||
          r.bottom > a.bottom + 0.5
        ) {
          ritagliata = true;
        }
      }
    }
    const visibile =
      stile.display !== 'none' && stile.visibility === 'visible' && stile.opacity === '1';
    const dentro =
      r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight;
    // «A posto» = aperta, dentro lo schermo, non ritagliata: la posizione arriva col
    // rilevamento delle modifiche, un attimo dopo il fuoco, quindi si attende con poll.
    return {
      visibile,
      dentro,
      ritagliata,
      aPosto: visibile && dentro && !ritagliata,
      testo: bolla.textContent?.trim() ?? '',
      rect: {
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
      },
    };
  }, nome);
}

test('aiuti «?» sulla scrivania: mouse e tastiera; Esc chiude; la bolla resta nello schermo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await instrada(page);
  const nome = 'Che cosa sono gli aggiornamenti automatici';
  const aiuto = page.getByRole('button', { name: nome });
  await expect(aiuto).toHaveAccessibleDescription(/che cosa si aggiorna da sé/i);
  expect((await bollaDi(page, nome))?.visibile).toBe(false);
  // Mouse.
  await aiuto.hover();
  await expect.poll(async () => (await bollaDi(page, nome))?.aPosto).toBe(true);
  await page.mouse.move(640, 800);
  await expect.poll(async () => (await bollaDi(page, nome))?.visibile).toBe(false);
  // Tastiera: si arriva col Tab, Esc chiude e il fuoco resta.
  await aiuto.focus();
  await expect.poll(async () => (await bollaDi(page, nome))?.visibile).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await bollaDi(page, nome))?.visibile).toBe(false);
  await expect(aiuto).toBeFocused();
  // Le spiegazioni non hanno una seconda copia visibile nella pagina.
  await expect(page.getByText(/che cosa si aggiorna da sé/i)).toHaveCount(1);
});

test.describe('aiuti «?» sul telefono', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('si aprono al tocco, contenuti nello schermo; un secondo tocco chiude; un tocco altrove chiude', async ({
    page,
  }) => {
    await instrada(page);
    await schede(page).getByRole('link', { name: 'Connessione e sedi' }).click();
    // Un pulsante a metà schermo: la bolla non sta né a destra né a sinistra, e si stringe.
    const nome = 'Che cosa hanno in comune';
    const aiuto = page.getByRole('button', { name: nome });
    await aiuto.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await aiuto.tap();
    await expect.poll(async () => (await bollaDi(page, nome))?.aPosto).toBe(true);
    await aiuto.tap();
    await expect.poll(async () => (await bollaDi(page, nome))?.visibile).toBe(false);
    await aiuto.tap();
    await expect.poll(async () => (await bollaDi(page, nome))?.aPosto).toBe(true);
    await page.touchscreen.tap(195, 780);
    await expect.poll(async () => (await bollaDi(page, nome))?.visibile).toBe(false);
    // L'icona è piccola, l'area premibile vale un pulsante: a 18px dal centro si colpisce ancora.
    const colpito = await aiuto.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const sotto = document.elementFromPoint(r.left + r.width / 2 + 18, r.top + r.height / 2 + 18);
      return sotto?.closest('button.hover-tooltip__icona') === el;
    });
    expect(colpito).toBe(true);
    await nessunoSbordo(page);
  });
});
