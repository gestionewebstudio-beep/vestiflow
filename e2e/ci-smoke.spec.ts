import { expect, test } from '@playwright/test';

test.describe('CI smoke (mock auth)', () => {
  test('shell applicativa e sidebar dopo login mock', async ({ page }) => {
    await page.goto('/app/dashboard');
    await expect(page.locator('h1.dashboard__title')).toHaveText('Dashboard');
    await expect(page.locator('app-app-sidebar')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Prodotti' })).toBeVisible();
  });

  test('wizard nuovo prodotto — step dati generali e opzioni', async ({ page }) => {
    await page.goto('/app/products/new');
    await expect(page.locator('h1.product-form__title')).toHaveText('Nuovo prodotto', {
      timeout: 30_000,
    });

    await page.locator('#product-name').fill('Prodotto CI Smoke');
    await page.locator('#product-brand').fill('Brand Test');
    await page.locator('#product-category').fill('Abbigliamento');

    await page.getByRole('button', { name: 'Avanti' }).click();
    await expect(page.getByRole('button', { name: 'Opzioni' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    await expect(page.getByText('Definisci le opzioni che generano le varianti')).toBeVisible();
  });

  test('lista prodotti degrada senza errore bloccante se API non disponibile', async ({ page }) => {
    await page.goto('/app/products');
    await expect(page.locator('h1.product-list__title')).toHaveText('Prodotti', {
      timeout: 30_000,
    });

    const skeleton = page.locator('app-table-skeleton');
    const table = page.locator('app-product-table');
    const empty = page.getByText('Nessun prodotto', { exact: true });
    const error = page.locator('app-error-state');

    await expect(skeleton.or(table).or(empty).or(error)).toBeVisible({ timeout: 30_000 });
  });
});
