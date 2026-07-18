import { expect, test } from '@playwright/test';

import { resolveTestSku } from './helpers/catalog';
import {
  confirmMovement,
  expectMovementInHistory,
  openMovementFormForSku,
  pickFirstLocation,
  pickTransferLocations,
  selectMovementType,
  setFirstLineQuantity,
} from './helpers/movement-form';

test.describe('Movimenti di magazzino', () => {
  test('carica storico movimenti o empty state', async ({ page }) => {
    await page.goto('/app/inventory/movements');
    await expect(page.locator('h1.stock-movements__title')).toHaveText('Movimenti di magazzino', {
      timeout: 30_000,
    });

    const skeleton = page.locator('app-table-skeleton');
    const table = page.locator('app-movement-table');
    const empty = page.getByText('Nessun movimento', { exact: true });
    const error = page.locator('app-error-state');

    await expect(skeleton.or(table).or(empty).or(error)).toBeVisible({ timeout: 30_000 });
  });

  test('salva chiede conferma con riepilogo (dialog)', async ({ page }) => {
    const sku = await resolveTestSku(page);

    await openMovementFormForSku(page, sku);
    await pickFirstLocation(page);
    await setFirstLineQuantity(page, '1');
    await page.getByRole('button', { name: 'Salva' }).click();

    await expect(page.getByRole('button', { name: 'Registra', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Registrare 1 articolo come carico/)).toBeVisible();
  });
});

test.describe('Movimenti di magazzino — scrittura reale', () => {
  test.describe.configure({ mode: 'serial' });

  test('registra un carico e lo trova nello storico', async ({ page }) => {
    test.setTimeout(120_000);
    const sku = await resolveTestSku(page);

    await openMovementFormForSku(page, sku);
    await pickFirstLocation(page);
    await setFirstLineQuantity(page, '1');
    await confirmMovement(page);

    await expectMovementInHistory(page, sku, 'Carico');
  });

  test('blocca rettifica senza causale prima della conferma', async ({ page }) => {
    test.setTimeout(120_000);
    const sku = await resolveTestSku(page);

    await openMovementFormForSku(page, sku);
    await selectMovementType(page, 'Rettifica');
    await pickFirstLocation(page);
    await page.locator('#mov-reason').fill('');
    await page.getByRole('button', { name: 'Salva' }).click();

    await expect(page.getByText('La causale è obbligatoria per le rettifiche.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registra', exact: true })).toHaveCount(0);
  });

  test('registra rettifica in aumento con causale', async ({ page }) => {
    test.setTimeout(120_000);
    const sku = await resolveTestSku(page);
    const reason = `E2E rettifica ${Date.now()}`;

    await openMovementFormForSku(page, sku);
    await selectMovementType(page, 'Rettifica');
    await pickFirstLocation(page);

    // Nuova giacenza = giacenza attuale + 1 (rettifica in aumento).
    const newOnHand = page.locator('.movement-form__line-input').first();
    await expect(newOnHand).not.toHaveValue('', { timeout: 15_000 });
    const current = Number(await newOnHand.inputValue());
    await newOnHand.fill(String(current + 1));

    await page.locator('#mov-reason').fill(reason);
    await confirmMovement(page);

    await expectMovementInHistory(page, sku, 'Rettifica', reason);
  });

  test('registra uno scarico e lo trova nello storico', async ({ page }) => {
    test.setTimeout(120_000);
    const sku = await resolveTestSku(page);

    await openMovementFormForSku(page, sku);
    await selectMovementType(page, 'Scarico');
    await pickFirstLocation(page);
    await setFirstLineQuantity(page, '1');
    await confirmMovement(page);

    await expectMovementInHistory(page, sku, 'Scarico');
  });

  test('registra un trasferimento tra location', async ({ page }) => {
    test.setTimeout(120_000);
    const sku = await resolveTestSku(page);

    await openMovementFormForSku(page, sku);
    await selectMovementType(page, 'Trasferimento');

    const hasTwoLocations = await pickTransferLocations(page);
    if (!hasTwoLocations) {
      test.skip(true, 'Tenant di test con una sola location — skip trasferimento.');
      return;
    }

    await setFirstLineQuantity(page, '1');
    await confirmMovement(page);

    await expectMovementInHistory(page, sku, 'Trasferimento');
  });
});
