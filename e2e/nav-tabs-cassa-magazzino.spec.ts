import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { intercetta } from './helpers/cash-register-fixtures';
import { test } from './helpers/isolated-test';

/**
 * ⭐ Il controllo MIRATO delle schede condivise (`app-nav-tabs`) dove vivono FUORI da
 *    Shopify: la Cassa («Aree della Cassa») e il Magazzino («Sezioni magazzino»).
 *
 * Il 13/09/2026 il componente ha preso la parola di stato in maiuscoletto, il conteggio
 * a pastiglia, l'ombra di scorrimento e la scheda attiva in vista — per le cinque
 * schede di Impostazioni → Shopify. Cassa e Magazzino non passano né stato né
 * conteggio: qui si verifica che per loro NIENTE sia cambiato (nessuna pastiglia,
 * nessun conteggio), che la scheda attiva sia una sola, e che sul telefono la barra
 * scorra in orizzontale senza far sbordare la pagina (proprietario: «documentare un
 * controllo mirato delle nav-tabs su Cassa e Magazzino»).
 */
const SCATTI = 'test-results/nav-tabs';

async function schedeIntegre(page: Page, nome: string, attesa: string): Promise<void> {
  const nav = page.getByRole('navigation', { name: nome });
  await expect(nav).toBeVisible({ timeout: 45_000 });
  const link = nav.getByRole('link');
  expect(await link.count()).toBeGreaterThanOrEqual(2);
  // Una sola scheda attiva, ed è quella della pagina aperta.
  await expect(nav.locator('.nav-tabs__link--active')).toHaveCount(1);
  await expect(nav.locator('.nav-tabs__link--active')).toHaveText(new RegExp(attesa));
  // Niente pastiglie né conteggi: sono del solo pannello Shopify, che li passa.
  await expect(nav.locator('.nav-tabs__stato')).toHaveCount(0);
  await expect(nav.locator('.nav-tabs__conteggio')).toHaveCount(0);
}

async function nessunoSbordo(page: Page): Promise<void> {
  const sborda = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(sborda, 'la pagina scorre in orizzontale').toBe(false);
}

async function apriMagazzino(page: Page): Promise<void> {
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
  await page.route('**/api/v1/products/variants/summaries**', (route: Route) =>
    route.fulfill({ status: 200, json: { items: [], page: 1, pageSize: 100, total: 0 } }),
  );
  await page.goto('/app/inventory/lookup');
}

test('scrivania: Cassa e Magazzino hanno le loro schede, senza pastiglie né conteggi', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await intercetta(page, 3);
  await page.goto('/app/cassa/operazioni');
  await schedeIntegre(page, 'Aree della Cassa', 'Operazioni');
  await page.screenshot({ path: `${SCATTI}/01-cassa-desktop.png` });

  await apriMagazzino(page);
  await schedeIntegre(page, 'Sezioni magazzino', 'Cerca');
  await page.screenshot({ path: `${SCATTI}/02-magazzino-desktop.png` });
});

test('telefono (390): le schede scorrono in orizzontale e la pagina non sborda', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await intercetta(page, 3);
  await page.goto('/app/cassa/operazioni');
  await schedeIntegre(page, 'Aree della Cassa', 'Operazioni');
  await nessunoSbordo(page);
  await page.screenshot({ path: `${SCATTI}/03-cassa-telefono.png` });

  await apriMagazzino(page);
  await schedeIntegre(page, 'Sezioni magazzino', 'Cerca');
  await nessunoSbordo(page);
  // La barra delle sezioni del magazzino è più larga del telefono: scorre lei, non la pagina.
  const nav = page.getByRole('navigation', { name: 'Sezioni magazzino' });
  const misura = await nav.evaluate((el) => ({ scroll: el.scrollWidth, vista: el.clientWidth }));
  expect(misura.scroll).toBeGreaterThanOrEqual(misura.vista);
  await page.screenshot({ path: `${SCATTI}/04-magazzino-telefono.png` });
});
