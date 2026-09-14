import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { AZIENDA, CONNESSIONE, IMPOSTAZIONI_FUNZIONI } from './helpers/impostazioni-fixtures';
import { test } from './helpers/isolated-test';

/**
 * IMPOSTAZIONI → SHOPIFY, la sola sede dei comandi generali (11/09/2026).
 *
 * I quattro casi di raggiungibilità chiesti dal proprietario — titolare, utente
 * con un solo permesso di sincronizzazione, utente senza quei permessi, tenant
 * senza modulo Shopify — con gli utenti dell'auth finta. Più il quinto, deciso
 * lo stesso giorno: chi ha la COMBINAZIONE dell'API per i clienti («Esportare
 * dati» E «Gestire clienti») raggiunge la pagina e vede quel solo comando. E il
 * rovescio: le barre di Prodotti, Giacenze, Clienti e Ordini cliente non
 * portano più i pulsanti.
 */

const SCATTI = 'test-results/impostazioni-shopify';

const SEDI = [
  {
    id: 'loc-1',
    name: 'Negozio centro',
    code: 'LOC-1',
    tenantId: 'ten-1',
    isActive: true,
    licensedInVf: true,
    shopifySyncStatus: 'synced',
    shopify: { status: 'synced', lastSyncedAt: '2026-09-01T00:00:00.000Z' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const ESITO_CLIENTI = {
  synced: true,
  imported: 2,
  updated: 1,
  skipped: 0,
  remoteCustomerCount: 3,
  failed: [],
};

/** Un blocco di «Allinea giacenze» che chiude il perimetro al primo giro. */
const BLOCCO_ALLINEA = {
  totale: 4,
  esaminate: 4,
  allineate: 3,
  giaAllineate: 1,
  nonAllineate: [],
  prossimo: null,
  fine: true,
};

async function instrada(page: Page): Promise<void> {
  for (const [rotta, corpo] of [
    ['**/api/v1/shopify/connection', CONNESSIONE],
    ['**/api/v1/tenant/company', AZIENDA],
    ['**/api/v1/tenant/feature-settings', IMPOSTAZIONI_FUNZIONI],
    ['**/api/v1/inventory/locations**', SEDI],
    ['**/api/v1/unit-of-measure-options', []],
    ['**/api/v1/vat-codes', []],
    ['**/api/v1/shopify/sync/inventory/align', BLOCCO_ALLINEA],
    ['**/api/v1/shopify/sync/customers', ESITO_CLIENTI],
  ] as const) {
    await page.route(rotta, (route: Route) =>
      route.fulfill({ status: 200, json: corpo as object }),
    );
  }
}

/** La sessione salvata è del titolare: per gli altri si entra da capo. */
async function entraCome(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/app\//, { timeout: 30_000 });
}

const vociMenu = (page: Page) =>
  page.locator('nav.app-sidebar').getByRole('link', { name: 'Impostazioni', exact: true });

test('⭐ titolare: dalla card delle Impostazioni alla pagina Shopify con le cinque schede', async ({
  page,
}) => {
  await instrada(page);
  await page.goto('/app/settings');
  await page.getByRole('button', { name: 'Apri Shopify' }).click({ timeout: 45_000 });
  // Senza scheda nella rotta si apre la sincronizzazione automatica, e la rotta lo dice.
  await expect(page).toHaveURL(/\/app\/settings\/shopify\/sincronizzazione$/);

  const schede = page.getByRole('navigation', { name: 'Aree di Shopify' });
  for (const scheda of [
    /^Prima connessione/,
    /^Sincronizzazione automatica/,
    'Operazioni manuali',
    /^Problemi ed esiti/,
    'Connessione e sedi',
  ]) {
    await expect(schede.getByRole('link', { name: scheda })).toBeVisible();
  }
  await expect(page.getByText('demo.myshopify.com').first()).toBeVisible();

  // Operazioni manuali: le quattro, con la direzione scritta accanto.
  await schede.getByRole('link', { name: 'Operazioni manuali' }).click();
  await expect(page).toHaveURL(/\/shopify\/operazioni$/);
  await expect(page.getByText('VestiFlow → Shopify', { exact: true })).toBeVisible();
  await expect(page.getByText('Shopify → VestiFlow', { exact: true })).toHaveCount(3);
  for (const comando of [
    'Importa catalogo',
    'Allinea giacenze su Shopify',
    'Importa clienti',
    'Importa ordini',
  ]) {
    await expect(page.getByRole('button', { name: comando })).toBeVisible();
  }
  // Connessione e sedi: il comando sulle location e la disconnessione.
  await schede.getByRole('link', { name: 'Connessione e sedi' }).click();
  await expect(page.getByRole('button', { name: 'Rileggi le location dal negozio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disconnetti Shopify' })).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/titolare.png`, fullPage: true });
});

test('⭐ un solo permesso di sync: il menu porta a Shopify, la pagina mostra il solo comando, la radice resta chiusa', async ({
  page,
}) => {
  await instrada(page);
  await entraCome(page, 'sync@vestiflow.test', 'sync123');

  const voce = vociMenu(page);
  await expect(voce).toBeVisible();
  await expect(voce).toHaveAttribute('href', '/app/settings/shopify');
  await voce.click();
  // Senza il permesso sulla connessione la scheda predefinita sono le operazioni, e la rotta lo dice.
  await expect(page).toHaveURL(/\/app\/settings\/shopify\/operazioni$/);

  await expect(page.getByRole('heading', { name: /Operazioni avviate manualmente/ })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByRole('button', { name: 'Allinea giacenze su Shopify' })).toBeVisible();
  // ⭐ UN solo comando manuale sulle quantità (13/09/2026): niente «Riallinea».
  await expect(page.getByRole('button', { name: /Riallinea/ })).toHaveCount(0);
  for (const assente of [
    'Importa catalogo',
    'Importa clienti',
    'Importa ordini',
    'Rileggi le location dal negozio',
    'Disconnetti Shopify',
    'Connetti Shopify',
  ]) {
    await expect(page.getByRole('button', { name: assente })).toHaveCount(0);
  }
  // Senza il permesso sulla connessione niente schede: solo le operazioni concesse.
  await expect(page.getByRole('navigation', { name: 'Aree di Shopify' })).toHaveCount(0);
  await expect(page.getByText(/visibili al titolare/)).toBeVisible();

  // Il comando si esegue, e l'esito compare sulla sua riga.
  await page.getByRole('button', { name: 'Allinea giacenze su Shopify' }).click();
  const esiti = page.getByRole('listitem', { name: 'Allinea giacenze su Shopify' });
  await expect(esiti.getByRole('status')).toContainText('Controllo completato');
  await page.screenshot({ path: `${SCATTI}/solo-giacenze.png`, fullPage: true });

  // Le altre Impostazioni restano chiuse: la radice rimanda alla dashboard.
  await page.goto('/app/settings');
  await expect(page).toHaveURL(/\/app\/dashboard/);
});

test('⭐ la combinazione dei clienti (Esportare dati E Gestire clienti): il menu porta a Shopify, «Importa clienti» c’è e si esegue, «Importa ordini» no', async ({
  page,
}) => {
  await instrada(page);
  await entraCome(page, 'clienti@vestiflow.test', 'clienti123');

  const voce = vociMenu(page);
  await expect(voce).toBeVisible();
  await expect(voce).toHaveAttribute('href', '/app/settings/shopify');
  await voce.click();
  // Senza il permesso sulla connessione la scheda predefinita sono le operazioni, e la rotta lo dice.
  await expect(page).toHaveURL(/\/app\/settings\/shopify\/operazioni$/);

  await expect(page.getByRole('heading', { name: /Operazioni avviate manualmente/ })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByRole('button', { name: 'Importa clienti' })).toBeVisible();
  await expect(page.getByText('Shopify → VestiFlow', { exact: true })).toHaveCount(1);
  for (const assente of [
    'Importa ordini',
    'Importa catalogo',
    'Allinea giacenze su Shopify',
    'Rileggi le location dal negozio',
    'Disconnetti Shopify',
  ]) {
    await expect(page.getByRole('button', { name: assente })).toHaveCount(0);
  }
  await expect(page.getByRole('heading', { name: 'Connessione' })).toHaveCount(0);

  // Il comando si esegue e la chiamata parte: l’esito compare accanto ai Comandi.
  const chiamata = page.waitForRequest('**/api/v1/shopify/sync/customers');
  await page.getByRole('button', { name: 'Importa clienti' }).click();
  expect((await chiamata).method()).toBe('POST');
  const esiti = page.getByRole('region', { name: /Operazioni avviate manualmente/ });
  await expect(esiti.getByRole('status')).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/solo-clienti.png`, fullPage: true });

  await page.goto('/app/settings');
  await expect(page).toHaveURL(/\/app\/dashboard/);
});

test('⛔ senza permessi di sync: nessuna voce Impostazioni e la pagina Shopify rimanda alla dashboard', async ({
  page,
}) => {
  await instrada(page);
  await entraCome(page, 'manager@vestiflow.test', 'manager123');
  await expect(page.locator('nav.app-sidebar')).toBeVisible();
  await expect(vociMenu(page)).toHaveCount(0);
  await page.goto('/app/settings/shopify');
  await expect(page).toHaveURL(/\/app\/dashboard/);
});

test('⛔ tenant senza modulo Shopify: nessuna card e la pagina rimanda alla dashboard', async ({
  page,
}) => {
  await instrada(page);
  await entraCome(page, 'gestionale@vestiflow.test', 'gestionale123');
  await page.goto('/app/settings');
  await expect(page.getByRole('heading', { name: 'Impostazioni', level: 1 })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByRole('button', { name: 'Apri Shopify' })).toHaveCount(0);
  await page.goto('/app/settings/shopify');
  await expect(page).toHaveURL(/\/app\/dashboard/);
});

test('⛔ le barre di Giacenze e Ordini cliente non portano più i comandi Shopify', async ({
  page,
}) => {
  await instrada(page);
  await page.route('**/api/v1/inventory/levels**', (route: Route) =>
    route.fulfill({ status: 200, json: { items: [], page: 1, pageSize: 50, total: 0 } }),
  );
  await page.route('**/api/v1/sales-orders**', (route: Route) =>
    route.fulfill({ status: 200, json: { items: [], page: 1, pageSize: 100, total: 0 } }),
  );

  await page.goto('/app/inventory');
  await expect(page.getByRole('button', { name: 'Importa le giacenze da CSV' })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByRole('button', { name: /Riallinea/ })).toHaveCount(0);

  await page.goto('/app/sales/shopify');
  await expect(page.getByRole('heading', { name: 'Ordini Shopify', level: 1 })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByRole('button', { name: 'Sincronizza le vendite da Shopify' })).toHaveCount(
    0,
  );
});
