import { expect, test } from '@playwright/test';

/**
 * ⭐ **I FILTRI DI COLONNA, GUARDATI DA UN BROWSER VERO** (`14` §0.2).
 *
 * ⛔ **Esiste perché jsdom non dipinge.** Le prove di componente coprono il
 * percorso dei dati — si scrive, si sceglie, le righe si restringono — e passano
 * tutte anche mentre a schermo «i filtri non funzionano», segnalato dal
 * proprietario il 01/09/2026.
 *
 * ⚠️ **Nessuna prova di componente può vedere la differenza**: ritaglio,
 * sovrapposizione e posizionamento esistono solo dove c'è un motore di layout, e
 * un id si ripete solo quando la pagina è intera.
 */

/*
  ⚠️ **Fornitori e non Documenti**: è il pilota, la sua riga non ha mappatura —
  l'API restituisce `Supplier` così com'è — e le prove di componente lo coprono
  già. Se qui il filtro funziona e a schermo no, la differenza non è nel codice.
*/
const ELENCO = '/app/suppliers';

/**
 * ⭐ **Le righe arrivano da un'intercettazione, non dal database.**
 *
 * ⚠️ L'API non accetta il token dell'auth mock — `mock-token-…` non compare in
 * `api/src` — quindi con l'utente di prova ogni elenco finisce in errore e la
 * tabella non si rende affatto. Qui il dato non è il soggetto: **è il CSS**.
 */
function fornitore(id: string, code: string, name: string, city: string) {
  return {
    id,
    code,
    name,
    city,
    vatNumber: `IT${code}`,
    email: `${id}@esempio.it`,
    phone: null,
    paymentTerms: null,
    isActive: true,
  };
}

const RIGHE = [
  fornitore('f-1', '0001', 'Revoll Srls', 'Casalnuovo di Napoli'),
  fornitore('f-2', '0002', 'Fornitore Test 2', 'Napoli'),
  fornitore('f-3', '0003', 'fornitore test 1', 'Napoli'),
];

async function apriElencoConFiltri(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/v1/suppliers**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      /*
        ⚠️ **L'involucro è `items` + `total` + `page` + `pageSize`**, non
        `data` + `meta`: quello è già il modello del client, e
        `toPaginatedResponse` traduce dall'uno all'altro. Con le chiavi sbagliate
        la pagina non dice niente di utile — mostra «Errore imprevisto».
      */
      body: JSON.stringify({ items: RIGHE, page: 1, pageSize: 20, total: RIGHE.length }),
    });
  });

  await page.goto(ELENCO);
  await expect(page.locator('app-data-table table')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('tbody tr.data-table__row')).toHaveCount(3);

  await page.getByRole('button', { name: /^Filtri/ }).click();
}

test.describe('Filtri di colonna — resa nel browser', () => {
  test('⛔ scrivere in un filtro di testo restringe l’elenco', async ({ page }) => {
    await apriElencoConFiltri(page);

    const campo = page.getByLabel('Filtra per Codice');
    await expect(campo).toBeVisible();
    await campo.fill('0003');

    await expect(page.locator('tbody tr.data-table__row')).toHaveCount(1);
  });

  /**
   * ⭐ **La tendina si apre e si VEDE.**
   *
   * ⚠️ Tre asserzioni distinte, e servono tutte e tre: «esiste» non implica «ha
   * una dimensione», e «ha una dimensione» non implica «si vede» — un pannello
   * ritagliato da un contenitore a scorrimento ha un riquadro pieno e non è
   * visibile.
   */
  test('⛔ la tendina di una colonna si apre e si VEDE', async ({ page }) => {
    await apriElencoConFiltri(page);

    /*
      ⚠️ **Il ruolo, non la sola etichetta**: aperto, il pannello porta lo stesso
      `aria-label` del trigger — `getByLabel` ne troverebbe due.
    */
    const trigger = page.getByRole('button', { name: 'Filtra per Città' });
    await expect(trigger).toBeVisible();
    const triggerBox = await trigger.boundingBox();
    await trigger.click();

    const panel = page.locator('ul.select-menu__panel');
    await expect(panel).toHaveCount(1);

    const box = await panel.boundingBox();
    const vista = page.viewportSize();
    const dove = `pannello ${JSON.stringify(box)} · trigger ${JSON.stringify(triggerBox)} · viewport ${JSON.stringify(vista)}`;

    expect(box, 'il pannello non ha un riquadro: non è nel flusso').not.toBeNull();
    expect(box!.height, dove).toBeGreaterThan(20);
    expect(box!.width, dove).toBeGreaterThan(40);
    expect(box!.y, dove).toBeGreaterThanOrEqual(0);
    expect(box!.y, dove).toBeLessThan(vista!.height);

    /*
      ⛔ **E QUI SOTTO C'ERA IL BUCO DELLA PROVA.** Le quattro asserzioni qui
      sopra misurano il RIQUADRO, e un pannello ritagliato dalla propria cella
      ha un riquadro perfetto: dimensioni giuste, posizione giusta, invisibile.

      Misurato il 01/09/2026: `th` porta `overflow: hidden` dal taglio a colonna
      del 30/08, e ritagliava il pannello del filtro. `elementFromPoint` al suo
      centro rispondeva `td` — la riga sotto — e a schermo non si vedeva niente.
      **Le quattro asserzioni erano tutte verdi.**

      ⭐ **Chi risponde al centro dice la verità**: se lì c'è il pannello (o
      qualcosa dentro di lui) è dipinto davvero; se c'è una cella della tabella,
      è ritagliato o coperto.
    */
    const alCentro = await page.evaluate(() => {
      const p = document.querySelector('ul.select-menu__panel');
      if (!p) return 'nessun pannello';
      const r = p.getBoundingClientRect();
      const sopra = document.elementFromPoint(
        Math.round(r.left + r.width / 2),
        Math.round(r.top + r.height / 2),
      );
      return sopra?.closest('ul.select-menu__panel') ? 'pannello' : `coperto da ${sopra?.tagName}`;
    });
    expect(alCentro, `al centro del pannello: ${alCentro} · ${dove}`).toBe('pannello');
  });

  /**
   * ⭐ **L'ESCLUSIONE, guardata da un browser** — «tutte tranne queste».
   *
   * ⚠️ Le prove di componente coprono il verso emesso e il modello copre il
   * confronto; qui si verifica l'unica cosa che nessuna delle due vede: che i
   * due comandi nel pannello siano **raggiungibili col dito e col mouse** dopo
   * che il pannello si è aperto sopra la tabella.
   */
  test('⭐ «Escludi» toglie dall’elenco i valori scelti, e «Tutti» li rimette', async ({
    page,
  }) => {
    await apriElencoConFiltri(page);

    await page.getByRole('button', { name: /^Filtra per Città/ }).click();
    await page.getByRole('button', { name: 'Escludi' }).click();
    // ⚠️ `exact`: fra le scelte c'è anche «Casalnuovo di Napoli».
    await page.getByRole('option', { name: 'Napoli', exact: true }).click();

    // Due righe su tre sono di Napoli: escludendola resta solo la terza.
    await expect(page.locator('tbody tr.data-table__row')).toHaveCount(1);

    await page.getByRole('button', { name: /Mostra tutti i valori/ }).click();
    await expect(page.locator('tbody tr.data-table__row')).toHaveCount(3);
  });

  /**
   * ⭐ **La riga totali sta in FONDO al contenitore, non in coda alle righe.**
   *
   * ⛔ Segnalato dal proprietario il 01/09/2026 su Fornitori: con quattro righe
   * la riga «4 voci» restava appena sotto l'ultima, e sotto di lei mezzo schermo
   * di bianco fino alla barra comandi.
   *
   * ⚠️ **`position: sticky` da solo non basta**: appiccica quando il contenuto
   * ECCEDE il contenitore, e con poche righe non c'è niente da cui staccarsi. A
   * portarla in fondo dev'essere l'altezza della tabella.
   */
  /*
    ⏸ **MISURATA APERTA E CHIUSA — 01/09/2026.** Con tre righe in un contenitore
    da 452px: contenitore `y 194 h 452` (fondo a 646), totali `y 337 h 21`
    (fondo a 358) → **288px di bianco sotto la riga totali**.

    ⛔ **Non si corregge stirando la tabella e basta.** `block-size: 100%` su un
    `display: table` distribuisce l'altezza in eccesso alle RIGHE: quattro righe
    da cento pixel invece di una riga totali in fondo — un difetto peggiore di
    quello che chiude, e già misurato il 30/08 sulle Vendite online.

    ⭐ **Chiusa con una riga di RIEMPIMENTO** in coda al corpo, che chiede il
    100% e si prende tutto l'avanzo: le righe di dati restano alla loro altezza
    e il `tfoot` si trova davvero in fondo.
  */
  test('⛔ la riga totali è in fondo al contenitore, anche con poche righe', async ({ page }) => {
    await apriElencoConFiltri(page);

    const contenitore = await page.locator('.data-table-scroll').boundingBox();
    const totali = await page.locator('tfoot.data-table__totals').boundingBox();

    const dove = `contenitore ${JSON.stringify(contenitore)} · totali ${JSON.stringify(totali)}`;
    expect(contenitore, dove).not.toBeNull();
    expect(totali, dove).not.toBeNull();

    // ⚠️ Tolleranza di qualche pixel: bordo e raggio del contenitore.
    const distanzaDalFondo = contenitore!.y + contenitore!.height - (totali!.y + totali!.height);
    expect(distanzaDalFondo, dove).toBeLessThan(8);

    /*
      ⛔ **E le righe NON devono essersi allargate**, che è il difetto gemello:
      la prima volta la tabella fu stirata e l'avanzo finì alle righe — cinque
      documenti alti 95px (30/08/2026). Una prova che guarda solo il piede lo
      lascerebbe passare, perché anche così il piede finisce in fondo.
    */
    const altezze = await page
      .locator('tbody tr.data-table__row')
      .evaluateAll((righe) => righe.map((r) => r.getBoundingClientRect().height));
    expect(Math.max(...altezze), `altezze delle righe: ${altezze.join(', ')}`).toBeLessThan(60);
  });

  /**
   * ⭐ **Gli id duplicati sono un difetto vero, e li vede solo il DOM reso.**
   *
   * ⛔ Trovato così il 01/09/2026: `confirm-dialog-title` ×3 su una pagina, con
   * l'id del titolo scritto come costante. Con id ripetuti l'`aria-labelledby`
   * risolve sempre il primo, quindi due dialoghi su tre si annunciano col titolo
   * di un altro.
   */
  test('⛔ nessun id duplicato con i filtri accesi', async ({ page }) => {
    await apriElencoConFiltri(page);

    const duplicati = await page.evaluate(() => {
      const conta = new Map<string, number>();
      for (const el of Array.from(document.querySelectorAll('[id]'))) {
        conta.set(el.id, (conta.get(el.id) ?? 0) + 1);
      }
      return [...conta.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} ×${n}`);
    });

    expect(duplicati, `id ripetuti nel documento: ${duplicati.join(', ')}`).toEqual([]);
  });
});
