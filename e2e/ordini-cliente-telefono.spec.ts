import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { test } from './helpers/isolated-test';

/**
 * Gli ORDINI CLIENTE sul telefono stanno sul motore (`docs/26` A25): la card è
 * quella di `appRowCard`, con origine, sede e i tre stati. Fixture nella forma
 * di `ApiPaginated<SalesOrderApiRow>`, come in `dashboard-anteprime.spec.ts`.
 *
 * ⛔ Qui c'era una seconda vista mobile scritta a mano (`<ul class="sales-cards">`)
 * e il motore spento sotto `lg`: «Seleziona», pannello filtri e riga totali non
 * arrivavano al telefono.
 */

const SCATTI = 'test-results/ordini-cliente';

function ordine(
  id: string,
  numero: string,
  cliente: string,
  placedAt: string,
  totale: number,
  source = 'shopify',
) {
  return {
    id,
    tenantId: 'ten-1',
    orderNumber: numero,
    source,
    financialStatus: 'paid',
    fulfillmentStatus: 'unfulfilled',
    customerName: cliente,
    currency: 'EUR',
    subtotalMinor: totale,
    totalMinor: totale,
    placedAt,
    locationId: 'loc-1',
    shopifyOrderId: source === 'shopify' ? `gid://shopify/Order/${id}` : null,
    createdAt: placedAt,
    updatedAt: placedAt,
  };
}

const ORDINI = [
  ordine('o-1', '#1001', 'Mario Rossi', '2026-09-01T10:00:00.000Z', 2_990),
  ordine('o-2', 'OC-2026-0007', 'Anna Bianchi', '2026-09-03T10:00:00.000Z', 12_050, 'manual'),
];

async function apri(
  page: Page,
  ordini: readonly ReturnType<typeof ordine>[] = ORDINI,
): Promise<void> {
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
  await page.route('**/api/v1/sales-orders**', (route: Route) =>
    route.fulfill({
      status: 200,
      json: { items: ordini, page: 1, pageSize: 100, total: ordini.length },
    }),
  );
  await page.goto('/app/sales');
}

test('⭐ sul telefono gli ordini cliente sono le card del motore, con origine e stati', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await apri(page);

  const card = page.locator('tr.data-table__row').filter({ hasText: 'Anna Bianchi' });
  await expect(card).toBeVisible({ timeout: 45_000 });
  // Origine, stato ordine, stato pagamento ed evasione: tutto ciò che la card a mano mostrava.
  await expect(card.locator('.list-card__words')).toContainText('Manuale');
  await expect(card.locator('.list-card__words app-badge')).toHaveCount(3);
  await expect(card.locator('.list-card__anchor')).toHaveText('OC-2026-0007');
  await expect(card.locator('.list-card__total')).toContainText('120,50');

  // Niente seconda vista: l'elenco è uno solo, e ha i comandi del motore.
  await expect(page.locator('.sales-cards')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Seleziona', exact: true })).toBeVisible();
  await expect(page.locator('tfoot.data-table__totals')).toContainText('2 voci');

  const eccesso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(eccesso).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SCATTI}/telefono.png` });
});

/**
 * ⛔ **Sul telefono il piede NON si ancorava**: `list-page-fills-viewport` sotto `lg`
 * rimetteva l’host a `display: block`, la pagina cresceva quanto le card e totali
 * e comandi — «Nuovo» compreso — finivano in fondo a trenta giorni di ordini
 * (segnalato dal proprietario l’11/09/2026: «da mobile non si vede il pulsante
 * Nuovo»). Qui quaranta ordini: il piede sta in fondo allo SCHERMO, «Nuovo» si
 * vede senza scorrere, e a scorrere sono le card nel proprio contenitore.
 */
test('⭐ sul telefono il piede è ancorato: «Nuovo» e i totali si vedono senza scorrere', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  const tanti = Array.from({ length: 40 }, (_v, i) =>
    ordine(
      `o-${i}`,
      `#${1000 + i}`,
      `Cliente ${i}`,
      `2026-09-0${(i % 9) + 1}T10:00:00.000Z`,
      1_000 + i,
    ),
  );
  await apri(page, tanti);
  await expect(page.locator('tr.data-table__row').first()).toBeVisible({ timeout: 45_000 });

  const misuraGeometria = () =>
    page.evaluate(() => {
      const piede = document.querySelector('.list-page__foot')!.getBoundingClientRect();
      const shell = document.querySelector<HTMLElement>('.shell__content')!;
      const scroller = document.querySelector<HTMLElement>('.data-table-scroll')!;
      return {
        piedeBottom: Math.round(piede.bottom),
        viewport: window.innerHeight,
        paginaScorre: shell.scrollHeight - shell.clientHeight,
        elencoScorre: scroller.scrollHeight - scroller.clientHeight,
      };
    });
  // ⚠️ Si misura a geometria ASSESTATA, non alla prima riga visibile: sul telefono le
  //    card entrano nella finestra di rendering un attimo dopo il primo disegno, e in
  //    quell'attimo la pagina contiene ancora tutte le card (misurato nella CI della PR #9,
  //    14/09/2026: `paginaScorre` 2851 con lo scatto già corretto). Non è un'attesa fissa:
  //    è la condizione stessa, attesa finché non vale.
  await expect
    .poll(async () => (await misuraGeometria()).paginaScorre, { timeout: 15_000 })
    .toBeLessThanOrEqual(1);
  const misura = await misuraGeometria();
  // Il piede finisce sul bordo dello schermo (meno il margine della shell), la
  // pagina non scorre, l’elenco sì.
  expect(misura.piedeBottom, JSON.stringify(misura)).toBeGreaterThanOrEqual(misura.viewport - 24);
  expect(misura.paginaScorre, JSON.stringify(misura)).toBeLessThanOrEqual(1);
  expect(misura.elencoScorre, JSON.stringify(misura)).toBeGreaterThan(200);
  await expect(page.getByRole('button', { name: 'Nuovo ordine manuale' })).toBeInViewport();
  await expect(page.locator('tfoot.data-table__totals')).toContainText('40 voci');
  await page.screenshot({ path: `${SCATTI}/telefono-piede-ancorato.png` });
});

test('⭐ e su scrivania la tabella è quella di sempre', async ({ page }) => {
  await apri(page);
  const tabella = page.getByRole('table', { name: 'Ordini cliente' });
  await expect(tabella.locator('tbody tr.data-table__row')).toHaveCount(2, { timeout: 45_000 });
  await expect(page.locator('.sales-cards')).toHaveCount(0);
  await page.screenshot({ path: `${SCATTI}/scrivania.png` });
});
