import { expect, test } from '@playwright/test';

import {
  expectAccountantDocumentsView,
  expectPendingInvoiceDocumentsView,
  waitForAccountantRegisterReady,
  waitForDocumentsListReady,
} from './helpers/accountant-register';

test.describe('Registro commercialista', () => {
  test('naviga da report al registro unificato', async ({ page }) => {
    await page.goto('/app/reports');
    await expect(page.locator('h1.reports__title')).toHaveText('Report', { timeout: 30_000 });

    await page.getByRole('link', { name: 'Registro commercialista unificato →' }).click();
    await waitForAccountantRegisterReady(page);

    await expect(page.getByRole('tab', { name: 'Documenti' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('DDT vendita in attesa fattura', { exact: true })).toBeVisible();
  });

  test('link DDT da fatturare apre lista documenti filtrata', async ({ page }) => {
    await waitForAccountantRegisterReady(page);

    await page.getByRole('link', { name: 'DDT da fatturare →' }).click();
    await waitForDocumentsListReady(page);
    await expectPendingInvoiceDocumentsView(page);
  });

  test('link registro documenti filtrato apre vista commercialista', async ({ page }) => {
    await waitForAccountantRegisterReady(page);

    await page.getByRole('link', { name: 'Apri registro documenti filtrato →' }).click();
    await waitForDocumentsListReady(page);
    await expectAccountantDocumentsView(page);
  });
});
