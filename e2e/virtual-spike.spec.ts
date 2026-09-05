import { expect, type Page } from '@playwright/test';
import { test } from './helpers/isolated-test';
import { intercetta, pagina } from './helpers/cash-register-fixtures';
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

const QUANTE = 5000;

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
    // MISURA: quante righe esistono al MASSIMO durante il caricamento?
    await page.addInitScript(() => {
      (window as unknown as { __picco: number }).__picco = 0;
      const create = new Set<string>();
      Object.assign(window, { __righeCreate: create });
      const setAttribute = Object.getOwnPropertyDescriptor(Element.prototype, 'setAttribute')!
        .value as (this: Element, name: string, value: string) => void;
      Element.prototype.setAttribute = function (name, value): void {
        if (name === 'data-row-id') create.add(value);
        setAttribute.call(this, name, value);
      };
      const osserva = (): void => {
        const n = document.querySelectorAll('.data-table__row').length;
        const w = window as unknown as { __picco: number };
        if (n > w.__picco) {
          w.__picco = n;
        }
        requestAnimationFrame(osserva);
      };
      requestAnimationFrame(osserva);
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
    const picco = await page.evaluate(() => (window as unknown as { __picco: number }).__picco);
    nota(`  PICCO di righe rese         : ${picco}`);

    // ⛔ Le asserzioni: poche righe rese, colonne allineate, conteggio giusto.
    expect(m.righeRese).toBeLessThan(120);
    expect(m.righeRese).toBeGreaterThan(0);
    expect(m.td).toEqual(m.th);
    expect(m.rowcount).toBe(String(QUANTE + 1));
    expect(m.spaziatrici).toBeGreaterThan(0);
    // Un campione rAF può perdere creazione e rimozione nello stesso frame.
    // Contiamo anche le identità istanziate, comprese quelle ancora staccate dal DOM.
    const create = await page.evaluate(
      () => (window as unknown as { __righeCreate: Set<string> }).__righeCreate.size,
    );
    nota(`  identità di riga istanziate  : ${create}`);
    expect(create).toBeLessThan(120);
    expect(caricamento).toBeLessThan(10_000);
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

    // Filtro CLIENT sull'intero risultato: la riga 4200 non è nella finestra finale.
    // La vecchia prova usava una ricerca ignorata dalla fixture e verificava solo > 0.
    await page.getByRole('button', { name: /^Filtri/ }).click();
    await page.getByRole('button', { name: 'Filtra per Numero', exact: true }).click();
    await page.getByLabel('Cerca fra i valori di Numero', { exact: true }).fill('CS/2026/4200');
    await expect(page.locator('.data-table__row')).toHaveCount(1);
    await expect(page.locator('.data-table__row')).toHaveAttribute('data-row-id', 'd-4199');

    const numeriDopo = await numeriResi(page);
    const dopo = await page.evaluate(() => ({
      righe: document.querySelectorAll('.data-table__row').length,
      scroll: Math.round((document.querySelector('.data-table-scroll') as HTMLElement).scrollTop),
    }));
    const primo = numeriDopo[0] ?? '';
    nota(`\n  dopo il filtro in fondo     : ${dopo.righe} righe, prima «${primo}»`);
    expect(primo).toBe('CS/2026/4200');
    expect(dopo.scroll).toBe(0);
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
    const ultima = pagina(QUANTE).items[QUANTE - 1]!;
    await page.route(`**/api/v1/cash-sessions/operations/${ultima.id}`, (route) =>
      route.fulfill({
        json: {
          ...ultima,
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
    await page.locator('.data-table__row').first().click();
    await expect(page).toHaveURL(new RegExp(`/app/cassa/operazioni/${ultima.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(ultima.reference);
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

  test('resize, zoom e passaggio compatto conservano righe, testo e finestra', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await intercetta(page, 300);
    await page.goto('/app/cassa/operazioni');
    await expect(page.locator('.data-table__row').first()).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 700 });
    await scorriFinoAlNumero(page, 'CS/2026/300');
    await expect(page.locator('.data-table__row[data-row-id="d-299"]')).toBeInViewport();
    // Zoom del layout del contenitore: cambia la misura letta da ResizeObserver.
    await page.evaluate(() => {
      document.body.style.zoom = '1.25';
    });
    await page.locator('.data-table__row').last().focus();
    await page.keyboard.press('Home');
    await expect(page.locator('.data-table__row[data-row-id="d-0"]')).toBeFocused();
    const pageRows = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('.data-table-scroll')!;
      const row = scroller.querySelector('.data-table__row')!;
      return Math.floor(scroller.clientHeight / Math.round(row.getBoundingClientRect().height));
    });
    await page.keyboard.press('PageDown');
    await expect(page.locator(`.data-table__row[data-row-id="d-${pageRows}"]`)).toBeFocused();
    await page.keyboard.press('PageUp');
    await expect(page.locator('.data-table__row[data-row-id="d-0"]')).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.locator('.data-table__row[data-row-id="d-299"]')).toBeFocused();
    await page.evaluate(() => {
      document.body.style.zoom = '';
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.data-table__row')).toHaveCount(300);
    await expect(page.locator('.data-table__spacer')).toHaveCount(0);
    const heights = await page
      .locator('.data-table__card')
      .evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().height)));
    expect(new Set(heights).size).toBeGreaterThan(1);
    await expect(
      page.locator('.data-table__row[data-row-id="d-0"] .list-card__words'),
    ).toContainText('Anna Maria Giuseppina Della Valle');
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => page.locator('.data-table__row').count()).toBeLessThan(120);
    await scorriFinoAlNumero(page, 'CS/2026/300');
    await expect(page.locator('.data-table__row[data-row-id="d-299"]')).toBeInViewport();
  });

  test('Home e Fine muovono il cursore del campo dentro la cella', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await intercetta(page, QUANTE);
    await page.goto('/app/cassa/operazioni');
    // Inserito solo dalla prova: esercita un controllo editabile nel motore comune,
    // senza aggiungere un campo fittizio al registro Cassa.
    await page
      .locator('.data-table__row td')
      .first()
      .evaluate((cell) => {
        const input = document.createElement('input');
        input.setAttribute('aria-label', 'Campo di prova nella cella');
        input.value = 'abcdef';
        cell.append(input);
      });
    const control = page.getByRole('textbox', { name: 'Campo di prova nella cella' });
    await control.focus();
    await page.keyboard.press('End');
    await expect(control).toBeFocused();
    expect(await control.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(6);
    await page.keyboard.press('Home');
    await expect(control).toBeFocused();
    expect(await control.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(0);
    await expect(page.locator('.data-table__row').first()).toHaveAttribute('data-row-id', 'd-0');
  });

  /*
    ⛔ **I TASTI DEVONO ARRIVARE A DESTINAZIONE, sempre.**

    Distinta dalla prova sulla rotellina qui sotto: la` il fuoco si PERDE e va
    raccolto; qui e' un COMANDO ESPLICITO e deve essere eseguito, anche quando
    la riga di partenza resta nel margine reso e quindi il fuoco non risulta
    «perduto».

    ⚠️ Era una regressione vera: la guardia contro il furto del fuoco annullava
    `PagGiu` e `PagSu` brevi.
  */
  test('⛔ Fine porta il fuoco sull_ultima riga, premendo davvero il tasto', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await intercetta(page, QUANTE);
    await page.goto('/app/cassa/operazioni');
    await expect(page.locator('.data-table__row').first()).toBeVisible({ timeout: 60_000 });

    await page.locator('.data-table__row').first().focus();
    await page.keyboard.press('End');

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const a = document.activeElement;
            return a?.querySelector('td[data-label="Numero"]')?.textContent?.trim() ?? '';
          }),
        { timeout: 30_000 },
      )
      .toBe(`CS/2026/${QUANTE}`);
  });

  test('⛔ PagSu raggiunge la destinazione anche se la riga di partenza RESTA resa', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await intercetta(page, QUANTE);
    await page.goto('/app/cassa/operazioni');
    await expect(page.locator('.data-table__row').first()).toBeVisible({ timeout: 60_000 });

    /*
      ⛔ **LA CONDIZIONE ESATTA DELLA REGRESSIONE.**

      Un `PagGiu` dall'inizio allontana la riga di partenza oltre il margine
      reso: il fuoco si perde, e la guardia lascia comunque passare. Non prova
      niente — misurato il 05/09/2026, con la guardia rimessa la prova restava
      verde.

      ⭐ Qui il fuoco parte da una riga VICINA alla cima e `PagSu` porta a
      riga 1: lo scorrimento va a zero, la riga di partenza resta RESA, il
      fuoco non risulta «perduto» — ed e' esattamente il caso in cui la guardia
      annullava il comando.
    */
    const partenzaIndice = 5;
    await page.locator('.data-table__row').nth(partenzaIndice).focus();
    const partenza = await page.evaluate(
      () =>
        document.activeElement?.querySelector('td[data-label="Numero"]')?.textContent?.trim() ?? '',
    );
    expect(partenza).toBe(`CS/2026/${partenzaIndice + 1}`);

    await page.keyboard.press('PageUp');

    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document.activeElement
                ?.querySelector('td[data-label="Numero"]')
                ?.textContent?.trim() ?? '',
          ),
        { timeout: 30_000 },
      )
      .toBe('CS/2026/1');

    // ⭐ E la riga di partenza e` ancora resa: e` cio' che rende la prova valida.
    const partenzaAncoraResa = await page.evaluate(
      (testo) =>
        Array.from(document.querySelectorAll('.data-table__row')).some(
          (r) => r.querySelector('td[data-label="Numero"]')?.textContent?.trim() === testo,
        ),
      partenza,
    );
    expect(partenzaAncoraResa).toBe(true);
  });

  test('⭐ i tasti NON si prendono quelli di un controllo di cella', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await intercetta(page, QUANTE);
    await page.goto('/app/cassa/operazioni');
    await expect(page.locator('.data-table__row').first()).toBeVisible({ timeout: 60_000 });

    // La ricerca e` un controllo: `Home` deve muovere il CURSORE, non la tabella.
    const ricerca = page.getByRole('searchbox').first();
    await ricerca.click();
    await ricerca.fill('abcdef');
    await page.keyboard.press('Home');

    const stato = await page.evaluate(() => {
      const a = document.activeElement as HTMLInputElement | null;
      return { tag: a?.tagName ?? '', cursore: a?.selectionStart ?? -1 };
    });
    expect(stato.tag).toBe('INPUT');
    expect(stato.cursore).toBe(0);
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
    await expect
      .poll(() => page.evaluate(() => document.querySelector('.data-table-scroll')?.scrollTop))
      .toBe(120);

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

    const maniglia = page.locator('.data-table__resize').first();
    await expect(maniglia).toBeVisible();
    const scatola = (await maniglia.boundingBox())!;
    const prima = (await page.locator('.data-table__head-cell').first().boundingBox())!.width;
    await page.mouse.move(scatola.x + scatola.width / 2, scatola.y + scatola.height / 2);
    await page.mouse.down();
    await page.mouse.move(scatola.x + 80, scatola.y + scatola.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => (await page.locator('.data-table__head-cell').first().boundingBox())!.width)
      .toBeGreaterThan(prima + 20);

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
      // Le colonne normalmente si adattano: forziamo un overflow SOLO nella prova.
      (vista.querySelector('table') as HTMLElement).style.minWidth = `${vista.clientWidth + 400}px`;
      vista.scrollLeft = 200;
    });
    await expect
      .poll(() => page.evaluate(() => document.querySelector('.data-table-scroll')?.scrollLeft))
      .toBeGreaterThan(0);
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
    const QUANTE_SESSIONI = 5000;
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

    // Poche righe rese, ma il fondo somma TUTTE le 5.000 sessioni da 1,00 €.
    expect(m.rese).toBeLessThan(120);
    expect(m.piede).toContain(String(QUANTE_SESSIONI));
    expect(m.piede).toContain('5.000,00');
    // ⭐ E il conteggio accessibile conta tutte le righe piu` l'intestazione,
    //    anche col piede dei totali presente.
    expect(m.rowcount).toBe(String(QUANTE_SESSIONI + 1));
  });
});
