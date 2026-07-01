import { test as setup } from '@playwright/test';

import { loginWithMockAuth } from './helpers/mock-auth';

const mockAuthFile = 'e2e/.auth/mock-user.json';

setup('authenticate (mock)', async ({ page }) => {
  await loginWithMockAuth(page);
  await page.waitForFunction(
    () => localStorage.getItem('vestiflow-mock-user-id') !== null,
    undefined,
    { timeout: 10_000 },
  );
  await page.context().storageState({ path: mockAuthFile });
});
