import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { IMPOSTAZIONI_FUNZIONI } from './helpers/impostazioni-fixtures';
import { test } from './helpers/isolated-test';

/**
 * Nata come PROVA DI MISURA (11/09/2026 sera) e diventata guardia la stessa sera:
 * come la scheda articolo presenta Prezzi e Listini quando le due richieste che
 * le governano (`/vat-codes`, `/tenant/feature-settings`) rispondono e quando NON
 * rispondono (API giù: connessione rifiutata), e la regola Netti/Ivati decisa dal
 * proprietario: selettore sempre visibile, importo ivato in attesa senza aliquota.
 *
 * La configurazione è quella del tenant «Test Amato Luigi» letta in sola
 * lettura sul condiviso: due listini attivi con nome, Codice IVA predefinito
 * 22%, convenzione «ivati».
 */

const IVA_22 = 'iva-22';

const CODICI_IVA = [
  {
    id: IVA_22,
    code: '22',
    natureId: 'nat-imponibile',
    nature: {
      id: 'nat-imponibile',
      key: 'imponibile',
      officialCode: null,
      label: 'Imponibile',
      description: null,
      defaultUsageScope: 'both',
      defaultCalculationMode: 'standard',
      sortOrder: 1,
    },
    ratePercent: 22,
    nonDeductiblePercent: 0,
    description: 'Imponibile 22%',
    notes: null,
    usageScope: 'both',
    calculationMode: 'standard',
    vatAffectsSupplierTotal: true,
    isDefault: true,
    isActive: true,
    isSystem: true,
    sortOrder: 1,
  },
];

const IMPOSTAZIONI_TEST_AMATO_LUIGI = {
  ...IMPOSTAZIONI_FUNZIONI,
  salesPricesIncludeVat: true,
  defaultVatCodeId: IVA_22,
  listino1Name: 'Listino test 1',
  listino1Active: true,
  listino2Name: 'Listino test 2',
  listino2Active: true,
};

async function apriNuovoArticolo(page: Page): Promise<void> {
  await page.goto('/app/products/new');
  await expect(page.locator('h1.product-form__title')).toHaveText('Anagrafica prodotto', {
    timeout: 30_000,
  });
  await expect(page.locator('#product-name')).toBeVisible();
}

function sezione(page: Page, titolo: 'Prezzi di vendita' | 'Listini') {
  return page.locator('section.general-step__pricing', {
    has: page.locator('h2.general-step__pricing-title', { hasText: titolo }),
  });
}

test.describe('Scheda articolo · prezzi e listini secondo le risposte dell’API', () => {
  test('API che risponde: selettore Netti/Ivati e due listini', async ({ page }) => {
    await page.route('**/api/v1/vat-codes', (route: Route) => route.fulfill({ json: CODICI_IVA }));
    await page.route('**/api/v1/tenant/feature-settings', (route: Route) =>
      route.fulfill({ json: IMPOSTAZIONI_TEST_AMATO_LUIGI }),
    );
    await page.route('**/api/v1/products/price-mode-preference', (route: Route) =>
      route.fulfill({ json: { pricesIncludeVat: true } }),
    );
    await apriNuovoArticolo(page);

    const prezzi = sezione(page, 'Prezzi di vendita');
    await expect(prezzi.locator('app-segmented')).toBeVisible();
    await expect(prezzi.getByRole('button', { name: 'Ivati' })).toBeVisible();
    await expect(prezzi.locator('.general-step__pricing-note')).toHaveCount(0);

    const listini = sezione(page, 'Listini');
    await expect(listini.locator('label')).toHaveText(['Listino test 1', 'Listino test 2']);
    await expect(listini.locator('input')).toHaveCount(2);
  });

  test('API che NON risponde: l’errore si vede, «Riprova» esiste, e niente si presenta come «non configurato»', async ({
    page,
  }) => {
    // Connessione rifiutata: è ciò che il browser vede con l'API locale spenta.
    for (const rotta of [
      '**/api/v1/vat-codes',
      '**/api/v1/tenant/feature-settings',
      '**/api/v1/products/price-mode-preference',
    ]) {
      await page.route(rotta, (route: Route) => route.abort('connectionrefused'));
    }
    await apriNuovoArticolo(page);

    const prezzi = sezione(page, 'Prezzi di vendita');
    // Il selettore c’è comunque: la presenza dell’aliquota non lo governa.
    await expect(prezzi.locator('app-segmented')).toBeVisible();

    const listini = sezione(page, 'Listini');
    await expect(listini).toBeVisible();
    await expect(listini.locator('input')).toHaveCount(0);

    // ⭐ Qui c’era «nessun banner né testo d’errore» — il difetto misurato quella sera.
    const banner = page.locator('app-inline-banner');
    await expect(banner).toContainText('Codici IVA e impostazioni aziendali non caricati');
    await expect(banner.getByRole('button', { name: 'Riprova' })).toBeVisible();
    await expect(page.locator('#product-vat')).toBeDisabled();
  });

  test('Ivati senza Codice IVA: il prezzo si digita, resta in attesa, e al Codice IVA scelto resta 100', async ({
    page,
  }) => {
    await page.route('**/api/v1/vat-codes', (route: Route) => route.fulfill({ json: CODICI_IVA }));
    await page.route('**/api/v1/tenant/feature-settings', (route: Route) =>
      route.fulfill({ json: { ...IMPOSTAZIONI_TEST_AMATO_LUIGI, defaultVatCodeId: null } }),
    );
    await page.route('**/api/v1/products/price-mode-preference', (route: Route) =>
      route.fulfill({ json: { pricesIncludeVat: true } }),
    );
    await apriNuovoArticolo(page);

    const prezzo = page.locator('#product-selling-price');
    await prezzo.fill('100');
    await expect(
      page.getByText('Scegli il Codice IVA per salvare il prezzo').first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crea prodotto' })).toBeDisabled();

    // Si sceglie il 22%: l’ivato digitato resta fermo, la frase sparisce.
    const codiceIva = page.locator('#product-vat');
    await codiceIva.click();
    await codiceIva.fill('22');
    await codiceIva.press('Enter');
    await expect(page.getByText('Scegli il Codice IVA per salvare il prezzo')).toHaveCount(0);
    await expect(prezzo).toHaveValue('100');

    // E ai netti si legge lo scorporo, a due decimali.
    await page.getByRole('button', { name: 'Netti' }).click();
    await expect(prezzo).toHaveValue('81.97');
  });

  test('senza Codice IVA (né articolo né azienda) con API sana: il selettore c’è, e la testata avvisa', async ({
    page,
  }) => {
    await page.route('**/api/v1/vat-codes', (route: Route) => route.fulfill({ json: CODICI_IVA }));
    await page.route('**/api/v1/tenant/feature-settings', (route: Route) =>
      route.fulfill({ json: { ...IMPOSTAZIONI_TEST_AMATO_LUIGI, defaultVatCodeId: null } }),
    );
    await page.route('**/api/v1/products/price-mode-preference', (route: Route) =>
      route.fulfill({ json: { pricesIncludeVat: true } }),
    );
    await apriNuovoArticolo(page);

    const prezzi = sezione(page, 'Prezzi di vendita');
    await expect(prezzi.locator('app-segmented')).toBeVisible();
    await expect(prezzi.locator('.general-step__pricing-note')).toContainText(
      'Senza Codice IVA i prezzi salvati si leggono al netto.',
    );
    // I listini invece ci sono: la loro sezione dipende solo dalle impostazioni.
    await expect(sezione(page, 'Listini').locator('input')).toHaveCount(2);
  });
});

const ARTICOLO_ESISTENTE = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: 'ten-1',
  articleCode: 'ART-001',
  name: 'Maglia cotone',
  description: '',
  status: 'active',
  unitOfMeasure: 'pz',
  defaultVatCodeId: IVA_22,
  // Netto con coda decimale (100,00 ivati al 22%, alla precisione memorizzabile:
  // 4 cifre di centesimo), listini valorizzati.
  sellingPriceMinor: '8196.7213',
  shopifyPriceMinor: '8196.7213',
  listino1PriceMinor: '1000',
  listino2PriceMinor: '2049.1803',
  listino3PriceMinor: null,
  compareAtPriceMinor: null,
  purchasePriceMinor: null,
  inventoryTracking: 'product',
  managesStock: true,
  kind: 'article',
  shopifySyncEnabled: false,
  options: [],
  variants: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      productId: '11111111-1111-4111-8111-111111111111',
      sku: 'ART-001',
      optionValues: [],
      currency: 'EUR',
      sellingPriceMinor: '8196.7213',
      shopifyPriceMinor: '8196.7213',
      lifecycleStatus: 'active',
    },
  ],
};

test.describe('Scheda articolo esistente · salvataggio con caricamenti falliti', () => {
  test('cambiando solo il nome, listini e Codice IVA tornano al server identici', async ({
    page,
  }) => {
    for (const rotta of [
      '**/api/v1/vat-codes',
      '**/api/v1/tenant/feature-settings',
      '**/api/v1/products/price-mode-preference',
    ]) {
      await page.route(rotta, (route: Route) => route.abort('connectionrefused'));
    }
    const inviati: Record<string, unknown>[] = [];
    await page.route(`**/api/v1/products/${ARTICOLO_ESISTENTE.id}`, (route: Route) => {
      if (route.request().method() === 'PATCH') {
        inviati.push(route.request().postDataJSON() as Record<string, unknown>);
        return route.fulfill({ json: { ...ARTICOLO_ESISTENTE, name: 'Maglia cotone bio' } });
      }
      return route.fulfill({ json: ARTICOLO_ESISTENTE });
    });

    await page.goto(`/app/products/${ARTICOLO_ESISTENTE.id}/edit`);
    await expect(page.locator('#product-name')).toHaveValue('Maglia cotone', { timeout: 30_000 });

    // Lo stato a schermo: l’errore è detto, listini assenti, IVA non toccabile — ma i valori esistono.
    await expect(page.locator('app-inline-banner')).toContainText('non caricati');
    await expect(sezione(page, 'Listini').locator('input')).toHaveCount(0);
    await expect(page.locator('#product-selling-price')).toHaveValue('81.97');

    await page.locator('#product-name').fill('Maglia cotone bio');
    await page.getByRole('button', { name: 'Salva modifiche' }).click();
    await expect.poll(() => inviati.length, { timeout: 15_000 }).toBe(1);

    const payload = inviati[0]!;
    expect(payload['name']).toBe('Maglia cotone bio');
    expect(payload['defaultVatCodeId']).toBe(IVA_22);
    expect(payload['sellingPrice']).toEqual({ amountMinor: 8196.7213, currency: 'EUR' });
    expect(payload['listino1Price']).toEqual({ amountMinor: 1000, currency: 'EUR' });
    expect(payload['listino2Price']).toEqual({ amountMinor: 2049.1803, currency: 'EUR' });
    expect(payload['listino3Price']).toBeNull();
  });
});

test.describe('Scheda articolo esistente · caso MISTO fino al salvataggio', () => {
  test('netto salvato e ivato in attesa: alla scelta dell’IVA il PATCH porta il netto di prima e il nuovo netto scorporato', async ({
    page,
  }) => {
    await page.route('**/api/v1/vat-codes', (route: Route) => route.fulfill({ json: CODICI_IVA }));
    // Nessun predefinito aziendale, e l’articolo non ha Codice IVA: aliquota IGNOTA.
    await page.route('**/api/v1/tenant/feature-settings', (route: Route) =>
      route.fulfill({ json: { ...IMPOSTAZIONI_TEST_AMATO_LUIGI, defaultVatCodeId: null } }),
    );
    await page.route('**/api/v1/products/price-mode-preference', (route: Route) =>
      route.fulfill({ json: { pricesIncludeVat: true } }),
    );
    const articolo = { ...ARTICOLO_ESISTENTE, defaultVatCodeId: null };
    const inviati: Record<string, unknown>[] = [];
    await page.route(`**/api/v1/products/${articolo.id}`, (route: Route) => {
      if (route.request().method() === 'PATCH') {
        inviati.push(route.request().postDataJSON() as Record<string, unknown>);
        return route.fulfill({ json: articolo });
      }
      return route.fulfill({ json: articolo });
    });

    await page.goto(`/app/products/${articolo.id}/edit`);
    const prezzo = page.locator('#product-selling-price');
    await expect(prezzo).toHaveValue('81.97', { timeout: 30_000 });

    // I netti salvati si dichiarano campo per campo: prezzo, prezzo Shopify (il tenant finto ha il canale), due listini.
    await expect(
      page.getByText('Importo netto salvato: senza Codice IVA non si converte'),
    ).toHaveCount(4);

    // Si ridigita SOLO il primo listino, come ivato.
    const listino1 = page.locator('#product-listino-1-price');
    await listino1.fill('61');
    await expect(page.getByText('Scegli il Codice IVA per salvare il prezzo')).toHaveCount(1);
    await expect(
      page.getByText('Importo netto salvato: senza Codice IVA non si converte'),
    ).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Salva modifiche' })).toBeDisabled();

    // Si sceglie il 22%: 81,97 si legge 100,00 ivati; 61 resta 61.
    const codiceIva = page.locator('#product-vat');
    await codiceIva.click();
    await codiceIva.fill('22');
    await codiceIva.press('Enter');
    await expect(page.getByText('Scegli il Codice IVA per salvare il prezzo')).toHaveCount(0);
    await expect(prezzo).toHaveValue('100');
    await expect(listino1).toHaveValue('61');
    await expect(page.getByRole('button', { name: 'Salva modifiche' })).toBeEnabled();

    await page.getByRole('button', { name: 'Salva modifiche' }).click();
    await expect.poll(() => inviati.length, { timeout: 15_000 }).toBe(1);
    const payload = inviati[0]!;
    expect(payload['defaultVatCodeId']).toBe(IVA_22);
    // Non modificati: il loro netto, identico.
    expect(payload['sellingPrice']).toEqual({ amountMinor: 8196.7213, currency: 'EUR' });
    expect(payload['listino2Price']).toEqual({ amountMinor: 2049.1803, currency: 'EUR' });
    // Digitato in attesa: il suo ivato, scorporato una volta sola (61 al 22% = 50 netti).
    expect(payload['listino1Price']).toEqual({ amountMinor: 5000, currency: 'EUR' });
  });
});
