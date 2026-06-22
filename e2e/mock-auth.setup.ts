import { test as setup } from '@playwright/test';

import { loginWithMockAuth } from './helpers/mock-auth';

const mockAuthFile = 'e2e/.auth/mock-user.json';

setup('authenticate (mock)', async ({ page }) => {
  await loginWithMockAuth(page);
  await page.context().storageState({ path: mockAuthFile });
});
