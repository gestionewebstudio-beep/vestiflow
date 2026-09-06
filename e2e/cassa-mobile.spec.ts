import { expect } from '@playwright/test';

import { intercetta, pagina } from './helpers/cash-register-fixtures';
import { test } from './helpers/isolated-test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('mobile: date e calendari restano interamente dentro entrambi i registri', async ({
  page,
}, info) => {
  await intercetta(page, 3);
  for (const register of ['operazioni', 'sessioni']) {
    await page.goto(`/app/cassa/${register}`);
    for (const width of [360, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      const fields = page.locator('[period] app-date-input');
      await expect(fields).toHaveCount(2);
      for (const field of await fields.all()) {
        await expect(field).toBeInViewport({ ratio: 1 });
        const bounds = (await field.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      }
      for (const name of ['Dal', 'Al']) {
        await fields
          .filter({ has: page.getByRole('textbox', { name, exact: true }) })
          .getByRole('button', { name: 'Apri calendario' })
          .tap();
        const calendar = page.getByRole('dialog', { name, exact: true });
        await expect(calendar).toBeInViewport({ ratio: 1 });
        const bounds = (await calendar.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        await page.screenshot({ path: info.outputPath(`${register}-${width}-${name}.png`) });
        await page.getByRole('heading', { level: 1 }).tap();
        await expect(calendar).toHaveCount(0);
      }
    }
  }
});

test('mobile: 5.000 card complete senza stallo iniziale', async ({ page }, info) => {
  await intercetta(page, 5000);
  // Scalda i moduli senza pagare due volte il difetto che questa prova cerca.
  await page.goto('/app/dashboard');
  const start = Date.now();
  await page.goto('/app/cassa/operazioni');
  /*
    ⚠️ **Qui c'era `toHaveCount(5000)` sulle righe RESE**, e misurava la
    completezza contando i nodi. Dal 06/09/2026 non si può più: con la finestra
    accesa i nodi sono una manciata **per costruzione**, e contarli
    misurerebbe la finestra invece del risultato.

    ⭐ **La completezza si verifica dove ora vive**: il conteggio dichiarato in
    testata — che viene dal riepilogo del server, sullo stesso filtro — e la
    raggiungibilità dell'ultima card, provata più sotto scorrendo fino in fondo.
  */
  await expect(page.locator('.data-table__card').first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('5000 operazioni')).toBeVisible();
  const loadMs = Date.now() - start;
  await info.attach('caricamento-mobile', {
    body: JSON.stringify({ loadMs, rows: await page.locator('.data-table__row').count() }),
    contentType: 'application/json',
  });
  await page.screenshot({ path: info.outputPath('mobile-inizio.png') });
  /*
    ⛔ **Qui c'era `expect(loadMs).toBeLessThan(10_000)`, e NON è stato
    cancellato: è stato SPOSTATO** in `cassa-prestazioni.spec.ts`, che gira in
    un passo CI dichiarato non bloccante (deroga del 06/09/2026, `DA-FARE`).

    ⭐ **Tutto il resto di questa prova resta obbligatorio**, ed è la parte che
    dice se la schermata FUNZIONA: il risultato è completo — 5.000 dichiarate in
    testata — la finestra è accesa, l'ultima card si raggiunge e l'operazione si
    apre.

    ⚠️ **«la finestra resta spenta sotto `lg`» era scritto qui, ed è superato**
    dalla tranche del 06/09/2026: ora è accesa, e le distanziatrici lo provano.

    ⚠️ **Il numero continua a essere misurato e pubblicato**: `loadMs` sta
    nell'allegato qui sopra a ogni esecuzione. La deroga riguarda il CANCELLO,
    non la misura — «limite noto e temporaneamente accettato» non vuol dire
    «smettiamo di guardarlo».
  */
  /*
    ⚠️ **Qui c'era `toHaveCount(0)` sulle distanziatrici**, e diceva il vero
    finché la finestra sotto `lg` era spenta. Dal 06/09/2026 è accesa: le
    distanziatrici ci sono, ed è il segno che sta funzionando.

    ⛔ **Quello che NON cambia è la completezza**: la testata dichiara 5.000, e
    l'ultima card si raggiunge — le due asserzioni che contano le RIGHE DEI
    DATI invece dei nodi resi.
  */
  await expect(page.locator('.data-table__spacer').first()).toBeAttached();
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('.data-table-scroll')!;
    scroller.scrollTop = scroller.scrollHeight;
  });
  const last = page.locator('.data-table__row[data-row-id="d-4999"]');
  await expect(last).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: info.outputPath('mobile-fondo.png') });
  const operation = pagina(5000).items[4999]!;
  await page.route(`**/api/v1/cash-sessions/operations/${operation.id}`, (route) =>
    route.fulfill({
      json: {
        ...operation,
        taxableMinor: 820,
        taxMinor: 181,
        notes: null,
        lines: [],
        session: null,
        relatedReturns: [],
        stockMovements: [],
      },
    }),
  );
  await last.tap();
  await expect(page).toHaveURL(/\/app\/cassa\/operazioni\/d-4999$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(operation.reference);
});

test('mobile: filtro in fondo, azzeramento e testi lunghi a diverse larghezze', async ({
  page,
}, info) => {
  await intercetta(page, 300);
  await page.goto('/app/cassa/operazioni');
  /*
    ⚠️ **Contava le righe RESE, e con la finestra accesa non sono piu' 300.**
    La completezza si legge in testata, che viene dal riepilogo del server.
  */
  await expect(page.getByText('300 operazioni')).toBeVisible();
  await expect(page.locator('.data-table__card').first()).toBeVisible();
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>('.data-table__card'));
      const words = document.querySelector<HTMLElement>('.list-card__words')!;
      const scroller = document.querySelector<HTMLElement>('.data-table-scroll')!;
      return {
        heights: rows.map((row) => Math.round(row.getBoundingClientRect().height)),
        text: words.textContent,
        clippedText: words.scrollHeight > words.clientHeight + 1,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        scrollOverflow: scroller.scrollWidth - scroller.clientWidth,
      };
    });
    // A 768px anche il nome lungo entra su una riga; sul telefono va a capo.
    if (viewport.width < 768) expect(new Set(geometry.heights).size).toBeGreaterThan(1);
    expect(geometry.text).toContain('Anna Maria Giuseppina Della Valle');
    expect(geometry.clippedText).toBe(false);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.scrollOverflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`mobile-${viewport.width}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('.data-table-scroll')!;
    scroller.scrollTop = scroller.scrollHeight;
  });
  await expect(page.locator('.data-table__row[data-row-id="d-299"]')).toBeInViewport();
  await page.getByRole('button', { name: 'Filtri', exact: true }).tap();
  await page.getByRole('button', { name: 'Filtra per Numero', exact: true }).tap();
  await page.getByLabel('Cerca fra i valori di Numero', { exact: true }).fill('CS/2026/42');
  await page.getByRole('button', { name: 'Vedi risultati', exact: true }).tap();
  await expect(page.locator('.data-table__row')).toHaveCount(1);
  await expect(page.locator('.data-table__row')).toHaveAttribute('data-row-id', 'd-41');
  await expect(page.locator('.data-table__row')).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Filtri', exact: true }).tap();
  await page.getByRole('button', { name: /Azzera/ }).tap();
  await page.getByRole('button', { name: 'Vedi risultati', exact: true }).tap();
  // Azzerato il filtro, il risultato torna completo: lo dice la testata.
  await expect(page.getByText('300 operazioni')).toBeVisible();
});
