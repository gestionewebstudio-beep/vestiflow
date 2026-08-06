import { expect, type Page } from '@playwright/test';

const MAX_ERROR_RELOADS = 3;

export async function reloadIfErrorState(
  page: Page,
  reloadCount: { value: number },
): Promise<boolean> {
  const errorState = page.locator('app-error-state');
  const hasError = await errorState.isVisible().catch(() => false);

  if (!hasError || reloadCount.value >= MAX_ERROR_RELOADS) {
    return false;
  }

  reloadCount.value += 1;
  await page.reload({ waitUntil: 'domcontentloaded' });
  return true;
}

export async function waitForProductListReady(page: Page): Promise<'rows' | 'empty'> {
  if (!page.url().includes('/app/products')) {
    await page.goto('/app/products');
  }

  await expect(page.locator('h1.product-list__title')).toHaveText('Prodotti', { timeout: 30_000 });

  const reloadCount = { value: 0 };
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    if (await page.locator('.product-table__row').first().isVisible()) {
      return 'rows';
    }

    if (await page.getByText('Nessun prodotto', { exact: true }).isVisible()) {
      return 'empty';
    }

    if (await reloadIfErrorState(page, reloadCount)) {
      continue;
    }

    await page.waitForTimeout(500);
  }

  throw new Error('La lista prodotti non è stata caricata in tempo.');
}

export async function waitForSupplierOrdersReady(page: Page): Promise<'rows' | 'empty'> {
  if (!page.url().includes('/app/orders')) {
    await page.goto('/app/orders');
  }

  await expect(page.locator('h1.po-list__title')).toHaveText('Ordini Fornitori', {
    timeout: 30_000,
  });

  const reloadCount = { value: 0 };
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    if (await page.locator('.po-table__row').first().isVisible()) {
      return 'rows';
    }

    if (await page.getByText('Nessun ordine fornitore', { exact: true }).isVisible()) {
      return 'empty';
    }

    if (await reloadIfErrorState(page, reloadCount)) {
      continue;
    }

    await page.waitForTimeout(500);
  }

  throw new Error('La lista ordini fornitori non è stata caricata in tempo.');
}

export async function waitForDashboardReady(page: Page): Promise<void> {
  if (!page.url().includes('/app/dashboard')) {
    await page.goto('/app/dashboard');
  }

  await expect(page.locator('h1.dashboard__title')).toHaveText('Dashboard', { timeout: 30_000 });

  const reloadCount = { value: 0 };
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    if (await page.locator('.dashboard__kpis').isVisible()) {
      return;
    }

    if (await reloadIfErrorState(page, reloadCount)) {
      continue;
    }

    await page.waitForTimeout(500);
  }

  throw new Error('La dashboard non ha caricato i KPI in tempo.');
}

export async function waitForCustomersReady(page: Page): Promise<'rows' | 'empty'> {
  if (!page.url().includes('/app/customers')) {
    await page.goto('/app/customers');
  }

  await expect(page.locator('h1.customer-list__title')).toHaveText('Clienti', { timeout: 30_000 });

  const reloadCount = { value: 0 };
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    if (await page.locator('.customer-table__row').first().isVisible()) {
      return 'rows';
    }

    if (await page.getByText('Nessun cliente', { exact: true }).isVisible()) {
      return 'empty';
    }

    if (await reloadIfErrorState(page, reloadCount)) {
      continue;
    }

    await page.waitForTimeout(500);
  }

  throw new Error('La lista clienti non è stata caricata in tempo.');
}

export async function waitForSalesReady(page: Page): Promise<'rows' | 'empty'> {
  if (!page.url().includes('/app/sales')) {
    await page.goto('/app/sales');
  }

  await expect(page.locator('h1.sales-list__title')).toHaveText('Vendite', { timeout: 30_000 });

  const reloadCount = { value: 0 };
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    if (await page.locator('.sales-table__row').first().isVisible()) {
      return 'rows';
    }

    if (await page.getByText('Nessuna vendita', { exact: true }).isVisible()) {
      return 'empty';
    }

    if (await reloadIfErrorState(page, reloadCount)) {
      continue;
    }

    await page.waitForTimeout(500);
  }

  throw new Error('La lista vendite non è stata caricata in tempo.');
}

export async function waitForReportsReady(page: Page): Promise<void> {
  if (!page.url().includes('/app/reports')) {
    await page.goto('/app/reports');
  }

  await expect(page.locator('h1.reports__title')).toHaveText('Report', { timeout: 30_000 });

  const reloadCount = { value: 0 };
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    if (await page.locator('.reports__kpis').isVisible()) {
      return;
    }

    if (await reloadIfErrorState(page, reloadCount)) {
      continue;
    }

    await page.waitForTimeout(500);
  }

  throw new Error('I report non hanno caricato i KPI in tempo.');
}
