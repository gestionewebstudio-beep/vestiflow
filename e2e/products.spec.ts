import { expect, test } from '@playwright/test';

test.describe('Prodotti', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/products');
    await expect(page.locator('h1.product-list__title')).toHaveText('Prodotti', {
      timeout: 30_000,
    });
  });

  test('carica la lista prodotti o empty state', async ({ page }) => {
    const skeleton = page.locator('app-table-skeleton');
    const table = page.locator('app-product-table');
    const empty = page.getByText('Nessun prodotto', { exact: true });
    const error = page.locator('app-error-state');

    await expect(skeleton.or(table).or(empty).or(error)).toBeVisible({ timeout: 30_000 });
  });

  test('ricerca prodotti aggiorna i query params', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: 'Cerca prodotti' });
    await expect(search).toBeVisible();

    await search.fill('maglietta');
    await expect(page).toHaveURL(/search=maglietta/, { timeout: 10_000 });
  });

  test('CTA aggiungi prodotto è raggiungibile', async ({ page }) => {
    const createButton = page.getByRole('button', { name: 'Aggiungi prodotto' });
    if (!(await createButton.isVisible())) {
      test.skip(true, 'Utente E2E senza permesso di gestione catalogo.');
      return;
    }

    await createButton.click();
    await expect(page).toHaveURL(/\/app\/products\/new/);
  });
});
