/**
 * Login mock prima delle route /app/* per Lighthouse CI (build e2e, auth in sessionStorage).
 */
module.exports = async (browser, context) => {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4210/login', { waitUntil: 'networkidle0' });

  // ⛔ **Puppeteer non attende da solo.** `page.type()` pretende che
  //    l'elemento ci sia gia', e `networkidle0` non garantisce che Angular
  //    abbia reso: il messaggio era «No element found for selector:
  //    #login-email», che si legge come un selettore sbagliato mentre e'
  //    un'attesa mancante. Gli stessi id li usa l'auth finta di Playwright,
  //    che in CI passa — perche' `.fill()` attende.
  await page.waitForSelector('#login-email', { timeout: 30_000 });

  await page.type('#login-email', 'owner@vestiflow.test');
  await page.type('#login-password', 'owner123');
  await page.click('button[type="submit"]');

  // ⛔ **`page.waitForURL` NON ESISTE in Puppeteer**: e' API di Playwright.
  //    Verificato su puppeteer-core 24.43.1 — `waitForURL: undefined`. Lo
  //    script sarebbe morto qui appena superata la riga sopra.
  //
  // ⚠️ E nemmeno `waitForNavigation` andrebbe bene: l'accesso non ricarica
  //    la pagina, e' instradamento del client. Si attende il percorso.
  await page.waitForFunction(() => window.location.pathname.startsWith('/app/dashboard'), {
    timeout: 30_000,
  });
  await page.close();
};
