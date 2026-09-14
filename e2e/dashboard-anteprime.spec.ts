import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { test } from './helpers/isolated-test';

/**
 * Le due ANTEPRIME della dashboard sul motore comune (`docs/26` A8 · A9):
 * sotto scorta e ultime vendite. Erano due `<table>` a mano.
 *
 * ⛔ Le risposte sono nella forma esatta di `DashboardSummary` e di
 *    `SalesOrderApiRow` (involucro `items/page/pageSize/total`).
 */

const SCATTI = 'test-results/dashboard';

const RIEPILOGO = {
  productCount: 12,
  incomingSupplierOrders: 1,
  availableUnits: 40,
  lowStockCount: 2,
  levels: [
    {
      variantId: 'v-1',
      locationId: 'loc-1',
      sku: 'TSB-M',
      title: 'T-shirt Basic — M / Bianco',
      available: 0,
      minThreshold: 5,
      locationName: 'Negozio centro',
    },
    {
      variantId: 'v-2',
      locationId: 'loc-1',
      sku: 'PNT-48',
      title: 'Pantalone in lino — 48',
      available: 3,
      minThreshold: 10,
      locationName: 'Negozio centro',
    },
    {
      variantId: 'v-3',
      locationId: 'loc-1',
      sku: 'MAG-L',
      title: 'Maglia in cotone — L',
      available: 30,
      minThreshold: 2,
      locationName: 'Negozio centro',
    },
  ],
  locations: [{ id: 'loc-1', name: 'Negozio centro' }],
};

function ordine(id: string, numero: string, cliente: string, placedAt: string, totale: number) {
  return {
    id,
    tenantId: 'ten-1',
    orderNumber: numero,
    source: 'shopify',
    financialStatus: 'paid',
    fulfillmentStatus: 'unfulfilled',
    customerName: cliente,
    currency: 'EUR',
    subtotalMinor: totale,
    totalMinor: totale,
    placedAt,
    shopifyOrderId: `gid://shopify/Order/${id}`,
    createdAt: placedAt,
    updatedAt: placedAt,
  };
}

const ORDINI = [
  ordine('o-1', '#1001', 'Mario Rossi', '2026-09-01T10:00:00.000Z', 2_990),
  ordine('o-2', '#1002', 'Anna Bianchi', '2026-09-03T10:00:00.000Z', 12_050),
];

async function apri(page: Page): Promise<void> {
  await page.route('**/api/v1/dashboard/summary**', (route: Route) =>
    route.fulfill({ status: 200, json: RIEPILOGO }),
  );
  await page.route('**/api/v1/sales-orders**', (route: Route) =>
    route.fulfill({
      status: 200,
      json: { items: ORDINI, page: 1, pageSize: 100, total: ORDINI.length },
    }),
  );
  await page.goto('/app/dashboard');
  await expect(page.getByRole('table', { name: 'Varianti sotto scorta' })).toBeVisible({
    timeout: 45_000,
  });
}

test('⭐ sotto scorta e ultime vendite sono tabelle del motore, ordinabili sul valore', async ({
  page,
}) => {
  await apri(page);

  // Sotto scorta: solo le righe sotto soglia, la peggiore per prima.
  const scorta = page.getByRole('table', { name: 'Varianti sotto scorta' });
  const righeScorta = scorta.locator('tbody tr.data-table__row');
  await expect(righeScorta).toHaveCount(2);
  await expect(righeScorta.first()).toContainText('T-shirt Basic');
  // Ordinamento numerico su Soglia: 5 prima di 10.
  await scorta.getByRole('button', { name: 'Ordina per Soglia min.' }).click();
  await expect(righeScorta.first()).toContainText('T-shirt Basic');
  await scorta.getByRole('button', { name: 'Soglia min.: ordinamento crescente' }).click();
  await expect(righeScorta.first()).toContainText('Pantalone in lino');

  // Ultime vendite: la più recente per prima; il clic di riga apre la vendita.
  const vendite = page.getByRole('table', { name: 'Ultime vendite' });
  const righeVendite = vendite.locator('tbody tr.data-table__row');
  await expect(righeVendite).toHaveCount(2);
  await expect(righeVendite.first()).toContainText('#1002');
  await expect(righeVendite.first()).toContainText('120,50');
  // Ordinamento sull'IMPORTO (valore, non testo): crescente → 29,90 prima.
  await vendite.getByRole('button', { name: 'Ordina per Totale' }).click();
  await expect(righeVendite.first()).toContainText('#1001');

  const altezze = await page.evaluate(() =>
    Array.from(document.querySelectorAll('tbody tr.data-table__row')).map((r) =>
      Math.round(r.getBoundingClientRect().height),
    ),
  );
  expect(Math.max(...altezze)).toBeLessThanOrEqual(26);
  await page.screenshot({ path: `${SCATTI}/anteprime.png`, fullPage: true });

  await righeVendite.filter({ hasText: '#1002' }).click();
  await expect(page).toHaveURL(/\/app\/sales\/o-2/);
});

test('⭐ e sul telefono le due anteprime sono card coi numeri nominati', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await apri(page);

  const scorta = page.locator('.list-card__figures').filter({ hasText: 'Soglia 5' });
  await expect(scorta).toBeVisible();
  await expect(scorta).toContainText('Disp. 0');

  const vendita = page.locator('.list-card__head').filter({ hasText: '#1002' });
  await expect(vendita).toBeVisible();
  await expect(vendita).toContainText('Pagato');

  const eccesso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(eccesso).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SCATTI}/anteprime-telefono.png`, fullPage: true });
});
