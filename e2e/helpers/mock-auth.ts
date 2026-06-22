import { expect, type Page } from '@playwright/test';

/** Credenziali mock (MockAuthGateway) per E2E CI senza Supabase. */
export const MOCK_OWNER_CREDENTIALS = {
  email: 'owner@vestiflow.test',
  password: 'owner123',
} as const;

export async function loginWithMockAuth(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('#login-email').fill(MOCK_OWNER_CREDENTIALS.email);
  await page.locator('#login-password').fill(MOCK_OWNER_CREDENTIALS.password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 30_000 });
  await expect(page.locator('h1.dashboard__title')).toHaveText('Dashboard');
}
