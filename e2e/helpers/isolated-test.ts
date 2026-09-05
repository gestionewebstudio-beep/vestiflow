import { test as base } from '@playwright/test';

/** Fixture senza backend: nessuna richiesta API non intercettata esce dal browser. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/api/v1/**', (route) =>
      route.fulfill({ status: 404, json: { message: 'API non prevista dalla fixture E2E' } }),
    );
    await use(page);
  },
});
