import type { Page, Route } from '@playwright/test';

/**
 * Le fixture della pagina IMPOSTAZIONI, condivise dalle prove isolate che la
 * aprono (pannello Shopify, Sedi). Nella forma esatta delle risposte dell'API.
 */

export const CONNESSIONE = {
  id: 'conn-1',
  tenantId: 'tenant-1',
  status: 'connected',
  shopDomain: 'demo.myshopify.com',
  scopes: ['read_products', 'write_products', 'write_inventory'],
  autoSyncEnabled: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export const AZIENDA = {
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

export const IMPOSTAZIONI_FUNZIONI = {
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

/**
 * Apre Impostazioni con le sedi date; ogni altra chiamata non dichiarata risponde 404.
 * `connessione` sostituisce la connessione di serie (per provare stati diversi).
 */
export async function apriImpostazioni(
  page: Page,
  sedi: readonly object[] = [],
  pagina = '/app/settings',
  connessione: object = CONNESSIONE,
): Promise<void> {
  for (const [rotta, corpo] of [
    ['**/api/v1/shopify/connection', connessione],
    ['**/api/v1/tenant/company', AZIENDA],
    ['**/api/v1/tenant/feature-settings', IMPOSTAZIONI_FUNZIONI],
    ['**/api/v1/inventory/locations', sedi],
    ['**/api/v1/unit-of-measure-options', []],
    ['**/api/v1/vat-codes', []],
  ] as const) {
    await page.route(rotta, (route: Route) =>
      route.fulfill({ status: 200, json: corpo as object }),
    );
  }
  await page.goto(pagina);
}
