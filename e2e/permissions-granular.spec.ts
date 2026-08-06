import { expect, test } from '@playwright/test';

import {
  e2eClerkCatalogImportCredentials,
  e2eClerkInventoryImportCredentials,
  hasE2eClerkCatalogImportCredentials,
  hasE2eClerkInventoryImportCredentials,
} from './helpers/env';
import { expectButtonAbsent, expectDashboardRedirect } from './helpers/permissions';
import { loginWithCredentials } from './helpers/login';

test.describe('Permessi granulari — solo catalog.import_export', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasE2eClerkCatalogImportCredentials()) {
      testInfo.skip(
        true,
        'Esegui npm run provision:e2e-users e imposta E2E_CLERK_CATALOG_IMPORT_* in .env',
      );
      return;
    }
    await loginWithCredentials(page, e2eClerkCatalogImportCredentials());
  });

  test('sync catalogo Shopify senza gestione catalogo', async ({ page }) => {
    await page.goto('/app/products');
    await expect(page.locator('h1.product-list__title')).toHaveText('Prodotti', {
      timeout: 30_000,
    });

    const shopifyTenant = await page
      .getByRole('button', { name: 'Sincronizza catalogo da Shopify' })
      .isVisible();
    if (shopifyTenant) {
      await expect(
        page.getByRole('button', { name: 'Sincronizza catalogo da Shopify' }),
      ).toBeVisible();
    }

    await expectButtonAbsent(page, 'Aggiungi prodotto');
    await expect(page.getByRole('button', { name: 'Esporta CSV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Importa CSV' })).toBeVisible();
  });

  test('magazzino: no sync giacenze e no movimenti', async ({ page }) => {
    await page.goto('/app/inventory');
    await expect(page.locator('h1.inventory-levels__title')).toHaveText('Magazzino', {
      timeout: 30_000,
    });

    await expectButtonAbsent(page, 'Sincronizza giacenze da Shopify');
    await expectButtonAbsent(page, 'Registra movimento');

    await page.goto('/app/inventory/movements/new');
    await expectDashboardRedirect(page);
  });
});

test.describe('Permessi granulari — solo inventory.import_export', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasE2eClerkInventoryImportCredentials()) {
      testInfo.skip(
        true,
        'Esegui npm run provision:e2e-users e imposta E2E_CLERK_INVENTORY_IMPORT_* in .env',
      );
      return;
    }
    await loginWithCredentials(page, e2eClerkInventoryImportCredentials());
  });

  test('sync giacenze Shopify senza inventory.manage', async ({ page }) => {
    await page.goto('/app/inventory');
    await expect(page.locator('h1.inventory-levels__title')).toHaveText('Magazzino', {
      timeout: 30_000,
    });

    const shopifyTenant = await page
      .getByRole('button', { name: 'Sincronizza giacenze da Shopify' })
      .isVisible();
    if (shopifyTenant) {
      await expect(
        page.getByRole('button', { name: 'Sincronizza giacenze da Shopify' }),
      ).toBeVisible();
    }

    await expect(page.getByRole('button', { name: 'Esporta CSV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Importa CSV' })).toBeVisible();
    await expectButtonAbsent(page, 'Registra movimento');
  });

  test('prodotti: no sync catalogo e no gestione', async ({ page }) => {
    await page.goto('/app/products');
    await expect(page.locator('h1.product-list__title')).toHaveText('Prodotti', {
      timeout: 30_000,
    });

    await expectButtonAbsent(page, 'Sincronizza catalogo da Shopify');
    await expectButtonAbsent(page, 'Aggiungi prodotto');
    await expectButtonAbsent(page, 'Esporta CSV');
  });
});
