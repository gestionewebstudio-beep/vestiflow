import { expect, test } from '@playwright/test';

import { e2eClerkCredentials, hasE2eClerkCredentials } from './helpers/env';
import { loginWithCredentials } from './helpers/login';

test.describe('Permessi ruolo clerk', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasE2eClerkCredentials()) {
      testInfo.skip(
        true,
        'Imposta E2E_CLERK_EMAIL e E2E_CLERK_PASSWORD nel file .env per eseguire i test permessi.',
      );
      return;
    }

    await loginWithCredentials(page, e2eClerkCredentials());
  });
  test('impostazioni mostra ruolo commesso senza azioni Shopify admin', async ({ page }) => {
    await page.goto('/app/settings');
    await expect(page.locator('h1.settings__title')).toHaveText('Impostazioni', {
      timeout: 30_000,
    });

    const profile = page.getByRole('region', { name: 'Profilo' });
    await expect(profile).toBeVisible();
    await expect(profile.getByText(/Commesso/)).toBeVisible();

    const shopifyPanel = page.getByRole('region', { name: 'Integrazione Shopify' });
    if (await shopifyPanel.isVisible()) {
      await expect(shopifyPanel.getByRole('button', { name: 'Connetti Shopify' })).toHaveCount(0);
      await expect(shopifyPanel.getByRole('button', { name: 'Disconnetti Shopify' })).toHaveCount(
        0,
      );
    }
  });

  test('catalogo prodotti senza CTA di gestione', async ({ page }) => {
    await page.goto('/app/products');
    await expect(page.locator('h1.product-list__title')).toHaveText('Prodotti', {
      timeout: 30_000,
    });

    await expect(page.getByRole('button', { name: 'Aggiungi prodotto' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Esporta CSV' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Importa CSV' })).toHaveCount(0);
  });

  test('route manager prodotti reindirizza alla dashboard', async ({ page }) => {
    await page.goto('/app/products/new');
    await expect(page).toHaveURL(/\/app\/dashboard$/, { timeout: 15_000 });
    await expect(page.locator('h1.dashboard__title')).toHaveText('Dashboard');

    await page.goto('/app/products/import');
    await expect(page).toHaveURL(/\/app\/dashboard$/, { timeout: 15_000 });
  });

  test('ordini fornitore senza CTA creazione e route new bloccata', async ({ page }) => {
    await page.goto('/app/orders');
    await expect(page.locator('h1.po-list__title')).toHaveText('Ordini Fornitori', {
      timeout: 30_000,
    });

    await expect(page.getByRole('button', { name: 'Nuovo ordine' })).toHaveCount(0);

    await page.goto('/app/orders/new');
    await expect(page).toHaveURL(/\/app\/dashboard$/, { timeout: 15_000 });
  });

  test('import giacenze CSV bloccato per clerk', async ({ page }) => {
    await page.goto('/app/inventory/import');
    await expect(page).toHaveURL(/\/app\/dashboard$/, { timeout: 15_000 });
  });

  test('può consultare giacenze e registrare movimenti', async ({ page }) => {
    await page.goto('/app/inventory/lookup');
    await expect(page.locator('h1.stock-lookup__title')).toHaveText('Magazzino', {
      timeout: 30_000,
    });
    await expect(page.locator('#stock-code')).toBeVisible();

    await page.goto('/app/inventory/movements/new');
    await expect(page).toHaveURL(/\/app\/inventory\/movements\/new$/, { timeout: 15_000 });
    await expect(page.locator('h1.movement-form__title')).toHaveText('Registra movimento');
  });
});
