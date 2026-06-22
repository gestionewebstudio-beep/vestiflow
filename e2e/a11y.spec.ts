import { expect, test } from '@playwright/test';

import { assertNoSeriousA11yViolations } from './helpers/a11y';
import { waitForProductListReady } from './helpers/page-ready';

async function useLightThemeIfAvailable(page: import('@playwright/test').Page): Promise<void> {
  const lightTheme = page.getByRole('button', { name: 'Tema chiaro' });
  if (await lightTheme.isVisible()) {
    await lightTheme.click();
  }
}

test.describe('Accessibilità operativa', () => {
  test('prodotti senza violazioni a11y serious/critical', async ({ page }) => {
    await page.goto('/app/products');
    await waitForProductListReady(page);
    await useLightThemeIfAvailable(page);

    await expect(page.locator('h1.product-list__title')).toHaveText('Prodotti');
    await assertNoSeriousA11yViolations(page, { include: 'main' });
  });

  test('magazzino senza violazioni a11y serious/critical', async ({ page }) => {
    await page.goto('/app/inventory');
    await expect(page.locator('h1.inventory-levels__title')).toHaveText('Magazzino', {
      timeout: 30_000,
    });
    await useLightThemeIfAvailable(page);

    await assertNoSeriousA11yViolations(page, { include: 'main' });
  });
});
