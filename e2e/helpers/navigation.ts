import { expect, type Page } from '@playwright/test';

export async function openSidebarLink(page: Page, label: string): Promise<void> {
  const link = page.locator('nav.app-sidebar').getByRole('link', { name: label, exact: true });
  await expect(link).toBeVisible();
  await link.click();
}

export async function expectPageHeading(page: Page, selector: string, text: string): Promise<void> {
  await expect(page.locator(selector)).toBeVisible();
  await expect(page.locator(selector)).toHaveText(text);
}
