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
      await expect(panel.getByRole('button', { name: 'Cambia negozio' })).toBeVisible();
      await expect(panel.getByRole('button', { name: 'Disconnetti e rimuovi dati' })).toBeVisible();
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

  test('pannello Sede fisica in Impostazioni', async ({ page }) => {
    const heading = page.getByRole('heading', { name: 'Sede fisica', exact: true });
    if (!(await heading.isVisible())) {
      test.skip(true, 'Pannello Sede fisica non disponibile per questo tenant.');
      return;
    }

    await expect(heading).toBeVisible();
  });

  test('wizard Cambia negozio mostra anteprima dati e si chiude', async ({ page }) => {
    const panel = shopifyPanel(page);
    if (!(await panel.isVisible())) {
      test.skip(true, 'Integrazione Shopify non abilitata per questo tenant.');
      return;
    }

    const changeBtn = panel.getByRole('button', { name: 'Cambia negozio' });
    if (!(await changeBtn.isVisible())) {
      test.skip(true, 'Shopify non connesso: wizard cambio negozio non disponibile.');
      return;
    }

    await changeBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Cambia negozio Shopify' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(dialog.getByText('Prodotti Shopify')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Continua' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Annulla' }).click();
    await expect(dialog).toBeHidden();
  });

  test('wizard Disconnetti e rimuovi dati mostra opzioni purge', async ({ page }) => {
    const panel = shopifyPanel(page);
    if (!(await panel.isVisible())) {
      test.skip(true, 'Integrazione Shopify non abilitata per questo tenant.');
      return;
    }

    const purgeBtn = panel.getByRole('button', { name: 'Disconnetti e rimuovi dati' });
    if (!(await purgeBtn.isVisible())) {
      test.skip(true, 'Shopify non connesso: wizard purge non disponibile.');
      return;
    }

    await purgeBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Rimuovi dati Shopify' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(dialog.getByText('Catalogo importato da Shopify')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Disconnetti senza rimuovere' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Annulla' }).click();
    await expect(dialog).toBeHidden();
  });

  test('wizard purge: step conferma richiede dominio e consenso', async ({ page }) => {
    const panel = shopifyPanel(page);
    if (!(await panel.isVisible())) {
      test.skip(true, 'Integrazione Shopify non abilitata per questo tenant.');
      return;
    }

    const purgeBtn = panel.getByRole('button', { name: 'Disconnetti e rimuovi dati' });
    if (!(await purgeBtn.isVisible())) {
      test.skip(true, 'Shopify non connesso: wizard purge non disponibile.');
      return;
    }

    await purgeBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Rimuovi dati Shopify' })).toBeVisible({
      timeout: 30_000,
    });

    await dialog.getByRole('button', { name: 'Continua' }).click();

    await expect(
      dialog.getByRole('textbox', { name: /Digita il dominio del negozio attuale/i }),
    ).toBeVisible();
    const removeBtn = dialog.getByRole('button', { name: 'Rimuovi dati selezionati' });
    await expect(removeBtn).toBeDisabled();

    await dialog.getByRole('button', { name: 'Indietro' }).click();
    await expect(dialog.getByRole('button', { name: 'Continua' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Annulla' }).click();
    await expect(dialog).toBeHidden();
  });
});
