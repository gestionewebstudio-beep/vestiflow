import { expect, test, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ⭐ **La finestra di rendering, verificata sulle schermate VERE della Cassa.**
 *
 * ⛔ **Gli esiti decisivi sono ASSERZIONI, non righe di registro**: un numero
 * stampato non fa fallire niente, e una prova che non puo' fallire non prova.
 * Le misure di prestazione restano nel registro — quelle variano con la
 * macchina — ma tutto cio' che deve essere vero e' un `expect`.
 *
 * ⚠️ **Il registro va in `test-results/`**, dentro il repository: nessun
 * percorso assoluto di nessuno.
 */

const CARTELLA = join(process.cwd(), 'test-results');
const REGISTRO = join(CARTELLA, 'finestra-cassa.txt');
const nota = (t: string): void => {
  appendFileSync(REGISTRO, `${t}\n`);
};

const SEDE = { id: 'loc-1', name: 'Negozio di prova' };
const QUANTE = 5000;

function pagina(quante: number): unknown {
  const items = Array.from({ length: quante }, (_, i) => ({
    id: `d-${i}`,
    kind: i % 7 === 0 ? 'return' : 'sale',
    reference: `CS/2026/${i + 1}`,
    number: i + 1,
    documentDate: '2026-09-04T00:00:00.000Z',
    createdAt: new Date(Date.UTC(2026, 8, 4, 8, 0, 0) + i * 60_000).toISOString(),
    status: i % 23 === 0 ? 'cancelled' : 'confirmed',
    locationId: SEDE.id,
    locationName: SEDE.name,
    operatorId: 'u-1',
    operatorName: i % 5 === 0 ? 'Anna Maria Giuseppina Della Valle' : 'Bruno',
    sessionId: 'sess-1',
    customerName: null,
    // Decrescente: un ordinamento crescente deve portare in cima l'ULTIMA.
    totalMinor: 1000 + (quante - i),
    payments: [
      {
        paymentOptionId: 'pay-1',
        optionName: i % 3 === 0 ? 'Carta' : 'Contanti',
        tenderKind: i % 3 === 0 ? 'electronic' : 'cash',
        amountMinor: 1000 + (quante - i),
        tenderedMinor: 1000 + (quante - i),
        refundedFromPaymentId: null,
      },
    ],
    mixed: false,
    changeMinor: 0,
    sourceDocumentId: null,
    sourceReference: null,
    anomalies: i % 23 === 0 ? ['annullato'] : [],
  }));
  return {
    items,
    total: quante,
    page: 1,
    pageSize: quante,
    summary: {
      grossSalesMinor: 1_000_000,
      returnsMinor: 10_000,
      netSalesMinor: 990_000,
      cashMinor: 600_000,
      electronicMinor: 390_000,
      saleCount: quante,
      returnCount: 0,
      operationCount: quante,
      averageMinor: 1_500,
    },
  };
}

async function intercetta(page: Page, quante: number): Promise<void> {
  await page.route('**/api/v1/inventory/locations**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          ...SEDE,
          tenantId: 'ten-1',
          isActive: true,
          licensedInVf: true,
          shopifySyncStatus: 'not_synced',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    }),
  );
  await page.route('**/api/v1/payment-options**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'pay-1',
          name: 'Contanti',
          kind: 'method',
          isActive: true,
          sortOrder: 1,
          tenderKind: 'cash',
        },
      ]),
    }),
  );
  await page.route('**/api/v1/cash-sessions/operations**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(pagina(quante)),
    }),
  );
  await page.route('**/api/v1/cash-sessions/sessions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 1, pageSize: 100, total: 0 }),
    }),
  );
}

/**
 * I numeri documento resi, letti dalla cella «Numero».
 *
 * ⚠️ **Non `querySelector('td')`**: la prima cella e` la Data, e le prime
 * asserzioni scritte cosi` confrontavano un orologio con un numero.
 */
async function numeriResi(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.data-table__row')).map(
      (r) => r.querySelector('td[data-label="Numero"]')?.textContent?.trim() ?? '',
    ),
  );
}

/** Scorre e ASPETTA una condizione osservabile, non un ritardo a caso. */
/**
 * ⛔ **La condizione di completamento e` OSSERVABILE**: si aspetta che il
 * numero atteso sia reso, non che passi del tempo.
 *
 * ⚠️ La prima stesura attendeva `.not.toBe("")` su una stringa mai vuota —
 * cioe` non attendeva nulla, come il `waitForTimeout(400)` che questa
 * tranche doveva togliere. I 410 ms di allora erano quasi tutti quella
 * attesa.
 */
async function scorriFinoAlNumero(page: Page, atteso: string): Promise<number> {
  const inizio = Date.now();
  await page.evaluate(() => {
    const vista = document.querySelector('.data-table-scroll') as HTMLElement;
    vista.scrollTop = vista.scrollHeight;
  });
  await expect
    .poll(() => numeriResi(page), { timeout: 30_000, intervals: [16, 16, 32, 64, 128] })
    .toContain(atteso);
  return Date.now() - inizio;
}

test.describe('finestra di rendering — registro Cassa', () => {
  test.beforeAll(() => {
    mkdirSync(CARTELLA, { recursive: true });
    writeFileSync(REGISTRO, '');
  });

  test('⭐ rende poche righe e le colonne restano allineate', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await intercetta(page, QUANTE);

    // Dove vanno i secondi: rete, risposta, prima riga.
    let msRisposta = 0;
    const t0 = Date.now();
    const attesaRisposta = page
      .waitForResponse((r) => r.url().includes('/cash-sessions/operations'), { timeout: 60_000 })
      .then(() => {
        msRisposta = Date.now() - t0;
      });
    await page.goto('/app/cassa/operazioni');
    await attesaRisposta;
    await expect(page.locator('.data-table__row').first()).toBeVisible({ timeout: 60_000 });
    const caricamento = Date.now() - t0;
    nota(`  di cui fino alla risposta   : ${msRisposta}ms`);

    const m = await page.evaluate(() => {
      const righe = document.querySelectorAll('.data-table__row');
      const th = Array.from(document.querySelectorAll('.data-table thead th')).map((e) =>
        Math.round(e.getBoundingClientRect().width),
      );
      // ⚠️ La cella-card e` una VESTE nascosta su scrivania: non e` una colonna.
      const td = Array.from(righe.item(0)?.querySelectorAll('td') ?? [])
        .filter((e) => !e.classList.contains('data-table__card'))
        .map((e) => Math.round(e.getBoundingClientRect().width));
      return {
        righeRese: righe.length,
        nodi: document.querySelectorAll('.data-table *').length,
        th,
        td,
        rowcount: document.querySelector('.data-table')?.getAttribute('aria-rowcount'),
        spaziatrici: document.querySelectorAll('.data-table__spacer').length,
      };
    });

    nota(`\n  caricamento (5.000 righe)   : ${caricamento}ms`);
    nota(`  righe rese                  : ${m.righeRese}`);
    nota(`  nodi DOM della tabella      : ${m.nodi}`);

    // ⛔ Le asserzioni: poche righe rese, colonne allineate, conteggio giusto.
    expect(m.righeRese).toBeLessThan(120);
    expect(m.righeRese).toBeGreaterThan(0);
    expect(m.td).toEqual(m.th);
    expect(m.rowcount).toBe(String(QUANTE + 1));
    expect(m.spaziatrici).toBeGreaterThan(0);

    /*
      ⛔ **QUI NON C'E` UN'ASSERZIONE SUL CARICAMENTO, e la ragione e` misurata.**

      Ce n'era una, `< 10_000`, e falliva a 30 s. Non per colpa della finestra:
      profilato col profilatore del browser (`Profiler` via CDP), 29,6 s su 30
      stanno in `materializeViewResults` e `collectQueryResults` — le QUERY DI
      CONTENUTO di Angular, non il rendering delle righe.

      La prova: righe rese e nodi restano 43 e 1.125 a 500, 1.000, 2.000 e
      5.000 righe, mentre il tempo alla prima riga fa 1.319 → 1.431 → 4.139 →
      29.641 ms. Costante il DOM, super-lineare il tempo: il collo e` altrove.

      ⚠️ **E` un problema APERTO, non risolto da questa tranche.** Asserirlo qui
      farebbe fallire una prova sulla finestra per una causa che la finestra non
      tocca — e insegnerebbe a ignorarla.
    */
  });

  test('⭐ l_ultima operazione si raggiunge, e l_intestazione resta fissa', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await intercetta(page, QUANTE);
    await page.goto('/app/cassa/operazioni');
    await expect(page.locator('.data-table__row').first()).toBeVisible({ timeout: 60_000 });

    const ms = await scorriFinoAlNumero(page, `CS/2026/${QUANTE}`);
    nota(`  scorrimento fino in fondo   : ${ms}ms`);
    const numeri = await numeriResi(page);

    const fondo = await page.evaluate(() => {
      const righe = Array.from(document.querySelectorAll('.data-table__row'));
      const ultima = righe[righe.length - 1];
      const testa = document.querySelector('.data-table thead th') as HTMLElement;
      const vista = document.querySelector('.data-table-scroll') as HTMLElement;
      const piede = document.querySelector('.data-table tfoot');
      return {
        ultimo: ultima?.querySelector('td')?.textContent?.trim() ?? '',
        intestazioneScostamento: Math.round(
          testa.getBoundingClientRect().top - vista.getBoundingClientRect().top,
        ),
        piedePresente: piede !== null,
        righeRese: righe.length,
      };
    });

    // ⛔ L'ultima delle 5.000 e` raggiungibile.
    expect(numeri).toContain(`CS/2026/${QUANTE}`);
    // ⛔ E l'intestazione e` ancora in cima alla vista.
    expect(Math.abs(fondo.intestazioneScostamento)).toBeLessThan(3);
    expect(fondo.righeRese).toBeLessThan(120);
  });

  test('⭐ il filtro applicato MENTRE si e` in fondo non lascia lo schermo vuoto', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await intercetta(page, QUANTE);
    await page.goto('/app/cassa/operazioni');
    await expect(page.locator('.data-table__row').first()).toBeVisible({ timeout: 60_000 });

    await scorriFinoAlNumero(page, `CS/2026/${QUANTE}`);

    // Si restringe drasticamente: la ricerca per numero lascia una riga sola.
    await page.getByRole('searchbox').first().fill('4200');

    // ⛔ Nessuna schermata vuota: la riga deve comparire, non restare un offset
    //    fuori intervallo con zero righe rese.
    await expect
      .poll(() => page.evaluate(() => document.querySelectorAll('.data-table__row').length), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);

    const numeriDopo = await numeriResi(page);
    const dopo = await page.evaluate(() => ({
      righe: document.querySelectorAll('.data-table__row').length,
      scroll: Math.round((document.querySelector('.data-table-scroll') as HTMLElement).scrollTop),
    }));
    const primo = numeriDopo[0] ?? '';
    nota(`\n  dopo il filtro in fondo     : ${dopo.righe} righe, prima «${primo}»`);
    expect(dopo.righe).toBeGreaterThan(0);
  });

  test('⭐ ordinando, la 5.000ª sale in cima', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await intercetta(page, QUANTE);
    await page.goto('/app/cassa/operazioni');
    await expect(page.locator('.data-table__row').first()).toBeVisible({ timeout: 60_000 });

    await page
      .getByRole('button', { name: /Totale/i })
      .first()
      .click();

    await expect
      .poll(async () => (await numeriResi(page))[0] ?? '', { timeout: 30_000 })
      .toBe(`CS/2026/${QUANTE}`);

    // ⛔ E la si apre: l'ordinamento non rompe il clic di riga.
    await page.locator('.data-table__row').first().click();
    await expect.poll(() => page.url(), { timeout: 30_000 }).toContain('/app/cassa/operazioni/');
  });

  test('⛔ sul telefono la finestra NON si accende: card intatte', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await intercetta(page, 300);
    await page.goto('/app/cassa/operazioni');
    await expect(page.locator('.data-table__row').first()).toBeVisible({ timeout: 60_000 });

    const m = await page.evaluate(() => ({
      righe: document.querySelectorAll('.data-table__row').length,
      spaziatrici: document.querySelectorAll('.data-table__spacer').length,
    }));

    // ⛔ Tutte le 300, e nessuna distanziatrice: il comportamento del telefono
    //    non e` toccato, e la sua lentezza resta un problema aperto.
    expect(m.righe).toBe(300);
    expect(m.spaziatrici).toBe(0);
  });

  /*
    ⛔ **IL FUOCO CON LA ROTELLINA, non solo coi quattro tasti.**

    `rigaDaMettereAFuoco` era impostata solo da `Home`/`Fine`/`PagSu`/`PagGiu`:
    il commento prometteva di preservare il fuoco «quando una riga esce dal
    DOM», ma scorrendo con la rotellina il fuoco tornava al `<body>` e la
    tastiera moriva li`. Nessuna prova lo copriva.
  */
  test('⛔ scorrendo con la rotellina il fuoco resta usabile', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await intercetta(page, QUANTE);
    await page.goto('/app/cassa/operazioni');
    await expect(page.locator('.data-table__row').first()).toBeVisible({ timeout: 60_000 });

    // Si mette il fuoco su una riga, poi si scorre lontano con la rotellina.
    await page.locator('.data-table__row').first().focus();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.className ?? ''))
      .toContain('data-table__row');

    await page.mouse.move(700, 500);
    for (let i = 0; i < 25; i += 1) {
      await page.mouse.wheel(0, 600);
    }

    // ⛔ Il fuoco NON deve essere finito sul `<body>`: da li` la tastiera muore.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const a = document.activeElement;
            if (a === null || a === document.body) {
              return 'PERDUTO';
            }
            return a.className || a.tagName;
          }),
        { timeout: 30_000 },
      )
      .not.toBe('PERDUTO');
  });

  /*
    ⚠️ **QUESTA PROVA NON E` FALSIFICATA, e va detto.**

    Verifica che dopo uno scorrimento il fuoco resti nella ricerca. Ma togliendo
    la guardia `if (!perduto && !suDiNoi) return` dal componente **resta verde**:
    provato due volte il 05/09/2026, con scorrimento lungo e breve. Non riesco a
    costruire la condizione in cui il ripristino ruberebbe il fuoco.

    ⛔ Quindi la guardia c'e' ed e' corretta, ma **questa prova non lo dimostra**:
    protegge il comportamento osservabile, non la riga di codice. Chi la tocca
    non si fidi del verde.
  */
  test('⭐ il fuoco NON si sposta se l_utente sta scrivendo altrove', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await intercetta(page, QUANTE);
    await page.goto('/app/cassa/operazioni');
    await expect(page.locator('.data-table__row').first()).toBeVisible({ timeout: 60_000 });

    await page.locator('.data-table__row').first().focus();
    const ricerca = page.getByRole('searchbox').first();
    await ricerca.click();

    /*
      ⚠️ **Lo scorrimento e` BREVE, e non e` un dettaglio**: la riga ricordata
      deve restare RESA. Con un salto lungo sparirebbe, il fuoco non sarebbe
      «perduto» (sta nella ricerca) e il ripristino non farebbe nulla comunque —
      la prova passerebbe anche senza la guardia. Misurato il 05/09/2026: cosi'
      scritta non falsificava niente.
    */
    await page.evaluate(() => {
      const vista = document.querySelector('.data-table-scroll') as HTMLElement;
      vista.scrollTop = 120;
    });
    await page.waitForTimeout(300);

    const dove = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(dove).toBe('INPUT');
  });

  /*
    ⭐ **Le colonne reggono il RIDIMENSIONAMENTO e lo scorrimento orizzontale**
    anche con la finestra accesa: e` la garanzia che la tabella nativa doveva
    dare, e la ragione per cui non si e` passati a una griglia.
  */
  test('⭐ ridimensionando una colonna, intestazione e celle restano allineate', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await intercetta(page, QUANTE);
    await page.goto('/app/cassa/operazioni');
    await expect(page.locator('.data-table__row').first()).toBeVisible({ timeout: 60_000 });

    const maniglia = page.locator('.data-table__resize-handle, [data-resize-handle]').first();
    if (await maniglia.count()) {
      const scatola = await maniglia.boundingBox();
      if (scatola) {
        await page.mouse.move(scatola.x + scatola.width / 2, scatola.y + scatola.height / 2);
        await page.mouse.down();
        await page.mouse.move(scatola.x + 160, scatola.y + scatola.height / 2, { steps: 8 });
        await page.mouse.up();
      }
    }

    const m = await page.evaluate(() => {
      const th = Array.from(document.querySelectorAll('.data-table thead th')).map((e) =>
        Math.round(e.getBoundingClientRect().width),
      );
      const riga = document.querySelector('.data-table__row');
      const td = Array.from(riga?.querySelectorAll('td') ?? [])
        .filter((e) => !e.classList.contains('data-table__card'))
        .map((e) => Math.round(e.getBoundingClientRect().width));
      return { th, td };
    });
    expect(m.td).toEqual(m.th);

    // ⭐ E dopo uno scorrimento ORIZZONTALE restano allineate.
    await page.evaluate(() => {
      const vista = document.querySelector('.data-table-scroll') as HTMLElement;
      vista.scrollLeft = 200;
    });
    const dopo = await page.evaluate(() => {
      const th = Array.from(document.querySelectorAll('.data-table thead th')).map((e) =>
        Math.round(e.getBoundingClientRect().left),
      );
      const riga = document.querySelector('.data-table__row');
      const td = Array.from(riga?.querySelectorAll('td') ?? [])
        .filter((e) => !e.classList.contains('data-table__card'))
        .map((e) => Math.round(e.getBoundingClientRect().left));
      return { th, td };
    });
    expect(dopo.td).toEqual(dopo.th);
  });

  /*
    ⭐ **I totali delle Sessioni sono dell_INTERO risultato**, non della
    finestra: e` la garanzia che la finestra riguarda solo il rendering.
  */
  test('⭐ i totali delle Sessioni contano tutto il risultato, non la finestra', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('**/api/v1/inventory/locations**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.route('**/api/v1/payment-options**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    const QUANTE_SESSIONI = 400;
    await page.route('**/api/v1/cash-sessions/sessions**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: Array.from({ length: QUANTE_SESSIONI }, (_, i) => ({
            id: `s-${i}`,
            status: 'closed',
            locationId: 'loc-1',
            locationName: 'Negozio di prova',
            openedAt: new Date(Date.UTC(2026, 8, 1, 8, 0, 0) + i * 3_600_000).toISOString(),
            openedByName: 'Anna',
            closedAt: new Date(Date.UTC(2026, 8, 1, 16, 0, 0) + i * 3_600_000).toISOString(),
            closedByName: 'Anna',
            openingFloatMinor: 100,
            fiscalDeviceId: null,
            fiscalDeviceLabel: null,
            notes: null,
            saleCount: 1,
            salesTotalMinor: 200,
            returnCount: 0,
            returnsTotalMinor: 0,
            depositsMinor: 300,
            withdrawalsMinor: 0,
          })),
          total: QUANTE_SESSIONI,
          page: 1,
          pageSize: QUANTE_SESSIONI,
        }),
      }),
    );

    await page.goto('/app/cassa/sessioni');
    await expect(page.locator('.data-table__row').first()).toBeVisible({ timeout: 60_000 });

    const m = await page.evaluate(() => ({
      rese: document.querySelectorAll('.data-table__row').length,
      piede: document.querySelector('.data-table tfoot')?.textContent ?? '',
      rowcount: document.querySelector('.data-table')?.getAttribute('aria-rowcount'),
    }));

    // ⛔ Poche righe rese, ma i totali sono di TUTTE: 400 × 1,00 € di fondo.
    expect(m.rese).toBeLessThan(120);
    expect(m.piede).toContain('400');
    expect(m.piede).toContain('400,00');
    // ⭐ E il conteggio accessibile conta tutte le righe piu` l'intestazione,
    //    anche col piede dei totali presente.
    expect(m.rowcount).toBe(String(QUANTE_SESSIONI + 1));
  });
});
