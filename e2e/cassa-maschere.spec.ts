import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

import { test } from './helpers/isolated-test';

/**
 * Le due MASCHERE della Cassa con righe compilabili (`docs/26` A17 · A18): il
 * carrello della Vendita e gli articoli del Reso al banco. Non sono elenchi
 * del motore — la quantità si compila sulla riga — ma vestono con la
 * grammatica condivisa delle righe documento, e sotto `lg` diventano card con
 * l'etichetta di colonna per cella. Intercettazioni come in `cassa.spec.ts`.
 */

const SCATTI = 'test-results/cassa-maschere';

const SEDE = { id: 'loc-1', name: 'Negozio di prova' };

const SESSIONE_APERTA = {
  id: 'sess-1',
  tenantId: 'ten-1',
  locationId: SEDE.id,
  status: 'open',
  openedAt: '2026-09-04T08:00:00.000Z',
  openedById: 'u-1',
  openedByName: 'Cassiere',
  openingFloatMinor: 5000,
  closedAt: null,
  closedByName: null,
  fiscalDeviceId: null,
  notes: null,
  countedCashMinor: null,
  declaredElectronicMinor: null,
  expectedCashMinor: null,
  expectedElectronicMinor: null,
};

const ARTICOLI = [
  {
    variantId: 'v-1',
    sku: 'MAG-M',
    barcode: null,
    productName: 'Maglia in cotone',
    optionSummary: 'M · Bianco',
    sellingPriceMinor: 2_500,
    currency: 'EUR',
    vatRatePercent: 22,
    vatCodeId: null,
    vatCodeLabel: '22',
    onHand: 5,
    committed: 0,
    available: 5,
  },
  {
    variantId: 'v-2',
    sku: 'MAG-L',
    barcode: null,
    productName: 'Maglia in cotone',
    optionSummary: 'L · Bianco',
    sellingPriceMinor: 2_500,
    currency: 'EUR',
    vatRatePercent: 22,
    vatCodeId: null,
    vatCodeLabel: '22',
    onHand: 2,
    committed: 0,
    available: 2,
  },
];

const OPERAZIONE = {
  id: 'doc-1',
  kind: 'sale',
  reference: 'CS/2026/1',
  documentDate: '2026-09-04T00:00:00.000Z',
  createdAt: '2026-09-04T10:00:00.000Z',
  status: 'confirmed',
  locationId: SEDE.id,
  locationName: SEDE.name,
  operatorId: 'u-1',
  operatorName: 'Cassiere',
  sessionId: 'sess-1',
  customerName: null,
  totalMinor: 6_100,
  payments: [],
  mixed: false,
  changeMinor: 0,
  sourceDocumentId: null,
  sourceReference: null,
  anomalies: [],
  taxableMinor: 5_000,
  taxMinor: 1_100,
  notes: null,
  lines: [],
  session: null,
  relatedReturns: [],
  stockMovements: [],
};

const RICHIAMO = {
  documentId: 'doc-1',
  reference: 'CS/2026/1',
  documentDate: '2026-09-04T00:00:00.000Z',
  totalMinor: 6_100,
  cashSessionId: 'sess-1',
  lines: [
    {
      lineId: 'l-1',
      variantId: 'v-1',
      description: 'Maglia in cotone — M · Bianco',
      quantitySold: 2,
      quantityReturned: 0,
      quantityReturnable: 2,
      unitPriceMinor: 2_500,
      lineTotalMinor: 5_000,
      lineGrossTotalMinor: 6_100,
    },
  ],
  payments: [
    {
      paymentId: 'pay-1',
      paymentOptionId: 'po-1',
      optionName: 'Contanti',
      tenderKind: 'cash',
      amountMinor: 6_100,
      refundedMinor: 0,
      remainingMinor: 6_100,
    },
  ],
};

async function intercetta(page: Page): Promise<void> {
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
  await page.route('**/api/v1/inventory/locations**', (route) =>
    route.fulfill(
      json([
        {
          ...SEDE,
          tenantId: 'ten-1',
          isActive: true,
          licensedInVf: true,
          shopifySyncStatus: 'not_synced',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    ),
  );
  await page.route('**/api/v1/payment-options**', (route) =>
    route.fulfill(
      json([
        {
          id: 'po-1',
          name: 'Contanti',
          kind: 'method',
          isActive: true,
          sortOrder: 1,
          tenderKind: 'cash',
        },
      ]),
    ),
  );
  await page.route('**/api/v1/cash-sessions/current**', (route) =>
    route.fulfill(json({ session: SESSIONE_APERTA, depositsMinor: 0, withdrawalsMinor: 0 })),
  );
  await page.route('**/api/v1/store-sales/lookup**', (route) => route.fulfill(json(ARTICOLI)));
  await page.route('**/api/v1/cash-sessions/operations/doc-1', (route) =>
    route.fulfill(json(OPERAZIONE)),
  );
  await page.route('**/api/v1/cash-sessions/returns/lookup/doc-1**', (route) =>
    route.fulfill(json(RICHIAMO)),
  );
}

async function grammatica(page: Page, tabella: string, numerica: string) {
  return page.evaluate(
    ([sel, num]) => {
      const t = document.querySelector(sel)!;
      const th = t.querySelector('thead th')!;
      const celle = Array.from(t.querySelectorAll('tbody tr:first-child td'));
      return {
        collasso: getComputedStyle(t).borderCollapse,
        fondoIntestazione: getComputedStyle(th).backgroundColor,
        etichette: celle.map((c) => c.getAttribute('data-label')),
        // ⚠️ Titolo E valore a destra: la grammatica pesa più di una classe sola.
        numeriADestra: [
          t.querySelector(`thead th.${num}`),
          t.querySelector(`tbody td.${num}`),
        ].every((c) => c && getComputedStyle(c).textAlign === 'end'),
        eccesso: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    },
    [tabella, numerica] as const,
  );
}

test('⭐ il carrello della Cassa veste con la grammatica condivisa delle righe documento', async ({
  page,
}) => {
  await intercetta(page);
  await page.goto('/app/cassa');
  // Aggiungere un articolo svuota i risultati: per il secondo si cerca di nuovo.
  for (const indice of [0, 1]) {
    await page.locator('#cassa-ricerca').fill('MAG');
    await page.getByRole('button', { name: 'Cerca', exact: true }).click();
    await page.locator('.cassa__result').nth(indice).click({ timeout: 45_000 });
  }

  const righe = page.locator('table.cassa__lines tbody tr');
  await expect(righe).toHaveCount(2);
  const g = await grammatica(page, 'table.cassa__lines', 'cassa__num');
  expect(g.collasso).toBe('separate');
  expect(g.numeriADestra).toBe(true);
  expect(g.etichette).toEqual(['Articolo', 'Quantità', 'Prezzo', 'Totale', 'Azioni']);
  await page.screenshot({ path: `${SCATTI}/carrello.png` });
});

test('⭐ gli articoli del Reso al banco: stessa grammatica, e sul telefono card con etichetta', async ({
  page,
}) => {
  await intercetta(page);
  await page.goto('/app/cassa/operazioni/doc-1/reso');
  const tabella = page.locator('table.reso__table');
  await expect(tabella).toBeVisible({ timeout: 45_000 });
  const g = await grammatica(page, 'table.reso__table', 'reso__num');
  expect(g.collasso).toBe('separate');
  expect(g.numeriADestra).toBe(true);
  expect(g.etichette).toEqual(['Articolo', 'Venduti', 'Già resi', 'Rendibili', 'Rendi']);
  await page.screenshot({ path: `${SCATTI}/reso.png` });
});

test('⭐ e sul telefono gli articoli del Reso sono card con l’etichetta per cella', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await intercetta(page);
  await page.goto('/app/cassa/operazioni/doc-1/reso');
  const tabella = page.locator('table.reso__table');
  await expect(tabella).toBeVisible({ timeout: 45_000 });
  const telefono = await grammatica(page, 'table.reso__table', 'reso__num');
  expect(telefono.eccesso).toBeLessThanOrEqual(1);
  // L'intestazione sparisce e ogni cella porta la propria etichetta.
  await expect(tabella.locator('thead')).toBeHidden();
  await expect(
    page.getByLabel('Quantità da rendere di Maglia in cotone — M · Bianco'),
  ).toBeVisible();
  const etichettaResa = await tabella
    .locator('tbody td')
    .nth(1)
    .evaluate((td) => getComputedStyle(td, '::before').content);
  expect(etichettaResa).toContain('Venduti');
  await page.screenshot({ path: `${SCATTI}/reso-telefono.png` });
});
