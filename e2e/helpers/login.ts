import { expect, type Page } from '@playwright/test';

import { e2eCredentials, type E2eCredentials } from './env';

export async function loginWithCredentials(
  page: Page,
  credentials: E2eCredentials = e2eCredentials(),
): Promise<void> {
  const { email, password, mfaCode } = credentials;

  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();

  const loginOutcome = await Promise.race([
    page.waitForURL(/\/app\/dashboard/, { timeout: 30_000 }).then(() => 'dashboard' as const),
    page
      .locator('#login-mfa-code')
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => 'mfa' as const),
  ]);

  if (loginOutcome === 'mfa') {
    if (!mfaCode) {
      throw new Error(
        'MFA is enabled for the E2E user. Set E2E_MFA_CODE (or E2E_CLERK_MFA_CODE) or use a test account without MFA.',
      );
    }
    const totp = mfaCode;

    await page.locator('#login-mfa-code').fill(totp);
    await page.getByRole('button', { name: 'Verifica e accedi' }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 30_000 });
  }
  await expect(page.locator('h1.dashboard__title')).toHaveText('Dashboard');
}
