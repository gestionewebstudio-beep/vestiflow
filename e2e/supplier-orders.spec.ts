import { expect, test } from '@playwright/test';

import { waitForSupplierOrdersReady } from './helpers/page-ready';

test.describe('Ordini fornitori', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/orders');
    await expect(page.locator('h1.po-list__title')).toHaveText('Ordini Fornitori', {
      timeout: 30_000,
    });
  });

  test('carica lista ordini o empty state', async ({ page }) => {
    const skeleton = page.locator('app-table-skeleton');
    const table = page.locator('app-data-table');
    const empty = page.getByText('Nessun ordine fornitore', { exact: true });
    const error = page.locator('app-error-state');

    await expect(skeleton.or(table).or(empty).or(error)).toBeVisible({ timeout: 30_000 });
  });

  test('CTA nuovo ordine fornitore', async ({ page }) => {
    const createButton = page.getByRole('button', { name: 'Nuovo ordine' });
    if (!(await createButton.isVisible())) {
      test.skip(true, 'Utente E2E senza permesso ordini fornitori.');
      return;
    }

    await createButton.click();
    await expect(page).toHaveURL(/\/app\/orders\/new/);
    await expect(page.locator('h1.doc-form__title')).toHaveText('Nuovo ordine fornitore');
  });

  test('ricerca ordini accetta input', async ({ page }) => {
    const search = page.locator('.po-list__input');
    await expect(search).toBeVisible();
    await search.fill('PO-2024');
    await expect(search).toHaveValue('PO-2024');
  });

  /**
   * ⛔ Qui il test si chiamava «apre dettaglio ordine fornitore dalla lista» e
   * attendeva `/app/orders/<id>` con `h1.po-detail__title`. Inchiodava il
   * comportamento vecchio: il clic di riga cablava il Dettaglio mentre
   * `DOCUMENT_ROW_OPENS[SupplierOrder]` dichiara `'form'` dal 20/08/2026.
   *
   * ⭐ La riga porta alla **Modifica**, in qualunque stato dell'ordine: gli stati
   * dell'Ordine fornitore servono ai collegamenti documentali, non al routing.
   * Il Dettaglio resta, come azione separata dalla barra della selezione.
   */
  test('la riga apre la MODIFICA dell’ordine fornitore, non il Dettaglio', async ({ page }) => {
    const state = await waitForSupplierOrdersReady(page);
    if (state === 'empty') {
      test.skip(true, 'Nessun ordine fornitore nel tenant di test.');
      return;
    }

    const firstRow = page.locator('.data-table__row').first();

    // Precondizione: la riga è un ordine vero, non uno scheletro.
    const reference = (
      (await firstRow.locator('.po-list__riferimento').textContent()) ?? ''
    ).trim();
    expect(reference.length).toBeGreaterThan(0);

    await firstRow.click();

    // 1 · l'indirizzo è quello della maschera, non del Dettaglio.
    await expect(page).toHaveURL(/\/app\/orders\/[^/]+\/edit$/, { timeout: 15_000 });

    // 2 · e la pagina è la maschera VERA, non una vista che ci somiglia: il
    //     titolo è quello della modifica e il documento riaperto nasce protetto.
    await expect(page.locator('h1.doc-form__title')).toHaveText('Modifica ordine fornitore');
    await expect(page.getByRole('button', { name: /Sblocca modifica/ })).toBeVisible();

    // 3 · il Dettaglio non c'è: se la rotta ripiegasse là, il titolo sarebbe suo.
    await expect(page.locator('h1.po-detail__title')).toHaveCount(0);
  });
});
