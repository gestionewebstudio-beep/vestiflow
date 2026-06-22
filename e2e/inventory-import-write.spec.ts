import { expect, test } from '@playwright/test';

import {
  analyzeInventoryCsv,
  buildInventoryCsv,
  confirmInventoryImport,
  openInventoryImport,
  readAvailableForSku,
  resolveTestLocation,
  resolveTestSkuForImport,
} from './helpers/import-csv';

test.describe('Import giacenze CSV — scrittura reale', () => {
  test.describe.configure({ mode: 'serial' });

  test('importa rettifica giacenza per SKU di test', async ({ page }) => {
    test.setTimeout(180_000);

    const sku = await resolveTestSkuForImport(page);
    const locationName = await resolveTestLocation(page, sku);
    const current = await readAvailableForSku(page, sku, locationName);
    const target = current + 3;

    const canImport = await openInventoryImport(page);
    if (!canImport) {
      test.skip(true, 'Utente E2E senza permesso import giacenze.');
      return;
    }

    await analyzeInventoryCsv(
      page,
      buildInventoryCsv(sku, locationName, target),
      'inventory-import-write.csv',
    );

    const importButton = page.getByRole('button', { name: /Importa \d+ righe/ });
    if (await importButton.isDisabled()) {
      test.skip(true, 'Nessuna riga pronta per import (location o SKU non validi).');
      return;
    }

    await confirmInventoryImport(page);

    const stats = await page.locator('.inventory-import__done-stats').textContent();
    expect(stats).toMatch(/1 aggiornate|aggiornate ·/);
  });

  test('lookup riflette la quantità importata', async ({ page }) => {
    test.setTimeout(180_000);

    const sku = await resolveTestSkuForImport(page);
    const locationName = await resolveTestLocation(page, sku);
    const current = await readAvailableForSku(page, sku, locationName);
    const target = current + 5;

    const canImport = await openInventoryImport(page);
    if (!canImport) {
      test.skip(true, 'Utente E2E senza permesso import giacenze.');
      return;
    }

    await analyzeInventoryCsv(
      page,
      buildInventoryCsv(sku, locationName, target),
      'inventory-import-verify.csv',
    );

    const importButton = page.getByRole('button', { name: /Importa \d+ righe/ });
    if (await importButton.isDisabled()) {
      test.skip(true, 'Nessuna riga pronta per import.');
      return;
    }

    await confirmInventoryImport(page);

    const after = await readAvailableForSku(page, sku, locationName);
    expect(after).toBe(target);
  });
});
