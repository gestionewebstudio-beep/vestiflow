import path from 'node:path';

import { expect, test } from '@playwright/test';

test.describe('Import prodotti CSV', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/products');
    await expect(page.locator('h1.product-list__title')).toHaveText('Prodotti', {
      timeout: 30_000,
    });
  });

  test('analizza CSV demo e mostra anteprima senza importare', async ({ page }) => {
    test.setTimeout(120_000);

    const importButton = page.getByRole('button', { name: 'Importa CSV' });
    if (!(await importButton.isVisible())) {
      test.skip(true, 'Utente E2E senza permesso import prodotti.');
      return;
    }

    await importButton.click();
    await expect(page).toHaveURL(/\/app\/products\/import/);
    await expect(page.locator('h1.product-import__title')).toHaveText('Importa prodotti da CSV');

    const csvPath = path.resolve(process.cwd(), 'fixtures', 'shopify-import-demo.csv');
    await page.locator('#product-csv-file').setInputFiles(csvPath);
    await expect(page.getByText('shopify-import-demo.csv')).toBeVisible();

    await page.getByRole('button', { name: 'Analizza file' }).click();
    await expect(page.locator('.product-import__summary')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.product-import__table')).toBeVisible();
    await expect(page.getByRole('button', { name: /Importa \d+ prodotti/ })).toBeVisible();
  });
});
