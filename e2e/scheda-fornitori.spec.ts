import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { test } from './helpers/isolated-test';

/**
 * I FORNITORI DELL'ARTICOLO nella scheda prodotto (`docs/26` A15), sul motore
 * comune. Fixture minime: `ProductApiRow` senza varianti né immagini, e i
 * collegamenti fornitore nella forma di `SupplierVariantLink[]`.
 */

const SCATTI = 'test-results/scheda-fornitori';

const PRODOTTO = {
  id: 'p-1',
  tenantId: 'ten-1',
  articleCode: '00042',
  name: 'Maglia in cotone',
  status: 'active',
  catalogOrigin: 'vestiflow',
  options: [],
  shopifySyncStatus: 'not_synced',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  variants: [],
  images: [],
};

function collegamento(
  id: string,
  fornitore: string,
  sku: string,
  prezzo: number | null,
  extra = {},
) {
  return {
    id,
    tenantId: 'ten-1',
    supplierId: `s-${id}`,
    variantId: `v-${id}`,
    supplierSku: `F-${sku}`,
    isPreferred: false,
    lastPurchasePriceMinor: prezzo,
    minOrderQuantity: null,
    currency: 'EUR',
    supplier: { id: `s-${id}`, name: fornitore, code: null },
    variant: { id: `v-${id}`, sku, title: `Maglia in cotone — ${sku}` },
    ...extra,
  };
}

const COLLEGAMENTI = [
  collegamento('a', 'Tessuti Sud', 'MAG-M', 1_250, { isPreferred: true }),
  collegamento('b', 'Cotonificio Nord', 'MAG-L', 980),
  collegamento('c', 'Filati Bianchi', 'MAG-S', null),
];

async function apri(page: Page): Promise<void> {
  await page.route('**/api/v1/products/p-1', (route: Route) =>
    route.fulfill({ status: 200, json: PRODOTTO }),
  );
  await page.route('**/api/v1/products/p-1/supplier-links', (route: Route) =>
    route.fulfill({ status: 200, json: COLLEGAMENTI }),
  );
  await page.goto('/app/products/p-1');
  await expect(page.getByRole('table', { name: 'Fornitori dell’articolo' })).toBeVisible({
    timeout: 45_000,
  });
}

test('⭐ i fornitori dell’articolo sono una tabella del motore, ordinabile sul prezzo', async ({
  page,
}) => {
  await apri(page);
  const tabella = page.getByRole('table', { name: 'Fornitori dell’articolo' });
  const righe = tabella.locator('tbody tr.data-table__row');
  await expect(righe).toHaveCount(3);
  await expect(righe.first()).toContainText('Tessuti Sud');
  await expect(righe.first()).toContainText('Sì');
  await expect(righe.first()).toContainText('12,50');

  // Ordinamento sul VALORE del prezzo: l'assenza («—») vale −∞ e apre il crescente.
  await tabella.getByRole('button', { name: 'Ordina per Ultimo prezzo' }).click();
  await expect(righe.nth(0)).toContainText('Filati Bianchi');
  await expect(righe.nth(1)).toContainText('Cotonificio Nord');
  await expect(righe.nth(2)).toContainText('Tessuti Sud');

  const altezza = await righe
    .first()
    .evaluate((tr) => Math.round(tr.getBoundingClientRect().height));
  expect(altezza).toBeLessThanOrEqual(26);
  await page.screenshot({ path: `${SCATTI}/fornitori.png` });
});

test('⭐ e sul telefono ogni fornitore è una card con il prezzo come cifra', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await apri(page);

  const card = page.locator('.list-card__figures').filter({ hasText: '12,50' });
  await expect(card).toBeVisible();
  await expect(page.locator('.list-card__anchor').filter({ hasText: 'Preferenziale' })).toHaveCount(
    1,
  );

  const eccesso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(eccesso).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SCATTI}/fornitori-telefono.png`, fullPage: true });
});
