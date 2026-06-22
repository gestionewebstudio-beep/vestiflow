import { expect, test } from '@playwright/test';

test.describe('Sessione autenticata', () => {
  test('utente autenticato viene reindirizzato alla dashboard da /login', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 30_000 });
    await expect(page.locator('h1.dashboard__title')).toHaveText('Dashboard');
    await expect(page.getByRole('button', { name: /^Esci \(/ })).toBeVisible();
  });

  test('topbar mostra controlli utente autenticato', async ({ page }) => {
    await page.goto('/app/dashboard');
    await expect(page.locator('h1.dashboard__title')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^Impostazioni \(/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Esci \(/ })).toBeVisible();
  });

  test('logout con conferma torna al login', async ({ page }) => {
    await page.goto('/app/dashboard');
    await expect(page.locator('h1.dashboard__title')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /^Esci \(/ }).click();
    await expect(page.getByRole('heading', { name: "Uscire dall'applicazione?" })).toBeVisible();

    await page
      .locator('dialog.confirm-dialog')
      .getByRole('button', { name: 'Esci', exact: true })
      .click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.locator('h1.login__title')).toHaveText('Accesso');
  });
});
