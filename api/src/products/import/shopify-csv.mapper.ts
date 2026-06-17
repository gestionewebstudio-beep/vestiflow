import { ProductStatus } from '@prisma/client';

import { normalizeProductDescription } from '../../shopify/shopify-html.util';
import { shopifyDecimalToMinor } from '../../shopify/shopify-money.util';
import { parseShopifyTags } from '../../shopify/shopify-product-metadata.util';
import type { CreateProductDto, CreateVariantDto } from '../dto/create-product.dto';
import { groupShopifyCsvRows, type ShopifyCsvRow } from './shopify-csv.parse';

const DEFAULT_CURRENCY = 'EUR';

export type ImportIssueLevel = 'error' | 'warning';

export interface ImportIssue {
  readonly level: ImportIssueLevel;
  readonly message: string;
  readonly rowNumber?: number;
}

export interface ImportProductImage {
  readonly url: string;
  readonly altText: string | null;
  readonly sortOrder: number;
}

export interface ParsedImportProduct {
  readonly handle: string;
  readonly dto: CreateProductDto;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly images: readonly ImportProductImage[];
  readonly issues: readonly ImportIssue[];
  readonly rowNumbers: readonly number[];
}

export interface ImportPreviewResult {
  readonly products: readonly ParsedImportProduct[];
  readonly summary: {
    readonly total: number;
    readonly ready: number;
    readonly warnings: number;
    readonly errors: number;
  };
}

export function buildImportPreview(
  rows: readonly ShopifyCsvRow[],
  existingSkus: ReadonlySet<string>,
): ImportPreviewResult {
  const groups = groupShopifyCsvRows(rows);
  const products: ParsedImportProduct[] = [];

  for (const [handle, groupRows] of groups.entries()) {
    products.push(mapGroupToImportProduct(handle, groupRows, existingSkus));
  }

  products.sort((a, b) => a.dto.name.localeCompare(b.dto.name, 'it'));

  const ready = products.filter(isImportProductReady).length;
  const warnings = products.filter((product) =>
    product.issues.some((issue) => issue.level === 'warning'),
  ).length;

  return {
    products,
    summary: {
      total: products.length,
      ready,
      warnings,
      errors: products.length - ready,
    },
  };
}

function mapGroupToImportProduct(
  handle: string,
  rows: readonly ShopifyCsvRow[],
  existingSkus: ReadonlySet<string>,
): ParsedImportProduct {
  const issues: ImportIssue[] = [];
  const rowNumbers = rows.map((row) => row.rowNumber);
  const parent = rows.find((row) => row.title.trim()) ?? rows[0];
  if (!parent) {
    return {
      handle,
      dto: emptyProductDto('Prodotto senza titolo'),
      seoTitle: null,
      seoDescription: null,
      images: [],
      issues: [{ level: 'error', message: 'Gruppo senza righe valide.' }],
      rowNumbers,
    };
  }

  const name = parent.title.trim() || handle;
  if (!name) {
    issues.push({
      level: 'error',
      message: 'Titolo prodotto mancante.',
      rowNumber: parent.rowNumber,
    });
  }

  const options = buildOptions(rows, issues);
  const variants = buildVariants(rows, options, existingSkus, issues);

  if (variants.length === 0) {
    issues.push({
      level: 'error',
      message: 'Nessuna variante valida nel gruppo.',
      rowNumber: parent.rowNumber,
    });
  }

  const dto: CreateProductDto = {
    name,
    description: normalizeProductDescription(parent.bodyHtml) ?? undefined,
    brand: firstNonEmpty(rows.map((row) => row.vendor)) ?? undefined,
    category: firstNonEmpty(rows.map((row) => row.type)) ?? undefined,
    tags: parseShopifyTags(firstNonEmpty(rows.map((row) => row.tags)) ?? parent.tags),
    status: mapPublishedStatus(firstNonEmpty(rows.map((row) => row.published))),
    options,
    variants,
  };

  return {
    handle,
    dto,
    seoTitle: firstNonEmpty(rows.map((row) => row.seoTitle)) ?? null,
    seoDescription: firstNonEmpty(rows.map((row) => row.seoDescription)) ?? null,
    images: collectImages(rows),
    issues,
    rowNumbers,
  };
}

function buildOptions(
  rows: readonly ShopifyCsvRow[],
  issues: ImportIssue[],
): CreateProductDto['options'] {
  const names = [1, 2, 3].map((index) =>
    firstNonEmpty(rows.map((row) => row[`option${index}Name` as keyof ShopifyCsvRow] as string)),
  );
  const options: CreateProductDto['options'] = [];

  names.forEach((name, index) => {
    if (!name) {
      return;
    }
    const values = new Set<string>();
    for (const row of rows) {
      const value = (row[`option${index + 1}Value` as keyof ShopifyCsvRow] as string).trim();
      if (value) {
        values.add(value);
      }
    }
    if (values.size === 0) {
      issues.push({
        level: 'warning',
        message: `Opzione "${name}" senza valori: verrà ignorata.`,
      });
      return;
    }
    options.push({ name, values: [...values] });
  });

  if (options.length === 0) {
    return [{ name: 'Title', values: ['Default Title'] }];
  }

  return options.slice(0, 3);
}

function buildVariants(
  rows: readonly ShopifyCsvRow[],
  options: CreateProductDto['options'],
  existingSkus: ReadonlySet<string>,
  issues: ImportIssue[],
): CreateVariantDto[] {
  const reserved = new Set([...existingSkus].map((sku) => sku.toLowerCase()));
  const variants = rows.map((row, index) => {
    const optionValues = mapVariantOptions(row, options);
    const rawSku = row.variantSku.trim();
    const sku = resolveCsvImportSku(reserved, rawSku, row.rowNumber, index + 1);

    if (!rawSku) {
      issues.push({
        level: 'warning',
        message: `SKU mancante: assegnato "${sku}".`,
        rowNumber: row.rowNumber,
      });
    } else if (rawSku.toLowerCase() !== sku.toLowerCase()) {
      issues.push({
        level: 'warning',
        message: `SKU "${rawSku}" duplicato o già in catalogo: usato "${sku}".`,
        rowNumber: row.rowNumber,
      });
    }

    reserved.add(sku.toLowerCase());

    if (!row.variantPrice.trim()) {
      issues.push({
        level: 'warning',
        message: 'Prezzo vendita mancante: impostato a 0.',
        rowNumber: row.rowNumber,
      });
    }

    const compareRaw = row.variantCompareAtPrice.trim();
    return {
      sku,
      optionValues,
      sellingPrice: {
        amountMinor: shopifyDecimalToMinor(row.variantPrice || '0'),
        currency: DEFAULT_CURRENCY,
      },
      barcode: row.variantBarcode.trim() || undefined,
      ...(compareRaw
        ? {
            compareAtPrice: {
              amountMinor: shopifyDecimalToMinor(compareRaw),
              currency: DEFAULT_CURRENCY,
            },
          }
        : {}),
    } satisfies CreateVariantDto;
  });

  return dedupeVariantsByOptions(variants);
}

function mapVariantOptions(
  row: ShopifyCsvRow,
  options: CreateProductDto['options'],
): CreateVariantDto['optionValues'] {
  if (options.length === 1 && options[0]?.name === 'Title') {
    return [{ name: 'Title', value: row.option1Value.trim() || 'Default Title' }];
  }

  return options.flatMap((option, index) => {
    const value = (row[`option${index + 1}Value` as keyof ShopifyCsvRow] as string).trim();
    return value ? [{ name: option.name, value }] : [];
  });
}

function dedupeVariantsByOptions(variants: CreateVariantDto[]): CreateVariantDto[] {
  const seen = new Set<string>();
  return variants.filter((variant) => {
    const key = variant.optionValues.map((entry) => `${entry.name}:${entry.value}`).join('|');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function collectImages(rows: readonly ShopifyCsvRow[]): ImportProductImage[] {
  const images: ImportProductImage[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const url = row.imageSrc.trim();
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    const sortOrder = Number.parseInt(row.imagePosition, 10);
    images.push({
      url,
      altText: row.imageAltText.trim() || null,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : images.length,
    });
  }
  return images.sort((a, b) => a.sortOrder - b.sortOrder);
}

function mapPublishedStatus(raw: string | undefined): ProductStatus {
  const normalized = raw?.trim().toLowerCase();
  if (
    normalized === 'true' ||
    normalized === 'vero' ||
    normalized === '1' ||
    normalized === 'yes'
  ) {
    return ProductStatus.active;
  }
  if (normalized === 'archived') {
    return ProductStatus.archived;
  }
  return ProductStatus.draft;
}

function firstNonEmpty(values: readonly string[]): string | undefined {
  return values.map((value) => value.trim()).find(Boolean);
}

function emptyProductDto(name: string): CreateProductDto {
  return {
    name,
    status: ProductStatus.draft,
    options: [{ name: 'Title', values: ['Default Title'] }],
    variants: [],
  };
}

export function resolveCsvImportSku(
  reserved: Set<string>,
  rawSku: string,
  rowNumber: number,
  variantIndex: number,
): string {
  const trimmed = rawSku.trim();
  if (trimmed && !reserved.has(trimmed.toLowerCase())) {
    return trimmed;
  }
  const fallback = trimmed ? `${trimmed}-CSV-${rowNumber}` : `CSV-${rowNumber}-${variantIndex}`;
  if (!reserved.has(fallback.toLowerCase())) {
    return fallback;
  }
  return `CSV-${rowNumber}-${variantIndex}-${Date.now()}`;
}

export function isImportProductReady(product: ParsedImportProduct): boolean {
  return !product.issues.some((issue) => issue.level === 'error');
}
