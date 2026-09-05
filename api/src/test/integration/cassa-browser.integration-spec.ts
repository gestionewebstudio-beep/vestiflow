import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium, expect as browserExpect, type Browser, type Page } from '@playwright/test';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { avviaApp, type AppIntegrazione } from './app';
import { avviaBrowserServer } from './browser-server';
import { creaDatasetCassa } from './cassa.fixture';
import { IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

describe('Cassa browser → API → PostgreSQL isolato', () => {
  let prisma: PrismaClient;
  let browser: Browser;
  const artifacts = resolve(process.cwd(), '../test-results/cassa-browser-real');
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

  async function money(page: Page, label: string, value: string) {
    await page.getByRole('textbox', { name: label, exact: true }).fill(value);
    await page.getByRole('textbox', { name: label, exact: true }).press('Tab');
  }
  async function scan(page: Page) {
    await page
      .getByRole('searchbox', { name: 'Cerca per codice, barcode o nome' })
      .fill('CASSA-TEST');
    await page.getByRole('button', { name: 'Cerca', exact: true }).click();
    // Codice esatto: il componente aggiunge il risultato e pulisce la ricerca.
    await browserExpect(
      page.getByRole('searchbox', { name: 'Cerca per codice, barcode o nome' }),
    ).toHaveValue('');
  }
  async function loseResponseOnce(page: Page, path: string) {
    await page.route(
      `**/api/v1${path}`,
      async (route) => {
        const response = await route.fetch();
        expect(response.status(), await response.text()).toBe(201);
        // Il vero server ha già committato. Si perde soltanto la risposta verso il browser.
        await route.abort('failed');
      },
      { times: 1 },
    );
  }
  for (const mobile of [false, true]) {
    const name = mobile ? 'mobile' : 'desktop';
    it(`${name}: invii incerti, carrello modificato, resi 1+2 e quadratura`, async () => {
      const fixture = await creaDatasetCassa(prisma);
      await prisma.user.update({
        where: { id: IDS.utenteA1 },
        data: { defaultLocationId: IDS.locA1 },
      });
      await prisma.tenant.update({
        where: { id: IDS.tenantA },
        data: { channelProfile: 'gestionale' },
      });
      const vat = await prisma.vatCode.create({
        data: {
          tenantId: IDS.tenantA,
          natureId: (await prisma.vatNature.findUniqueOrThrow({ where: { key: 'TAXABLE' } })).id,
          code: 'IVA22 browser',
          description: 'TEST',
          ratePercent: 22,
        },
      });
      const variant = await prisma.productVariant.update({
        where: { id: fixture.variantId },
        data: { sellingPriceMinor: '998.9071' },
      });
      await prisma.product.update({
        where: { id: variant.productId },
        data: { defaultVatCodeId: vat.id },
      });
      await prisma.inventoryLevel.create({
        data: {
          tenantId: IDS.tenantA,
          locationId: IDS.locA1,
          variantId: variant.id,
          onHand: 10,
          available: 10,
        },
      });
      let app: AppIntegrazione | undefined;
      let server: Awaited<ReturnType<typeof avviaBrowserServer>> | undefined;
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        isMobile: mobile,
        hasTouch: mobile,
        locale: 'it-IT',
      });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      const external: string[] = [];
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (['127.0.0.1', 'localhost'].includes(url.hostname) && url.port !== '4200')
          await route.continue();
        else {
          external.push(`${url.origin}${url.pathname}`);
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
        await page.goto(`${server.url}/app/cassa`);
        await money(page, 'Fondo iniziale di cassa', '5');
        await page.getByRole('button', { name: 'Apri la cassa', exact: true }).click();
        await scan(page);
        await scan(page);
        await scan(page);
        await browserExpect(
          page.getByRole('spinbutton', { name: 'Quantità di Articolo Cassa TEST' }),
        ).toHaveValue('3');
        await page.getByRole('button', { name: 'Contanti TEST', exact: true }).click();
        await money(page, 'Importo Contanti TEST', '10');
        await money(page, 'Contante ricevuto per Contanti TEST', '15');
        await page.getByRole('button', { name: 'Carta TEST', exact: true }).click();
        await page.getByRole('checkbox', { name: 'Esito confermato sul terminale' }).check();
        await browserExpect(
          page.getByRole('textbox', { name: 'Importo Carta TEST', exact: true }),
        ).toHaveValue('26,56');
        await loseResponseOnce(page, '/cash-sessions/checkout');
        await page.getByRole('button', { name: 'Concludi vendita' }).click();
        await browserExpect(page.getByText('Esito da verificare', { exact: true })).toBeVisible();
        const sale = await prisma.document.findFirstOrThrow({
          where: { tenantId: IDS.tenantA, cashSessionId: { not: null }, type: 'store_sale' },
        });
        const sessionId = sale.cashSessionId!;
        expect(sale.totalMinor.toString()).toBe('3656');
        expect(
          (
            await prisma.documentLine.findFirstOrThrow({ where: { documentId: sale.id } })
          ).unitPriceMinor.toString(),
        ).toBe('998.9071');
        await scan(page);
        await browserExpect(page.getByRole('button', { name: 'Concludi vendita' })).toBeDisabled();
        await page.getByRole('button', { name: "Recupera l'esito" }).click();
        await browserExpect(
          page.getByRole('heading', { name: 'Vendita registrata' }),
        ).toBeVisible();
        await browserExpect(page.locator('.cassa__done-totals')).toContainText('36,56');
        await browserExpect(page.locator('.cassa__done-totals')).toContainText('5,00');
        const sends = server.requests.filter((r) => r.path.endsWith('/checkout'));
        expect(sends).toHaveLength(2);
        expect(sends[1]?.body).toEqual(sends[0]?.body);
        expect(await prisma.document.count({ where: { cashSessionId: sessionId } })).toBe(1);
        expect(
          (await prisma.inventoryLevel.findFirstOrThrow({ where: { variantId: variant.id } }))
            .onHand,
        ).toBe(7);
        await page.getByRole('button', { name: 'Riprendi carrello modificato' }).click();
        await browserExpect(
          page.getByRole('spinbutton', { name: 'Quantità di Articolo Cassa TEST' }),
        ).toHaveValue('4');
        await page.screenshot({ path: resolve(artifacts, `${name}-recovery.png`), fullPage: true });

        await page.goto(`${server.url}/app/cassa/operazioni/${sale.id}/reso`);
        await page.getByRole('spinbutton', { name: /^Quantità da rendere/ }).fill('1');
        await browserExpect(page.locator('.reso__total')).toContainText('12,19');
        await page.getByRole('button', { name: 'Proponi', exact: true }).click();
        await page.getByRole('checkbox', { name: 'Storno confermato sul terminale' }).check();
        await page.getByPlaceholder('Perché la merce rientra').fill('Primo pezzo, risposta persa');
        await loseResponseOnce(page, '/cash-sessions/returns');
        await page.getByRole('button', { name: 'Concludi reso' }).click();
        await browserExpect(page.getByText('Esito da verificare', { exact: true })).toBeVisible();
        await page.reload();
        await page.getByRole('button', { name: "Recupera l'esito" }).click();
        await browserExpect(page.getByRole('heading', { name: 'Reso registrato' })).toBeVisible();
        const returns = server.requests.filter(
          (r) => r.path.endsWith('/returns') && r.method === 'POST',
        );
        expect(returns).toHaveLength(2);
        expect(returns[1]?.body).toEqual(returns[0]?.body);
        expect(
          await prisma.document.count({
            where: { cashSessionId: sessionId, type: 'store_return' },
          }),
        ).toBe(1);

        await page.goto(`${server.url}/app/cassa/operazioni/${sale.id}/reso`);
        await page.getByRole('spinbutton', { name: /^Quantità da rendere/ }).fill('2');
        await browserExpect(page.locator('.reso__total')).toContainText('24,37');
        await page.getByRole('button', { name: 'Proponi', exact: true }).click();
        await page.getByRole('checkbox', { name: 'Storno confermato sul terminale' }).check();
        await page.getByPlaceholder('Perché la merce rientra').fill('Ultimi due pezzi');
        await page.getByRole('button', { name: 'Concludi reso' }).click();
        await browserExpect(page.getByRole('heading', { name: 'Reso registrato' })).toBeVisible();
        const docs = await prisma.document.findMany({
          where: { cashSessionId: sessionId, type: 'store_return' },
        });
        expect(docs.map((d) => Number(d.totalMinor)).sort()).toEqual([1219, 2437]);
        for (const doc of docs)
          expect(Number(doc.subtotalMinor) + Number(doc.taxMinor)).toBe(Number(doc.totalMinor));
        expect(
          (await prisma.inventoryLevel.findFirstOrThrow({ where: { variantId: variant.id } }))
            .onHand,
        ).toBe(10);

        await page.goto(`${server.url}/app/cassa/sessioni/${sessionId}`);
        for (const [type, amount, reason] of [
          ['deposit', '2', 'Fondo aggiunto'],
          ['withdrawal', '1', 'Prelievo TEST'],
        ] as const) {
          await page.getByRole('combobox', { name: /^Tipo/ }).selectOption(type);
          await money(page, 'Importo del movimento', amount);
          await page.getByPlaceholder('Perché il denaro entra o esce').fill(reason);
          await page.getByRole('button', { name: 'Registra', exact: true }).click();
          await browserExpect(
            page.locator('.sd__mov-reason').filter({ hasText: reason }),
          ).toBeVisible();
        }
        await page.goto(`${server.url}/app/cassa/sessioni/${sessionId}/chiusura`);
        await browserExpect(page.getByText('Contante atteso', { exact: true })).toHaveCount(0);
        await money(page, 'Contante contato nel cassetto', '6');
        await page.getByRole('checkbox', { name: "Riconcilio anche l'elettronico" }).check();
        await money(page, 'Totale elettronico letto sul terminale', '0');
        await page.getByRole('button', { name: 'Chiudi la cassa', exact: true }).click();
        await browserExpect(
          page.getByRole('heading', { name: 'Cassa chiusa', exact: true }),
        ).toBeVisible();
        expect(
          await prisma.cashSession.findUniqueOrThrow({ where: { id: sessionId } }),
        ).toMatchObject({ status: 'closed', expectedCashMinor: 600, countedCashMinor: 600 });
        await page.screenshot({ path: resolve(artifacts, `${name}-closed.png`), fullPage: true });
        await page.goto(`${server.url}/app/cassa/operazioni`);
        await browserExpect(
          page.getByRole('heading', { name: 'Operazioni di cassa', exact: true }),
        ).toBeVisible();
        await browserExpect(page.getByText('36,56', { exact: false }).first()).toBeVisible();
        expect(
          await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),
        ).toBe(true);
        await page.screenshot({
          path: resolve(artifacts, `${name}-operations.png`),
          fullPage: true,
        });
        expect(pageErrors).toEqual([]);
        expect(external).toEqual([]);
        expect(server.errors).toEqual([]);
        expect(server.requests.filter((r) => r.status >= 400)).toEqual([]);
      } finally {
        await writeFile(
          resolve(artifacts, `${name}-requests.json`),
          JSON.stringify(
            { requests: server?.requests, errors: server?.errors, pageErrors, external },
            null,
            2,
          ),
        );
        await page
          .screenshot({ path: resolve(artifacts, `${name}-last.png`), fullPage: true })
          .catch(() => undefined);
        await context.tracing.stop({ path: resolve(artifacts, `${name}-trace.zip`) });
        await context.close();
        await server?.chiudi();
        await app?.chiudi();
      }
    });
  }
});
