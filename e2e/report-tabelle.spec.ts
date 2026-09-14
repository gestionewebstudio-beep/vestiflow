import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { test } from './helpers/isolated-test';

/**
 * Le tabelle della pagina REPORT sul motore comune (`docs/26` A10 · A12):
 * giacenze per sede (con la riga totali), fatturato per canale (con la riga
 * totali) e top prodotti (senza: la somma dei primi dieci non dice niente).
 *
 * ⛔ Risposte nella forma di `LocationInventoryReportRow[]` e di
 *    `BusinessAnalyticsSummary`.
 */

const SCATTI = 'test-results/report';

const SEDI = [
  {
    locationId: 'loc-1',
    locationName: 'Negozio centro',
    trackedVariants: 120,
    availableUnits: 640,
    lowStockCount: 3,
    stockValueMinor: 1_250_000,
    currencyCode: 'EUR',
  },
  {
    locationId: 'loc-2',
    locationName: 'Magazzino',
    trackedVariants: 80,
    availableUnits: 1_200,
    lowStockCount: 0,
    stockValueMinor: 2_000_050,
    currencyCode: 'EUR',
  },
];

const ANALISI = {
  currencyCode: 'EUR',
  period: { from: '2026-09-01', to: '2026-09-11', dayCount: 11 },
  previousPeriod: { from: '2026-08-21', to: '2026-08-31', dayCount: 11 },
  revenue: {
    totalMinor: 320_000,
    shopifyMinor: 200_000,
    manualMinor: 120_000,
    previousTotalMinor: 300_000,
    changePercent: 6.7,
  },
  sales: { transactionCount: 40, unitsSold: 95, avgTicketMinor: 8_000 },
  margin: { grossMinor: null, grossPercent: null },
  inventory: {
    stockValueMinor: 3_250_050,
    stockCostMinor: null,
    stockMarginMinor: null,
    stockMarginPercent: null,
    availableUnits: 1_840,
    lowStockCount: 3,
  },
  forecast: {
    avgDailyRevenueMinor: 29_090,
    projectedMonthRevenueMinor: 872_700,
    daysOfCover: null,
  },
  channels: [
    { channel: 'shopify', label: 'Shopify', revenueMinor: 200_000, unitsSold: 60 },
    { channel: 'manual', label: 'Negozio', revenueMinor: 120_000, unitsSold: 35 },
  ],
  topProducts: [
    {
      variantId: 'v-mag-m',
      sku: 'MAG-M',
      title: 'Maglia in cotone — M',
      revenueMinor: 90_000,
      unitsSold: 30,
    },
    {
      variantId: 'v-pnt-48',
      sku: 'PNT-48',
      title: 'Pantalone in lino — 48',
      revenueMinor: 150_000,
      unitsSold: 25,
    },
  ],
  dailyRevenue: [],
};

async function apri(page: Page): Promise<void> {
  await page.route('**/api/v1/inventory/reports/location-summary**', (route: Route) =>
    route.fulfill({ status: 200, json: SEDI }),
  );
  await page.route('**/api/v1/analytics/business-summary**', (route: Route) =>
    route.fulfill({ status: 200, json: ANALISI }),
  );
  await page.goto('/app/reports');
  await expect(page.getByRole('table', { name: 'Giacenze per sede' })).toBeVisible({
    timeout: 45_000,
  });
}

test('⭐ giacenze per sede e canali sommano; i top prodotti no; tutto si ordina sul valore', async ({
  page,
}) => {
  await apri(page);

  // Giacenze per sede: la riga totali è l'azienda intera.
  const sedi = page.getByRole('table', { name: 'Giacenze per sede' });
  await expect(sedi.locator('tbody tr.data-table__row')).toHaveCount(2);
  const totaliSedi = sedi.locator('tfoot.data-table__totals');
  await expect(totaliSedi).toContainText('2 voci');
  await expect(totaliSedi).toContainText('200'); // varianti tracciate 120 + 80
  await expect(totaliSedi).toContainText('1840'); // pezzi 640 + 1200
  await expect(totaliSedi).toContainText('32.500,50'); // 12.500,00 + 20.000,50
  // Ordinamento sul VALORE del denaro: 12.500 prima di 20.000.
  await sedi.getByRole('button', { name: 'Ordina per Valore stock' }).click();
  await expect(sedi.locator('tbody tr.data-table__row').first()).toContainText('Negozio centro');
  await sedi.getByRole('button', { name: 'Valore stock: ordinamento crescente' }).click();
  await expect(sedi.locator('tbody tr.data-table__row').first()).toContainText('Magazzino');

  // Canali: la somma dei canali È il fatturato del periodo. ⭐ Il punto delle migliaia
  // c'è anche a quattro cifre (13/09/2026): it-IT da solo scriveva «3200,00 €».
  const canali = page.getByRole('table', { name: 'Fatturato per canale' });
  await expect(canali.locator('tfoot.data-table__totals')).toContainText('3.200,00');
  await expect(canali.locator('tfoot.data-table__totals')).toContainText('95');

  // Top prodotti: nessuna riga totali, e l'ordinamento è sull'importo.
  const top = page.getByRole('table', { name: 'Top prodotti per fatturato' });
  await expect(top.locator('tfoot')).toHaveCount(0);
  await top.getByRole('button', { name: 'Ordina per Fatturato' }).click();
  await expect(top.locator('tbody tr.data-table__row').first()).toContainText('Maglia');

  const altezze = await page.evaluate(() =>
    Array.from(document.querySelectorAll('tbody tr.data-table__row')).map((r) =>
      Math.round(r.getBoundingClientRect().height),
    ),
  );
  expect(Math.max(...altezze)).toBeLessThanOrEqual(26);
  await page.screenshot({ path: `${SCATTI}/tabelle.png`, fullPage: true });
});

test('⭐ e sul telefono le tre tabelle sono card coi numeri nominati', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await apri(page);

  const sede = page.locator('.list-card__figures').filter({ hasText: 'Pezzi 640' });
  await expect(sede).toBeVisible();
  await expect(sede).toContainText('Sotto soglia 3');
  await expect(sede).toContainText('12.500,00');

  const canale = page.locator('.list-card__figures').filter({ hasText: 'Pezzi 60' });
  await expect(canale).toBeVisible();
  await expect(canale).toContainText('2.000,00');

  const eccesso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(eccesso).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SCATTI}/tabelle-telefono.png`, fullPage: true });
});
