import { expect, test } from '@playwright/test';

test.describe('Impostazioni', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/settings');
    await expect(page.locator('h1.settings__title')).toHaveText('Impostazioni', {
      timeout: 30_000,
    });
  });

  test('mostra sezione Profilo con dati utente', async ({ page }) => {
    await expect(page.locator('#settings-profile')).toHaveText('Profilo');
    await expect(
      page.locator('#settings-profile').locator('..').locator('.settings__facts'),
    ).toBeVisible();
  });

  test('Profilo precede Integrazione Shopify nel layout', async ({ page }) => {
    const shopifyPanel = page.locator('#settings-shopify');
    if (!(await shopifyPanel.isVisible())) {
      test.skip(true, 'Integrazione Shopify non visibile per questo tenant/ruolo.');
      return;
    }

    const profileIndex = await page.locator('#settings-profile').evaluate((node) => {
      const headings = Array.from(document.querySelectorAll('.settings__panel-title'));
      return headings.indexOf(node);
    });

    const shopifyIndex = await page.locator('#settings-shopify').evaluate((node) => {
      const headings = Array.from(document.querySelectorAll('.settings__panel-title'));
      return headings.indexOf(node);
    });

    expect(profileIndex).toBeGreaterThanOrEqual(0);
    expect(shopifyIndex).toBeGreaterThan(profileIndex);
  });

  test('sezione Aspetto con opzioni tema', async ({ page }) => {
    await expect(page.locator('#settings-theme')).toHaveText('Aspetto');
    await expect(page.getByText("Tema dell'interfaccia")).toBeVisible();
  });
});
