import { expect, test } from '@playwright/test';

import { resolveTestSku } from './helpers/catalog';
import {
  confirmMovement,
  expectMovementInHistory,
  goToMovementReview,
  openMovementFormForSku,
  pickFirstLocation,
  selectMovementType,
} from './helpers/movement-form';
import { pickSelectMenuOption } from './helpers/select-menu';

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

  test('form movimento mostra riepilogo prima della conferma', async ({ page }) => {
    const sku = await resolveTestSku(page);

    await openMovementFormForSku(page, sku);
    await pickFirstLocation(page);
    await goToMovementReview(page, '1');

    await expect(page.locator('h2.movement-form__review-title')).toHaveText('Riepilogo movimento', {
      timeout: 15_000,
    });
    await expect(page.getByText('Impatto atteso sul disponibile')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Conferma movimento' })).toBeVisible();
  });
});

test.describe('Movimenti di magazzino — scrittura reale', () => {
  test.describe.configure({ mode: 'serial' });

  test('registra un carico e lo trova nello storico', async ({ page }) => {
    test.setTimeout(120_000);
    const sku = await resolveTestSku(page);

    await openMovementFormForSku(page, sku);
    await pickFirstLocation(page);
    await goToMovementReview(page, '1');
    await confirmMovement(page);

    await expectMovementInHistory(page, sku, 'Carico');
  });

  test('blocca rettifica senza motivo prima del riepilogo', async ({ page }) => {
    test.setTimeout(120_000);
    const sku = await resolveTestSku(page);

    await openMovementFormForSku(page, sku);
    await selectMovementType(page, 'Rettifica');
    await pickFirstLocation(page);
    await page.locator('#mov-reason').fill('');
    await goToMovementReview(page, '1');

    await expect(page.locator('h1.movement-form__title')).toHaveText('Registra movimento');
    await expect(page.locator('#mov-reason-error')).toBeVisible();
    await expect(page.locator('h2.movement-form__review-title')).toHaveCount(0);
  });

  test('registra rettifica in aumento con motivo obbligatorio', async ({ page }) => {
    test.setTimeout(120_000);
    const sku = await resolveTestSku(page);
    const reason = `E2E rettifica ${Date.now()}`;

    await openMovementFormForSku(page, sku);
    await selectMovementType(page, 'Rettifica');
    await pickFirstLocation(page);
    await pickSelectMenuOption(page, 'Verso della rettifica', { name: 'Aumento' });
    await page.locator('#mov-reason').fill(reason);
    await goToMovementReview(page, '1');
    await confirmMovement(page);

    await expectMovementInHistory(page, sku, 'Rettifica', reason);
  });
});
