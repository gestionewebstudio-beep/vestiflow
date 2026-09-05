import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium, expect as browserExpect, type Browser, type Page } from '@playwright/test';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { avviaApp, type AppIntegrazione } from './app';
import { avviaBrowserServer } from './browser-server';
import { creaDatasetCassa, fotografaCassa } from './cassa.fixture';
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
  async function recoverUnreadable(
    page: Page,
    operation: 'checkout' | 'returns',
    documentId: string,
  ) {
    const before = await fotografaCassa(prisma);
    const intentsBefore = await prisma.creationIntent.findMany({ orderBy: { id: 'asc' } });
    const saved = await page.evaluate((kind) => {
      const key = Object.keys(sessionStorage).find(
        (key) => key.startsWith('vestiflow.cash.pending.v1:') && key.endsWith(`:${kind}`),
      )!;
      return { key, raw: sessionStorage.getItem(key)! };
    }, operation);
    const setRaw = async (raw: string) => {
      await page.evaluate(({ key, raw }) => sessionStorage.setItem(key, raw), {
        key: saved.key,
        raw,
      });
      await page.reload();
      await browserExpect(page.getByText('Esito non confermato', { exact: true })).toBeVisible();
    };
    // JSON rotto: il testo resta consultabile; nessuna ricerca con identità indovinata.
    await setRaw(saved.raw.slice(0, -1));
    await browserExpect(
      page.getByRole('button', { name: 'Verifica esito sul server' }),
    ).toHaveCount(0);
    await browserExpect(
      page.getByRole('button', { name: /Concludi (vendita|reso)/ }),
    ).toBeDisabled();
    // Una versione sconosciuta permette solo consultazione, mai chiusura o replay.
    const parsed = JSON.parse(saved.raw) as { version: number; payload: { lines: unknown } };
    await setRaw(JSON.stringify({ ...parsed, version: 99 }));
    await page.getByRole('button', { name: 'Verifica esito sul server' }).click();
    await browserExpect(page.getByText(/versione o contesto locale incompatibili/)).toBeVisible();
    await browserExpect(
      page.getByRole('button', { name: 'Conferma recupero dell’operazione' }),
    ).toHaveCount(0);
    // Identità e contesto v1 integri, contenuto illeggibile: recupero autorizzato.
    parsed.payload.lines = 'contenuto danneggiato';
    const damagedRaw = JSON.stringify(parsed);
    await setRaw(damagedRaw);
    // Un draft nuovo resta in revisione dopo il recupero, senza essere cancellato o reinviato.
    if (operation === 'checkout') {
      await scan(page);
      await page.getByRole('textbox', { name: 'Quantità di Articolo Cassa TEST' }).fill('');
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByRole('button', { name: 'Verifica esito sul server' }).click();
      await browserExpect(
        page.getByRole('link', { name: /Apri operazione registrata/ }),
      ).toBeVisible();
    }
    const confirm = page.getByRole('button', { name: 'Conferma recupero dell’operazione' });
    await browserExpect(confirm).toBeDisabled();
    await page.getByText('Dati locali conservati per la verifica', { exact: true }).click();
    expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(
      true,
    );
    const originalData = page.getByRole('textbox', { name: 'Dati originali dell’invio' });
    await originalData.scrollIntoViewIfNeeded();
    await browserExpect(originalData).toBeInViewport();
    await browserExpect(originalData).toHaveValue(damagedRaw);
    await page.screenshot({
      path: resolve(artifacts, `${page.viewportSize()!.width}-${operation}-unreadable.png`),
      fullPage: true,
    });
    const popupPromise = page.context().waitForEvent('page');
    await page.getByRole('link', { name: /Apri operazione registrata/ }).click();
    const popup = await popupPromise;
    await browserExpect(popup).toHaveURL(new RegExp(`/app/cassa/operazioni/${documentId}$`));
    await browserExpect(popup.getByRole('heading', { level: 1 })).toBeVisible();
    await popup.close();
    await browserExpect(confirm).toBeEnabled();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), saved.key)).toBe(damagedRaw);
    await confirm.click();
    await browserExpect(page.getByText(/Pendenza locale chiusa dopo il recupero/)).toBeVisible();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), saved.key)).toBeNull();
    const archive = await page.evaluate(
      (key) =>
        sessionStorage.getItem(
          Object.keys(sessionStorage).find((entry) => entry.startsWith(`${key}:recovered:`))!,
        ),
      saved.key,
    );
    expect(JSON.parse(archive!).originalRaw).toBe(damagedRaw);
    expect(await fotografaCassa(prisma)).toBe(before);
    expect(await prisma.creationIntent.findMany({ orderBy: { id: 'asc' } })).toEqual(intentsBefore);
    expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(
      true,
    );
    if (operation === 'checkout') {
      await page.getByRole('button', { name: 'Rivedi carrello conservato' }).click();
      await browserExpect(
        page.getByRole('textbox', { name: 'Quantità di Articolo Cassa TEST' }),
      ).toHaveValue('');
      await browserExpect(page.getByRole('button', { name: 'Concludi vendita' })).toBeDisabled();
    }
  }

  for (const { mobile, damaged } of [false, true].flatMap((mobile) =>
    [false, true].map((damaged) => ({ mobile, damaged })),
  )) {
    const name = `${mobile ? 'mobile' : 'desktop'}${damaged ? '-unreadable' : ''}`;
    it(`${name}: digitazione quantità, invii incerti, resi 1+2 e quadratura`, async () => {
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
        const quantity = page.getByRole('textbox', { name: 'Quantità di Articolo Cassa TEST' });
        const conclude = page.getByRole('button', { name: 'Concludi vendita' });
        await page.getByRole('button', { name: 'Contanti TEST', exact: true }).click();
        await browserExpect(quantity).toHaveValue('1');
        if (mobile) {
          const inputBox = await quantity.boundingBox();
          expect(inputBox!.height).toBeGreaterThanOrEqual(44);
          const removeBox = await page
            .getByRole('button', { name: 'Togli Articolo Cassa TEST', exact: true })
            .boundingBox();
          expect(removeBox!.x).toBeGreaterThanOrEqual(0);
          expect(removeBox!.x + removeBox!.width).toBeLessThanOrEqual(390);
        }
        await quantity.click();
        await quantity.press('End');
        await quantity.press('Backspace');
        await browserExpect(quantity).toHaveValue('');
        await quantity.press('Tab');
        await browserExpect(quantity).toHaveValue('');
        await browserExpect(quantity).toHaveAttribute('aria-invalid', 'true');
        await browserExpect(conclude).toBeDisabled();
        await browserExpect(page.locator('.tender__total').first()).toContainText('12,19');
        await quantity.pressSequentially('12');
        await browserExpect(quantity).toHaveValue('12');
        await browserExpect(page.locator('.tender__total').first()).toContainText('146,24');
        await browserExpect(
          page.getByRole('textbox', { name: 'Importo Contanti TEST', exact: true }),
        ).toHaveValue('12,19');
        await browserExpect(conclude).toBeDisabled();
        await quantity.press('Control+A');
        await quantity.pressSequentially('7');
        await browserExpect(quantity).toHaveValue('7');
        // Incolla reale dal clipboard del browser; non assegnazione a input.value.
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
          origin: server.url,
        });
        await page.evaluate("navigator.clipboard.writeText('12')");
        await quantity.press('Control+A');
        await quantity.press('Control+V');
        await browserExpect(quantity).toHaveValue('12');
        for (const draft of ['0', '-1', '1.5', '1e2', 'abc', '2147483648', '9007199254740992']) {
          await quantity.press('Control+A');
          await quantity.pressSequentially(draft);
          await quantity.press('Tab');
          await browserExpect(quantity).toHaveValue(draft);
          await browserExpect(quantity).toHaveAttribute('aria-invalid', 'true');
          await browserExpect(conclude).toBeDisabled();
        }
        await quantity.press('Control+A');
        await quantity.press('Backspace');
        await scan(page);
        await browserExpect(quantity).toHaveValue('');
        await browserExpect(
          page.getByText(/l’articolo scansionato non è stato aggiunto/),
        ).toBeVisible();
        expect(server.requests.filter((r) => r.path.endsWith('/checkout'))).toHaveLength(0);
        expect(
          await prisma.document.count({
            where: { tenantId: IDS.tenantA, cashSessionId: { not: null } },
          }),
        ).toBe(0);
        await page.screenshot({
          path: resolve(artifacts, `${name}-quantity-invalid.png`),
          fullPage: true,
        });
        expect(
          await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),
        ).toBe(true);
        await quantity.pressSequentially('1');
        await scan(page);
        await scan(page);
        await browserExpect(quantity).toHaveValue('3');
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
        // Stessa quantità valida del comando originale, ma una modifica incompleta:
        // il recupero deve conservare anche questo draft, senza creare un documento nuovo.
        await quantity.click();
        await quantity.press('Control+A');
        await quantity.press('Backspace');
        await browserExpect(page.getByRole('button', { name: 'Concludi vendita' })).toBeDisabled();
        if (damaged) {
          await recoverUnreadable(page, 'checkout', sale.id);
          expect(server.requests.filter((r) => r.path.endsWith('/checkout'))).toHaveLength(1);
          await page.screenshot({
            path: resolve(artifacts, `${name}-recovery.png`),
            fullPage: true,
          });
        } else {
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
          await browserExpect(quantity).toHaveValue('');
          await browserExpect(conclude).toBeDisabled();
          await browserExpect(
            page.getByRole('textbox', { name: 'Importo Contanti TEST', exact: true }),
          ).toHaveValue('10,00');
          await browserExpect(
            page.getByRole('textbox', { name: 'Importo Carta TEST', exact: true }),
          ).toHaveValue('26,56');
          await quantity.pressSequentially('4');
          await browserExpect(quantity).toHaveValue('4');
          await browserExpect(conclude).toBeDisabled();
          await page.screenshot({
            path: resolve(artifacts, `${name}-recovery.png`),
            fullPage: true,
          });
          await page
            .getByRole('button', { name: 'Togli Articolo Cassa TEST', exact: true })
            .click();
          await browserExpect(quantity).toHaveCount(0);
        }

        await page.goto(`${server.url}/app/cassa/operazioni/${sale.id}/reso`);
        await page.getByRole('spinbutton', { name: /^Quantità da rendere/ }).fill('1');
        await browserExpect(page.locator('.reso__total')).toContainText('12,19');
        await page.getByRole('button', { name: 'Proponi', exact: true }).click();
        await page.getByRole('checkbox', { name: 'Storno confermato sul terminale' }).check();
        await page.getByPlaceholder('Perché la merce rientra').fill('Primo pezzo, risposta persa');
        await loseResponseOnce(page, '/cash-sessions/returns');
        await page.getByRole('button', { name: 'Concludi reso' }).click();
        await browserExpect(page.getByText('Esito da verificare', { exact: true })).toBeVisible();
        if (damaged) {
          const returned = await prisma.document.findFirstOrThrow({
            where: { cashSessionId: sessionId, type: 'store_return' },
          });
          await recoverUnreadable(page, 'returns', returned.id);
        } else {
          await page.reload();
          await page.getByRole('button', { name: "Recupera l'esito" }).click();
        }
        await browserExpect(page.getByRole('heading', { name: 'Reso registrato' })).toBeVisible();
        const returns = server.requests.filter(
          (r) => r.path.endsWith('/returns') && r.method === 'POST',
        );
        expect(returns).toHaveLength(damaged ? 1 : 2);
        if (!damaged) expect(returns[1]?.body).toEqual(returns[0]?.body);
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
