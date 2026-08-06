import { expect, test } from '@playwright/test';

import { assertNoSeriousA11yViolations } from './helpers/a11y';

test.describe('Accesso (guest)', () => {
  test('mostra il form di login', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('h1.login__title')).toHaveText('Accesso');
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accedi' })).toBeVisible();
  });

  test('reindirizza /app al login se non autenticato', async ({ page }) => {
    await page.goto('/app/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('validazione email obbligatoria al submit', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Accedi' }).click();

    await expect(page.locator('#login-email-error')).toBeVisible();
    await expect(page.locator('#login-email-error')).toContainText('email');
  });

  test('login con credenziali errate mostra errore', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#login-email').fill('invalid@example.com');
    await page.locator('#login-password').fill('wrong-password-12345');
    await page.getByRole('button', { name: 'Accedi' }).click();

    await expect(page.locator('.login__alert')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('pagina login senza violazioni a11y serious/critical', async ({ page }) => {
    await page.goto('/login');
    await assertNoSeriousA11yViolations(page);
  });
});
