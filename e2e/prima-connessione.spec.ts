import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { apriImpostazioni } from './helpers/impostazioni-fixtures';
import { test } from './helpers/isolated-test';

/**
 * LA PRIMA CONNESSIONE SHOPIFY, guardata a schermo (`docs/27` §1).
 *
 * ⭐ **Nessuna API, nessun database, nessuno Shopify**: il percorso lo governa
 *    una macchina a stati scritta QUI, che risponde agli stessi endpoint del
 *    client (`GET/PUT/POST /shopify/setup*`) con la forma vera del DTO. Le
 *    prove di componente misurano il comportamento; questa misura la RESA:
 *    le tre fasi impilate, l'anteprima con gli ordini da risolvere e le
 *    variazioni sul motore, i casi irrisolti aperti davanti al pulsante, il
 *    badge dopo l'attivazione, e la sezione Sedi che prende il posto della
 *    fase 2 una volta attivato.
 *
 * ⛔ Non prova l'API: quella sta in
 *    `api/src/test/integration/prima-connessione-percorso.integration-spec.ts`,
 *    sui servizi veri.
 */

const SCATTI = 'test-results/prima-connessione';

const LOCATIONS = [
  {
    shopifyLocationId: '11',
    name: 'Negozio centro',
    active: true,
    choice: null as string | null,
    locationId: null as string | null,
    locationName: null as string | null,
  },
  {
    shopifyLocationId: '22',
    name: 'Deposito',
    active: true,
    choice: null as string | null,
    locationId: null as string | null,
    locationName: null as string | null,
  },
];

const ANTEPRIMA = {
  computedAt: '2026-09-12T10:00:00.000Z',
  direction: 'shopify_to_vestiflow',
  catalogo: {
    remoti: 12,
    locali: 0,
    collegati: 0,
    daImportare: 11,
    daAggiornare: 0,
    daPubblicare: 0,
    ambigui: [
      {
        sku: 'DOPPIO-1',
        locale: { productId: 'p-1', nome: 'Cintura' },
        remoto: { shopifyProductId: '901', titolo: 'Cintura pelle' },
      },
    ],
  },
  sedi: {
    collegate: [
      {
        locationId: 'loc-1',
        nome: 'Sede 1',
        shopifyLocationId: '11',
        shopifyName: 'Negozio centro',
      },
    ],
    lasciate: [{ shopifyLocationId: '22', shopifyName: 'Deposito' }],
    daDecidere: [],
  },
  quantita: {
    coppie: 2,
    righeTotali: 2,
    nonDeterminabili: [],
    articoliNuovi: 11,
    righe: [
      {
        sku: 'MAG-M',
        articolo: 'Maglia',
        variante: 'M',
        sede: 'Sede 1',
        attuale: 0,
        prevista: 7,
        delta: 7,
      },
      {
        sku: 'BOR-1',
        articolo: 'Borsa',
        variante: null,
        sede: 'Sede 1',
        attuale: 0,
        prevista: 3,
        delta: 3,
      },
    ],
  },
  ordini: {
    aperti: 2,
    parziali: 0,
    senzaSede: 1,
    giaInVestiFlow: 0,
    elenco: [
      {
        shopifyOrderId: '5001',
        nome: '#5001',
        stato: 'aperto',
        righe: 1,
        sedeDeterminabile: true,
        giaInVestiFlow: false,
      },
      {
        shopifyOrderId: '5002',
        nome: '#5002',
        stato: 'aperto',
        righe: 2,
        sedeDeterminabile: false,
        giaInVestiFlow: false,
      },
    ],
  },
  blocchi: [] as string[],
};

const ESITO = {
  fase: 'concluso',
  startedAt: '2026-09-12T10:01:00.000Z',
  finishedAt: '2026-09-12T10:03:00.000Z',
  interruzione: null,
  catalogo: { imported: 11, updated: 0, skipped: 0, failed: 0, esclusiAmbigui: 1 },
  quantita: { coppie: 2, scritte: 2, invariate: 0, giaScritte: 0, nonDeterminabili: 0 },
  allinea: null,
  esclusi: [
    {
      tipo: 'articolo',
      riferimento: '901',
      nome: 'Cintura pelle',
      motivo: 'stesso SKU dalle due parti',
    },
  ],
};

const IRRISOLTI = [
  {
    tipo: 'articolo',
    riferimento: '901',
    nome: 'Cintura pelle',
    motivo: 'stesso SKU dalle due parti',
  },
  {
    tipo: 'ordine',
    riferimento: '5002',
    nome: '#5002',
    motivo: 'sede non collegata: nessun impegno, resta «Da verificare» in Vendite',
  },
];

/** La macchina a stati del percorso, nella forma del DTO dell'API. */
function percorso() {
  const stato = {
    presente: true,
    status: 'scelte' as string,
    direction: null as string | null,
    locations: LOCATIONS.map((l) => ({ ...l })),
    sediVestiFlow: [
      { id: 'loc-1', name: 'Sede 1', code: 'S1', shopifyLocationId: null as string | null },
    ],
    anteprima: null as object | null,
    esito: null as object | null,
    confirmedAt: null as string | null,
    activatedAt: null as string | null,
    blocchiAttivazione: [] as string[],
    irrisolti: [] as object[],
    trasferimentoInCorso: false,
    situazione: { calcolataAt: '2026-09-12T10:00:00.000Z', problemi: [] as object[] },
  };
  return stato;
}

/** I problemi aperti DOPO l'attivazione: l'articolo con lo SKU ambiguo e l'ordine senza sede. */
const SITUAZIONE_ATTIVATA = {
  calcolataAt: '2026-09-12T10:06:00.000Z',
  problemi: [
    {
      tipo: 'ordine',
      causa: 'ordine_permesso_fulfillment_orders',
      riferimento: 'o-5002',
      nome: '#5002',
      dettaglio: null,
      sede: null,
      conseguenza:
        'Nessun impegno per le sue righe: la quantità delle varianti coinvolte resta ferma verso Shopify (nessuna pubblicazione, «Allinea» rifiuta).',
      azione: {
        tipo: 'permessi',
        etichetta:
          'Disconnetti e Connetti Shopify: la nuova autorizzazione include il permesso di leggere la sede degli ordini',
        riferimento: null,
      },
      apri: { tipo: 'apri_ordine', etichetta: 'Apri l’ordine', riferimento: 'o-5002' },
      rilevatoAt: '2026-09-12T10:05:30.000Z',
    },
    {
      tipo: 'articolo',
      causa: 'articolo_sku_ambiguo',
      riferimento: '901',
      nome: 'Cintura pelle',
      dettaglio: null,
      sede: null,
      conseguenza:
        'Lo stesso SKU esiste dalle due parti senza collegamento: l’articolo non è sincronizzato.',
      azione: {
        tipo: 'apri_articolo',
        etichetta: 'Apri l’articolo e collega la variante Shopify giusta',
        riferimento: '901',
      },
      apri: { tipo: 'apri_articolo', etichetta: 'Apri l’articolo', riferimento: '901' },
      rilevatoAt: null,
    },
  ],
};

async function instradaPercorso(page: Page) {
  const s = percorso();
  const rispondi = (route: Route) => route.fulfill({ status: 200, json: s });

  await page.route('**/api/v1/shopify/setup', rispondi);
  await page.route('**/api/v1/shopify/setup/direction', (route: Route) => {
    s.direction = (route.request().postDataJSON() as { direction: string }).direction;
    s.status = 'sedi';
    return rispondi(route);
  });
  await page.route('**/api/v1/shopify/setup/locations/*', (route: Route) => {
    const id = route.request().url().split('/').pop()!;
    const scelta = route.request().postDataJSON() as { choice: string; locationId?: string };
    const location = s.locations.find((l) => l.shopifyLocationId === id)!;
    location.choice = scelta.choice;
    location.locationId = scelta.locationId ?? null;
    location.locationName = scelta.locationId ? 'Sede 1' : null;
    if (scelta.locationId) {
      s.sediVestiFlow[0]!.shopifyLocationId = id;
    }
    s.anteprima = null;
    return rispondi(route);
  });
  await page.route('**/api/v1/shopify/setup/preview', (route: Route) => {
    s.status = 'controllo';
    s.anteprima = ANTEPRIMA;
    return rispondi(route);
  });
  await page.route('**/api/v1/shopify/setup/confirm', (route: Route) => {
    // Il trasferimento è già concluso quando il browser rilegge: qui non c'è attesa.
    s.status = 'trasferito';
    s.confirmedAt = '2026-09-12T10:01:00.000Z';
    s.esito = ESITO;
    s.irrisolti = IRRISOLTI;
    return rispondi(route);
  });
  await page.route('**/api/v1/shopify/setup/activate', (route: Route) => {
    s.status = 'attivato';
    s.activatedAt = '2026-09-12T10:05:00.000Z';
    s.esito = {
      ...ESITO,
      attivazione: {
        ordini: { totale: 2, acquisiti: 1, giaPresenti: 0, senzaSede: 1, parziali: 0, falliti: 0 },
        base: { totale: 2, allineate: 0, giaAllineate: 2, nonAllineate: 0 },
        ordersSinceId: '5002',
      },
    };
    s.situazione = SITUAZIONE_ATTIVATA;
    return rispondi(route);
  });
  return s;
}

test('⭐ il percorso a schermo: scelte, sedi, controllo, conferma, casi irrisolti, attivazione', async ({
  page,
}) => {
  // Una finestra alta: la regione che scorre è `.shell__content`, e uno scatto
  // dell'elemento prende solo la parte visibile. Così il pannello entra intero.
  await page.setViewportSize({ width: 1280, height: 2600 });
  await instradaPercorso(page);
  await apriImpostazioni(page, [], '/app/settings/shopify?shopify=setup');
  await expect(page.getByText('demo.myshopify.com').first()).toBeVisible({ timeout: 45_000 });

  // ── 1 · si apre la scheda Prima connessione con le tre fasi; le operazioni sono chiuse ──
  await expect(page).toHaveURL(/\/shopify\/prima-connessione/);
  const pannello = page.getByRole('region', { name: 'Prima connessione' });
  await expect(pannello).toBeVisible();
  await expect(page.getByText(/completa la prima connessione/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /1 Scelte iniziali/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /2 Sedi/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /3 Controllo e conferma/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importa catalogo' })).toHaveCount(0);
  // ⭐ La riga di stato dice la fase (di TRE); la scheda lo dice a parole.
  await expect(page.getByText('fase 1 di 3 · Scelte iniziali')).toBeVisible();
  const schede = page.getByRole('navigation', { name: 'Aree di Shopify' });
  await expect(schede.getByRole('link', { name: 'Prima connessione in corso' })).toBeVisible();
  // I rimedi per connessione e permessi restano raggiungibili, nella loro scheda.
  await schede.getByRole('link', { name: 'Connessione e sedi' }).click();
  await expect(page.getByRole('button', { name: 'Disconnetti Shopify' })).toBeVisible();
  await expect(page.getByText('Accesso a Shopify')).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/00b-percorso-iniziale-connessione.png` });
  await schede.getByRole('link', { name: 'Prima connessione in corso' }).click();
  await page.screenshot({ path: `${SCATTI}/00-percorso-iniziale-pagina.png` });
  await pannello.screenshot({ path: `${SCATTI}/01-scelte.png` });

  await page.getByRole('button', { name: 'Shopify → VestiFlow' }).click();

  // ── 2 · una scelta per location; il controllo si apre solo a scelte fatte ─
  const vaiAlControllo = page.getByRole('button', { name: 'Vai al controllo' });
  await expect(vaiAlControllo).toBeDisabled();
  await page.getByRole('button', { name: /Scelta per la location Negozio centro/ }).click();
  await page.getByRole('option', { name: 'Collega a «Sede 1»' }).click();
  await page.getByRole('button', { name: /Scelta per la location Deposito/ }).click();
  await page.getByRole('option', { name: 'Lascia fuori da VestiFlow' }).click();
  await expect(vaiAlControllo).toBeEnabled();
  await pannello.screenshot({ path: `${SCATTI}/02-sedi.png` });
  await vaiAlControllo.click();

  // ── 3 · l'anteprima: gli ordini da risolvere, le variazioni sul motore ────
  // ⚠️ Stringa, non regex: Playwright normalizza gli spazi solo per le stringhe
  //    (misurato il 13/09/2026), e qui il testo va a capo dentro un blocco `@if`.
  await expect(page.getByText('2 aperti su Shopify: diventano impegni')).toBeVisible();
  const daRisolvere = page.getByText(/Ordini che resteranno senza impegno: 1/);
  await expect(daRisolvere).toBeVisible();
  await daRisolvere.click();
  await expect(page.getByText(/#5002 · 2 righe/)).toBeVisible();
  await page.getByText(/Variazioni previste/).click();
  const tabella = page.getByRole('table', { name: 'Quantità attuali e previste' });
  await expect(tabella).toBeVisible();
  await expect(tabella.locator('tbody tr.data-table__row')).toHaveCount(2);
  await expect(tabella.getByRole('columnheader', { name: /Prevista/ })).toBeVisible();
  await pannello.screenshot({ path: `${SCATTI}/03-controllo.png` });

  await page.getByRole('button', { name: 'Conferma e avvia il trasferimento' }).click();

  // ── 4 · trasferito: i casi irrisolti stanno APERTI davanti al pulsante ────
  await expect(page.getByText('Trasferito, da attivare')).toBeVisible();
  const avviso = pannello.getByRole('status');
  await expect(avviso).toContainText('2 casi restano esclusi');
  await expect(avviso).toContainText('Cintura pelle — stesso SKU dalle due parti');
  await expect(avviso).toContainText('#5002 — sede non collegata');
  // Prima dell'attivazione i problemi non ci sono: il percorso È la situazione.
  await expect(page.getByRole('heading', { name: /Problemi aperti/ })).toHaveCount(0);
  await expect(pannello.getByText(/pront[oa]/i)).toHaveCount(0);
  await pannello.screenshot({ path: `${SCATTI}/04-trasferito-irrisolti.png` });

  await page.getByRole('button', { name: 'Attiva la sincronizzazione' }).click();

  // (lo scorrimento è di `.shell__content`: `fullPage` si ferma alla finestra, si fotografa il pannello)
  // ── 5 · attivato: si apre la sincronizzazione automatica; la prima connessione resta
  //        CONSULTABILE nelle tre fasi (comandi spenti, con il motivo); i problemi nella
  //        loro scheda; le scelte sulle sedi in Connessione e sedi (13/09/2026) ──
  await expect(page).toHaveURL(/\/shopify\/sincronizzazione/);
  await expect(schede.getByRole('link', { name: 'Prima connessione conclusa' })).toBeVisible();
  await expect(schede.getByRole('link', { name: 'Problemi ed esiti 2' })).toBeVisible();

  await schede.getByRole('link', { name: 'Problemi ed esiti 2' }).click();
  const situazione = page.getByRole('region', { name: /Problemi aperti/ });
  await expect(situazione.locator('.problemi__gruppi').getByRole('term')).toHaveCount(2);
  await expect(situazione.getByRole('link', { name: '#5002' }).first()).toHaveAttribute(
    'href',
    '/app/sales/o-5002',
  );
  await situazione.screenshot({ path: `${SCATTI}/05-attivata-problemi.png` });

  await schede.getByRole('link', { name: 'Prima connessione conclusa' }).click();
  await expect(pannello.getByText(/conclusa il/)).toBeVisible();
  // ⭐ A percorso concluso la scelta si legge nel titolo, senza pulsanti; la spiegazione
  //    della sola direzione scelta è un dettaglio richiudibile (13/09/2026).
  await expect(pannello.getByRole('heading', { name: /1 Scelte iniziali/ })).toContainText(
    'Shopify → VestiFlow',
  );
  await expect(pannello.getByRole('button', { name: 'Shopify → VestiFlow' })).toHaveCount(0);
  await expect(pannello.getByText(/Che cosa ha fatto «Shopify → VestiFlow»/)).toBeVisible();
  await expect(pannello.getByText(/Pubblica gli articoli del gestionale/)).toHaveCount(0);
  await expect(pannello.getByRole('button', { name: 'Attiva la sincronizzazione' })).toBeDisabled();
  await expect(pannello.getByText(/già attivata il/)).toBeVisible();
  // Gli esclusi di allora non si ripetono come elenco.
  await expect(pannello.getByText(/casi sono rimasti esclusi/)).toHaveCount(0);
  await expect(pannello.locator('details.setup__storico')).toHaveCount(0);
  await pannello.screenshot({ path: `${SCATTI}/05-attivata.png` });

  await schede.getByRole('link', { name: 'Connessione e sedi' }).click();
  await expect(page.getByRole('button', { name: /Scelta per la location/ })).toHaveCount(2);
  await schede.getByRole('link', { name: 'Operazioni manuali' }).click();
  await expect(page.getByRole('button', { name: 'Allinea giacenze su Shopify' })).toBeVisible();
});

test('sul telefono le tre fasi restano leggibili e la scelta si fa toccando', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await instradaPercorso(page);
  await apriImpostazioni(page, [], '/app/settings/shopify');
  await expect(page.getByText('demo.myshopify.com').first()).toBeVisible({ timeout: 45_000 });

  await page.getByRole('button', { name: 'Shopify → VestiFlow' }).click();
  await page.getByRole('button', { name: /Scelta per la location Negozio centro/ }).click();
  await page.getByRole('option', { name: 'Crea la sede «Negozio centro»' }).click();
  await expect(
    page.getByRole('button', { name: /Scelta per la location Negozio centro/ }),
  ).toContainText(/Crea la sede/);
  // Nessuno scorrimento orizzontale: la pagina non deve sbordare.
  const larghezze = await page.evaluate(() => ({
    documento: document.documentElement.scrollWidth,
    finestra: window.innerWidth,
  }));
  expect(larghezze.documento).toBeLessThanOrEqual(larghezze.finestra);
  await page
    .getByRole('region', { name: 'Prima connessione' })
    .screenshot({ path: `${SCATTI}/06-telefono.png` });
});
