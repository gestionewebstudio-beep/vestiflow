import { expect, test } from '@playwright/test';

import {
  CLERK_E2E_PROFILE_HINT,
  expectButtonAbsent,
  expectDashboardRedirect,
  expectSidebarLinkVisible,
  loginAsClerk,
  shopifySettingsPanel,
  skipIfNoClerkCredentials,
  tenantCompanyPanel,
  topbarLocationMode,
} from './helpers/permissions';

test.describe('Permessi commesso (E2E_CLERK_*)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (skipIfNoClerkCredentials(testInfo)) {
      return;
    }
    await loginAsClerk(page);
  });

  test.describe('Impostazioni e integrazioni', () => {
    test('mostra profilo commesso senza azioni Shopify admin', async ({ page }) => {
      await page.goto('/app/settings');
      await expect(page.locator('h1.settings__title')).toHaveText('Impostazioni', {
        timeout: 30_000,
      });

      const profile = page.getByRole('region', { name: 'Profilo' });
      await expect(profile).toBeVisible();
      await expect(profile.getByText(/Commesso/)).toBeVisible();

      const shopifyPanel = shopifySettingsPanel(page);
      if (await shopifyPanel.isVisible()) {
        await expect(shopifyPanel.getByRole('button', { name: 'Connetti Shopify' })).toHaveCount(0);
        await expect(shopifyPanel.getByRole('button', { name: 'Disconnetti Shopify' })).toHaveCount(
          0,
        );
        await expect(shopifyPanel.getByRole('button', { name: 'Cambia negozio' })).toHaveCount(0);
      }
    });

    test('anagrafica Sede fisica nascosta senza permesso settings.company', async ({ page }) => {
      await page.goto('/app/settings');
      await expect(page.locator('h1.settings__title')).toHaveText('Impostazioni', {
        timeout: 30_000,
      });

      await expect(tenantCompanyPanel(page)).toHaveCount(0);
    });
  });

  test.describe('Navigazione sidebar', () => {
    test('mostra sezioni consentite dal preset commesso', async ({ page }) => {
      await page.goto('/app/dashboard');
      await expect(page.locator('h1.dashboard__title')).toHaveText('Dashboard', {
        timeout: 30_000,
      });

      await expectSidebarLinkVisible(page, 'Dashboard', true);
      await expectSidebarLinkVisible(page, 'Prodotti', true);
      await expectSidebarLinkVisible(page, 'Magazzino', true);
      await expectSidebarLinkVisible(page, 'Impostazioni', true);
      await expectSidebarLinkVisible(page, 'Report', true);
      await expectSidebarLinkVisible(page, 'Clienti', true);
      await expectSidebarLinkVisible(page, 'Ordini Fornitori', true);
    });

    test('area admin piattaforma non accessibile', async ({ page }) => {
      await page.goto('/app/admin/clients');
      await expect(page).not.toHaveURL(/\/app\/admin\//, { timeout: 15_000 });
    });
  });

  test.describe('Topbar sede operativa', () => {
    test('commesso con sede assegnata vede etichetta fissa, non select multi-sede', async ({
      page,
    }) => {
      await page.goto('/app/dashboard');
      await expect(page.locator('h1.dashboard__title')).toHaveText('Dashboard', {
        timeout: 30_000,
      });

      const mode = await topbarLocationMode(page);
      expect(mode).not.toBe('select');
      if (mode === 'fixed') {
        const label = page.locator('.app-topbar__store-fixed');
        await expect(label).not.toHaveText(/tutte le location/i);
        const text = (await label.textContent())?.trim() ?? '';
        expect(text.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Catalogo prodotti', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/app/products');
      await expect(page.locator('h1.product-list__title')).toHaveText('Prodotti', {
        timeout: 30_000,
      });
    });

    test('consultazione lista senza CTA di gestione catalogo', async ({ page }) => {
      await expectButtonAbsent(page, 'Aggiungi prodotto');
      await expectButtonAbsent(page, 'Esporta CSV');
      await expectButtonAbsent(page, 'Importa CSV');
      await expectButtonAbsent(page, 'Sincronizza catalogo da Shopify');
    });

    test('route creazione/import prodotti reindirizza alla dashboard', async ({ page }) => {
      await page.goto('/app/products/new');
      await expectDashboardRedirect(page);

      await page.goto('/app/products/import');
      await expectDashboardRedirect(page);
    });
  });

  test.describe('Magazzino', () => {
    test('giacenze: no sync Shopify e no CSV senza import_export', async ({ page }) => {
      await page.goto('/app/inventory');
      await expect(page.locator('h1.inventory-levels__title')).toHaveText('Magazzino', {
        timeout: 30_000,
      });

      await expectButtonAbsent(page, 'Sincronizza giacenze da Shopify');
      await expectButtonAbsent(page, 'Esporta CSV');
      await expectButtonAbsent(page, 'Importa CSV');
    });

    test('CTA Registra movimento solo nel tab Movimenti (non in Giacenze)', async ({ page }) => {
      await page.goto('/app/inventory');
      await expect(page.locator('h1.inventory-levels__title')).toHaveText('Magazzino', {
        timeout: 30_000,
      });
      await expect(page.getByRole('button', { name: 'Registra movimento' })).toHaveCount(0);

      await page.goto('/app/inventory/movements');
      await expect(page.getByRole('button', { name: 'Registra movimento' })).toBeVisible({
        timeout: 30_000,
      });
    });

    test('route import giacenze CSV bloccata', async ({ page }) => {
      await page.goto('/app/inventory/import');
      await expectDashboardRedirect(page);
    });

    test('può consultare giacenze e aprire form movimento', async ({ page }) => {
      await page.goto('/app/inventory/lookup');
      await expect(page.locator('h1.stock-lookup__title')).toHaveText('Magazzino', {
        timeout: 30_000,
      });
      await expect(page.locator('#stock-code')).toBeVisible();

      await page.goto('/app/inventory/movements/new');
      await expect(page).toHaveURL(/\/app\/inventory\/movements\/new$/, { timeout: 15_000 });
      await expect(page.locator('h1.movement-form__title')).toHaveText('Registra movimento');
    });

    test('storico movimenti: CTA movimento coerente con inventory.manage', async ({ page }) => {
      await page.goto('/app/inventory/movements');
      await expect(page.locator('h1.stock-movements__title')).toHaveText('Movimenti di magazzino', {
        timeout: 30_000,
      });
      await expect(page.getByRole('button', { name: 'Registra movimento' })).toBeVisible();
    });
  });

  test.describe('Ordini fornitore', () => {
    test('lista senza CTA creazione e route new bloccata', async ({ page }) => {
      await page.goto('/app/orders');
      await expect(page.locator('h1.po-list__title')).toHaveText('Ordini Fornitori', {
        timeout: 30_000,
      });

      await expectButtonAbsent(page, 'Nuovo ordine');

      await page.goto('/app/orders/new');
      await expectDashboardRedirect(page);
    });
  });

  test.describe('Clienti e report', () => {
    test('clienti: consultazione senza export/sync operativi', async ({ page }) => {
      await page.goto('/app/customers');
      await expect(page.locator('h1.customer-list__title')).toHaveText('Clienti', {
        timeout: 30_000,
      });

      await expectButtonAbsent(page, 'Sincronizza clienti da Shopify');
      await expectButtonAbsent(page, 'Esporta CSV');
    });

    test('report accessibile in sola consultazione', async ({ page }) => {
      await page.goto('/app/reports');
      await expect(page.locator('h1.reports__title')).toHaveText('Report', { timeout: 30_000 });
      await expect(page.getByText('Valore magazzino', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
    });
  });

  test.describe('Vendite al banco', () => {
    test('registra vendita in sidebar se permesso retail.register', async ({ page }) => {
      await page.goto('/app/dashboard');
      await expect(page.locator('h1.dashboard__title')).toHaveText('Dashboard', {
        timeout: 30_000,
      });

      const registerLink = page
        .locator('nav.app-sidebar')
        .getByRole('link', { name: 'Registra vendita', exact: true });
      if (await registerLink.isVisible()) {
        await registerLink.click();
        await expect(page).toHaveURL(/\/app\/sales\/register/, { timeout: 15_000 });
      } else {
        test.info().annotations.push({
          type: 'note',
          description: `Link vendita al banco assente — verifica preset commesso. ${CLERK_E2E_PROFILE_HINT}`,
        });
      }
    });
  });

  test.describe('Coerenza permessi granulari (runtime)', () => {
    test('sync catalogo e CSV prodotti hanno la stessa visibilità', async ({ page }) => {
      await page.goto('/app/products');
      await expect(page.locator('h1.product-list__title')).toHaveText('Prodotti', {
        timeout: 30_000,
      });

      const syncVisible = await page
        .getByRole('button', { name: 'Sincronizza catalogo da Shopify' })
        .isVisible();
      const exportVisible = await page.getByRole('button', { name: 'Esporta CSV' }).isVisible();
      const importVisible = await page.getByRole('button', { name: 'Importa CSV' }).isVisible();

      expect(exportVisible).toBe(importVisible);
      expect(syncVisible).toBe(exportVisible);
    });

    test('sync giacenze e CSV giacenze hanno la stessa visibilità', async ({ page }) => {
      await page.goto('/app/inventory');
      await expect(page.locator('h1.inventory-levels__title')).toHaveText('Magazzino', {
        timeout: 30_000,
      });

      const syncVisible = await page
        .getByRole('button', { name: 'Sincronizza giacenze da Shopify' })
        .isVisible();
      const exportVisible = await page.getByRole('button', { name: 'Esporta CSV' }).isVisible();
      const importVisible = await page.getByRole('button', { name: 'Importa CSV' }).isVisible();

      expect(exportVisible).toBe(importVisible);
      expect(syncVisible).toBe(exportVisible);
    });

    test('inventory.manage implica CTA movimento sul tab Movimenti', async ({ page }) => {
      await page.goto('/app/inventory/movements/new');
      const onForm = /\/inventory\/movements\/new$/.test(page.url());

      await page.goto('/app/inventory/movements');
      await expect(page.locator('h1.stock-movements__title')).toHaveText('Movimenti di magazzino', {
        timeout: 30_000,
      });

      const movementCta = page.getByRole('button', { name: 'Registra movimento' });
      if (onForm) {
        await expect(movementCta).toBeVisible();
      } else {
        await expect(movementCta).toHaveCount(0);
      }
    });
  });
});
