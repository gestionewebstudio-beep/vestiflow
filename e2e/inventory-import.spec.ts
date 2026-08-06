import { expect, test } from '@playwright/test';

import { resolveTestSku } from './helpers/catalog';

// Anteprima rapida; import reale in inventory-import-write.spec.ts (serial).
test.describe('Import giacenze CSV', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/inventory');
    await expect(page.locator('h1.inventory-levels__title')).toHaveText('Magazzino', {
      timeout: 30_000,
    });
  });

  test('analizza CSV e mostra anteprima senza importare', async ({ page }) => {
    test.setTimeout(120_000);

    const importButton = page.getByRole('button', { name: 'Importa CSV' });
    if (!(await importButton.isVisible())) {
      test.skip(true, 'Utente E2E senza permesso import giacenze.');
      return;
    }

    await importButton.click();
    await expect(page).toHaveURL(/\/app\/inventory\/import/);
    await expect(page.locator('h1.inventory-import__title')).toHaveText('Importa giacenze da CSV');

    const sku = await resolveTestSku(page);
    const csv = `SKU,Location,Disponibile,Soglia minima\n${sku},E2E-Location-Test,42,\n`;

    await page.locator('#inventory-csv-file').setInputFiles({
      name: 'inventory-import-e2e.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    });
    await expect(page.getByText('inventory-import-e2e.csv')).toBeVisible();

    await page.getByRole('button', { name: 'Analizza file' }).click();
    await expect(page.locator('.inventory-import__summary')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.inventory-import__table')).toBeVisible();
    await expect(page.getByRole('button', { name: /Importa \d+ righe/ })).toBeVisible();
  });
});
