import { expect, type Page } from '@playwright/test';

import { reloadIfErrorState } from './page-ready';

/** Attende il caricamento del registro commercialista (tab Documenti). */
export async function waitForAccountantRegisterReady(page: Page): Promise<void> {
  if (!page.url().includes('/app/reports/accountant-register')) {
    await page.goto('/app/reports/accountant-register');
  }

  await expect(page.locator('h1.accountant-register__title')).toHaveText(
    'Registro commercialista',
    {
      timeout: 30_000,
    },
  );

  const panel = page.locator('#accountant-docs-title');
  const skeleton = page.locator('app-table-skeleton');
  const error = page.locator('app-error-state');

  await expect(panel.or(skeleton).or(error)).toBeVisible({ timeout: 45_000 });

  if (await error.isVisible()) {
    return;
  }

  const reloadCount = { value: 0 };
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    if (await panel.isVisible()) {
      return;
    }

    if (await reloadIfErrorState(page, reloadCount)) {
      return;
    }

    if (await skeleton.isVisible()) {
      await page.waitForTimeout(500);
      continue;
    }

    await page.waitForTimeout(500);
  }

  throw new Error('Il registro commercialista non ha caricato il pannello documenti in tempo.');
}

/** Attende la lista documenti (titolo visibile; tabella opzionale se API assente). */
export async function waitForDocumentsListReady(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/app\/documents/, { timeout: 30_000 });
  await expect(page.locator('h1.doc-list__title')).toHaveText('Documenti', { timeout: 45_000 });
}

/** Verifica vista filtrata DDT da fatturare (query URL + banner + checkbox). */
export async function expectPendingInvoiceDocumentsView(page: Page): Promise<void> {
  const url = new URL(page.url());

  expect(url.searchParams.get('pendingInvoice')).toBe('1');
  expect(url.searchParams.get('type')).toBe('sales_ddt');
  expect(url.searchParams.get('dateFrom')).toBeTruthy();
  expect(url.searchParams.get('dateTo')).toBeTruthy();

  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'DDT vendita confermati senza bozza fattura collegata' }),
  ).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'DDT da fatturare' })).toBeChecked();
}

/** URL lista documenti con filtro DDT da fatturare (stesso output del link nel registro). */
export function buildPendingInvoiceDocumentsPath(dateFrom: string, dateTo: string): string {
  const params = new URLSearchParams({
    dateFrom,
    dateTo,
    type: 'sales_ddt',
    pendingInvoice: '1',
  });
  return `/app/documents?${params.toString()}`;
}

/** Verifica vista registro commercialista sulla lista documenti. */
export async function expectAccountantDocumentsView(page: Page): Promise<void> {
  const url = new URL(page.url());

  expect(url.searchParams.get('accountant')).toBe('1');
  expect(url.searchParams.get('dateFrom')).toBeTruthy();
  expect(url.searchParams.get('dateTo')).toBeTruthy();

  await expect(
    page.getByRole('status').filter({
      hasText:
        'Vista registro commercialista: tipi documento rilevanti per contabilità e fatturazione',
    }),
  ).toBeVisible();
}
