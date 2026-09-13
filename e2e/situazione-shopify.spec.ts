import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { apriImpostazioni, CONNESSIONE } from './helpers/impostazioni-fixtures';
import { test } from './helpers/isolated-test';

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

const AMBITO_FO = 'read_merchant_managed_fulfillment_orders';

const CONNESSIONE_ATTIVA = {
  ...CONNESSIONE,
  autoSyncEnabled: true,
  scopes: ['read_products', 'write_products', 'write_inventory', 'read_orders'],
  scopeDiagnostics: {
    requested: ['read_products', 'write_products', 'write_inventory', 'read_orders', AMBITO_FO],
    granted: ['read_products', 'write_products', 'write_inventory', 'read_orders'],
    missingFromGrant: [AMBITO_FO],
    missingForCatalogImport: [],
    catalogImportBlockedReason: 'none',
    missingForPublications: [],
    publicationsBlockedReason: 'none',
  },
  webhookTopicsKnown: true,
  webhookTopics: [
    'inventory_levels/update',
    'orders/create',
    'orders/updated',
    'orders/cancelled',
    'customers/create',
    'customers/update',
    'products/create',
    'products/update',
  ],
  webhookMissingTopics: ['fulfillment_orders/moved', 'fulfillment_orders/order_routing_complete'],
  webhookAddressMatchesConfigured: true,
  webhookAddressComparable: true,
  webhookAddress: 'https://tunnel.example/api/v1/shopify/webhooks',
  webhooksCheckedAt: '2026-09-13T01:20:00.000Z',
  lastWebhookEventAt: '2026-09-13T01:10:00.000Z',
};

function problemiDelCollaudo() {
  const azioneAllinea = {
    tipo: 'allinea',
    etichetta:
      '«Allinea giacenze su Shopify» dopo aver risolto gli ordini senza sede: finché ci sono, rifiuta',
    riferimento: null,
  };
  return [
    {
      tipo: 'connessione',
      causa: 'connessione_ambiti_mancanti',
      riferimento: 'ambiti',
      nome: AMBITO_FO,
      dettaglio: null,
      sede: null,
      conseguenza:
        'Senza il permesso di leggere i fulfillment order la sede degli ordini online non si determina: nessun impegno, quantità ferme.',
      azione: {
        tipo: 'permessi',
        etichetta:
          'Disconnetti e Connetti Shopify: la nuova autorizzazione chiede i permessi mancanti',
        riferimento: null,
      },
      apri: null,
      rilevatoAt: null,
    },
    {
      tipo: 'connessione',
      causa: 'connessione_webhook_mancanti',
      riferimento: 'webhook',
      nome: 'fulfillment_orders/moved, fulfillment_orders/order_routing_complete',
      dettaglio: null,
      sede: null,
      conseguenza:
        'Gli eventi di questi tipi non arrivano: ciò che cambia su Shopify per quella via si vede solo con un import manuale.',
      azione: { tipo: 'webhook', etichetta: 'Registra le notifiche mancanti', riferimento: null },
      apri: null,
      rilevatoAt: null,
    },
    ...['#1010', '#1011'].map((nome, i) => ({
      tipo: 'ordine',
      causa: 'ordine_permesso_fulfillment_orders',
      riferimento: `ordine-${i}`,
      nome,
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
      apri: { tipo: 'apri_ordine', etichetta: 'Apri l’ordine', riferimento: `ordine-${i}` },
      rilevatoAt: '2026-09-13T01:49:00.000Z',
    })),
    ...Array.from({ length: 75 }, (_, i) => ({
      tipo: 'coppia',
      causa: 'coppia_lettura_fallita',
      riferimento: `v${i}:sede-b`,
      nome: `Articolo ${String(i + 1).padStart(2, '0')} (SKU-${i + 1})`,
      dettaglio: i % 3 === 0 ? 'M' : i % 3 === 1 ? 'L' : 'XL',
      sede: 'Sede B (rientro resi)',
      conseguenza:
        'Base non stabilita: la lettura del canale è fallita (ultimo tentativo: 2026-09-13 01:14). La quantità di questa coppia non parte finché la base manca.',
      azione: azioneAllinea,
      apri: { tipo: 'apri_articolo', etichetta: 'Apri l’articolo', riferimento: `p${i}` },
      rilevatoAt: '2026-09-13T01:14:00.000Z',
    })),
    ...Array.from({ length: 7 }, (_, i) => ({
      tipo: 'coppia',
      causa: 'coppia_non_stoccata',
      riferimento: `w${i}:sede-b`,
      nome: `Accessorio ${i + 1} (ACC-${i + 1})`,
      dettaglio: null,
      sede: 'Sede B (rientro resi)',
      conseguenza:
        'Su Shopify l’articolo non è stoccato in questa location (ultimo tentativo: 2026-09-13 01:14): nessuna quantità da leggere o scrivere, la giacenza VestiFlow resta com’è.',
      azione: {
        tipo: 'shopify',
        etichetta:
          'Su Shopify: stocca l’articolo nella location, se deve vendersi da questa sede; poi «Allinea giacenze» qui',
        riferimento: null,
      },
      apri: { tipo: 'apri_articolo', etichetta: 'Apri l’articolo', riferimento: `q${i}` },
      rilevatoAt: '2026-09-13T01:14:00.000Z',
    })),
    {
      tipo: 'articolo',
      causa: 'articolo_sku_ambiguo',
      riferimento: 'p-cintura',
      nome: 'Cintura pelle',
      dettaglio: null,
      sede: null,
      conseguenza:
        'Lo stesso SKU esiste dalle due parti senza collegamento: l’articolo non è sincronizzato.',
      azione: {
        tipo: 'apri_articolo',
        etichetta: 'Apri l’articolo e collega la variante Shopify giusta',
        riferimento: 'p-cintura',
      },
      apri: { tipo: 'apri_articolo', etichetta: 'Apri l’articolo', riferimento: 'p-cintura' },
      rilevatoAt: null,
    },
  ];
}

/** Il percorso CONCLUSO, con l'esito di allora e la situazione di oggi. */
function percorsoAttivato() {
  return {
    presente: true,
    status: 'attivato',
    direction: 'shopify_to_vestiflow',
    locations: [
      {
        shopifyLocationId: '11',
        name: 'Shop location',
        active: true,
        choice: 'collega',
        locationId: 'loc-b',
        locationName: 'Sede B (rientro resi)',
      },
      {
        shopifyLocationId: '22',
        name: 'Magazzino test 3',
        active: true,
        choice: 'lascia',
        locationId: null,
        locationName: null,
      },
    ],
    sediVestiFlow: [
      { id: 'loc-a', name: 'Sede A (spedizione)', code: 'S1', shopifyLocationId: null },
      { id: 'loc-b', name: 'Sede B (rientro resi)', code: 'S2', shopifyLocationId: '11' },
    ],
    anteprima: {
      computedAt: '2026-09-13T00:55:00.000Z',
      direction: 'shopify_to_vestiflow',
      catalogo: {
        remoti: 56,
        locali: 1,
        collegati: 1,
        daImportare: 55,
        daAggiornare: 0,
        daPubblicare: 0,
        ambigui: [],
      },
      sedi: {
        collegate: [
          {
            locationId: 'loc-b',
            nome: 'Sede B (rientro resi)',
            shopifyLocationId: '11',
            shopifyName: 'Shop location',
          },
        ],
        lasciate: [{ shopifyLocationId: '22', shopifyName: 'Magazzino test 3' }],
        daDecidere: [],
      },
      quantita: {
        coppie: 82,
        righe: [],
        righeTotali: 25,
        nonDeterminabili: [],
        articoliNuovi: 55,
      },
      ordini: {
        aperti: 4,
        parziali: 0,
        senzaSede: 2,
        giaInVestiFlow: 0,
        elenco: [],
      },
      blocchi: [],
    },
    esito: {
      fase: 'concluso',
      startedAt: '2026-09-13T00:58:00.000Z',
      finishedAt: '2026-09-13T00:59:03.000Z',
      interruzione: null,
      catalogo: { imported: 55, updated: 0, skipped: 0, failed: 0, esclusiAmbigui: 1 },
      quantita: { coppie: 82, scritte: 25, invariate: 50, giaScritte: 0, nonDeterminabili: 7 },
      allinea: null,
      esclusi: [],
      attivazione: {
        ordini: { totale: 4, acquisiti: 4, giaPresenti: 0, senzaSede: 2, parziali: 0, falliti: 0 },
        base: {
          totale: 0,
          allineate: 0,
          giaAllineate: 0,
          nonAllineate: 0,
          fermo: {
            motivo:
              'Quantità ferma verso Shopify: gli ordini #1010, #1011 sono aperti senza una sede determinabile.',
            ordini: ['#1010', '#1011'],
          },
        },
        ordersSinceId: '1011',
      },
    },
    confirmedAt: '2026-09-13T00:58:00.000Z',
    activatedAt: '2026-09-13T01:14:00.000Z',
    blocchiAttivazione: [],
    irrisolti: [],
    trasferimentoInCorso: false,
    situazione: { calcolataAt: '2026-09-13T03:40:00.000Z', problemi: problemiDelCollaudo() },
  };
}

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
const CONNESSIONE_SANA = {
  ...CONNESSIONE_ATTIVA,
  scopes: [...CONNESSIONE_ATTIVA.scopes, AMBITO_FO],
  scopeDiagnostics: {
    ...CONNESSIONE_ATTIVA.scopeDiagnostics,
    granted: CONNESSIONE_ATTIVA.scopeDiagnostics.requested,
    missingFromGrant: [],
  },
  webhookTopics: [
    ...CONNESSIONE_ATTIVA.webhookTopics,
    'fulfillment_orders/moved',
    'fulfillment_orders/order_routing_complete',
  ],
  webhookMissingTopics: [],
};

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
  const larghezze = await page.evaluate(() => ({
    documento: document.documentElement.scrollWidth,
    finestra: window.innerWidth,
  }));
  expect(larghezze.documento).toBeLessThanOrEqual(larghezze.finestra);
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
  await expect(ordini).toContainText('fulfillment_orders/moved');
  const quantita = flussi.getByRole('listitem').filter({ hasText: 'Quantità' });
  await expect(quantita).toContainText('limitato');
  await expect(flussi.getByRole('listitem').filter({ hasText: 'Clienti' })).toContainText('attivo');
  await expect(page.getByText('Notifiche dal negozio')).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/01-sincronizzazione-desktop.png` });
  // Le notifiche sono un approfondimento: chiuso, si apre.
  await page.getByText('Notifiche dal negozio').click();
  await expect(page.getByText('Ultimo evento ricevuto')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verifica ora' })).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/02-notifiche-aperte-desktop.png` });

  // ── Problemi ed esiti: cause con effetto e azione, niente nomi troncati, tono per «da valutare» ──
  await nav.getByRole('link', { name: 'Problemi ed esiti 87' }).click();
  await expect(page).toHaveURL(/\/shopify\/problemi/);
  const problemi = page.getByRole('region', { name: /Problemi aperti/ });
  const cause = problemi.locator('.problemi__gruppi').getByRole('term');
  await expect(cause).toHaveCount(6);
  await expect(cause.nth(3)).toContainText('75');
  await expect(cause.nth(3)).not.toContainText('Articolo 01');
  await expect(problemi.getByText('Effetto')).toHaveCount(6);
  await expect(problemi.locator('.problemi__gruppo--valutare')).toHaveCount(1);
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
  await expect(operazioni.getByText('Su tutto il catalogo del negozio.')).toBeVisible();
  await expect(
    operazioni.getByRole('listitem', { name: 'Allinea giacenze su Shopify' }),
  ).toContainText('fermo');
  await page.screenshot({ path: `${SCATTI}/04-operazioni-desktop.png` });

  // ── Connessione e sedi: negozio, accesso, sedi con «Su Shopify» e «Sede VestiFlow», disconnessione ──
  await nav.getByRole('link', { name: 'Connessione e sedi' }).click();
  await expect(page.getByRole('heading', { name: 'Negozio', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Su Shopify' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Sede VestiFlow' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Disconnessione e cambio negozio' }),
  ).toBeVisible();
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
  await expect(percorso.getByRole('button', { name: 'Attiva la sincronizzazione' })).toBeDisabled();
  await expect(percorso.getByText(/già attivata il/)).toBeVisible();
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
  await expect(problemi.getByRole('table')).toHaveCount(0);
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
  await expect(problemi.locator('.problemi__gruppi').getByRole('term')).toHaveCount(6);
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
  const setup = percorsoAttivato();
  const problemi = setup.situazione.problemi.map((p, indice) =>
    indice === 4 ? { ...p, nome: lungo } : p,
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
