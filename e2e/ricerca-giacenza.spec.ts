import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { test } from './helpers/isolated-test';

/**
 * La RICERCA GIACENZA (`docs/26` A11): la griglia taglie × sedi è una MATRICE
 * e resta fuori dal motore, ma veste la grammatica condivisa. Qui si guarda che
 * la grammatica sia arrivata (intestazione, altezza di riga) e che la funzione
 * — il numero che apre gli impegni — sia intatta, su scrivania e telefono.
 *
 * ⛔ Le risposte sono nella forma di `VariantSummaryApiRow` con l'involucro
 *    `items/page/pageSize/total`; la stessa rotta risponde sia alla ricerca
 *    (`search=`) sia alla situazione per sede (`productId=&locationId=`).
 */

const SCATTI = 'test-results/ricerca-giacenza';

const SEDI = [
  { id: 'loc-1', name: 'Negozio centro' },
  { id: 'loc-2', name: 'Magazzino' },
];

function variante(
  variantId: string,
  sku: string,
  label: string,
  available: number | null,
  extra: Record<string, unknown> = {},
) {
  return {
    variantId,
    productId: 'p-1',
    sku,
    articleCode: '00042',
    productName: 'Maglia in cotone',
    title: `Maglia in cotone — ${label}`,
    variantLabel: label,
    barcode: null,
    sellingPrice: { amountMinor: 2_990, currencyCode: 'EUR' },
    stockOnHand: available,
    stockAvailable: available,
    ...extra,
  };
}

const PER_SEDE: Record<string, readonly ReturnType<typeof variante>[]> = {
  'loc-1': [variante('v-m', 'MAG-M', 'M', 5), variante('v-l', 'MAG-L', 'L', 0)],
  'loc-2': [variante('v-m', 'MAG-M', 'M', 2), variante('v-l', 'MAG-L', 'L', 7)],
};

async function apri(page: Page): Promise<void> {
  await page.route('**/api/v1/inventory/locations**', (route: Route) =>
    route.fulfill({
      status: 200,
      json: SEDI.map((s) => ({
        ...s,
        tenantId: 'ten-1',
        isActive: true,
        licensedInVf: true,
        shopifySyncStatus: 'not_synced',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })),
    }),
  );
  await page.route('**/api/v1/products/variants/summaries**', (route: Route) => {
    const url = new URL(route.request().url());
    const locationId = url.searchParams.get('locationId');
    const items = locationId ? (PER_SEDE[locationId] ?? []) : PER_SEDE['loc-1']!;
    return route.fulfill({
      status: 200,
      json: { items, page: 1, pageSize: 100, total: items.length },
    });
  });
  await page.goto('/app/inventory/lookup');
  await page.getByRole('searchbox').first().fill('maglia');
  await page.getByRole('button', { name: /Maglia in cotone/ }).click();
  await expect(page.getByRole('table', { name: 'Disponibilità per taglia e sede' })).toBeVisible({
    timeout: 45_000,
  });
}

test('⭐ la matrice taglie × sedi veste la grammatica condivisa e i numeri restano comandi', async ({
  page,
}) => {
  await apri(page);
  const griglia = page.getByRole('table', { name: 'Disponibilità per taglia e sede' });

  // Intestazione: le sedi come colonne, il totale in coda.
  await expect(griglia.getByRole('columnheader', { name: 'Negozio centro' })).toBeVisible();
  await expect(griglia.getByRole('columnheader', { name: 'Totale' })).toBeVisible();

  // Le righe: M → 5 · 2 · 7, L → 0 · 7 · 7.
  const righe = griglia.locator('tbody tr');
  await expect(righe).toHaveCount(2);
  await expect(righe.first()).toContainText('M');
  await expect(righe.first()).toContainText('MAG-M');
  await expect(righe.first().locator('td').last()).toHaveText(/7/);

  // Il numero è un pulsante che apre gli impegni: intatto.
  await griglia.getByRole('button', { name: 'Impegni di M in Negozio centro' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  // La grammatica: intestazione maiuscola a 26px, righe a 25px.
  const misura = await page.evaluate(() => {
    const th = document.querySelector('.ricerca__griglia thead th')!;
    const tr = document.querySelector('.ricerca__griglia tbody tr')!;
    const numero = document.querySelector('.ricerca__griglia tbody td.ricerca__num')!;
    return {
      maiuscolo: getComputedStyle(th).textTransform,
      // ⚠️ Con la grammatica condivisa i numeri erano tornati a sinistra: `tbody td` pesa più di una classe.
      numeriADestra: getComputedStyle(numero).textAlign,
      altezzaTesta: Math.round(th.getBoundingClientRect().height),
      altezzaRiga: Math.round(tr.getBoundingClientRect().height),
    };
  });
  expect(misura.maiuscolo).toBe('uppercase');
  expect(misura.numeriADestra).toBe('end');
  expect(misura.altezzaTesta).toBeLessThanOrEqual(27);
  expect(misura.altezzaRiga).toBeLessThanOrEqual(26);
  await page.screenshot({ path: `${SCATTI}/griglia.png` });
});

test('⭐ e sul telefono resta una TABELLA, per scelta: le sedi stanno in larghezza', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await apri(page);
  const griglia = page.getByRole('table', { name: 'Disponibilità per taglia e sede' });
  await expect(griglia.getByRole('columnheader', { name: 'Magazzino' })).toBeVisible();
  await expect(griglia.locator('tbody tr')).toHaveCount(2);

  const eccesso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(eccesso).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SCATTI}/griglia-telefono.png`, fullPage: true });
});
