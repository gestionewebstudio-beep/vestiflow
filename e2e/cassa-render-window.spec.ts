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

const NOMI = [
  'Bruno',
  'Anna Maria Giuseppina Della Valle',
  'Anna Maria Giuseppina Della Valle di Sant_Angelo dei Lombardi in Provincia di Avellino, delegata alla cassa del negozio di corso Vittorio Emanuele, con delega anche al magazzino centrale',
];

/**
 * ⭐ **Le stesse operazioni, con altezze di card MOLTO diverse fra loro.**
 *
 * ⚠️ **Serve alle prove dell'ancoraggio**: con righe uniformi la misura
 * coinciderebbe con la stima, gli offset non si sposterebbero e non ci sarebbe
 * niente da ancorare — la prova resterebbe verde anche col difetto.
 *
 * ⛔ **A BLOCCHI di venti righe, non a righe alternate**, e non è un dettaglio
 * estetico: con un ciclo corto ogni finestra contiene la stessa mescolanza, la
 * **stima** delle righe mai viste non si muove mai e gli offset di ciò che sta
 * sopra restano fermi — cioè sparisce proprio la condizione che l'ancoraggio
 * deve reggere. Provato il 06/09/2026: col ciclo di tre, le prove restavano
 * verdi anche rimettendo il difetto.
 */
async function intercettaAltezzeVarie(page: Page, quante: number): Promise<void> {
  await intercetta(page, quante);
  const BLOCCO = 20;
  const dati = pagina(quante);
  const corpo = {
    ...dati,
    items: dati.items.map((riga, i) => ({
      ...riga,
      operatorName: NOMI[Math.floor(i / BLOCCO) % NOMI.length]!,
    })),
  };
  await page.route('**/api/v1/cash-sessions/operations**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(corpo),
    }),
  );
}

/**
 * Le stesse identità, tutte col nome più lungo: card uniformemente più alte.
 *
 * ⚠️ **Distinto da quello a blocchi**, che serve a far muovere la stima: qui
 * serve invece che le card crescano a QUALUNQUE posizione, perché le prove
 * sul contenuto guardano la cima dell’elenco.
 */
async function intercettaNomiLunghi(page: Page, quante: number): Promise<void> {
  await intercetta(page, quante);
  const dati = pagina(quante);
  const corpo = {
    ...dati,
    items: dati.items.map((riga) => ({ ...riga, operatorName: NOMI[2]! })),
  };
  await page.route('**/api/v1/cash-sessions/operations**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(corpo),
    }),
  );
}

/**
 * Lunghezza complessiva della vista e PASSO medio delle righe rese.
 *
 * ⚠️ **Si misura la RIGA, non la cella-card**, e si aggiunge il margine fra
 * una e l'altra: e` quello che il layout avanza davvero, ed e` la grandezza
 * con cui il modello degli offset va confrontato. Misurata la cella, il conto
 * non torna per una decina di pixel a riga e la verifica sembra rossa a torto.
 */
async function misuraRighe(page: Page): Promise<{ lunghezza: number; passo: number }> {
  return page.evaluate(() => {
    const vista = document.querySelector<HTMLElement>('.data-table-scroll')!;
    const righe = Array.from(
      document.querySelectorAll<HTMLElement>('.data-table__row[data-row-id]'),
    ).map((r) => r.getBoundingClientRect());
    const passi: number[] = [];
    for (let i = 0; i + 1 < righe.length; i += 1) {
      passi.push(righe[i + 1]!.top - righe[i]!.top);
    }
    return {
      lunghezza: Math.round(vista.scrollHeight),
      passo: passi.reduce((a, b) => a + b, 0) / passi.length,
    };
  });
}

/** L'identita` della card che sta sul bordo SUPERIORE della vista. */
async function idAlBordo(page: Page): Promise<string> {
  return page.evaluate(() => {
    const vista = document.querySelector<HTMLElement>('.data-table-scroll')!;
    const bordo = vista.getBoundingClientRect().top;
    const righe = Array.from(
      document.querySelectorAll<HTMLElement>('.data-table__row[data-row-id]'),
    );
    return righe.find((r) => r.getBoundingClientRect().bottom > bordo + 1)?.dataset['rowId'] ?? '';
  });
}

/** Dove sta una card rispetto al bordo superiore della vista, in pixel. */
async function posizioneDi(page: Page, id: string): Promise<number | null> {
  return page.evaluate((rowId) => {
    const vista = document.querySelector<HTMLElement>('.data-table-scroll')!;
    const riga = document.querySelector<HTMLElement>(`.data-table__row[data-row-id="${rowId}"]`);
    return riga === null
      ? null
      : Math.round(riga.getBoundingClientRect().top - vista.getBoundingClientRect().top);
  }, id);
}

/**
 * Aspetta che la finestra smetta di muoversi.
 *
 * ⚠️ **Non un ritardo a caso**: la compensazione dell'ancoraggio sposta
 * `scrollTop` DOPO il render, e la passata successiva puo` spostarlo ancora.
 * Si aspetta la quiete di posizione, lunghezza e righe rese — non un tempo.
 */
async function assestata(page: Page): Promise<void> {
  let ultimo = '';
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(60);
    const ora = await page.evaluate(() => {
      const vista = document.querySelector<HTMLElement>('.data-table-scroll')!;
      const rese = document.querySelectorAll('.data-table__row').length;
      return `${Math.round(vista.scrollTop)}/${Math.round(vista.scrollHeight)}/${rese}`;
    });
    if (ora === ultimo) {
      return;
    }
    ultimo = ora;
  }
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

  /*
    ⚠️ **Questa prova diceva il CONTRARIO fino al 06/09/2026**, e non è stata
    cancellata: è stata riscritta. Si chiamava «sul telefono la finestra NON si
    accende: card intatte» e asseriva 300 righe rese e zero distanziatrici,
    perché la finestra sapeva fare una sola altezza e sotto `lg` restava spenta.

    ⭐ Con gli offset misurati per riga la vista a card è supportata, e la
    decisione è cambiata: la prova ora inchioda quella nuova.
  */
  test('⭐ sul telefono la finestra SI accende, e le card restano complete', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await intercetta(page, 300);
    await page.goto('/app/cassa/operazioni');
    await expect(page.locator('.data-table__row').first()).toBeVisible({ timeout: 60_000 });

    const m = await page.evaluate(() => ({
      righe: document.querySelectorAll('.data-table__row').length,
      spaziatrici: document.querySelectorAll('.data-table__spacer').length,
      card: document.querySelectorAll('.data-table__card').length,
      // ⭐ Le altezze VERE delle card: se fossero tutte uguali, questa prova
      //    non starebbe verificando niente di ciò che dice.
      altezze: new Set(
        Array.from(document.querySelectorAll('.data-table__card')).map((c) =>
          Math.round(c.getBoundingClientRect().height),
        ),
      ).size,
    }));

    // ⛔ Molte meno di 300 nel DOM, ed è il punto della tranche.
    expect(m.righe).toBeLessThan(120);
    expect(m.righe).toBeGreaterThan(0);
    expect(m.spaziatrici).toBeGreaterThan(0);
    // ⭐ E sono CARD, non righe di tabella: la veste non è cambiata.
    expect(m.card).toBe(m.righe);
    // ⛔ Altezze DIVERSE fra loro: è la condizione che rendeva impossibile la
    //    vecchia finestra, e che questa gestisce.
    expect(m.altezze).toBeGreaterThan(1);
  });

  test('⭐ sul telefono l’ultima card si raggiunge, e non resta bianco', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await intercetta(page, 300);
    await page.goto('/app/cassa/operazioni');
    await expect(page.locator('.data-table__row').first()).toBeVisible({ timeout: 60_000 });

    await page.evaluate(() => {
      const vista = document.querySelector<HTMLElement>('.data-table-scroll')!;
      vista.scrollTop = vista.scrollHeight;
    });
    await expect(page.locator('.data-table__row[data-row-id="d-299"]')).toBeInViewport({
      ratio: 1,
    });

    // ⛔ Nessuno spazio vuoto in fondo: l'ultima card tocca il fondo della vista.
    const coda = await page.evaluate(() => {
      const vista = document.querySelector<HTMLElement>('.data-table-scroll')!;
      const ultima = document.querySelector<HTMLElement>('.data-table__row[data-row-id="d-299"]')!;
      return Math.round(
        vista.getBoundingClientRect().bottom - ultima.getBoundingClientRect().bottom,
      );
    });
    expect(coda).toBeLessThan(80);
  });

  /*
    ── L'ANCORA E` UN'IDENTITA`, NON UN INDICE RICALCOLATO ────────────────────

    ⛔ **Il difetto che queste prove falsificano**, corretto il 06/09/2026. La
    compensazione leggeva l'offset dell'ancora cosi`:

    ```text
      primaDi = offsets[indicePrimo()]     prima della misura
      dopo    = offsets[indicePrimo()]     DOPO la misura
    ```

    `indicePrimo()` e` un `computed` che dipende da `offsets()`, e la misura
    cambia anche la **stima** delle righe mai viste — quindi gli offset di tutto
    cio` che sta sopra la finestra. Le due letture cadevano percio` su **due
    righe diverse**, e il delta applicato a `scrollTop` non era lo spostamento
    di nessuno.

    ⚠️ **In cima e in fondo il difetto non si vede**: a `scrollTop` zero
    l'indice e` zero in entrambe le letture, e in fondo la compensazione e`
    saltata apposta (ci si ri-ancora alla coda). Vive a **meta` elenco**, dove
    sopra la finestra restano righe ancora STIMATE — ed e` la ragione per cui le
    prove esistenti, che verificano cima e fondo, restavano verdi.

    ⭐ **L'invariante verificata e` la posizione, non la raggiungibilita`**:
    scorrendo di N pixel, una card visibile prima e dopo deve spostarsi
    esattamente di N. Col difetto si sposta di N piu` l'errore dell'ancora.
  */
  /*
    ⭐ **DOVE SI ATTERRA saltando a meta` elenco.**

    ⛔ **E' la prova che falsifica l'ancora per identita`**, e le due qui sotto
    non ci riuscivano: dopo che la finestra si e` assestata le misure sono
    complete, la compensazione non scatta piu` e il difetto non ha piu` occasione
    di manifestarsi. Vive **durante** l'assestamento.

    ⚠️ **Misurato nel browser il 06/09/2026**, con una sonda dentro il
    componente: saltando a meta` elenco l'ancora resta d-150 mentre l'indice
    ricalcolato dice via via 139, 167, 113, 160 — e i delta applicati a
    `scrollTop` valgono +1177, −2260, +4264, −1218 pixel. Col difetto si
    atterra su **d-129** invece che su d-150: duemila pixel piu` su di dove la
    barra di scorrimento dice di essere.

    ⭐ **Il fixture e` bilanciato apposta**: quindici blocchi di venti righe che
    ciclano su tre altezze, cioe` cinque cicli interi. Meta` dell'altezza e`
    quindi meta' delle righe, e «saltare al 50%» vuol dire «atterrare sulla
    150ª».
  */
  for (const [donde, dalFondo] of [
    ['dall_alto', false],
    ['dal fondo', true],
  ] as const) {
    test(`⛔ saltando a meta' elenco ${donde}, si ATTERRA a meta'`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await intercettaAltezzeVarie(page, 300);
      await page.goto('/app/cassa/operazioni');
      await expect(page.locator('.data-table__card').first()).toBeVisible({ timeout: 60_000 });

      // Si parte da un estremo: cambia quali righe sono gia' misurate.
      await page.evaluate((fondo) => {
        const vista = document.querySelector<HTMLElement>('.data-table-scroll')!;
        vista.scrollTop = fondo ? vista.scrollHeight : 0;
      }, dalFondo);
      await assestata(page);

      await page.evaluate(() => {
        const vista = document.querySelector<HTMLElement>('.data-table-scroll')!;
        vista.scrollTop = Math.round(vista.scrollHeight / 2);
      });
      await assestata(page);

      const id = await idAlBordo(page);
      const indice = Number(id.replace('d-', ''));
      expect(Number.isFinite(indice)).toBe(true);
      // ⛔ IDENTITA`: la card al bordo e` quella di meta` elenco, non una a caso.
      expect(Math.abs(indice - 150)).toBeLessThanOrEqual(12);
      // ⛔ E POSIZIONE: e` appoggiata al bordo superiore, non a mezzo schermo.
      const dove = await posizioneDi(page, id);
      expect(dove).not.toBeNull();
      expect(dove!).toBeLessThanOrEqual(0);
      expect(dove!).toBeGreaterThan(-260);
    });
  }

  const PASSO = 300;

  for (const [verso, segno] of [
    ['in giu', 1],
    ['in su', -1],
  ] as const) {
    test(`⛔ a meta' elenco, scorrendo ${verso} la card resta LA STESSA e si sposta del passo esatto`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await intercettaAltezzeVarie(page, 300);
      await page.goto('/app/cassa/operazioni');
      await expect(page.locator('.data-table__card').first()).toBeVisible({ timeout: 60_000 });

      const altezzeInCima = await page
        .locator('.data-table__card')
        .evaluateAll((c) => c.map((x) => Math.round(x.getBoundingClientRect().height)));

      // A meta` elenco: sopra la finestra restano righe mai misurate.
      await page.evaluate(() => {
        const vista = document.querySelector<HTMLElement>('.data-table-scroll')!;
        vista.scrollTop = Math.round(vista.scrollHeight / 2);
      });
      await assestata(page);

      /*
        ⭐ **Le altezze devono essere DAVVERO diverse**, e molto: e` la
        condizione che fa cambiare la stima mentre si passa, cioe` quella in cui
        l'ancoraggio serve. Senza, questa prova non verificherebbe niente di
        cio` che dice.

        ⚠️ **Si guarda cima E meta`**: coi blocchi di venti righe una sola
        finestra puo` cadere tutta dentro un blocco, dove le card sono uguali —
        e la verifica direbbe il contrario di quello che intende.
      */
      const altezze = [
        ...altezzeInCima,
        ...(await page
          .locator('.data-table__card')
          .evaluateAll((c) => c.map((x) => Math.round(x.getBoundingClientRect().height)))),
      ];
      expect(new Set(altezze).size).toBeGreaterThan(2);
      expect(Math.max(...altezze) - Math.min(...altezze)).toBeGreaterThan(40);

      const id = await idAlBordo(page);
      expect(id).not.toBe('');
      const prima = await posizioneDi(page, id);
      expect(prima).not.toBeNull();

      // Un passo nel verso richiesto: entrano righe mai misurate, e la stima
      // cambia — che e` l'innesco del difetto.
      await page.evaluate((d) => {
        const vista = document.querySelector<HTMLElement>('.data-table-scroll')!;
        vista.scrollTop += d;
      }, segno * PASSO);
      await assestata(page);

      const dopo = await posizioneDi(page, id);

      // ⛔ STESSA IDENTITA`: e` ancora quella card, resa e ritrovabile.
      expect(dopo).not.toBeNull();
      // ⛔ E STESSA POSIZIONE ATTESA: scorrendo di N pixel si sposta di N pixel.
      expect(prima! - dopo!).toBeGreaterThan(segno * PASSO - 3);
      expect(prima! - dopo!).toBeLessThan(segno * PASSO + 3);
    });
  }

  /*
    ── LE MISURE NON RESTANO OBSOLETE A LARGHEZZA INVARIATA ───────────────────

    ⛔ **Le altezze si azzeravano solo al cambio di LARGHEZZA.** Ma a larghezza
    invariata l'altezza cambia eccome: dati aggiornati con gli **stessi
    `rowId`** — un nome piu` lungo, uno stato che diventa «Annullato» — e le
    card si riimpaginano. Senza rimisura la geometria resta quella vecchia
    finche` qualcuno non scorre o non ridimensiona la finestra, e nel frattempo
    la barra di scorrimento mente sulla lunghezza dell'elenco.

    ⚠️ **Il `ResizeObserver` non lo prende**: osserva il riquadro del
    contenitore, che la layout tiene fermo — a cambiare e` il CONTENUTO. E non
    arriva nemmeno un evento di scorrimento, perche` nessuno ha scorso.

    ⚠️ **Non basta guardare che la pagina sia cresciuta**: le poche righe RESE
    sono alte davvero, quindi `scrollHeight` cresce un po' anche con le misure
    vecchie. Si confronta percio` con la lunghezza ATTESA — righe totali per
    passo medio reso — che con le misure obsolete non torna.

    ⚠️⚠️ **QUESTA PROVA NON E` FALSIFICATA, e va detto.** Provate il 06/09/2026
    tutte e quattro le rotture — ancora per indice, altezza invece del passo,
    niente rimisura dopo il render, effetto sul contenuto spento — e resta
    verde con ognuna. Il motivo e` che il cambio di periodo passa da una
    richiesta: la zona dati si stacca e si riattacca, il `ResizeObserver`
    scatta e la rimisura arriva comunque.

    ⛔ **Protegge quindi il comportamento osservabile, non una riga di codice.**
    A falsificare la rimisura al cambio di contenuto e` la prova sulla colonna
    spenta, qui sotto. Chi tocca questo codice non si fidi del verde di questa.
  */
  test('⛔ dati nuovi con gli STESSI rowId: la geometria si rimisura senza ridimensionare', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await intercetta(page, 300);
    await page.goto('/app/cassa/operazioni');
    await expect(page.locator('.data-table__card').first()).toBeVisible({ timeout: 60_000 });
    await assestata(page);

    const prima = await misuraRighe(page);

    /*
      Le STESSE 300 identita`, con un nome operatore molto piu` lungo: le card
      si riimpaginano e diventano piu` alte. Nessun ridimensionamento, nessuno
      scorrimento — solo dati nuovi.
    */
    await intercettaNomiLunghi(page, 300);
    await page.getByRole('button', { name: /Filtra per periodo/ }).click();
    await page.getByRole('option', { name: 'Ieri', exact: true }).click();
    await expect(page.locator('.data-table__card').first()).toBeVisible();
    await assestata(page);

    const dopo = await misuraRighe(page);

    // Le righe sono davvero piu` alte: senza, non ci sarebbe niente da rimisurare.
    expect(dopo.passo).toBeGreaterThan(prima.passo + 10);
    /*
      ⛔ **La lunghezza totale segue le altezze NUOVE.** Con 300 righe la vista
      deve valere 300 passi: piu` corta significa misure obsolete, piu` lunga
      significa che non e` stato rimisurato niente.
    */
    expect(dopo.lunghezza).toBeGreaterThan(300 * dopo.passo * 0.85);
    expect(dopo.lunghezza).toBeLessThan(300 * dopo.passo * 1.15);
    // ⚠️ Il controllo negativo: con le misure obsolete resterebbe intorno a
    //    quella di prima.
    expect(dopo.lunghezza).toBeGreaterThan(prima.lunghezza * 1.2);
  });

  /*
    ⭐ **Il CONTENUTO che cambia altezza senza che cambi la larghezza.**

    ⚠️ **Distinta dalla prova qui sopra, e serve.** Il cambio di periodo passa
    da una richiesta: la zona dati si stacca e si riattacca, il
    `ResizeObserver` scatta e la rimisura arriva **per un altra strada**.
    Misurato il 06/09/2026: quella prova resta verde anche spegnendo
    `rimisuraQuandoCambiaIlContenuto`.

    ⛔ **Spegnere una colonna no**: nessuna richiesta, nessun distacco, il
    riquadro del contenitore non si muove di un pixel — cambia solo cosa la
    card scrive dentro. È il caso che solo l effetto sui dati può prendere.
  */
  test('⛔ colonna spenta: le card si accorciano e la geometria segue, senza ridimensionare', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await intercettaNomiLunghi(page, 300);
    await page.goto('/app/cassa/operazioni');
    await expect(page.locator('.data-table__card').first()).toBeVisible({ timeout: 60_000 });
    await assestata(page);

    const prima = await misuraRighe(page);

    // Via «Operatore»: è il nome lunghissimo che fa andare a capo la card.
    await page.getByRole('button', { name: 'Colonne' }).click();
    await page.getByRole('checkbox', { name: 'Operatore', exact: true }).click();
    await page.keyboard.press('Escape');
    await assestata(page);

    const dopo = await misuraRighe(page);

    // Le righe sono davvero più basse: senza, non ci sarebbe niente da rimisurare.
    expect(dopo.passo).toBeLessThan(prima.passo - 10);
    // ⛔ E la lunghezza totale segue le altezze NUOVE, non quelle vecchie.
    expect(dopo.lunghezza).toBeGreaterThan(300 * dopo.passo * 0.85);
    expect(dopo.lunghezza).toBeLessThan(300 * dopo.passo * 1.15);
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
    /*
      ⚠️ **Qui c'era `toHaveCount(300)` e zero distanziatrici**: la finestra
      sotto `lg` era spenta. Dal 06/09/2026 e' accesa anche sulle card, e la
      prova inchioda la decisione nuova — poche righe rese, distanziatrici
      presenti, altezze DIVERSE fra loro.
    */
    await expect(page.locator('.data-table__card').first()).toBeVisible();
    const reseCompatto = await page.locator('.data-table__row').count();
    expect(reseCompatto).toBeLessThan(120);
    expect(reseCompatto).toBeGreaterThan(0);
    await expect(page.locator('.data-table__spacer').first()).toBeAttached();
    const heights = await page
      .locator('.data-table__card')
      .evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().height)));
    expect(new Set(heights).size).toBeGreaterThan(1);
    /*
      ⚠️ **Si torna in CIMA prima di cercare `d-0`.** Con la finestra accesa
      la prima riga non e' piu' resa per forza: la posizione di scorrimento
      arriva dalla parte desktop di questa prova. Prima bastava, perche' su
      card erano rese tutte.
    */
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('.data-table-scroll')!.scrollTop = 0;
    });
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
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`⭐ i totali delle Sessioni contano tutto il risultato (${viewport.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
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

      /*
        ⭐ **Poche righe rese a QUALUNQUE larghezza**, ma il fondo somma tutte
        le 5.000 sessioni da 1,00 €: e' il punto della prova, e vale ancora di
        piu' ora che la finestra e' accesa anche sul telefono.

        ⚠️ Qui il ramo compatto pretendeva `m.rese === 5.000`: era il modo in
        cui la vecchia decisione — finestra spenta sotto `lg` — si era
        depositata dentro una prova sui TOTALI.
      */
      expect(m.rese).toBeLessThan(120);
      expect(m.rese).toBeGreaterThan(0);
      expect(m.piede).toContain(String(QUANTE_SESSIONI));
      expect(m.piede).toContain('5.000,00');
      // ⭐ E il conteggio accessibile conta tutte le righe piu` l'intestazione,
      //    anche col piede dei totali presente.
      /*
        ⚠️ **Prima era `null` in compatto**, perche' la finestra li' era spenta
        e il conteggio accessibile non serviva. Ora c'e' a ogni larghezza, ed e'
        proprio quello che deve esserci: nel DOM le righe sono poche, e un
        lettore di schermo direbbe altrimenti «riga 3 di 18».
      */
      expect(m.rowcount).toBe(String(QUANTE_SESSIONI + 1));
      const footer = page.locator('.data-table tfoot');
      await expect(footer).toBeInViewport({ ratio: 1 });
      const footerBefore = (await footer.boundingBox())!;
      await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>('.data-table-scroll')!;
        scroller.scrollTop = scroller.scrollHeight;
      });
      await expect(page.locator('.data-table__row[data-row-id="s-4999"]')).toBeInViewport({
        ratio: 1,
      });
      await expect(footer).toBeInViewport({ ratio: 1 });
      expect(Math.abs((await footer.boundingBox())!.y - footerBefore.y)).toBeLessThan(3);
    });
  }
});
