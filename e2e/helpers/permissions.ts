import { expect, type Page } from '@playwright/test';

import { e2eClerkCredentials, hasE2eClerkCredentials } from './env';
import { loginWithCredentials } from './login';

/** Profilo consigliato per E2E_CLERK_* (documentato in .env.example). */
export const CLERK_E2E_PROFILE_HINT =
  'Commesso con sede assegnata; inventory.manage; supplier_orders.receive; reports.view; customers.view; ' +
  'senza catalog.manage, catalog.import_export, inventory.import_export, settings.company.';

export function skipIfNoClerkCredentials(testInfo: {
  skip: (condition: boolean, description: string) => void;
}): boolean {
  if (!hasE2eClerkCredentials()) {
    testInfo.skip(
      true,
      'Imposta E2E_CLERK_EMAIL e E2E_CLERK_PASSWORD in .env per i test permessi commesso.',
    );
    return true;
  }
  return false;
}

export async function loginAsClerk(page: Page): Promise<void> {
  await loginWithCredentials(page, e2eClerkCredentials());
}

export async function expectDashboardRedirect(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/app\/dashboard(?:\?.*)?$/, { timeout: 15_000 });
  await expect(page.locator('h1.dashboard__title')).toHaveText('Dashboard');
}

export async function expectButtonAbsent(page: Page, name: string | RegExp): Promise<void> {
  await expect(page.getByRole('button', { name })).toHaveCount(0);
}

export function sidebarLink(page: Page, label: string) {
  return page.locator('nav.app-sidebar').getByRole('link', { name: label, exact: true });
}

export async function expectSidebarLinkVisible(
  page: Page,
  label: string,
  visible: boolean,
): Promise<void> {
  const link = sidebarLink(page, label);
  if (visible) {
    await expect(link).toBeVisible();
  } else {
    await expect(link).toHaveCount(0);
  }
}

export type TopbarLocationMode = 'fixed' | 'select' | 'hidden';

/** Modalità selettore sede in topbar (sede fissa vs select multi-sede). */
export async function topbarLocationMode(page: Page): Promise<TopbarLocationMode> {
  const fixed = page.locator('.app-topbar__store-fixed');
  if (await fixed.isVisible()) {
    return 'fixed';
  }
  const select = page.getByRole('button', { name: 'Location attiva' });
  if (await select.isVisible()) {
    return 'select';
  }
  return 'hidden';
}

/** Apre un select-menu e conta le opzioni visibili (include placeholder se presente). */
export async function countSelectMenuOptions(page: Page, ariaLabel: string): Promise<number> {
  await page.getByRole('button', { name: ariaLabel, exact: true }).click();
  const listbox = page.getByRole('listbox', { name: ariaLabel });
  await expect(listbox).toBeVisible();
  const count = await listbox.getByRole('option').count();
  await page.keyboard.press('Escape');
  await expect(listbox).toBeHidden();
  return count;
}

export function shopifySettingsPanel(page: Page) {
  return page.getByRole('region', { name: 'Integrazione Shopify' });
}

export function tenantCompanyPanel(page: Page) {
  return page.getByRole('heading', { name: 'Sede fisica', exact: true });
}
