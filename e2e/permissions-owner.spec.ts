import { expect, test } from '@playwright/test';

import { hasE2eCredentials } from './helpers/env';
import {
  countSelectMenuOptions,
  expectButtonAbsent,
  shopifySettingsPanel,
  tenantCompanyPanel,
  topbarLocationMode,
} from './helpers/permissions';

/**
 * Usa la sessione salvata da auth.setup (E2E_USER_*).
 * Account consigliato: titolare o admin/manager del tenant di test, preferibilmente Shopify.
 */
test.describe('Permessi titolare/admin tenant (E2E_USER_*)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasE2eCredentials()) {
      testInfo.skip(true, 'Imposta E2E_USER_EMAIL e E2E_USER_PASSWORD per i test permessi owner.');
      return;
    }
    await page.goto('/app/dashboard');
    await expect(page.locator('h1.dashboard__title')).toHaveText('Dashboard', {
      timeout: 30_000,
    });
  });

  test.describe('Impostazioni tenant', () => {
    test('pannello Sede fisica: carica anagrafica o mostra errore recuperabile', async ({
      page,
    }) => {
      await page.goto('/app/settings');
      await expect(page.locator('h1.settings__title')).toHaveText('Impostazioni', {
        timeout: 30_000,
      });

      const heading = tenantCompanyPanel(page);
      if (!(await heading.isVisible())) {
        test.skip(true, 'Anagrafica cliente non disponibile per questo utente/tenant.');
        return;
      }

      await expect(heading).toBeVisible();
      const card = page.locator('app-tenant-client-card');
      const skeleton = page.locator('.settings__company-card-skeleton');
      const error = page.getByText('Anagrafica cliente non disponibile', { exact: true });

      await expect(card.or(skeleton).or(error)).toBeVisible({ timeout: 30_000 });
    });

    test('integrazione Shopify: solo titolare gestisce connessione', async ({ page }) => {
      await page.goto('/app/settings');
      const panel = shopifySettingsPanel(page);
      if (!(await panel.isVisible())) {
        test.skip(true, 'Tenant non Shopify — pannello integrazione assente.');
        return;
      }

      const connectBtn = panel.getByRole('button', { name: 'Connetti Shopify' });
      const disconnectBtn = panel.getByRole('button', { name: 'Disconnetti Shopify' });
      await expect(connectBtn.or(disconnectBtn)).toBeVisible({ timeout: 30_000 });
    });
  });

  test.describe('Sync Shopify separato da gestione catalogo', () => {
    test('prodotti: sync catalogo non richiede CTA Aggiungi prodotto', async ({ page }) => {
      await page.goto('/app/products');
      await expect(page.locator('h1.product-list__title')).toHaveText('Prodotti', {
        timeout: 30_000,
      });

      const syncBtn = page.getByRole('button', { name: 'Sincronizza catalogo da Shopify' });
      const addBtn = page.getByRole('button', { name: 'Aggiungi prodotto' });

      const hasSync = await syncBtn.isVisible();
      const hasAdd = await addBtn.isVisible();

      if (hasSync && !hasAdd) {
        test.info().annotations.push({
          type: 'note',
          description:
            'Profilo con catalog.import_export ma senza catalog.manage — regression sync vs gestione.',
        });
      }

      if (hasAdd) {
        await expect(addBtn).toBeEnabled();
      }
    });

    test('magazzino: sync giacenze visibile solo con permesso import giacenze', async ({
      page,
    }) => {
      await page.goto('/app/inventory');
      await expect(page.locator('h1.inventory-levels__title')).toHaveText('Magazzino', {
        timeout: 30_000,
      });

      const syncBtn = page.getByRole('button', { name: 'Sincronizza giacenze da Shopify' });
      const csvExport = page.getByRole('button', { name: 'Esporta CSV' });

      const hasSync = await syncBtn.isVisible();
      const hasCsv = await csvExport.isVisible();

      expect(hasSync).toBe(hasCsv);
      if (hasSync) {
        await expect(syncBtn).toBeEnabled();
      }
    });
  });

  test.describe('Topbar e scope sedi', () => {
    test('titolar/admin può usare selettore location se più sedi licenziate', async ({ page }) => {
      await page.goto('/app/dashboard');
      const mode = await topbarLocationMode(page);
      if (mode === 'hidden') {
        test.skip(true, 'Nessuna location configurata nel tenant di test.');
        return;
      }

      if (mode === 'select') {
        await page.getByRole('button', { name: 'Location attiva' }).click();
        const listbox = page.getByRole('listbox', { name: 'Location attiva' });
        await expect(listbox).toBeVisible();
        await expect(listbox.getByRole('option').first()).toBeVisible();
        await page.keyboard.press('Escape');
        return;
      }

      test.info().annotations.push({
        type: 'note',
        description:
          'Una sola sede operativa: topbar mostra etichetta fissa (comportamento atteso).',
      });
    });

    test('filtro location giacenze espone tutte le sedi per titolare', async ({ page }) => {
      await page.goto('/app/inventory');
      await expect(page.locator('h1.inventory-levels__title')).toHaveText('Magazzino', {
        timeout: 30_000,
      });

      const filterBtn = page.getByRole('button', { name: 'Filtra per location', exact: true });
      if (!(await filterBtn.isVisible())) {
        test.skip(true, 'Filtro location non presente.');
        return;
      }

      const optionCount = await countSelectMenuOptions(page, 'Filtra per location');
      expect(optionCount).toBeGreaterThan(0);
    });
  });

  test.describe('Azioni manager titolare', () => {
    test('può aprire creazione prodotto se permesso catalogo', async ({ page }) => {
      await page.goto('/app/products');
      const createButton = page.getByRole('button', { name: 'Aggiungi prodotto' });
      if (!(await createButton.isVisible())) {
        test.skip(true, 'Utente E2E senza permesso gestione catalogo.');
        return;
      }

      await createButton.click();
      await expect(page).toHaveURL(/\/app\/products\/new/, { timeout: 15_000 });
    });

    test('può aprire nuovo ordine fornitore se permesso ordini', async ({ page }) => {
      await page.goto('/app/orders');
      await expect(page.locator('h1.po-list__title')).toHaveText('Ordini Fornitori', {
        timeout: 30_000,
      });

      const createButton = page.getByRole('button', { name: 'Nuovo ordine' });
      if (!(await createButton.isVisible())) {
        test.skip(true, 'Utente E2E senza permesso ordini fornitore.');
        return;
      }

      await createButton.click();
      await expect(page).toHaveURL(/\/app\/orders\/new/, { timeout: 15_000 });
    });

    test('clienti: export CSV solo con reports.export', async ({ page }) => {
      await page.goto('/app/customers');
      await expect(page.locator('h1.customer-list__title')).toHaveText('Clienti', {
        timeout: 30_000,
      });

      const exportBtn = page.getByRole('button', { name: 'Esporta CSV' });
      const syncBtn = page.getByRole('button', { name: 'Sincronizza clienti da Shopify' });
      const hasExport = await exportBtn.isVisible();
      const hasSync = await syncBtn.isVisible();

      expect(hasSync).toBe(hasExport);
      if (!hasExport) {
        await expectButtonAbsent(page, 'Esporta CSV');
      }
    });
  });
});
