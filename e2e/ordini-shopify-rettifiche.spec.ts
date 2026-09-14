import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { test } from './helpers/isolated-test';

/**
 * L'elenco ORDINI SHOPIFY con le rettifiche del canale (13/09/2026, #1014 del
 * collaudo reale), guardato come lo ha guardato il proprietario:
 *
 * - «attenzione al termine Rettifici»: a 1440 e a 1920 nessuna intestazione e nessun
 *   importo delle colonne di serie si taglia (proprietario: «leggibili anche a 1440, senza
 *   rimpicciolire il testo»). Misurato: con tredici colonne di serie una numerica rendeva
 *   46px a 1440; DDT, Aggiornato e Sync sono spente di serie e i pesi sono tarati;
 * - «Non ha ordinamento»: Rettifiche e Tot. aggiornato si ordinano come Totale,
 *   e l'elenco chiede l'ordine al server (parametro `sort`), come le altre;
 * - «mettere punto alle migliaia»: 2.249,85 €, non 2249,85 €.
 *
 * Fixture nella forma di `ApiPaginated<SalesOrderApiRow>`: la somma e il totale
 * aggiornato sono di TESTATA (`refundTotalMinor`, `currentTotalMinor`), come li
 * manda l'API.
 */

function ordine(
  id: string,
  numero: string,
  cliente: string,
  totale: number,
  rettifiche: number,
  fulfillmentStatus: string,
  financialStatus: string,
) {
  return {
    id,
    tenantId: 'ten-1',
    orderNumber: numero,
    source: 'shopify',
    financialStatus,
    fulfillmentStatus,
    customerName: cliente,
    currency: 'EUR',
    subtotalMinor: totale,
    totalMinor: totale,
    refundTotalMinor: rettifiche,
    currentTotalMinor: totale - rettifiche,
    refundCount: rettifiche > 0 ? 1 : 0,
    placedAt: '2026-09-13T13:11:06.000Z',
    locationId: null,
    locationName: 'Shop location',
    shopifyOrderId: `gid://shopify/Order/${id}`,
    createdAt: '2026-09-13T13:11:06.000Z',
    updatedAt: '2026-09-13T13:14:51.000Z',
  };
}

const ORDINI = [
  ordine('o-1014', '#1014', 'Karine Ruby', 224_985, 74_995, 'fulfilled', 'partially_refunded'),
  ordine('o-1013', '#1013', 'Russell Winfield', 102_500, 102_500, 'unfulfilled', 'refunded'),
  ordine('o-1012', '#1012', 'Ayumu Hirano', 60_000, 0, 'fulfilled', 'paid'),
];

async function apri(page: Page): Promise<string[]> {
  const ordinamentiChiesti: string[] = [];
  await page.route('**/api/v1/inventory/locations**', (route: Route) =>
    route.fulfill({ status: 200, json: [] }),
  );
  await page.route('**/api/v1/sales-orders**', (route: Route) => {
    const url = new URL(route.request().url());
    const sort = url.searchParams.get('sort');
    if (sort) ordinamentiChiesti.push(sort);
    return route.fulfill({
      status: 200,
      json: { items: ORDINI, page: 1, pageSize: 100, total: ORDINI.length },
    });
  });
  await page.goto('/app/sales/shopify');
  await expect(page.getByRole('row', { name: /#1014/ })).toBeVisible();
  return ordinamentiChiesti;
}

test('⭐ le tre colonne economiche: valore originario, rettifiche col segno, totale aggiornato — col punto delle migliaia', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await apri(page);

  const riga1014 = page.getByRole('row', { name: /#1014/ });
  await expect(riga1014).toContainText('2.249,85 €');
  await expect(riga1014).toContainText('− 749,95 €');
  await expect(riga1014).toContainText('1.499,90 €');
  // Annullato per intero, mai evaso: il totale aggiornato è zero e resta scritto.
  const riga1013 = page.getByRole('row', { name: /#1013/ });
  await expect(riga1013).toContainText('− 1.025,00 €');
  await expect(riga1013).toContainText('0,00 €');
  // Senza rettifiche: «—», e il totale aggiornato coincide col totale.
  const riga1012 = page.getByRole('row', { name: /#1012/ });
  await expect(riga1012).toContainText('—');
  await expect(riga1012).toContainText('600,00 €');
});

for (const larghezza of [1440, 1920]) {
  test(`⛔ «Rettifici»: a ${larghezza} intestazioni e importi delle colonne di serie entrano interi`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: larghezza, height: 900 });
    await apri(page);

    // Le tre colonne di serie in più — DDT, Aggiornato, Sync — sono spente (13/09/2026).
    for (const spenta of ['DDT', 'Aggiornato', 'Sync']) {
      await expect(page.getByRole('columnheader', { name: spenta, exact: true })).toHaveCount(0);
    }
    // Ogni intestazione: tagliata quando il suo testo è più largo dello spazio che ha.
    const intestazioni = await page.locator('thead th').evaluateAll((celle) =>
      celle.map((th) => {
        const etichetta = th.querySelector('.data-table__head-label, .data-table__sort') ?? th;
        return {
          nome: (th.textContent ?? '').trim(),
          tagliata: etichetta.scrollWidth > etichetta.clientWidth + 1,
        };
      }),
    );
    expect(intestazioni.filter((i) => i.tagliata).map((i) => i.nome)).toEqual([]);
    // Ogni importo delle tre colonne economiche, su ogni riga.
    const importi = await page.locator('tbody tr.data-table__row td').evaluateAll((celle) =>
      celle
        .filter((td) => /€/.test(td.textContent ?? ''))
        .map((td) => {
          const testo = td.querySelector('span, div') ?? td;
          return {
            valore: (td.textContent ?? '').trim(),
            tagliato:
              td.scrollWidth > td.clientWidth + 1 || testo.scrollWidth > testo.clientWidth + 1,
          };
        }),
    );
    expect(importi.length).toBeGreaterThanOrEqual(9);
    expect(importi.filter((i) => i.tagliato).map((i) => i.valore)).toEqual([]);
  });
}

test('⭐ «Non ha ordinamento»: Rettifiche e Tot. aggiornato si ordinano, e l’ordine lo chiede al server', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const chiesti = await apri(page);

  await page.getByRole('button', { name: 'Ordina per Rettifiche' }).click();
  await expect.poll(() => chiesti.at(-1)).toBe('refundTotal:asc');
  await expect(page).toHaveURL(/sort=refundTotal(%3A|:)asc/);

  // Il secondo clic si aggiunge al primo: l'ordinamento è a più chiavi, come sulle altre.
  await page.getByRole('button', { name: /Ordina per Tot\. aggiornato/ }).click();
  await expect.poll(() => chiesti.at(-1)).toContain('updatedTotal:asc');
});
