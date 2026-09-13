import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { test } from './helpers/isolated-test';

/**
 * I MOVIMENTI COLLEGATI nel dettaglio di una Vendita online (`docs/26` A16),
 * sul motore comune. Le righe della vendita restano una griglia documentale:
 * qui si guarda solo il secondo elenco. Fixture nella forma di
 * `OnlineSaleDetail`.
 */

const SCATTI = 'test-results/vendita-online';

const VENDITA = {
  id: 'os-1',
  reference: 'VO-2026-000012',
  channel: 'shopify',
  channelLabel: 'Shopify',
  salesOrderId: 'so-1',
  orderNumber: '#1042',
  customerName: 'Giulia Neri',
  orderPlacedAt: '2026-08-10T09:00:00.000Z',
  fulfilledAt: '2026-08-12T15:30:00.000Z',
  currency: 'EUR',
  totalMinor: 4_990,
  paymentStatus: 'paid',
  inventoryStatus: 'unloaded',
  refundedAt: null,
  locationName: 'Negozio centro',
  ddtReference: null,
  externalOrderId: '5551234',
  externalFulfillmentId: null,
  customerAddress: 'Via Roma 1, Milano',
  subtotalMinor: 4_090,
  discountMinor: 0,
  shippingMinor: 0,
  taxMinor: 900,
  // Il raccordo economico del 13/09/2026 (#1014): valore originario, rettifiche del canale,
  // totale aggiornato. Fa parte del contratto: senza, il dettaglio non si disegna.
  refunds: [],
  refundTotalMinor: 0,
  updatedTotalMinor: 4_990,
  lines: [
    {
      id: 'l-1',
      lineNumber: 1,
      variantId: 'v-1',
      sku: 'MAG-M',
      barcode: null,
      description: 'Maglia in cotone — M',
      quantity: 1,
      unitPriceMinor: 4_090,
      subtotalMinor: 4_090,
      vatRatePercent: 22,
      taxMinor: 900,
      totalMinor: 4_990,
      locationId: 'loc-1',
      vatCodeId: null,
      vatCodeLabel: '22',
    },
  ],
  movements: [
    {
      id: 'm-1',
      type: 'online_sale',
      quantity: 1,
      locationName: 'Negozio centro',
      createdAt: '2026-08-12T15:30:00.000Z',
    },
    {
      id: 'm-2',
      type: 'return',
      quantity: 3,
      locationName: 'Magazzino',
      createdAt: '2026-08-20T10:00:00.000Z',
    },
    {
      id: 'm-3',
      type: 'online_sale',
      quantity: 2,
      locationName: 'Negozio centro',
      createdAt: '2026-08-05T08:00:00.000Z',
    },
  ],
  linkedDocuments: [],
};

async function apri(page: Page): Promise<void> {
  await page.route('**/api/v1/online-sales/os-1', (route: Route) =>
    route.fulfill({ status: 200, json: VENDITA }),
  );
  await page.goto('/app/sales/online/os-1');
  await expect(page.getByRole('table', { name: 'Movimenti collegati' })).toBeVisible({
    timeout: 45_000,
  });
}

test('⭐ i movimenti collegati sono una tabella del motore, ordinabile su quantità e data', async ({
  page,
}) => {
  await apri(page);
  const tabella = page.getByRole('table', { name: 'Movimenti collegati' });
  const righe = tabella.locator('tbody tr.data-table__row');
  await expect(righe).toHaveCount(3);

  // Le intestazioni vengono dal catalogo: «Sede», non «Location».
  await expect(tabella.getByRole('columnheader', { name: /Sede/ })).toBeVisible();
  await expect(tabella.getByRole('columnheader', { name: /Location/ })).toHaveCount(0);

  // Ordinamento sul VALORE della quantità: 1 · 2 · 3.
  await tabella.getByRole('button', { name: 'Ordina per Quantità' }).click();
  await expect(righe.nth(0)).toContainText('Negozio centro');
  await expect(righe.nth(2)).toContainText('Reso');

  // Ordinamento sulla data ISO: il 05/08 prima del 12/08, che il testo «12/08» non garantisce.
  await tabella.getByRole('button', { name: 'Ordina per Data' }).click();
  await expect(righe.nth(0)).toContainText('05/08/2026');
  await expect(righe.nth(2)).toContainText('20/08/2026');

  const altezza = await righe
    .first()
    .evaluate((tr) => Math.round(tr.getBoundingClientRect().height));
  expect(altezza).toBeLessThanOrEqual(26);

  // Le righe della vendita restano la griglia documentale, non toccata.
  await expect(page.locator('table.os-lines')).toHaveCount(1);
  await page.screenshot({ path: `${SCATTI}/movimenti.png`, fullPage: true });
});

test('⭐ e sul telefono ogni movimento è una card con la quantità nominata', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await apri(page);

  await expect(page.locator('.list-card__figures').filter({ hasText: 'Qtà 3' })).toBeVisible();
  await expect(page.locator('.list-card__what').filter({ hasText: 'Reso' })).toHaveCount(1);

  const eccesso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(eccesso).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SCATTI}/movimenti-telefono.png`, fullPage: true });
});
