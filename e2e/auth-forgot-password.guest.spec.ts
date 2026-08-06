import { expect, test } from '@playwright/test';

import { assertNoSeriousA11yViolations } from './helpers/a11y';
import { e2eCredentials, hasE2eCredentials } from './helpers/env';

test.describe('Recupero password (guest)', () => {
  test('naviga dal login alla pagina forgot password', async ({ page }) => {
    await page.goto('/login');
    await page.locator('a.login__forgot-link').click();

    await expect(page).toHaveURL(/\/login\/forgot-password/);
    await expect(page.locator('h1.login__title')).toHaveText('Recupera password');
    await expect(page.locator('#forgot-email')).toBeVisible();
  });

  test('validazione email obbligatoria al submit', async ({ page }) => {
    await page.goto('/login/forgot-password');
    await page.getByRole('button', { name: 'Invia link di recupero' }).click();

    await expect(page.locator('.login__field-error')).toBeVisible();
    await expect(page.locator('.login__field-error')).toContainText('email');
  });

  test('submit email valida mostra messaggio di successo', async ({ page }) => {
    test.skip(!hasE2eCredentials(), 'Richiede E2E_USER_EMAIL per test end-to-end Supabase.');

    const { email } = e2eCredentials();
    await page.goto('/login/forgot-password');
    await page.locator('#forgot-email').fill(email);
    await page.getByRole('button', { name: 'Invia link di recupero' }).click();

    await expect(page.locator('.login__success')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Torna al login' })).toBeVisible();
  });

  test('pagina forgot password senza violazioni a11y serious/critical', async ({ page }) => {
    await page.goto('/login/forgot-password');
    await assertNoSeriousA11yViolations(page, { include: '.login__card' });
  });
});
