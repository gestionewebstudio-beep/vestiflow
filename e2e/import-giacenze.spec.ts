import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { test } from './helpers/isolated-test';

/**
 * L'IMPORT GIACENZE sul motore comune (`docs/26` A2), guardato a schermo.
 *
 * ⭐ **Nessuna API, nessun database.** La fixture isolata risponde 404 a ogni
 *    chiamata non dichiarata qui: tutto ciò che il browser riceve è scritto
 *    in questo file, nella forma esatta che `InventoryImportService` restituisce
 *    (`api/src/inventory/inventory-import.service.ts`) — il frontend non ha un
 *    mapper in mezzo.
 */

const IMPORT = '/app/inventory/import';
const SCATTI = 'test-results/import-giacenze';

/**
 * Tre righe scelte per tradire i difetti che una fixture qualsiasi nasconde:
 * un delta a due cifre contro uno a una (ordinamento testuale), un delta
 * negativo (segno e colore), una riga con errore e quantità `null` (che non
 * deve valere zero né ordinarsi come tale).
 */
const ANTEPRIMA = {
  rows: [
    {
      key: 'MAG-M@sede-1',
      rowNumber: 2,
      variantTitle: 'Maglia in cotone · M',
      sku: 'MAG-M',
      locationName: 'Negozio centro',
      currentAvailable: 5,
      newAvailable: 15,
      delta: 10,
      status: 'ready',
    },
    {
      key: 'PNT-48@sede-1',
      rowNumber: 3,
      variantTitle: 'Pantalone in lino · 48',
      sku: 'PNT-48',
      locationName: 'Negozio centro',
      currentAvailable: 4,
      newAvailable: 2,
      delta: -2,
      status: 'ready',
    },
    {
      key: 'XXX-1@?',
      rowNumber: 4,
      variantTitle: '—',
      sku: 'XXX-1',
      locationName: 'Magazzino',
      currentAvailable: null,
      newAvailable: null,
      delta: null,
      status: 'error',
      message: 'SKU non trovato',
    },
  ],
  summary: { total: 3, ready: 2, unchanged: 0, errors: 1 },
};

const RAPPORTO = {
  updated: 2,
  unchanged: 0,
  skipped: 0,
  failed: 0,
  rows: [
    { key: 'MAG-M@sede-1', sku: 'MAG-M', locationName: 'Negozio centro', status: 'updated' },
    {
      key: 'PNT-48@sede-1',
      sku: 'PNT-48',
      locationName: 'Negozio centro',
      status: 'updated',
      message: 'Rettifica registrata',
    },
  ],
};

async function apriAnteprima(page: Page): Promise<void> {
  await page.route('**/api/v1/inventory/levels/import/preview', (route: Route) =>
    route.fulfill({ status: 200, json: ANTEPRIMA }),
  );
  await page.route('**/api/v1/inventory/levels/import', (route: Route) =>
    route.fulfill({ status: 200, json: RAPPORTO }),
  );
  await page.goto(IMPORT);
  await expect(page.getByRole('heading', { name: 'Importa giacenze da CSV' })).toBeVisible({
    timeout: 45_000,
  });
  await page.locator('#inventory-csv-file').setInputFiles({
    name: 'giacenze.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('SKU,Location,Disponibile\nMAG-M,Negozio centro,15\n'),
  });
  await page.getByRole('button', { name: /Analizza/i }).click();
  await expect(page.locator('tbody tr.data-table__row')).toHaveCount(3);
}

test('⭐ l’anteprima ordina per numero, filtra per sede e somma i delta', async ({ page }) => {
  await apriAnteprima(page);
  const righe = page.locator('tbody tr.data-table__row');

  // ── La riga totali: «di quanti pezzi si muove il magazzino» ──────────────
  // +10 −2 = +8; la riga con errore ha `null` e non conta. Attuale 9, Nuovo 17.
  const totali = page.locator('tfoot.data-table__totals');
  await expect(totali).toBeVisible();
  await expect(totali).toContainText('3 voci');
  await expect(totali).toContainText('+8');
  await expect(totali).toContainText('17');

  // ── Ordinamento NUMERICO sul Delta ────────────────────────────────────────
  // Crescente: il valore assente vale −∞ per il motore (`column-sort.util`),
  // quindi la riga con errore apre, poi −2, poi +10. Un confronto testuale
  // metterebbe «+10» prima di «-2» (il più viene prima del meno in ASCII).
  await page.getByRole('button', { name: 'Ordina per Delta' }).click();
  await expect(righe.nth(0)).toContainText('SKU non trovato');
  await expect(righe.nth(1)).toContainText('Pantalone in lino');
  await expect(righe.nth(2)).toContainText('Maglia in cotone');
  await page.getByRole('button', { name: 'Delta: ordinamento crescente' }).click();
  await expect(righe.first()).toContainText('Maglia in cotone');

  // ── Filtro a VALORI sulla Sede ────────────────────────────────────────────
  await page.getByRole('button', { name: /^Filtri/ }).click();
  await page.getByRole('button', { name: 'Filtra per Sede' }).click();
  await page.getByRole('option', { name: 'Magazzino', exact: true }).click();
  await expect(righe).toHaveCount(1);
  await expect(righe.first()).toContainText('SKU non trovato');
  // E la riga totali segue il filtro: una voce sola, senza quantità note.
  await expect(totali).toContainText('1 voce');

  // ── Le due misure dell’11/09 (`docs/26` §5.1), tenute ferme anche qui ────
  const misura = await page.evaluate(() => {
    const riga = document.querySelector('tbody tr.data-table__row');
    const pannello = document.querySelector('.select-menu__panel');
    if (!riga || !pannello) {
      return null;
    }
    const p = pannello.getBoundingClientRect();
    const sopra = document.elementFromPoint(p.x + p.width / 2, p.y + p.height / 2);
    return {
      altezzaRiga: Math.round(riga.getBoundingClientRect().height),
      pannelloDentro: pannello.contains(sopra),
    };
  });
  expect(misura).not.toBeNull();
  expect(misura?.altezzaRiga).toBeLessThanOrEqual(26);
  expect(misura?.pannelloDentro).toBe(true);

  await page.screenshot({ path: `${SCATTI}/anteprima-filtrata.png`, fullPage: true });

  // Spento «Filtri», il filtro si azzera: tornano tutte.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Filtri/ }).click();
  await expect(righe).toHaveCount(3);
  await page.screenshot({ path: `${SCATTI}/anteprima.png`, fullPage: true });
});

test('⭐ il rapporto è sul motore, con lo stato e il dettaglio per riga', async ({ page }) => {
  await apriAnteprima(page);
  await page.getByRole('button', { name: /Importa 2 righe/i }).click();

  const rapporto = page.getByRole('table', { name: /Esito dell/ });
  const righe = rapporto.locator('tbody tr.data-table__row');
  await expect(righe).toHaveCount(2);
  await expect(righe.nth(1)).toContainText('Rettifica registrata');
  await expect(righe.first()).toContainText('Aggiornata');
  await expect(righe.first()).toContainText('—');

  await rapporto.getByRole('button', { name: 'Ordina per SKU' }).click();
  await rapporto.getByRole('button', { name: 'SKU: ordinamento crescente' }).click();
  await expect(righe.first()).toContainText('PNT-48');

  await page.screenshot({ path: `${SCATTI}/rapporto.png`, fullPage: true });
});

test('⭐ e sul telefono la card porta i numeri col loro nome', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await apriAnteprima(page);

  // Sotto `lg` ogni valore sta due volte nel DOM (card + cella `.sr-only`):
  // si guarda la card, che è la veste del telefono.
  const card = page.locator('.list-card__figures').filter({ hasText: 'Delta +10' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Attuale 5');
  await expect(card).toContainText('Nuovo 15');

  // Il delta negativo si legge dal colore, come le righe di reso.
  const negativo = page.locator('.list-card__total--negative').filter({ hasText: 'Delta -2' });
  await expect(negativo).toBeVisible();

  // ⛔ Nessuno scorrimento orizzontale.
  const eccesso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(eccesso).toBeLessThanOrEqual(1);

  await page.screenshot({ path: `${SCATTI}/anteprima-mobile.png`, fullPage: true });
});
