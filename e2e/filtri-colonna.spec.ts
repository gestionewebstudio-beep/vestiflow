import { expect, test } from '@playwright/test';

/**
 * ⭐ **I FILTRI DI COLONNA, GUARDATI DA UN BROWSER VERO** (`14` §0.2).
 *
 * ⛔ **Esiste perché jsdom non dipinge.** Le prove di componente coprono il
 * percorso dei dati — si scrive, si sceglie, le righe si restringono — e
 * passano tutte anche mentre a schermo la tendina si apre e **non compare
 * niente**, segnalato dal proprietario il 01/09/2026.
 *
 * ⚠️ **Nessuna prova di componente potrà mai vederlo**: ritaglio,
 * sovrapposizione e posizionamento esistono solo dove c'è un motore di layout.
 * Questa prova misura il **riquadro** del pannello, che è l'unica cosa che
 * distingue «reso» da «visibile».
 */

/*
  ⚠️ **Prodotti e non Arrivi merce**: l'inquilino dell'utente mock non ha arrivi,
  e un elenco vuoto rende lo stato vuoto al posto della tabella — quindi niente
  intestazioni e niente controlli da misurare.
*/
const ELENCO = '/app/products';

/**
 * ⭐ **Le righe arrivano da un'intercettazione, non dal database.**
 *
 * ⚠️ L'API non accetta il token dell'auth mock — `mock-token-…` non compare da
 * nessuna parte in `api/src` — quindi con l'utente di prova ogni elenco finisce
 * in errore e la tabella non si rende affatto. Qui però il dato non è il
 * soggetto: **il soggetto è il CSS**, e per misurarlo bastano tre righe qualsiasi.
 */
function riga(id: string, name: string, status: string) {
  return {
    id,
    tenantId: 'tenant-1',
    name,
    status,
    options: [{ name: 'Taglia', values: ['M', 'L'] }],
    sellingPriceMinor: 4990,
    shopifySyncStatus: 'not_connected',
    catalogOrigin: 'vestiflow',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

test.describe('Filtri di colonna — resa nel browser', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/products**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        /*
          ⚠️ **L'involucro è `items` + `total` + `page` + `pageSize`**, non
          `data` + `meta`: quello è già il modello del client, e `toPaginatedResponse`
          traduce dall'uno all'altro. Scritto con le chiavi sbagliate la pagina
          non fallisce con un messaggio utile — dice «Errore imprevisto».
        */
        body: JSON.stringify({
          items: [
            riga('p-1', 'Maglia cotone', 'active'),
            riga('p-2', 'Pantalone lino', 'draft'),
            riga('p-3', 'Giacca lana', 'active'),
          ],
          page: 1,
          pageSize: 20,
          total: 3,
        }),
      });
    });
  });

  /*
    ⏸ **APERTA — l'apparecchio non è ancora fedele, e va detto.**

    Eseguita il 01/09/2026 contro un browser vero, la pagina rende la tabella ma
    con **zero righe**: l'involucro intercettato dichiara `total: 3` e il corpo
    resta vuoto, quindi i controlli di filtro non compaiono e non c'è niente da
    misurare.

    ⛔ **Non è una diagnosi del difetto segnalato**: finché la finzione non
    popola l'elenco, «i controlli non ci sono» dice qualcosa sul mio apparecchio,
    non sull'applicazione — dove le prove di componente li rendono e li usano.

    ⚠️ Marcata `fixme` e non cancellata: la strada è quella giusta — misurare il
    riquadro è l'unico modo di vedere un pannello ritagliato — e la prova degli
    id qui sotto, costruita sullo stesso banco, ha già trovato e chiuso un
    difetto vero.
  */
  test.fixme('la tendina di una colonna si apre e si VEDE', async ({ page }) => {
    await page.goto(ELENCO);

    // L'elenco è pronto quando la sua tabella c'è.
    await expect(page.locator('app-data-table table')).toBeVisible({ timeout: 45_000 });

    // «Filtri» accende i controlli nelle intestazioni.
    await page.getByRole('button', { name: /^Filtri/ }).click();

    /*
      ⚠️ **La PRIMA tendina dell'intestazione, qualunque sia**: quali colonne
      siano accese dipende dalle preferenze dell'utente, e inchiodare un nome di
      colonna renderebbe la prova fragile per una ragione che non è la sua.
    */
    const trigger = page.locator('thead app-column-filter app-select-menu button').first();
    await expect(trigger).toBeVisible();
    await trigger.click();

    const panel = page.locator('ul.select-menu__panel');

    /*
      ⚠️ **Tre asserzioni distinte, e servono tutte e tre**: «esiste» non implica
      «ha una dimensione», e «ha una dimensione» non implica «si vede» — un
      pannello ritagliato da un contenitore a scorrimento ha un riquadro pieno e
      non è visibile.
    */
    await expect(panel).toHaveCount(1);

    const box = await panel.boundingBox();
    expect(box, 'il pannello non ha un riquadro: non è nel flusso').not.toBeNull();
    expect(box!.height, `altezza del pannello: ${box!.height}`).toBeGreaterThan(20);
    expect(box!.width, `larghezza del pannello: ${box!.width}`).toBeGreaterThan(40);

    await expect(panel).toBeInViewport();
  });

  /**
   * ⭐ **Gli id duplicati sono un difetto vero, e li vede solo il DOM reso.**
   *
   * ⛔ Segnalati dal proprietario negli strumenti del browser il 01/09/2026: sei
   * «Duplicate form field id in the same form» e ventidue campi senza `id` né
   * `name`. Un id ripetuto rompe l'associazione `label`/campo — chi naviga con
   * uno screen reader sente il nome sbagliato — e nessuna prova di componente
   * lo vede, perché ognuna monta un pezzo solo.
   */
  test('⛔ nessun id duplicato con i filtri accesi', async ({ page }) => {
    await page.goto(ELENCO);
    await expect(page.locator('app-data-table table')).toBeVisible({ timeout: 45_000 });
    await page.getByRole('button', { name: /^Filtri/ }).click();

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
