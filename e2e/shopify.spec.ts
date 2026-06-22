import { expect, test } from '@playwright/test';

function shopifyPanel(page: import('@playwright/test').Page) {
  return page.getByRole('region', { name: 'Integrazione Shopify' });
}

test.describe('Integrazione Shopify', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/settings');
    await expect(page.locator('h1.settings__title')).toHaveText('Impostazioni', {
      timeout: 30_000,
    });
  });

  test('mostra pannello connessione Shopify quando abilitato', async ({ page }) => {
    const panel = shopifyPanel(page);
    if (!(await panel.isVisible())) {
      test.skip(true, 'Integrazione Shopify non abilitata per questo tenant.');
      return;
    }

    await expect(panel.getByRole('heading', { name: 'Integrazione Shopify' })).toBeVisible();
  });

  test('tenant connesso mostra dominio shop e stato sync', async ({ page }) => {
    const panel = shopifyPanel(page);
    if (!(await panel.isVisible())) {
      test.skip(true, 'Integrazione Shopify non abilitata per questo tenant.');
      return;
    }

    const disconnectBtn = panel.getByRole('button', { name: 'Disconnetti Shopify' });
    const connectBtn = panel.getByRole('button', { name: 'Connetti Shopify' });
    const disconnectedCopy = panel.getByText(/Nessuna connessione Shopify attiva/);

    await expect(disconnectBtn.or(connectBtn).or(disconnectedCopy)).toBeVisible({
      timeout: 30_000,
    });

    if (await disconnectBtn.isVisible()) {
      await expect(panel.getByText(/myshopify\.com/)).toBeVisible();
      await expect(page.getByRole('button', { name: /Shopify connesso/i })).toBeVisible();
      return;
    }

    if (await connectBtn.isVisible()) {
      await expect(panel.locator('#shopify-shop')).toBeVisible();
      return;
    }

    await expect(disconnectedCopy).toBeVisible();
  });

  test('topbar indica stato connessione Shopify', async ({ page }) => {
    await page.goto('/app/dashboard');
    await expect(page.locator('h1.dashboard__title')).toBeVisible({ timeout: 30_000 });

    const syncButton = page.getByRole('button', { name: /Shopify/ });
    await expect(syncButton).toBeVisible();
  });
});
