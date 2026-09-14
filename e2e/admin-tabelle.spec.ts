import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { test } from './helpers/isolated-test';

/**
 * L'AMMINISTRAZIONE di piattaforma (`docs/26` A13 · A14): l'elenco delle aziende
 * sul motore comune, e la maschera degli utenti di un tenant con la grammatica
 * condivisa. Si entra con l'amministratore dell'auth finta, aggiunto apposta:
 * il titolare non vede queste pagine.
 *
 * ⛔ Risposte nella forma di `TenantSummary[]`, `TenantDetail` e `TenantUser[]`.
 */

const SCATTI = 'test-results/admin';

const AZIENDE = [
  {
    id: 't-1',
    name: 'Negozio Demo',
    channelProfile: 'shopify',
    createdAt: '2026-03-01T10:00:00.000Z',
    ownerEmail: 'owner@vestiflow.test',
    ownerDisplayName: 'Olivia Bianchi',
    vatNumber: 'IT01234567890',
  },
  {
    id: 't-2',
    name: 'Boutique Rossi',
    channelProfile: 'gestionale',
    createdAt: '2026-01-15T10:00:00.000Z',
    ownerEmail: 'rossi@esempio.it',
    ownerDisplayName: 'Marco Rossi',
    vatNumber: null,
  },
];

const DETTAGLIO = {
  id: 't-1',
  name: 'Negozio Demo',
  channelProfile: 'shopify',
  licensedLocationCount: 1,
  licensedLocationActiveCount: 1,
  locationSelectionLocked: false,
  locationSelectionChangeGranted: false,
  canChangeLicensedLocations: true,
  createdAt: '2026-03-01T10:00:00.000Z',
  profile: {
    legalName: 'Negozio Demo Srl',
    vatNumber: 'IT01234567890',
    fiscalCode: null,
    phone: null,
    pec: null,
    sdiCode: null,
    iban: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    province: null,
    postalCode: null,
    countryCode: 'IT',
  },
  owner: {
    id: 'u-owner',
    email: 'owner@vestiflow.test',
    displayName: 'Olivia Bianchi',
    role: 'owner',
  },
  store: null,
  activeLocations: [{ id: 'loc-1', name: 'Negozio centro', code: 'LOC-1', isActive: true }],
  location: null,
};

const UTENTI = [
  {
    id: 'u-owner',
    email: 'owner@vestiflow.test',
    displayName: 'Olivia Bianchi',
    role: 'owner',
    hasAllLocationsAccess: true,
    assignedLocationIds: [],
    assignedLocations: [],
    defaultLocationId: null,
    permissions: [],
    isActive: true,
    createdAt: '2026-03-01T10:00:00.000Z',
  },
  {
    id: 'u-clerk',
    email: 'anna@vestiflow.test',
    displayName: 'Anna Verdi',
    role: 'clerk',
    hasAllLocationsAccess: false,
    assignedLocationIds: ['loc-1'],
    assignedLocations: [{ id: 'loc-1', name: 'Negozio centro' }],
    defaultLocationId: 'loc-1',
    permissions: ['section.products'],
    isActive: true,
    createdAt: '2026-04-01T10:00:00.000Z',
  },
];

async function entraComeAmministratore(page: Page): Promise<void> {
  await page.route('**/api/v1/admin/tenants', (route: Route) =>
    route.fulfill({ status: 200, json: AZIENDE }),
  );
  await page.route('**/api/v1/admin/tenants/t-1', (route: Route) =>
    route.fulfill({ status: 200, json: DETTAGLIO }),
  );
  await page.route('**/api/v1/admin/tenants/t-1/users', (route: Route) =>
    route.fulfill({ status: 200, json: UTENTI }),
  );
  // ⚠️ La sessione salvata è del titolare: qui si entra da capo come amministratore.
  await page.context().clearCookies();
  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/login');
  await page.locator('#login-email').fill('admin@vestiflow.test');
  await page.locator('#login-password').fill('admin123');
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/app\//, { timeout: 30_000 });
}

test('⭐ le aziende sono un elenco del motore: filtri, ordinamento, «Apri gestionale» sulla selezione', async ({
  page,
}) => {
  await entraComeAmministratore(page);
  await page.goto('/app/admin/clients');

  const tabella = page.getByRole('table', { name: 'Clienti registrati' });
  const righe = tabella.locator('tbody tr.data-table__row');
  await expect(righe).toHaveCount(2, { timeout: 45_000 });
  await expect(tabella.locator('tfoot.data-table__totals')).toContainText('2 voci');

  // Ordinamento sulla DATA (valore ISO): gennaio prima di marzo.
  await tabella.getByRole('button', { name: 'Ordina per Creato il' }).click();
  await expect(righe.first()).toContainText('Boutique Rossi');

  // Filtro a valori sul Profilo.
  await page.getByRole('button', { name: /^Filtri/ }).click();
  await tabella.getByRole('button', { name: 'Filtra per Profilo' }).click();
  await page.getByRole('option', { name: 'Shopify', exact: true }).click();
  await expect(righe).toHaveCount(1);
  await expect(righe.first()).toContainText('Negozio Demo');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Filtri/ }).click();
  await expect(righe).toHaveCount(2);

  // «Apri gestionale»: spento senza selezione, con il motivo; acceso con un'azienda scelta.
  const apri = page.getByRole('button', { name: 'Apri il gestionale dell’azienda selezionata' });
  await expect(apri).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Seleziona Negozio Demo' }).check();
  await expect(apri).toBeEnabled();
  await page.screenshot({ path: `${SCATTI}/aziende.png` });

  // Il clic di riga apre la modifica del cliente.
  await righe.filter({ hasText: 'Negozio Demo' }).click();
  await expect(page).toHaveURL(/\/app\/admin\/clients\/t-1/);
});

test('⭐ gli utenti del tenant: maschera con la grammatica condivisa, permessi che si aprono', async ({
  page,
}) => {
  await entraComeAmministratore(page);
  await page.goto('/app/admin/clients/t-1');

  const riga = page.locator('.admin-users__table tbody tr').filter({ hasText: 'Anna Verdi' });
  await expect(riga).toBeVisible({ timeout: 45_000 });
  const vedi = riga.getByRole('button', { name: 'Vedi permessi' });
  await expect(vedi).toHaveAttribute('aria-expanded', 'false');
  await vedi.click();
  await expect(page.locator('.admin-users__permissions-row')).toBeVisible();
  await expect(riga.getByRole('button', { name: 'Nascondi' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  // Il titolare si modifica sul posto: la tendina del ruolo c'è ancora.
  await expect(page.getByRole('button', { name: 'Ruolo account titolare' })).toBeVisible();

  const grammatica = await page.evaluate(() => {
    const tabella = document.querySelector('.admin-users__table')!;
    const sedi = document.querySelector('.admin-users__cell-locations')!;
    const figli = Array.from(sedi.children).map((f) => f.getBoundingClientRect());
    return {
      collasso: getComputedStyle(tabella).borderCollapse,
      // «Tutte le sedi» e la tendina della predefinita stanno una SOTTO l’altra.
      impilati: figli.length === 2 && figli[1]!.top >= figli[0]!.bottom,
    };
  });
  expect(grammatica.collasso).toBe('separate');
  expect(grammatica.impilati).toBe(true);
  await page.screenshot({ path: `${SCATTI}/utenti-tenant.png` });
});

test('⭐ e sul telefono: aziende a card con «Seleziona», utenti con l’etichetta per cella', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await entraComeAmministratore(page);
  await page.goto('/app/admin/clients');

  await expect(page.locator('.list-card__head').filter({ hasText: 'Negozio Demo' })).toBeVisible({
    timeout: 45_000,
  });
  const apri = page.getByRole('button', { name: 'Apri il gestionale dell’azienda selezionata' });
  await expect(apri).toBeDisabled();
  await page.getByRole('button', { name: 'Seleziona', exact: true }).click();
  await page.locator('tbody tr.data-table__row').filter({ hasText: 'Negozio Demo' }).click();
  await expect(apri).toBeEnabled();
  await page.screenshot({ path: `${SCATTI}/aziende-telefono.png`, fullPage: true });

  await page.goto('/app/admin/clients/t-1');
  const riga = page.locator('.admin-users__table tbody tr').filter({ hasText: 'Anna Verdi' });
  await expect(riga).toBeVisible({ timeout: 45_000 });
  const etichette = await riga.evaluate((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => td.getAttribute('data-label')),
  );
  expect(etichette).toEqual(['Nome', 'Email', 'Ruolo', 'Sede operativa', 'Permessi']);
  const eccesso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(eccesso).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SCATTI}/utenti-tenant-telefono.png`, fullPage: true });
});
