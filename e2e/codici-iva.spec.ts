import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { test } from './helpers/isolated-test';

/**
 * I CODICI IVA sul motore comune (`docs/26` A6 · D3), guardati a schermo.
 *
 * ⭐ Nessuna API: le due risposte sono nella forma esatta di `VatCodeApiRow` e
 *    `VatNatureApiRow` (`vat-code.service.ts`), percentuali come stringhe
 *    comprese — è così che il server le manda.
 *
 * ⛔ Ciò che si verifica: le sezioni per Natura si CHIUDONO e si riaprono dal
 *    titolo; i tre filtri di prima (Natura, Ambito, Stato) esistono come filtri
 *    di colonna con lo stesso significato; l'ordinamento numerico sull'aliquota;
 *    la ricerca resta in barra; il clic di riga apre la scheda; la card sul telefono.
 */

const PAGINA = '/app/settings/codici-iva';
const SCATTI = 'test-results/codici-iva';

const ORDINARIA = {
  id: 'nat-1',
  key: 'TAXABLE',
  officialCode: null,
  label: 'Imponibile',
  description: null,
  defaultUsageScope: 'both',
  defaultCalculationMode: 'standard',
  sortOrder: 1,
};
const ESENTE = {
  id: 'nat-2',
  key: 'EXEMPT',
  officialCode: 'N4',
  label: 'Esente',
  description: null,
  defaultUsageScope: 'both',
  defaultCalculationMode: 'zero_rate',
  sortOrder: 2,
};

function codice(
  id: string,
  code: string,
  nature: typeof ORDINARIA | typeof ESENTE,
  rate: string,
  description: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    code,
    natureId: nature.id,
    nature,
    ratePercent: rate,
    nonDeductiblePercent: '0',
    description,
    notes: null,
    usageScope: 'both',
    calculationMode: 'standard',
    vatAffectsSupplierTotal: true,
    isDefault: false,
    isActive: true,
    isSystem: false,
    sortOrder: 10,
    ...extra,
  };
}

const CODICI = [
  codice('c-22', '22', ORDINARIA, '22', 'IVA 22% ordinaria', { isDefault: true }),
  codice('c-4', '4', ORDINARIA, '4', 'IVA 4% beni di prima necessità', { sortOrder: 30 }),
  codice('c-10', '10', ORDINARIA, '10', 'IVA 10% ridotta', { sortOrder: 20, usageScope: 'sales' }),
  codice('c-n4', 'N4', ESENTE, '0', 'Esente art. 10', {
    isActive: false,
    calculationMode: 'zero_rate',
    notes: 'Operazioni esenti',
  }),
];

async function apri(page: Page): Promise<void> {
  await page.route('**/api/v1/vat-codes/natures', (route: Route) =>
    route.fulfill({ status: 200, json: [ORDINARIA, ESENTE] }),
  );
  await page.route('**/api/v1/vat-codes', (route: Route) =>
    route.fulfill({ status: 200, json: CODICI }),
  );
  await page.goto(PAGINA);
  await expect(page.getByRole('heading', { name: 'Codici IVA' })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('tbody tr.data-table__row')).toHaveCount(4);
}

test('⭐ sezioni per Natura, comprimibili dal titolo; ordinamento numerico sull’aliquota', async ({
  page,
}) => {
  await apri(page);
  const righe = page.locator('tbody tr.data-table__row');

  // Il titolo porta il conteggio, come prima: «Imponibile (3)».
  const imponibile = page.getByRole('button', { name: 'Imponibile (3)' });
  await expect(imponibile).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Esente (1)' })).toBeVisible();

  // Dentro la sezione l'ordine è quello del catalogo (sortOrder): 22, 10, 4.
  await expect(righe.nth(0)).toContainText('IVA 22% ordinaria');
  await expect(righe.nth(1)).toContainText('IVA 10% ridotta');
  await expect(righe.nth(2)).toContainText('IVA 4%');

  // ── Chiudere una sezione toglie le sue righe e lascia le altre ──────────
  await imponibile.click();
  await expect(imponibile).toHaveAttribute('aria-expanded', 'false');
  await expect(righe).toHaveCount(1);
  await expect(righe.first()).toContainText('Esente art. 10');
  await page.screenshot({ path: `${SCATTI}/sezione-chiusa.png` });
  await imponibile.click();
  await expect(righe).toHaveCount(4);

  // ── Ordinamento NUMERICO: 4 prima di 10 prima di 22 (testuale: 10, 22, 4) ─
  await page.getByRole('button', { name: 'Ordina per Aliquota' }).click();
  await expect(righe.nth(0)).toContainText('IVA 4%');
  await expect(righe.nth(1)).toContainText('IVA 10%');
  await expect(righe.nth(2)).toContainText('IVA 22%');

  // Il codice predefinito porta la pastiglia.
  await expect(righe.filter({ hasText: 'IVA 22%' }).first()).toContainText('Predefinito');

  // Le due misure dell'11/09: riga ≤ 26px.
  const altezza = await page.evaluate(() =>
    Math.round(document.querySelector('tbody tr.data-table__row')!.getBoundingClientRect().height),
  );
  expect(altezza).toBeLessThanOrEqual(26);
  await page.screenshot({ path: `${SCATTI}/elenco.png` });
});

test('⭐ i tre filtri di prima sono filtri di colonna, e la ricerca resta in barra', async ({
  page,
}) => {
  await apri(page);
  const righe = page.locator('tbody tr.data-table__row');

  await page.getByRole('button', { name: /^Filtri/ }).click();

  // Ambito → un solo codice è «Vendite».
  await page.getByRole('button', { name: 'Filtra per Ambito' }).click();
  await page.getByRole('option', { name: 'Vendite', exact: true }).click();
  await expect(righe).toHaveCount(1);
  await expect(righe.first()).toContainText('IVA 10%');
  await page.keyboard.press('Escape');

  // Spegnere «Filtri» azzera: tornano tutte.
  await page.getByRole('button', { name: /^Filtri/ }).click();
  await expect(righe).toHaveCount(4);

  // Stato → «Disattivato» è solo l'esente; e la sua sezione resta, con una riga.
  await page.getByRole('button', { name: /^Filtri/ }).click();
  await page.getByRole('button', { name: 'Filtra per Stato' }).click();
  await page.getByRole('option', { name: 'Disattivato', exact: true }).click();
  await expect(righe).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Esente (1)' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Imponibile/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Natura → si restringe alla sola sezione scelta.
  await page.getByRole('button', { name: 'Filtra per Stato' }).click();
  await page.getByRole('button', { name: /Mostra tutti i valori/ }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Filtra per Natura' }).click();
  await page.getByRole('option', { name: 'Imponibile', exact: true }).click();
  await expect(righe).toHaveCount(3);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${SCATTI}/filtro-natura.png` });

  // La ricerca in barra si somma ai filtri di colonna.
  await page.getByRole('searchbox', { name: 'Cerca Codici IVA' }).fill('ridotta');
  await expect(righe).toHaveCount(1);
  await expect(righe.first()).toContainText('IVA 10% ridotta');
});

test('⭐ il clic di riga apre la scheda; «Duplica» sta nella barra, sulla selezione', async ({
  page,
}) => {
  await apri(page);

  await page.locator('tbody tr.data-table__row').filter({ hasText: 'IVA 10%' }).click();
  await expect(page.getByRole('heading', { name: 'Modifica Codice IVA' })).toBeVisible();
  await expect(page.getByLabel(/Codice IVA \*/)).toHaveValue('10');
  await page.getByRole('button', { name: 'Chiudi', exact: true }).first().click();

  // La barra comandi: «Duplica» è spento senza selezione, acceso con una riga scelta.
  const duplica = page.getByRole('button', { name: 'Duplica il Codice IVA selezionato' });
  await expect(duplica).toBeDisabled();
  // ⭐ E il motivo è scritto, dal contratto comune: occorre selezionare una riga.
  const motivo = await duplica.getAttribute('aria-describedby');
  expect(motivo).not.toBeNull();
  await expect(page.locator(`#${motivo}`)).toHaveText(/Seleziona un elemento/);
  await page.getByRole('checkbox', { name: 'Seleziona 22' }).check();
  await expect(duplica).toBeEnabled();
  await expect(page.locator('tfoot.data-table__totals')).toContainText('1 voce');
  await duplica.click();
  await expect(page.getByRole('heading', { name: 'Duplica Codice IVA' })).toBeVisible();
  await page.screenshot({ path: `${SCATTI}/duplica.png` });
});

test('⭐ e sul telefono: card con codice, stato, aliquota col nome — e i filtri nel pannello', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await apri(page);

  const card = page.locator('.list-card__figures').filter({ hasText: 'Aliquota 22' });
  await expect(card).toBeVisible();
  const parole = page.locator('.list-card__words').filter({ hasText: 'Operazioni esenti' });
  await expect(parole).toBeVisible();

  // Le sezioni si chiudono anche qui.
  await page.getByRole('button', { name: 'Imponibile (3)' }).click();
  await expect(page.locator('.list-card__figures')).toHaveCount(1);
  await page.getByRole('button', { name: 'Imponibile (3)' }).click();

  // I filtri di colonna nel pannello condiviso (`docs/26` D1).
  await page.getByRole('button', { name: 'Filtri', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Filtri' })).toBeVisible();
  await page.getByRole('button', { name: 'Filtra per Stato' }).click();
  await page.getByRole('option', { name: 'Attivo', exact: true }).click();
  await page.getByRole('button', { name: 'Vedi risultati', exact: true }).click();
  await expect(page.locator('tbody tr.data-table__row')).toHaveCount(3);

  // ⭐ E «Duplica» si raggiunge anche qui: «Seleziona» accende la selezione
  //    per tocco sulle card (il pulsante estratto dal telaio), poi la barra.
  const duplica = page.getByRole('button', { name: 'Duplica il Codice IVA selezionato' });
  await expect(duplica).toBeDisabled();
  await page.getByRole('button', { name: 'Seleziona', exact: true }).click();
  await page.locator('tbody tr.data-table__row').filter({ hasText: 'IVA 10%' }).click();
  await expect(duplica).toBeEnabled();
  await page.screenshot({ path: `${SCATTI}/telefono-selezione.png` });
  await duplica.click();
  await expect(page.getByRole('heading', { name: 'Duplica Codice IVA' })).toBeVisible();
  await page.getByRole('button', { name: 'Chiudi', exact: true }).first().click();

  const eccesso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(eccesso).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SCATTI}/telefono.png`, fullPage: true });
});
