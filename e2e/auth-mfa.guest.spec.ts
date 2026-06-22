import { expect, test } from '@playwright/test';

import { e2eCredentials, hasE2eCredentials } from './helpers/env';
import { loginWithCredentials } from './helpers/login';

test.describe('Login MFA (guest)', () => {
  test('login con TOTP arriva alla dashboard', async ({ page }) => {
    test.skip(!hasE2eCredentials(), 'Credenziali E2E mancanti.');
    test.skip(
      !process.env.E2E_MFA_CODE?.trim(),
      'E2E_MFA_CODE non impostato — skip test MFA dedicato.',
    );

    await loginWithCredentials(page, e2eCredentials());
    await expect(page).toHaveURL(/\/app\/dashboard/);
    await expect(page.locator('h1.dashboard__title')).toHaveText('Dashboard');
  });
});
