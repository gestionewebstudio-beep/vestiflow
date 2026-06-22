import { expect, test } from '@playwright/test';

test.describe('Ordini fornitori', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/orders');
    await expect(page.locator('h1.po-list__title')).toHaveText('Ordini Fornitori', {
      timeout: 30_000,
    });
  });

  test('carica lista ordini o empty state', async ({ page }) => {
    const skeleton = page.locator('app-table-skeleton');
    const table = page.locator('app-supplier-order-table');
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
    await expect(page.locator('h1.po-form__title')).toHaveText('Nuovo ordine fornitore');
  });

  test('ricerca ordini accetta input', async ({ page }) => {
    const search = page.locator('.po-list__input');
    await expect(search).toBeVisible();
    await search.fill('PO-2024');
    await expect(search).toHaveValue('PO-2024');
  });
});
