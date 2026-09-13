import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { test } from './helpers/isolated-test';

/**
 * Gli ELENCHI DI CONSULTAZIONE nei dettagli della Cassa (`docs/26` A19), sul
 * motore comune: i movimenti di magazzino di un'operazione; cassetto,
 * operazioni e cambi di registratore di una sessione. Fixture nella forma di
 * `CashOperationDetail` (righe già nella forma API documenti) e
 * `CashSessionDetail`. Le quote dell'incasso restano un riepilogo (classe C).
 */

const SCATTI = 'test-results/cassa-dettagli';

const OPERAZIONE = {
  id: 'op-1',
  kind: 'sale',
  reference: 'VB-2026-000031',
  documentDate: '2026-09-04T10:15:00.000Z',
  createdAt: '2026-09-04T10:15:00.000Z',
  status: 'confirmed',
  locationId: 'loc-1',
  locationName: 'Negozio centro',
  operatorId: 'u-1',
  operatorName: 'Anna Verdi',
  sessionId: 's-1',
  customerName: null,
  totalMinor: 4_990,
  payments: [
    {
      paymentOptionId: 'po-cash',
      optionName: 'Contanti',
      tenderKind: 'cash',
      amountMinor: 4_990,
      tenderedMinor: 5_000,
      refundedFromPaymentId: null,
    },
  ],
  mixed: false,
  changeMinor: 10,
  sourceDocumentId: null,
  sourceReference: null,
  anomalies: [],
  taxableMinor: 4_090,
  taxMinor: 900,
  notes: null,
  lines: [],
  session: {
    id: 's-1',
    status: 'open',
    openedAt: '2026-09-04T08:00:00.000Z',
    closedAt: null,
    openedByName: 'Anna Verdi',
  },
  relatedReturns: [],
  stockMovements: [
    {
      id: 'm-1',
      type: 'sale',
      quantity: 1,
      sku: 'MAG-M',
      locationId: 'loc-1',
      createdAt: '2026-09-04T10:15:00.000Z',
      createdByName: 'Anna Verdi',
    },
    {
      id: 'm-2',
      type: 'sale',
      quantity: 3,
      sku: 'MAG-L',
      locationId: 'loc-1',
      createdAt: '2026-09-04T10:15:01.000Z',
      createdByName: 'Anna Verdi',
    },
  ],
};

const SESSIONE = {
  id: 's-1',
  status: 'closed',
  locationId: 'loc-1',
  locationName: 'Negozio centro',
  openedAt: '2026-09-04T08:00:00.000Z',
  openedByName: 'Anna Verdi',
  closedAt: '2026-09-04T20:00:00.000Z',
  closedByName: 'Anna Verdi',
  openingFloatMinor: 5_000,
  fiscalDeviceId: 'dev-2',
  fiscalDeviceLabel: 'RT banco 2',
  notes: null,
  frozen: {
    expectedCashMinor: 15_000,
    expectedElectronicMinor: 0,
    countedCashMinor: 15_000,
    declaredElectronicMinor: 0,
    cashDifferenceMinor: 0,
    electronicDifferenceMinor: 0,
  },
  breakdown: {
    openingFloatMinor: 5_000,
    salesCashMinor: 10_000,
    returnsCashMinor: 0,
    salesElectronicMinor: 0,
    returnsElectronicMinor: 0,
    depositsMinor: 2_000,
    withdrawalsMinor: 2_000,
    expectedCashMinor: 15_000,
    expectedElectronicMinor: 0,
  },
  breakdownMatchesFrozen: true,
  movements: [
    {
      id: 'mv-1',
      type: 'deposit',
      amountMinor: 2_000,
      reason: 'Fondo cassa integrato',
      createdAt: '2026-09-04T09:00:00.000Z',
      createdByName: 'Anna Verdi',
    },
    {
      id: 'mv-2',
      type: 'withdrawal',
      amountMinor: 2_000,
      reason: 'Versamento in banca',
      createdAt: '2026-09-04T18:00:00.000Z',
      createdByName: 'Marco Rossi',
    },
  ],
  documents: [
    {
      id: 'op-1',
      kind: 'sale',
      reference: 'VB-2026-000031',
      status: 'confirmed',
      documentDate: '2026-09-04T10:15:00.000Z',
      totalMinor: 4_990,
      createdByName: 'Anna Verdi',
    },
    {
      id: 'op-2',
      kind: 'return',
      reference: 'RB-2026-000003',
      status: 'cancelled',
      documentDate: '2026-09-04T11:00:00.000Z',
      totalMinor: 1_500,
      createdByName: 'Anna Verdi',
    },
  ],
  deviceChanges: [
    {
      id: 'dc-1',
      previousDeviceId: 'dev-1',
      newDeviceId: 'dev-2',
      reason: 'Registratore 1 in assistenza',
      createdAt: '2026-09-04T12:00:00.000Z',
      changedByName: 'Anna Verdi',
    },
  ],
};

async function instrada(page: Page): Promise<void> {
  await page.route('**/api/v1/cash-sessions/operations/op-1', (route: Route) =>
    route.fulfill({ status: 200, json: OPERAZIONE }),
  );
  await page.route('**/api/v1/cash-sessions/sessions/s-1', (route: Route) =>
    route.fulfill({ status: 200, json: SESSIONE }),
  );
}

test('⭐ i movimenti di un’operazione sono un elenco del motore, ordinabile sulla quantità', async ({
  page,
}) => {
  await instrada(page);
  await page.goto('/app/cassa/operazioni/op-1');
  const tabella = page.getByRole('table', { name: 'Movimenti di magazzino' });
  await expect(tabella).toBeVisible({ timeout: 45_000 });
  const righe = tabella.locator('tbody tr.data-table__row');
  await expect(righe).toHaveCount(2);
  await expect(righe.first()).toContainText('MAG-M');

  await tabella.getByRole('button', { name: 'Ordina per Quantità' }).click();
  await tabella.getByRole('button', { name: 'Quantità: ordinamento crescente' }).click();
  await expect(righe.first()).toContainText('MAG-L');

  // Le quote dell'incasso restano un riepilogo, non una tabella.
  await expect(page.locator('.op__quotas')).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/operazione.png`, fullPage: true });
});

test('⭐ cassetto, operazioni e cambi di registratore della sessione sono tre elenchi del motore', async ({
  page,
}) => {
  await instrada(page);
  await page.goto('/app/cassa/sessioni/s-1');

  const cassetto = page.getByRole('table', { name: 'Movimenti del cassetto' });
  await expect(cassetto).toBeVisible({ timeout: 45_000 });
  await expect(cassetto.locator('tbody tr.data-table__row')).toHaveCount(2);
  await expect(cassetto.locator('tbody tr.data-table__row').first()).toContainText('Versamento');
  // Nessuna riga totali: un versamento e un prelievo non si sommano.
  await expect(cassetto.locator('tfoot')).toHaveCount(0);

  const operazioni = page.getByRole('table', { name: 'Operazioni della sessione' });
  const righeOp = operazioni.locator('tbody tr.data-table__row');
  await expect(righeOp).toHaveCount(2);
  await expect(righeOp.nth(1)).toContainText('Annullato');
  await expect(operazioni.getByRole('columnheader', { name: /Numero/ })).toBeVisible();

  const cambi = page.getByRole('table', { name: 'Cambi di registratore' });
  await expect(cambi.locator('tbody tr.data-table__row')).toHaveCount(1);
  await expect(cambi).toContainText('Registratore 1 in assistenza');
  await page.screenshot({ path: `${SCATTI}/sessione.png`, fullPage: true });

  // Il clic di riga apre l'operazione, come prima faceva il link.
  await righeOp.first().click();
  await expect(page).toHaveURL(/\/app\/cassa\/operazioni\/op-1$/);
});

test('⭐ e sul telefono le tre sezioni sono card, senza scorrimento orizzontale', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await instrada(page);
  await page.goto('/app/cassa/sessioni/s-1');

  await expect(page.locator('.list-card__what').filter({ hasText: 'Prelievo' })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.locator('.list-card__anchor').filter({ hasText: 'Annullato' })).toHaveCount(1);
  await expect(page.locator('.list-card__total').filter({ hasText: '49,90' })).toBeVisible();

  const eccesso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(eccesso).toBeLessThanOrEqual(1);
  // La shell scorre al suo interno: lo scatto si fa con le card a vista.
  await page.locator('.list-card__what').filter({ hasText: 'Versamento' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SCATTI}/sessione-telefono.png` });
});
