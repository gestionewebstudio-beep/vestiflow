import { expect, type Page } from '@playwright/test';

import { waitForSalesReady } from './page-ready';

export async function openFirstSalesOrder(page: Page): Promise<string | null> {
  const state = await waitForSalesReady(page);
  if (state === 'empty') {
    return null;
  }

  const firstRow = page.locator('.sales-table__row').first();
  const orderNumber = ((await firstRow.locator('.sales-table__number').textContent()) ?? '').trim();
  expect(orderNumber.length).toBeGreaterThan(0);

  await firstRow.click();
  await expect(page).toHaveURL(/\/app\/sales\/[^/]+$/, { timeout: 15_000 });
  await expect(page.locator('h1.sales-detail__title')).toHaveText(orderNumber, { timeout: 30_000 });

  return orderNumber;
}
