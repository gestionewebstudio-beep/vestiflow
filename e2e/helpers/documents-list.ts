import { expect, type Page } from '@playwright/test';

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

/** URL lista documenti con filtro DDT da fatturare. */
export function buildPendingInvoiceDocumentsPath(dateFrom: string, dateTo: string): string {
  const params = new URLSearchParams({
    dateFrom,
    dateTo,
    type: 'sales_ddt',
    pendingInvoice: '1',
  });
  return `/app/documents?${params.toString()}`;
}
