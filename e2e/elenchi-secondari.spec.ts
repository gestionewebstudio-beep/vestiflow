import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { test } from './helpers/isolated-test';

/**
 * Due ELENCHI SECONDARI del censimento (`docs/26`): gli ordini che impegnano
 * la quantità nel pannello delle Giacenze (A20, sul motore) e l'arrivo merce
 * collegato nel dettaglio dell'Ordine fornitore (A22, `app-detail-facts`).
 * Fixture nella forma delle API (`ApiPaginated<InventoryLevelApiRow>`,
 * `StockReservationRow[]`, `SupplierOrderApiRow`).
 */

const SCATTI = 'test-results/elenchi-secondari';

const GIACENZE = {
  page: 1,
  pageSize: 50,
  total: 1,
  items: [
    {
      id: 'lvl-1',
      tenantId: 'ten-1',
      variantId: 'v-1',
      locationId: 'loc-1',
      onHand: 10,
      available: 7,
      committed: 3,
      incoming: 0,
      reserved: 0,
      minThreshold: 2,
      updatedAt: '2026-09-01T00:00:00.000Z',
      variant: {
        sku: 'MAG-M',
        optionValues: [{ name: 'Taglia', value: 'M' }],
        product: { name: 'Maglia in cotone', articleCode: '00042' },
      },
      location: { name: 'Negozio centro' },
    },
  ],
};

const PRENOTAZIONI = [
  {
    id: 'r-1',
    orderNumber: '#1042',
    channel: 'shopify_online',
    quantity: 2,
    sku: 'MAG-M',
    locationName: 'Negozio centro',
    placedAt: '2026-08-10T09:00:00.000Z',
    createdAt: '2026-08-10T09:00:00.000Z',
  },
  {
    id: 'r-2',
    orderNumber: 'OC-2026-0007',
    channel: 'manual',
    quantity: 1,
    sku: 'MAG-M',
    locationName: 'Negozio centro',
    placedAt: '2026-08-12T09:00:00.000Z',
    createdAt: '2026-08-12T09:00:00.000Z',
  },
];

const ORDINE = {
  id: 'of-1',
  tenantId: 'ten-1',
  reference: 'OF-2026-0042',
  number: 42,
  series: null,
  supplierId: 's-1',
  supplierName: 'Tessuti Sud',
  destinationLocationId: null,
  status: 'received',
  currency: 'EUR',
  costEntryMode: 'vat_excluded',
  orderDate: '2026-08-01T00:00:00.000Z',
  supplierReference: null,
  externalDocNumber: null,
  externalDocDate: null,
  externalDocumentTypeId: null,
  externalDocumentTypeSnapshot: null,
  documentDiscountPercent: null,
  lines: [],
  subtotalMinor: 0,
  taxMinor: 0,
  totalMinor: 0,
  expectedAt: null,
  linkedDocuments: [
    {
      id: 'doc-9',
      type: 'goods_receipt',
      reference: 'AM-2026-0009',
      number: 9,
      documentDate: '2026-08-20T00:00:00.000Z',
      status: 'confirmed',
    },
  ],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
};

async function instradaGiacenze(page: Page): Promise<void> {
  // ⚠️ L'elenco parte solo con le sedi: `forkJoin` di giacenze e `/inventory/locations`.
  await page.route('**/api/v1/inventory/locations**', (route: Route) =>
    route.fulfill({
      status: 200,
      json: [
        {
          id: 'loc-1',
          name: 'Negozio centro',
          tenantId: 'ten-1',
          isActive: true,
          licensedInVf: true,
          shopifySyncStatus: 'not_synced',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }),
  );
  await page.route('**/api/v1/inventory/levels**', (route: Route) =>
    route.fulfill({ status: 200, json: GIACENZE }),
  );
  await page.route('**/api/v1/inventory/reservations**', (route: Route) =>
    route.fulfill({ status: 200, json: PRENOTAZIONI }),
  );
}

/** Il numero dell'Impegnata è un pulsante col solo valore come nome: si apre da lì. */
async function apriImpegnata(page: Page): Promise<void> {
  // Sotto `lg` la cella vera è `sr-only` e il pulsante visibile è quello della card.
  await page.locator('.level-table__committed-link:visible').first().click({ timeout: 45_000 });
}

test('⭐ gli ordini che impegnano la quantità sono un elenco del motore, con la somma che torna', async ({
  page,
}) => {
  await instradaGiacenze(page);
  await page.goto('/app/inventory');
  await apriImpegnata(page);

  const tabella = page.getByRole('table', { name: 'Ordini che impegnano la quantità' });
  await expect(tabella).toBeVisible();
  const righe = tabella.locator('tbody tr.data-table__row');
  await expect(righe).toHaveCount(2);
  await expect(tabella.getByRole('columnheader', { name: /Origine/ })).toBeVisible();
  // La riga totali somma le quantità: 3, cioè l'Impegnata dichiarata in testa al pannello.
  await expect(tabella.locator('tfoot.data-table__totals')).toContainText('2 voci');
  await expect(tabella.locator('tfoot.data-table__totals')).toContainText('3');

  await tabella.getByRole('button', { name: 'Ordina per Quantità' }).click();
  await expect(righe.first()).toContainText('OC-2026-0007');
  await page.screenshot({ path: `${SCATTI}/prenotazioni.png` });
});

test('⭐ e sul telefono gli ordini che impegnano sono card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await instradaGiacenze(page);
  await page.goto('/app/inventory');
  await apriImpegnata(page);

  await expect(page.locator('.list-card__what').filter({ hasText: '#1042' })).toBeVisible();
  await expect(page.locator('.list-card__total').filter({ hasText: 'Qtà 2' })).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/prenotazioni-telefono.png` });
});

test('⭐ l’arrivo merce collegato all’ordine fornitore è un fatto del dettaglio', async ({
  page,
}) => {
  await page.route('**/api/v1/supplier-orders/of-1', (route: Route) =>
    route.fulfill({ status: 200, json: ORDINE }),
  );
  await page.goto('/app/orders/of-1');
  await expect(page.getByText('Arrivo merce collegato', { exact: true })).toBeVisible({
    timeout: 45_000,
  });
  const fatto = page.locator('app-detail-facts').filter({ hasText: 'AM-2026-0009 del 20/08/2026' });
  await expect(fatto).toBeVisible();
  await expect(fatto.getByRole('link', { name: 'Apri documento' })).toHaveAttribute(
    'href',
    '/app/documents/doc-9',
  );
  await expect(page.locator('.po-detail__linked-list')).toHaveCount(0);
  await page.screenshot({ path: `${SCATTI}/ordine-collegato.png` });
});
