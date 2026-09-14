import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { test } from './helpers/isolated-test';

/**
 * UTENTI — una MASCHERA che riusa la grammatica condivisa (`docs/26` D2),
 * guardata a schermo.
 *
 * ⛔ Non è un elenco: ogni riga si compila sul posto e si salva da sé, e la riga
 *    «Personalizza» apre l'editor dei permessi a tutta larghezza. Qui si
 *    verifica che questo comportamento sia INTATTO dopo il riuso della
 *    grammatica di tabella, dei pulsanti e delle card sotto `lg`.
 */

const PAGINA = '/app/settings/utenti';
const SCATTI = 'test-results/utenti';

const SEDE = { id: 'loc-1', name: 'Negozio centro' };

const UTENTI = [
  {
    id: 'u-owner',
    email: 'owner@vestiflow.test',
    displayName: 'Titolare',
    role: 'owner',
    hasAllLocationsAccess: true,
    assignedLocationIds: [],
    assignedLocations: [],
    defaultLocationId: null,
    permissions: [],
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'u-clerk',
    email: 'anna@vestiflow.test',
    displayName: 'Anna Rossi',
    role: 'clerk',
    hasAllLocationsAccess: false,
    assignedLocationIds: [SEDE.id],
    assignedLocations: [SEDE],
    defaultLocationId: SEDE.id,
    permissions: ['section.products'],
    isActive: true,
    createdAt: '2026-02-01T00:00:00.000Z',
  },
];

async function apri(page: Page): Promise<void> {
  await page.route('**/api/v1/tenant/users', (route: Route) =>
    route.fulfill({ status: 200, json: UTENTI }),
  );
  await page.route('**/api/v1/inventory/locations**', (route: Route) =>
    route.fulfill({
      status: 200,
      json: [
        {
          ...SEDE,
          tenantId: 'ten-1',
          isActive: true,
          licensedInVf: true,
          shopifySyncStatus: 'not_synced',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }),
  );
  await page.goto(PAGINA);
  await expect(page.getByRole('heading', { name: 'Utenti' })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('.settings-users__table tbody tr')).toHaveCount(2);
}

test('⭐ la maschera conserva editing, «Personalizza» ed «Elimina», con la grammatica condivisa', async ({
  page,
}) => {
  await apri(page);
  const riga = page.locator('.settings-users__table tbody tr').filter({ hasText: 'Anna Rossi' });

  // Il titolare non si modifica: la riga lo dice, senza controlli.
  await expect(
    page.locator('.settings-users__table tbody tr').filter({ hasText: 'Titolare' }),
  ).toContainText('Tutte le sedi');

  // Editing sul posto: casella Attivo, tendina Ruolo, sedi.
  await expect(riga.getByRole('checkbox', { name: 'Account attivo per Anna Rossi' })).toBeChecked();
  await expect(riga.getByRole('button', { name: 'Ruolo utente' })).toContainText('Commesso');
  await expect(riga.getByRole('button', { name: 'Sedi operative utente' })).toBeVisible();

  // «Personalizza» apre la riga dei permessi a tutta larghezza — e la richiude.
  const personalizza = riga.getByRole('button', { name: 'Personalizza' });
  await expect(personalizza).toHaveAttribute('aria-expanded', 'false');
  await personalizza.click();
  await expect(personalizza).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.settings-users__permissions-row')).toBeVisible();
  await expect(
    page.locator('.settings-users__permissions-row app-user-permissions-editor'),
  ).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/personalizza.png` });
  await personalizza.click();
  await expect(page.locator('.settings-users__permissions-row')).toHaveCount(0);

  // «Elimina» è il pulsante condiviso, con il nome dell'utente.
  await expect(riga.getByRole('button', { name: 'Elimina utente Anna Rossi' })).toBeEnabled();

  // La grammatica condivisa delle maschere (`data-table-desktop`, la stessa delle
  // righe documento): `border-collapse: separate` e la cornice sulla tabella sono
  // del mixin — la `<table>` a mano aveva `collapse` e nessuna cornice.
  const grammatica = await page.evaluate(() => {
    const tabella = document.querySelector('.settings-users__table')!;
    const stile = getComputedStyle(tabella);
    return { collasso: stile.borderCollapse, cornice: stile.borderTopWidth };
  });
  expect(grammatica.collasso).toBe('separate');
  expect(grammatica.cornice).not.toBe('0px');
  await page.screenshot({ path: `${SCATTI}/maschera.png` });
});

test('⭐ e sul telefono ogni utente è una card con l’etichetta per cella, e le tendine si aprono', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await apri(page);
  const riga = page.locator('.settings-users__table tbody tr').filter({ hasText: 'Anna Rossi' });

  // Le celle portano l'etichetta della colonna (`data-label`): senza, sulla card
  // una tendina «Commesso/a» non direbbe che è il Ruolo.
  const etichette = await riga.evaluate((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => td.getAttribute('data-label')),
  );
  expect(etichette).toEqual([
    'Nome',
    'Email',
    'Attivo',
    'Ruolo',
    'Sede operativa',
    'Permessi',
    'Azioni',
  ]);

  await riga.getByRole('button', { name: 'Ruolo utente' }).click();
  await expect(page.getByRole('listbox', { name: 'Ruolo utente' })).toBeVisible();
  await page.keyboard.press('Escape');

  const eccesso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(eccesso).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SCATTI}/telefono.png`, fullPage: true });
});
