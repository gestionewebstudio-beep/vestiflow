import { expect } from '@playwright/test';

import { apriImpostazioni } from './helpers/impostazioni-fixtures';
import { test } from './helpers/isolated-test';

/**
 * Le SEDI nelle Impostazioni, sul motore comune (`docs/26` A7): erano quattro
 * `<table>` a mano. Con Shopify connesso la pagina mostra il gruppo «Sedi
 * Shopify» con le colonne Shopify e VestiFlow.
 *
 * ⛔ Le righe sono nella forma esatta di `LocationApiRow`: `shopifyLocationId`
 *    e `shopifySyncStatus` sono ciò che rende una sede «di Shopify».
 */

const SCATTI = 'test-results/sedi';

function sede(id: string, name: string, code: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    tenantId: 'tenant-1',
    name,
    code,
    addressLine1: 'Via Roma 1',
    addressLine2: null,
    city: 'Napoli',
    province: 'NA',
    postalCode: '80100',
    countryCode: 'IT',
    isActive: true,
    licensedInVf: true,
    storeId: null,
    shopifyLocationId: `gid://shopify/Location/${id}`,
    shopifySyncStatus: 'synced',
    shopifyLastSyncAt: '2026-09-01T00:00:00.000Z',
    shopifyLastError: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

const SEDI = [
  sede('loc-2', 'Magazzino nord', 'LOC-2', { licensedInVf: false, shopifySyncStatus: 'error' }),
  sede('loc-1', 'Negozio centro', 'LOC-1'),
];

test('⭐ le sedi sono una tabella del motore: ordinamento, stati come testo colorato', async ({
  page,
}) => {
  await apriImpostazioni(page, SEDI);
  await expect(page.getByRole('heading', { name: 'Sedi Shopify' })).toBeVisible({
    timeout: 45_000,
  });

  const tabella = page.getByRole('table', { name: 'Sedi Shopify' });
  const righe = tabella.locator('tbody tr.data-table__row');
  await expect(righe).toHaveCount(2);
  await expect(righe.first()).toContainText('Magazzino nord');
  await expect(righe.first()).toContainText('Errore sync');
  await expect(righe.first()).toContainText('Non attiva');
  await expect(righe.nth(1)).toContainText('Sincronizzata');

  // Ordinamento per Nome dalle intestazioni.
  await tabella.getByRole('button', { name: 'Ordina per Nome' }).click();
  await expect(righe.first()).toContainText('Magazzino nord');
  await tabella.getByRole('button', { name: 'Nome: ordinamento crescente' }).click();
  await expect(righe.first()).toContainText('Negozio centro');

  const altezza = await righe
    .first()
    .evaluate((tr) => Math.round(tr.getBoundingClientRect().height));
  expect(altezza).toBeLessThanOrEqual(26);
  await page.screenshot({ path: `${SCATTI}/sedi.png` });
});

test('⭐ e sul telefono ogni sede è una card con lo stato come ancora', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await apriImpostazioni(page, SEDI);
  await expect(page.getByRole('heading', { name: 'Sedi Shopify' })).toBeVisible({
    timeout: 45_000,
  });

  const card = page.locator('.list-card__words').filter({ hasText: 'LOC-1' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Via Roma 1, 80100 Napoli, NA');
  await expect(card).toContainText('Sincronizzata');

  const eccesso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(eccesso).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SCATTI}/sedi-telefono.png` });
});
