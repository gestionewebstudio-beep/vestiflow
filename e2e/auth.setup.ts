import { test as setup } from '@playwright/test';

import { hasE2eCredentials } from './helpers/env';
import { loginWithCredentials } from './helpers/login';

const authFile = 'e2e/.auth/user.json';

setup('authenticate', async ({ page }, testInfo) => {
  if (!hasE2eCredentials()) {
    testInfo.skip(true, 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run authenticated E2E tests.');
    return;
  }

  await loginWithCredentials(page);
  await page.context().storageState({ path: authFile });
});
