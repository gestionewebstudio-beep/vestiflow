import { expect, type Page } from '@playwright/test';

import { resolveTestSku } from './catalog';

const PRODUCT_CSV_HEADER = `Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Option3 Name,Option3 Value,Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Fulfillment Service,Variant Price,Variant Compare-at Price,Variant Requires Shipping,Variant Taxable,Variant Barcode,Image Src,Image Alt Text,Gift Card,SEO Title,SEO Description,Google Shopping / Google Product Category,Google Shopping / Gender,Google Shopping / Age Group,Google Shopping / MPN,Google Shopping / AdWords Grouping,Google Shopping / AdWords Labels,Google Shopping / Condition,Google Shopping / Custom Product,Google Shopping / Custom Label 0,Google Shopping / Custom Label 1,Google Shopping / Custom Label 2,Google Shopping / Custom Label 3,Google Shopping / Custom Label 4,Variant Image,Variant Weight Unit,Variant Tax Code,Cost per item,Status`;

export function buildUniqueProductCsv(handle: string, sku: string, title: string): Buffer {
  const row = `${handle},${title},<p>E2E import</p>,E2E Brand,Abbigliamento,e2e,TRUE,Taglia,S,,,,,${sku},,,1,deny,manual,19.90,,TRUE,TRUE,,,,,,,,,,,,,,,,,,,,,active`;
  return Buffer.from(`${PRODUCT_CSV_HEADER}\n${row}\n`, 'utf8');
}

export async function openProductImport(page: Page): Promise<boolean> {
  await page.goto('/app/products');
  await expect(page.locator('h1.product-list__title')).toHaveText('Prodotti', { timeout: 30_000 });

  const importButton = page.getByRole('button', { name: 'Importa CSV' });
  if (!(await importButton.isVisible())) {
    return false;
  }

  await importButton.click();
  await expect(page).toHaveURL(/\/app\/products\/import/);
  return true;
}

export async function analyzeProductCsv(page: Page, csv: Buffer, fileName: string): Promise<void> {
  await page.locator('#product-csv-file').setInputFiles({
    name: fileName,
    mimeType: 'text/csv',
    buffer: csv,
  });
  await page.getByRole('button', { name: 'Analizza file' }).click();
  await expect(page.locator('.product-import__summary')).toBeVisible({ timeout: 60_000 });
}

export async function confirmProductImport(page: Page): Promise<void> {
  const importButton = page.getByRole('button', { name: /Importa \d+ prodotti/ });
  await expect(importButton).toBeEnabled({ timeout: 15_000 });
  await importButton.click();
  await expect(page.locator('.product-import__done')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.product-import__done-stats')).toContainText(/importati/i);
}

export async function openInventoryImport(page: Page): Promise<boolean> {
  await page.goto('/app/inventory');
  await expect(page.locator('h1.inventory-levels__title')).toHaveText('Magazzino', {
    timeout: 30_000,
  });

  const importButton = page.getByRole('button', { name: 'Importa CSV' });
  if (!(await importButton.isVisible())) {
    return false;
  }

  await importButton.click();
  await expect(page).toHaveURL(/\/app\/inventory\/import/);
  return true;
}

export async function resolveTestLocation(page: Page, sku: string): Promise<string> {
  const fromEnv = process.env.E2E_TEST_LOCATION?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  await page.goto('/app/inventory/lookup');
  await page.locator('#stock-code').fill(sku);
  await page.getByRole('button', { name: 'Cerca giacenza' }).click();
  await expect(page.locator('#lookup-result-title')).toBeVisible({ timeout: 30_000 });

  const firstLocationCell = page.locator('.stock-lookup__table tbody tr td').first();
  await expect(firstLocationCell).toBeVisible({ timeout: 15_000 });

  const locationName = (await firstLocationCell.textContent())?.trim() ?? '';
  if (!locationName) {
    throw new Error(
      'Impossibile leggere la location dal lookup: imposta E2E_TEST_LOCATION in .env.',
    );
  }

  return locationName;
}

export function buildInventoryCsv(sku: string, locationName: string, available: number): Buffer {
  const csv = `SKU,Location,Disponibile,Soglia minima\n${sku},${locationName},${available},\n`;
  return Buffer.from(csv, 'utf8');
}

export async function analyzeInventoryCsv(
  page: Page,
  csv: Buffer,
  fileName: string,
): Promise<void> {
  await page.locator('#inventory-csv-file').setInputFiles({
    name: fileName,
    mimeType: 'text/csv',
    buffer: csv,
  });
  await page.getByRole('button', { name: 'Analizza file' }).click();
  await expect(page.locator('.inventory-import__summary')).toBeVisible({ timeout: 60_000 });
}

export async function confirmInventoryImport(page: Page): Promise<void> {
  const importButton = page.getByRole('button', { name: /Importa \d+ righe/ });
  await expect(importButton).toBeEnabled({ timeout: 15_000 });
  await importButton.click();
  await expect(page.locator('.inventory-import__done')).toBeVisible({ timeout: 120_000 });
}

export async function readAvailableForSku(
  page: Page,
  sku: string,
  locationName: string,
): Promise<number> {
  await page.goto('/app/inventory/lookup');
  await page.locator('#stock-code').fill(sku);
  await page.getByRole('button', { name: 'Cerca giacenza' }).click();
  await expect(page.locator('#lookup-result-title')).toBeVisible({ timeout: 30_000 });

  const row = page.locator('.stock-lookup__table tbody tr', { hasText: locationName });
  await expect(row).toBeVisible({ timeout: 15_000 });

  const availableText = (await row.locator('td').nth(1).textContent())?.trim() ?? '';
  const available = Number.parseInt(availableText, 10);
  if (!Number.isFinite(available)) {
    throw new Error(
      `Quantità disponibile non numerica per ${sku} @ ${locationName}: "${availableText}"`,
    );
  }

  return available;
}

export async function resolveTestSkuForImport(page: Page): Promise<string> {
  return resolveTestSku(page);
}
