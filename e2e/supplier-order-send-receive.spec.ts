import { expect, test } from '@playwright/test';

test.describe('Ordine fornitore — invio e ricezione', () => {
  test('invia bozza seed e riceve merce parziale', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/app/orders');
    await expect(page.locator('h1.po-list__title')).toHaveText('Ordini Fornitori', {
      timeout: 30_000,
    });

    const draftRef = page.getByText('PO-2026-0003', { exact: true });
    if (!(await draftRef.isVisible())) {
      test.skip(true, 'Seed PO-2026-0003 non presente (DB non seeded).');
      return;
    }

    await draftRef.click();
    await expect(page.locator('h1.po-detail__title')).toContainText('PO-2026-0003');

    const sendButton = page.getByRole('button', { name: 'Invia ordine' });
    if (!(await sendButton.isVisible())) {
      test.skip(true, 'Utente E2E senza permesso invio ordini.');
      return;
    }

    await sendButton.click();
    await page.getByRole('button', { name: 'Invia ordine', exact: true }).last().click();
    await expect(page.getByText('Inviato', { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Ricevi merce' }).click();
    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill('3');
    await page.getByRole('button', { name: 'Conferma ricezione' }).click();
    await page.getByRole('button', { name: 'Conferma ricezione', exact: true }).last().click();

    await expect(page.getByText('Ricevuto parziale', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
