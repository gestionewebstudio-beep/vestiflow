import { expect, test } from '@playwright/test';

import { addOptionValue, selectShopifyTaxonomyCategory } from './helpers/product-form';

test.describe('Form prodotto', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/products');
    await expect(page.locator('h1.product-list__title')).toHaveText('Prodotti', {
      timeout: 30_000,
    });
  });

  test('apre l’anagrafica nuovo prodotto', async ({ page }) => {
    const createButton = page.getByRole('button', { name: 'Aggiungi prodotto' });
    await expect(createButton).toBeVisible({ timeout: 15_000 });

    await createButton.click();
    await expect(page).toHaveURL(/\/app\/products\/new/);
    await expect(page.locator('h1.product-form__title')).toHaveText('Anagrafica prodotto', {
      timeout: 30_000,
    });
    await expect(page.getByRole('tab', { name: 'Articolo' })).toBeVisible();
    await expect(page.locator('#product-name')).toBeVisible();
  });

  test('compila i tab Articolo, Catalogo e Varianti senza salvare', async ({ page }) => {
    test.setTimeout(120_000);
    const createButton = page.getByRole('button', { name: 'Aggiungi prodotto' });
    await expect(createButton).toBeVisible({ timeout: 15_000 });

    await createButton.click();
    await expect(page).toHaveURL(/\/app\/products\/new/);

    await expect(page.locator('#product-name')).toBeVisible({ timeout: 30_000 });

    const uniqueSuffix = Date.now().toString().slice(-6);
    await page.locator('#product-name').fill(`Prodotto E2E ${uniqueSuffix}`);
    await page.locator('#product-brand').fill('VestiFlow Test');

    // Categoria Shopify: nel tab Catalogo (solo con integrazione attiva).
    await page.getByRole('tab', { name: 'Catalogo' }).click();
    await selectShopifyTaxonomyCategory(page);

    await page.getByRole('tab', { name: 'Varianti' }).click();
    await expect(page.getByText('Definisci le opzioni che generano le varianti')).toBeVisible({
      timeout: 15_000,
    });

    await addOptionValue(page, 'Taglia', 'M');
    await addOptionValue(page, 'Colori varianti', 'Nero');

    await expect(page.locator('.variants-step-table')).toBeVisible({ timeout: 15_000 });

    const skuInput = page.locator('.variants-step__input--sku').first();
    await skuInput.fill(`E2E-${uniqueSuffix}`);
    await page.locator('input[formcontrolname="sellingPrice"]').first().fill('19.90');

    await expect(page.getByRole('button', { name: 'Crea prodotto' })).toBeEnabled({
      timeout: 15_000,
    });
  });
});
