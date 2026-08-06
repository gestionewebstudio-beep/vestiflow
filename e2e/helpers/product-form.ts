import { expect, type Page } from '@playwright/test';

export async function selectShopifyTaxonomyCategory(page: Page): Promise<void> {
  const search = page.getByRole('searchbox', { name: 'Cerca categorie' });
  await expect(search).toBeVisible({ timeout: 15_000 });

  await page
    .getByText('Caricamento categorie')
    .waitFor({ state: 'hidden', timeout: 30_000 })
    .catch(() => undefined);

  for (let depth = 0; depth < 10; depth += 1) {
    if (await page.locator('.taxonomy-picker__selected').isVisible()) {
      return;
    }

    await page
      .locator('.taxonomy-picker__loading')
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => undefined);

    const selectLeaf = page
      .locator('.taxonomy-picker__item')
      .filter({ has: page.locator('.taxonomy-picker__item-hint', { hasText: 'Seleziona' }) })
      .first();

    if (await selectLeaf.isVisible().catch(() => false)) {
      await selectLeaf.click();
      await expect(page.locator('.taxonomy-picker__selected')).toBeVisible({ timeout: 10_000 });
      return;
    }

    const items = page.locator('.taxonomy-picker__item');
    if ((await items.count()) === 0) {
      await search.fill('apparel');
      continue;
    }

    await items.first().click();
  }

  throw new Error('Impossibile selezionare una categoria Shopify taxonomy nel wizard prodotto.');
}

export async function addOptionValue(page: Page, label: string, value: string): Promise<void> {
  const section = page.locator('.option-list').filter({
    has: page.getByText(label, { exact: true }),
  });
  await section.getByRole('textbox').fill(value);
  await section.getByRole('button', { name: 'Aggiungi' }).click();
}
