import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium, expect as browserExpect, type Browser } from '@playwright/test';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { avviaApp, chiama, type AppIntegrazione } from './app';
import { avviaBrowserServer } from './browser-server';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * IMPOSTAZIONI → SHOPIFY con API e PostgreSQL ISOLATI (11/09/2026).
 *
 * ⛔ Sul database condiviso `GET /shopify/connection` risponde 500: il client
 * Prisma legge `shopify_connections.shop_id`, aggiunta dalla migration
 * `20260907000000_shopify_link_history`, che lì non è applicata (ultima
 * applicata: 20260906120000). La verifica NON si fa applicando la migration al
 * condiviso: si fa qui, sul database di prova migrato, che è l'ambiente giusto.
 *
 * Due letture, con lo stesso codice che gira sul condiviso:
 *  1. il titolare legge la connessione → 200 e «non collegato», non 500;
 *  2. un commesso col SOLO `inventory.import_export` (senza «Sezione
 *     Impostazioni») raggiunge la pagina dal browser, vede il solo comando che
 *     il permesso concede, lo esegue e l'API risponde con un rifiuto motivato —
 *     non un 500 — che compare nella sezione delle operazioni; la radice delle
 *     Impostazioni resta chiusa, e la connessione non viene mai chiesta.
 */
describe('Impostazioni → Shopify: browser → API → PostgreSQL isolato', () => {
  let prisma: PrismaClient;
  let browser: Browser;
  const artifacts = resolve(process.cwd(), '../test-results/shopify-pagina-real');

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    browser = await chromium.launch({ headless: true });
    await mkdir(artifacts, { recursive: true });
  });

  afterAll(async () => {
    await browser?.close();
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  });

  it('titolare: la connessione si legge (200, non collegato) — la query che sul condiviso dà 500', async () => {
    await creaDataset(prisma);
    await prisma.user.update({ where: { id: IDS.utenteA1 }, data: { role: 'owner' } });
    let app: AppIntegrazione | undefined;
    try {
      app = await avviaApp();
      const token = await app.token(IDS.authA1);
      const risposta = await chiama(app, 'GET', '/shopify/connection', { token });
      expect(risposta.stato, JSON.stringify(risposta.corpo)).toBe(200);
      expect((risposta.corpo as { status: string }).status).toBe('not_connected');
    } finally {
      await app?.chiudi();
    }
  });

  it('commesso con il solo permesso sulle giacenze: pagina raggiungibile, comando eseguito, esito a schermo', async () => {
    await creaDataset(prisma);
    await prisma.user.update({
      where: { id: IDS.utenteA1 },
      data: { permissions: { push: 'inventory.import_export' } },
    });

    let app: AppIntegrazione | undefined;
    let server: Awaited<ReturnType<typeof avviaBrowserServer>> | undefined;
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: 'it-IT',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (['127.0.0.1', 'localhost'].includes(url.hostname) && url.port !== '4200') {
        await route.continue();
      } else {
        await route.abort('blockedbyclient');
      }
    });

    try {
      app = await avviaApp();
      server = await avviaBrowserServer(app);
      await page.goto(`${server.url}/login`);
      await page.locator('#login-email').fill(server.email);
      await page.locator('#login-password').fill(server.password);
      await page.getByRole('button', { name: 'Accedi', exact: true }).click();
      await browserExpect(page).toHaveURL(/\/app(?:\/|$)/);

      // Dal menu: «Impostazioni» porta direttamente alla pagina Shopify.
      const voce = page
        .locator('nav.app-sidebar')
        .getByRole('link', { name: 'Impostazioni', exact: true });
      await browserExpect(voce).toHaveAttribute('href', '/app/settings/shopify');
      await voce.click();
      // ⭐ Dal 13/09/2026 la pagina è a schede (`docs/29` §5): la rotta porta il nome
      //    della scheda scelta dallo stato, e per chi ha il solo permesso sulle giacenze
      //    è «Operazioni». Il comando si chiama «Allinea giacenze su Shopify» e chiama
      //    `sync/inventory/align`; l'esito compare nella stessa sezione, perché chi non
      //    gestisce Shopify non ha le schede dello stato.
      await browserExpect(page).toHaveURL(/\/app\/settings\/shopify(\/[a-z-]+)?$/);
      await browserExpect(
        page.getByRole('heading', { name: 'Shopify', exact: true }),
      ).toBeVisible();
      await browserExpect(
        page.getByRole('button', { name: 'Allinea giacenze su Shopify' }),
      ).toBeVisible();
      await browserExpect(page.getByRole('button', { name: 'Importa catalogo' })).toHaveCount(0);
      await browserExpect(page.getByRole('heading', { name: 'Configurazione' })).toHaveCount(0);

      // Il comando parte davvero e l'esito compare nella sezione delle operazioni, non
      // un 500. ⚠️ Senza un negozio collegato «Allinea» oggi CONCLUDE il controllo con
      // zero coppie esaminate (201, «Controllo completato — 0 esaminati»), non rifiuta con
      // «nessun negozio collegato» come faceva il comando precedente (4xx): misurato il
      // 14/09/2026 in questa prova; se debba invece fermarsi con un motivo è una decisione
      // registrata in `DA-FARE` §10g, non un'attesa da forzare qui.
      await page.getByRole('button', { name: 'Allinea giacenze su Shopify' }).click();
      const esiti = page.getByRole('region', { name: /Operazioni avviate manualmente/ });
      await browserExpect(
        esiti.getByRole('alert').or(esiti.getByRole('status')).first(),
      ).toBeVisible();
      await browserExpect(esiti.getByText(/Controllo completato/)).toBeVisible();
      await page.screenshot({ path: resolve(artifacts, 'commesso-giacenze.png'), fullPage: true });

      const sync = server.requests.filter((r) => r.path === '/api/v1/shopify/sync/inventory/align');
      expect(sync.length, JSON.stringify(server.requests)).toBeGreaterThanOrEqual(1);
      expect(sync[0]!.status).toBeLessThan(500);
      // La connessione — che a un commesso l'API negherebbe — non viene chiesta.
      expect(server.requests.some((r) => r.path === '/api/v1/shopify/connection')).toBe(false);

      // Le altre Impostazioni restano chiuse.
      await page.goto(`${server.url}/app/settings`);
      await browserExpect(page).toHaveURL(/\/app\/dashboard/);
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
      await server?.chiudi();
      await app?.chiudi();
    }
  });
});
