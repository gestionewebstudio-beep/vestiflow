import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { apriImpostazioni } from './helpers/impostazioni-fixtures';
import { test } from './helpers/isolated-test';
import { CONNESSIONE_SANA, percorsoAttivato } from './helpers/situazione-shopify-fixtures';

/**
 * LA CODA DEI WEBHOOK, guardata a schermo (docs/30 §7.1.2 D4 e D7, 15/09/2026): gli stati
 * delle notifiche nei Problemi (fallita con «Riprova», sospesa dopo il ripristino, scartata
 * per sync spenta, scartata per associazione cambiata) e il comando «Togli le notifiche
 * concluse da oltre 30 giorni» — visibile solo a chi gestisce la connessione, con conferma
 * delle conseguenze, caricamento, risultato ed errore. Scrivania e telefono.
 *
 * ⛔ Nessuna API, nessuno Shopify: risposte nella forma vera dei DTO (fixture E2E).
 *    È la verifica della funzione introdotta, non un giro estetico.
 */
const SCATTI = 'test-results/notifiche-webhook';

const MOTIVO_SYNCING =
  'L’articolo «Maglia» risulta in sincronizzazione verso Shopify: la notifica è rinviata e si applica quando la pubblicazione finisce. Se nessuna pubblicazione è in corso, lo stato è rimasto bloccato da un’interruzione: «Sincronizza con Shopify» dal dettaglio articolo lo sblocca — attenzione, pubblica sul negozio i dati locali.';

function eventiNonApplicati() {
  const base = { tipo: 'evento', sede: null, apri: null, rilevatoAt: '2026-09-15T18:00:00.000Z' };
  return [
    {
      ...base,
      causa: 'evento_fallito',
      riferimento: 'r-fallita',
      nome: 'products/update · prodotto:42',
      dettaglio: MOTIVO_SYNCING,
      conseguenza: `Notifica di Shopify non applicata dopo 6 tentativi: ciò che è cambiato là per questa risorsa non è arrivato, e gli eventi successivi della stessa risorsa aspettano. ${MOTIVO_SYNCING}`,
      azione: {
        tipo: 'riprova_evento',
        etichetta: 'Rimetti in coda questa notifica, con le stesse protezioni',
        riferimento: 'r-fallita',
      },
    },
    {
      ...base,
      causa: 'evento_sospeso_dopo_ripristino',
      riferimento: 'r-sospesa',
      nome: 'orders/updated · ordine:5001',
      dettaglio: null,
      conseguenza:
        'Notifica ancora da applicare al momento del backup: dopo il ripristino non riparte da sola.',
      azione: {
        tipo: 'riprova_evento',
        etichetta: 'Riprova, dopo aver verificato che il negozio collegato sia lo stesso',
        riferimento: 'r-sospesa',
      },
    },
    {
      ...base,
      causa: 'evento_scartato_sync_spenta',
      riferimento: 'r-spenta',
      nome: 'customers/update · cliente:7',
      dettaglio: 'Aggiornamenti automatici da Shopify disattivati al momento dell’elaborazione.',
      conseguenza:
        'Arrivata con gli aggiornamenti automatici disattivati: non applicata e non si riprova.',
      azione: {
        tipo: 'importa_ordini',
        etichetta: 'Riallinea con «Importa ordini» / «Importa catalogo»',
        riferimento: null,
      },
    },
    {
      ...base,
      causa: 'evento_scartato_associazione_cambiata',
      riferimento: 'r-cambiata',
      nome: 'orders/create · ordine:5002',
      dettaglio:
        'Il negozio non è più collegato a questa azienda come quando la notifica è arrivata: nessun effetto applicato.',
      conseguenza:
        'Il negozio non è più collegato a questa azienda come quando la notifica è arrivata: nessun effetto, per non applicare eventi vecchi a un altro collegamento.',
      azione: { tipo: 'nessuna', etichetta: 'Nessuna: resta documentata', riferimento: null },
    },
  ];
}

async function instrada(page: Page, problemi = eventiNonApplicati()) {
  const setup = {
    ...percorsoAttivato(),
    situazione: { calcolataAt: '2026-09-15T18:05:00.000Z', problemi },
  };
  await page.route('**/api/v1/shopify/setup', (route: Route) =>
    route.fulfill({ status: 200, json: setup }),
  );
  await page.route('**/api/v1/shopify/setup/**', (route: Route) =>
    route.fulfill({ status: 200, json: setup }),
  );
  await apriImpostazioni(page, [], '/app/settings/shopify', CONNESSIONE_SANA);
  await expect(page.getByText('demo.myshopify.com').first()).toBeVisible({ timeout: 45_000 });
}

const schede = (page: Page) => page.getByRole('navigation', { name: 'Aree di Shopify' });
const pulsantePulizia = (page: Page) =>
  page.getByRole('button', { name: 'Togli le notifiche concluse da oltre 30 giorni' });

test('scrivania, titolare: il comando c è a destra di «Verifica ora»; conferma con le conseguenze; caricamento; risultato con eliminate e conservate', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await instrada(page);
  await expect(page).toHaveURL(/\/shopify\/sincronizzazione/);
  await expect(page.getByRole('heading', { name: /Notifiche dal negozio/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verifica ora' })).toBeVisible();
  await expect(pulsantePulizia(page)).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/01-notifiche-desktop.png` });

  // La conferma dice le conseguenze: solo concluse >30 gg, le altre restano, non si recuperano.
  await pulsantePulizia(page).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText('Togliere le notifiche concluse da oltre 30 giorni?');
  await expect(dialogo).toContainText('Quelle in attesa, fallite o sospese restano');
  await expect(dialogo).toContainText('non si recuperano');
  await page.screenshot({ path: `${SCATTI}/02-conferma-desktop.png` });
  // «Annulla» non chiama niente.
  let chiamate = 0;
  await page.route('**/api/v1/shopify/webhook-ricevute/pulizia', async (route: Route) => {
    chiamate += 1;
    await new Promise((r) => setTimeout(r, 700));
    await route.fulfill({ status: 200, json: { eliminate: 12, conservate: 4 } });
  });
  await dialogo.getByRole('button', { name: 'Annulla' }).click();
  await expect(dialogo).toBeHidden();
  expect(chiamate).toBe(0);

  // Conferma → caricamento sul pulsante → riscontro con i due numeri.
  await pulsantePulizia(page).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sì, togli le concluse' }).click();
  await expect(pulsantePulizia(page)).toBeDisabled();
  await page.screenshot({ path: `${SCATTI}/03-caricamento-desktop.png` });
  const riscontro = page.getByRole('status').filter({ hasText: /12 notifiche concluse/ });
  await expect(riscontro).toBeVisible();
  await expect(riscontro).toContainText('4 conservate');
  await expect(riscontro).toContainText('in attesa, fallite e sospese non si toccano');
  expect(chiamate).toBe(1);
  await expect(pulsantePulizia(page)).toBeEnabled();
  await page.screenshot({ path: `${SCATTI}/04-risultato-desktop.png` });
});

test('scrivania, titolare: se l API rifiuta, l errore si legge e il comando torna disponibile; con zero da togliere lo dice', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await instrada(page);
  await page.route('**/api/v1/shopify/webhook-ricevute/pulizia', (route: Route) =>
    route.fulfill({ status: 403, json: { message: 'Comando riservato al titolare.' } }),
  );
  await pulsantePulizia(page).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sì, togli le concluse' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Comando riservato al titolare.' }),
  ).toBeVisible();
  await expect(pulsantePulizia(page)).toBeEnabled();
  await page.screenshot({ path: `${SCATTI}/05-errore-desktop.png` });

  await page.unroute('**/api/v1/shopify/webhook-ricevute/pulizia');
  await page.route('**/api/v1/shopify/webhook-ricevute/pulizia', (route: Route) =>
    route.fulfill({ status: 200, json: { eliminate: 0, conservate: 4 } }),
  );
  await pulsantePulizia(page).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sì, togli le concluse' }).click();
  await expect(
    page.getByRole('status').filter({
      hasText: 'Nessuna notifica conclusa da più di 30 giorni da togliere (4 conservate).',
    }),
  ).toBeVisible();
});

test('scrivania, titolare: i quattro stati delle notifiche nei Problemi, ognuno con la propria azione; «Riprova» chiama l API sulla STESSA ricevuta e rilegge', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await instrada(page);
  const nav = schede(page);
  await nav.getByRole('link', { name: 'Problemi ed esiti 4' }).click();
  await expect(page).toHaveURL(/\/shopify\/problemi/);
  // Le quattro cause, con la conseguenza; il tipo si legge «Notifica».
  for (const causa of [
    'Notifica di Shopify non applicata',
    'Notifica sospesa dopo il ripristino',
    'Notifica scartata: aggiornamenti automatici disattivati',
    'Notifica scartata: negozio non più collegato così',
  ]) {
    await expect(page.getByText(causa).first()).toBeVisible();
  }
  // La fallita porta il motivo per l'operatore NELL'EFFETTO (non troncato), comprese le
  // conseguenze del push di sblocco.
  const effettoFallita = page
    .getByRole('row')
    .filter({ hasText: 'Notifica di Shopify non applicata' })
    .first();
  await expect(effettoFallita).toContainText('pubblica sul negozio i dati locali');
  await page.screenshot({ path: `${SCATTI}/06-problemi-desktop.png` });

  let riprovata: string | null = null;
  await page.route('**/api/v1/shopify/webhook-ricevute/*/riprova', (route: Route) => {
    riprovata = route.request().url().split('/webhook-ricevute/')[1]!.split('/')[0]!;
    return route.fulfill({ status: 200, json: { inCoda: true } });
  });
  let riletture = 0;
  await page.route('**/api/v1/shopify/setup', (route: Route) => {
    riletture += 1;
    return route.fulfill({
      status: 200,
      json: {
        ...percorsoAttivato(),
        situazione: {
          calcolataAt: '2026-09-15T18:06:00.000Z',
          problemi: eventiNonApplicati().filter((p) => p.riferimento !== 'r-fallita'),
        },
      },
    });
  });
  // «Riprova» è l'azione di pagina della riga fallita (forma breve «Riprova ›»).
  await page
    .getByRole('button', { name: /^Riprova ›$/ })
    .first()
    .click();
  await expect.poll(() => riprovata).toBe('r-fallita');
  await expect.poll(() => riletture).toBeGreaterThan(0);
  // Rilette: la fallita non c'è più fra i problemi; le altre tre sì.
  await expect(page.getByText('Notifica di Shopify non applicata')).toHaveCount(0);
  await expect(page.getByText('Notifica sospesa dopo il ripristino').first()).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/07-problemi-dopo-riprova-desktop.png` });
});

test('scrivania, utente senza gestione della connessione (user-sync): la pagina si apre ma né notifiche né pulizia compaiono', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('vestiflow-mock-user-id', 'user-sync');
  });
  await page.setViewportSize({ width: 1280, height: 1000 });
  const setup = {
    ...percorsoAttivato(),
    situazione: { calcolataAt: '2026-09-15T18:05:00.000Z', problemi: eventiNonApplicati() },
  };
  await page.route('**/api/v1/shopify/setup', (route: Route) =>
    route.fulfill({ status: 200, json: setup }),
  );
  await apriImpostazioni(page, [], '/app/settings/shopify', CONNESSIONE_SANA);
  await expect(page).toHaveURL(/\/app\/settings\/shopify/);
  await expect(page.getByRole('heading', { name: /Notifiche dal negozio/ })).toHaveCount(0);
  await expect(pulsantePulizia(page)).toHaveCount(0);
  await page.screenshot({ path: `${SCATTI}/08-senza-gestione-desktop.png` });
});

test('telefono (390): il comando sta nella riga del titolo e va a capo senza uscire dallo schermo; conferma e riscontro leggibili; i Problemi a card con l azione', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await instrada(page);
  const pulsante = pulsantePulizia(page);
  await pulsante.scrollIntoViewIfNeeded();
  await expect(pulsante).toBeVisible();
  const box = (await pulsante.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${SCATTI}/09-notifiche-telefono.png` });

  await page.route('**/api/v1/shopify/webhook-ricevute/pulizia', (route: Route) =>
    route.fulfill({ status: 200, json: { eliminate: 3, conservate: 4 } }),
  );
  await pulsante.click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  const boxDialogo = (await dialogo.boundingBox())!;
  expect(boxDialogo.x + boxDialogo.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${SCATTI}/10-conferma-telefono.png` });
  await dialogo.getByRole('button', { name: 'Sì, togli le concluse' }).click();
  await expect(page.getByRole('status').filter({ hasText: /3 notifiche concluse/ })).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/11-risultato-telefono.png` });

  await schede(page).getByRole('link', { name: 'Problemi ed esiti 4' }).click();
  await expect(page.getByText('Notifica di Shopify non applicata').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Riprova ›$/ }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${SCATTI}/12-problemi-telefono.png`, fullPage: true });
});
