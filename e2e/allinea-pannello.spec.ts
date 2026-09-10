import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

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

const IMPOSTAZIONI = '/app/settings';
const SCATTI = 'test-results/allinea';

const CONNESSIONE = {
  id: 'conn-1',
  tenantId: 'tenant-1',
  status: 'connected',
  shopDomain: 'demo.myshopify.com',
  scopes: ['read_products', 'write_products', 'write_inventory'],
  autoSyncEnabled: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const AZIENDA = {
  name: 'Negozio di prova',
  channelProfile: 'shopify',
  storeName: 'Negozio di prova',
  licensedLocationCount: 1,
  licensedLocationActiveCount: 1,
  locationSelectionLocked: false,
  locationSelectionChangeGranted: false,
  canChangeLicensedLocations: true,
  profile: {
    legalName: 'Negozio di prova Srl',
    vatNumber: null,
    fiscalCode: null,
    phone: null,
    pec: null,
    sdiCode: null,
    iban: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    province: null,
    postalCode: null,
    countryCode: 'IT',
  },
};

const IMPOSTAZIONI_FUNZIONI = {
  lotsEnabled: false,
  serialsEnabled: false,
  variantsEnabled: true,
  barcodeScannerEnabled: false,
  supplierOrdersEnabled: true,
  goodsReceiptEnabled: true,
  warehouseValuationEnabled: false,
  allowNegativeInventory: false,
  warnNegativeInventory: true,
  blockNegativeInventory: false,
  manualUnloadEnabled: false,
  salesPricesIncludeVat: true,
  defaultVatCodeId: null,
  listino1Name: null,
  listino1Active: false,
  listino2Name: null,
  listino2Active: false,
  listino3Name: null,
  listino3Active: false,
};

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

async function apriPannello(page: Page): Promise<void> {
  for (const [rotta, corpo] of [
    ['**/api/v1/shopify/connection', CONNESSIONE],
    ['**/api/v1/tenant/company', AZIENDA],
    ['**/api/v1/tenant/feature-settings', IMPOSTAZIONI_FUNZIONI],
    ['**/api/v1/inventory/locations', []],
    ['**/api/v1/unit-of-measure-options', []],
    ['**/api/v1/vat-codes', []],
  ] as const) {
    await page.route(rotta, (route: Route) =>
      route.fulfill({ status: 200, json: corpo as object }),
    );
  }
  await page.goto(IMPOSTAZIONI);
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

  // ── 5 · l'elenco è PAGINATO e non perde righe ───────────────────────────
  await expect(page.getByText('Maglia cotone 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Maglia cotone 20', { exact: true })).toBeVisible();
  await expect(page.getByText('Maglia cotone 21', { exact: true })).toBeHidden();
  await expect(page.getByText(/Pagina 1 di 2/)).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/03-elenco-pagina-1.png` });

  await page.getByRole('button', { name: /Successiva/i }).click();
  await expect(page.getByText('Maglia cotone 21', { exact: true })).toBeVisible();
  await expect(page.getByText('Maglia cotone 25', { exact: true })).toBeVisible();
  await expect(page.getByText('Maglia cotone 1', { exact: true })).toBeHidden();
  await expect(page.getByText(/Pagina 2 di 2/)).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/04-elenco-pagina-2.png` });
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
  await expect(page.getByText('Maglia cotone 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Maglia cotone 3', { exact: true })).toBeVisible();
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
  await expect(page.getByText('Maglia cotone 1', { exact: true })).toBeVisible({ timeout: 20_000 });

  await expect(comando).toBeEnabled();
  await comando.click();

  // ⭐ **L'elenco di prima NON sopravvive**: è un controllo nuovo.
  await expect(page.getByText('Maglia cotone 1', { exact: true })).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(/Controllo completato/)).toBeVisible();

  // ⛔ **E la seconda pressione riparte SENZA cursore.**
  expect(richieste).toHaveLength(2);
  expect(richieste[0]?.corpo).toEqual({ prossimo: null });
  expect(richieste[1]?.corpo).toEqual({ prossimo: null });
  await page.screenshot({ path: `${SCATTI}/06-nuovo-clic.png` });
});
