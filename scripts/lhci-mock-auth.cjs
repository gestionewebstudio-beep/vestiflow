/**
 * Accesso finto prima delle rotte /app/* per Lighthouse CI (build e2e).
 *
 * ⚠️ **Lo script viene invocato UNA VOLTA PER URL**, sempre sullo STESSO
 *    browser (`@lhci/cli/src/collect/puppeteer-manager.js`: `_getBrowser()`
 *    tiene una sola istanza). Le tre invocazioni non sono quindi indipendenti:
 *    quello che la prima lascia nel browser, la seconda se lo trova davanti.
 */

const INDIRIZZO = 'http://127.0.0.1:4210';

module.exports = async (browser, context) => {
  // ⭐ **La pagina di accesso si misura da OSPITI.** Autenticarsi prima di
  //    misurarla la rende irraggiungibile — `guestGuard` rimanda alla
  //    dashboard — e Lighthouse finirebbe per misurare la dashboard
  //    etichettandola `/login`: un numero plausibile per la pagina sbagliata.
  if (!new URL(context.url).pathname.startsWith('/app/')) return;

  const page = await browser.newPage();
  try {
    await page.goto(INDIRIZZO + '/login', { waitUntil: 'networkidle0' });

    // ⛔ **Puppeteer non attende da solo.** `page.type()` pretende che
    //    l'elemento ci sia gia', e `networkidle0` non garantisce che Angular
    //    abbia reso: il messaggio era «No element found for selector:
    //    #login-email», che si legge come un selettore sbagliato mentre e'
    //    un'attesa mancante. Gli stessi id li usa l'auth finta di Playwright,
    //    che in CI passa — perche' `.fill()` attende.
    //
    // ⛔ **Ma il modulo puo' legittimamente NON esserci**, e questa e' la
    //    causa del fallimento del 03/09/2026: `mock-auth.gateway` scrive la
    //    sessione anche in `localStorage`, e Lighthouse fra una misura e
    //    l'altra NON lo azzera — `clearStorageTypes` vale
    //    `['file_systems', 'shader_cache', 'service_workers', 'cache_storage']`
    //    (`lighthouse/core/config/constants.js`). Alla seconda invocazione la
    //    sessione e' ancora viva, `/login` rimanda alla dashboard, e attendere
    //    il modulo per trenta secondi faceva uscire `lhci` con codice 1.
    const modulo = await page
      .waitForSelector('#login-email', { timeout: 30_000 })
      .catch(() => null);

    if (modulo) {
      await page.type('#login-email', 'owner@vestiflow.test');
      await page.type('#login-password', 'owner123');
      await page.click('button[type="submit"]');

      // ⛔ **`page.waitForURL` NON ESISTE in Puppeteer**: e' API di Playwright.
      //    Verificato su puppeteer-core 24.43.1 — `waitForURL: undefined`.
      //
      // ⚠️ E nemmeno `waitForNavigation` andrebbe bene: l'accesso non ricarica
      //    la pagina, e' instradamento del client. Si attende il percorso.
      await page.waitForFunction(() => window.location.pathname.startsWith('/app/'), {
        timeout: 30_000,
      });
      return;
    }

    // ⚠️ Nessun modulo: o si e' gia' dentro (la sessione e' sopravvissuta, ed
    //    e' il caso normale dalla seconda invocazione in poi), oppure e'
    //    successo altro — e allora si fallisce dicendo DOVE si e' finiti,
    //    invece di lasciare che la misura prosegua su una pagina qualunque.
    const dove = await page.evaluate(() => window.location.href);
    if (!new URL(dove).pathname.startsWith('/app/')) {
      throw new Error("Modulo di accesso assente e non si e' dentro l'app: " + dove);
    }
  } finally {
    await page.close();
  }
};
