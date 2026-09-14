import { expect, test } from '@playwright/test';

function shopifyPanel(page: import('@playwright/test').Page) {
  // Dal 13/09/2026 la regione prende il nome dal titolo di pagina, «Shopify».
  return page.getByRole('region', { name: 'Shopify', exact: true });
}

test.describe('Integrazione Shopify', () => {
  // ⭐ Dall’11/09/2026 il pannello ha una pagina propria, Impostazioni → Shopify:
  //    a un tenant senza modulo la rotta rimanda alla dashboard, e le prove che
  //    guardano il pannello lo dicono col `skip` invece di passare a vuoto.
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/settings/shopify');
    await expect(page).toHaveURL(/\/app\/(settings\/shopify|dashboard)/, { timeout: 30_000 });
  });

  test('mostra pannello connessione Shopify quando abilitato', async ({ page }) => {
    const panel = shopifyPanel(page);
    if (!(await panel.isVisible())) {
      test.skip(true, 'Integrazione Shopify non abilitata per questo tenant.');
      return;
    }

    await expect(page.getByRole('heading', { level: 1, name: 'Shopify' })).toBeVisible();
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
    await page.goto('/app/settings');
    await expect(page.locator('h1.settings__title')).toHaveText('Impostazioni', {
      timeout: 30_000,
    });
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

  // ⛔ «Disconnetti e rimuovi dati» è SPENTO finché l'API rifiuta la purga (422), col
  //    motivo accanto (proprietario, 13/09/2026). Qui c'erano due prove che aprivano il
  //    wizard: un comando acceso che poi viene negato era il difetto.
  test('«Disconnetti e rimuovi dati» è spento, e dice perché', async ({ page }) => {
    const panel = shopifyPanel(page);
    if (!(await panel.isVisible())) {
      test.skip(true, 'Integrazione Shopify non abilitata per questo tenant.');
      return;
    }

    const purgeBtn = panel.getByRole('button', { name: 'Disconnetti e rimuovi dati' });
    if (!(await purgeBtn.isVisible())) {
      test.skip(true, 'Shopify non connesso: il comando non c’è.');
      return;
    }

    await expect(purgeBtn).toBeDisabled();
    await expect(purgeBtn).toHaveAccessibleDescription(/l'API rifiuta la rimozione/);
  });

  test.skip('wizard purge: step conferma richiede dominio e consenso — sospeso con la purga', async ({
    page,
  }) => {
    const panel = shopifyPanel(page);
    const purgeBtn = panel.getByRole('button', { name: 'Disconnetti e rimuovi dati' });
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
