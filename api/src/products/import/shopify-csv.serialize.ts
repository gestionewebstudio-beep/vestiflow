import {
  ProductStatus,
  type Product,
  type ProductImage,
  type ProductVariant,
} from '@prisma/client';

import { minorToShopifyDecimal } from '../../shopify/shopify-money.util';
import { slugFromTitle } from './shopify-csv.parse';

/**
 * Colonne minime compatibili con import VestiFlow / export Shopify.
 * "Codice articolo" è una colonna SOLO VestiFlow (mai mappata su campi
 * Shopify: gli import Shopify ignorano le colonne sconosciute); serve al
 * round-trip export→import senza perdere l'identificatore anagrafico.
 */
export const SHOPIFY_PRODUCT_EXPORT_HEADERS = [
  'Codice articolo',
  'Handle',
  'Title',
  'Body (HTML)',
  'Vendor',
  'Type',
  'Tags',
  'Published',
  'Option1 Name',
  'Option1 Value',
  'Option2 Name',
  'Option2 Value',
  'Option3 Name',
  'Option3 Value',
  'Variant SKU',
  'Variant Price',
  'Variant Compare-at Price',
  'Variant Barcode',
  'Image Src',
  'Image Alt Text',
  'Image Position',
  'SEO Title',
  'SEO Description',
] as const;

export type ShopifyProductExportHeader = (typeof SHOPIFY_PRODUCT_EXPORT_HEADERS)[number];

export type ShopifyProductCsvRowRecord = Record<ShopifyProductExportHeader, string>;

export interface ProductExportRecord {
  readonly product: Product;
  readonly variants: readonly ProductVariant[];
  readonly images: readonly ProductImage[];
}

interface ProductOption {
  name: string;
  values: string[];
}

interface VariantOptionValue {
  readonly name: string;
  readonly value: string;
}

export function serializeProductsToShopifyCsv(products: readonly ProductExportRecord[]): string {
  const rows: ShopifyProductCsvRowRecord[] = [];
  const usedHandles = new Set<string>();

  for (const record of products) {
    rows.push(...productToCsvRows(record, usedHandles));
  }

  const lines = [
    SHOPIFY_PRODUCT_EXPORT_HEADERS.join(','),
    ...rows.map((row) =>
      SHOPIFY_PRODUCT_EXPORT_HEADERS.map((header) => escapeCsvField(row[header])).join(','),
    ),
  ];

  return `\uFEFF${lines.join('\n')}\n`;
}

function productToCsvRows(
  record: ProductExportRecord,
  usedHandles: Set<string>,
): ShopifyProductCsvRowRecord[] {
  const { product, variants, images } = record;
  const handle = uniqueHandle(
    slugFromTitle(product.name) || `product-${product.id.slice(0, 8)}`,
    usedHandles,
  );
  usedHandles.add(handle);

  const options = parseProductOptions(product.options);
  const sortedVariants = [...variants].sort((left, right) =>
    (left.sku ?? '').localeCompare(right.sku ?? '', 'it'),
  );
  const sortedImages = [...images].sort((left, right) => left.sortOrder - right.sortOrder);

  if (sortedVariants.length === 0) {
    return [buildProductRow(handle, product, options, null, sortedImages[0] ?? null, true)];
  }

  const rows: ShopifyProductCsvRowRecord[] = [];
  sortedVariants.forEach((variant, index) => {
    rows.push(
      buildProductRow(handle, product, options, variant, sortedImages[index] ?? null, index === 0),
    );
  });

  const extraImages = sortedImages.slice(sortedVariants.length);
  for (const image of extraImages) {
    rows.push(buildImageOnlyRow(handle, image));
  }

  return rows;
}

function buildProductRow(
  handle: string,
  product: Product,
  options: readonly ProductOption[],
  variant: ProductVariant | null,
  image: ProductImage | null,
  includeProductFields: boolean,
): ShopifyProductCsvRowRecord {
  const optionColumns = variant
    ? mapVariantOptionColumns(options, parseVariantOptionValues(variant.optionValues))
    : emptyOptionColumns(options);

  const row = emptyCsvRow();

  row.Handle = handle;
  if (includeProductFields) {
    row['Codice articolo'] = product.articleCode;
    row.Title = product.name;
    row['Body (HTML)'] = toBodyHtml(product.description);
    row.Vendor = product.brand?.trim() ?? '';
    row.Type = product.category?.trim() ?? '';
    row.Tags = formatExportTags(product);
    row.Published = mapPublished(product.status);
    row['SEO Title'] = product.seoTitle?.trim() ?? '';
    row['SEO Description'] = product.seoDescription?.trim() ?? '';
  }

  row['Option1 Name'] = optionColumns.option1Name;
  row['Option1 Value'] = optionColumns.option1Value;
  row['Option2 Name'] = optionColumns.option2Name;
  row['Option2 Value'] = optionColumns.option2Value;
  row['Option3 Name'] = optionColumns.option3Name;
  row['Option3 Value'] = optionColumns.option3Value;

  if (variant) {
    row['Variant SKU'] = variant.sku ?? '';
    row['Variant Price'] = minorToShopifyDecimal(variant.sellingPriceMinor);
    row['Variant Compare-at Price'] =
      variant.compareAtPriceMinor != null ? minorToShopifyDecimal(variant.compareAtPriceMinor) : '';
    row['Variant Barcode'] = variant.barcode?.trim() ?? '';
  }

  if (image) {
    row['Image Src'] = image.url;
    row['Image Alt Text'] = image.altText?.trim() ?? '';
    row['Image Position'] = String(image.sortOrder + 1);
  }

  return row;
}

function buildImageOnlyRow(handle: string, image: ProductImage): ShopifyProductCsvRowRecord {
  const row = emptyCsvRow();
  row.Handle = handle;
  row['Image Src'] = image.url;
  row['Image Alt Text'] = image.altText?.trim() ?? '';
  row['Image Position'] = String(image.sortOrder + 1);
  return row;
}

function emptyCsvRow(): ShopifyProductCsvRowRecord {
  return SHOPIFY_PRODUCT_EXPORT_HEADERS.reduce<ShopifyProductCsvRowRecord>((acc, header) => {
    acc[header] = '';
    return acc;
  }, {} as ShopifyProductCsvRowRecord);
}

function uniqueHandle(base: string, usedHandles: Set<string>): string {
  const normalized = base.trim() || 'product';
  if (!usedHandles.has(normalized)) {
    return normalized;
  }
  let index = 2;
  while (usedHandles.has(`${normalized}-${index}`)) {
    index += 1;
  }
  return `${normalized}-${index}`;
}

function parseProductOptions(raw: unknown): ProductOption[] {
  if (!Array.isArray(raw)) {
    return [{ name: 'Title', values: ['Default Title'] }];
  }

  const options = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const candidate = entry as { name?: unknown; values?: unknown };
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
      const values = Array.isArray(candidate.values)
        ? candidate.values
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
      if (!name || values.length === 0) {
        return null;
      }
      return { name, values };
    })
    .filter((entry): entry is ProductOption => entry != null);

  return options.length > 0 ? options.slice(0, 3) : [{ name: 'Title', values: ['Default Title'] }];
}

function parseVariantOptionValues(raw: unknown): VariantOptionValue[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const candidate = entry as { name?: unknown; value?: unknown };
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
      const value = typeof candidate.value === 'string' ? candidate.value.trim() : '';
      if (!name || !value) {
        return null;
      }
      return { name, value };
    })
    .filter((entry): entry is VariantOptionValue => entry != null);
}

function mapVariantOptionColumns(
  options: readonly ProductOption[],
  optionValues: readonly VariantOptionValue[],
): {
  option1Name: string;
  option1Value: string;
  option2Name: string;
  option2Value: string;
  option3Name: string;
  option3Value: string;
} {
  const valueByName = new Map(optionValues.map((entry) => [entry.name, entry.value]));

  return {
    option1Name: options[0]?.name ?? '',
    option1Value: options[0] ? (valueByName.get(options[0].name) ?? '') : '',
    option2Name: options[1]?.name ?? '',
    option2Value: options[1] ? (valueByName.get(options[1].name) ?? '') : '',
    option3Name: options[2]?.name ?? '',
    option3Value: options[2] ? (valueByName.get(options[2].name) ?? '') : '',
  };
}

function emptyOptionColumns(options: readonly ProductOption[]): {
  option1Name: string;
  option1Value: string;
  option2Name: string;
  option2Value: string;
  option3Name: string;
  option3Value: string;
} {
  return {
    option1Name: options[0]?.name ?? '',
    option1Value: '',
    option2Name: options[1]?.name ?? '',
    option2Value: '',
    option3Name: options[2]?.name ?? '',
    option3Value: '',
  };
}

function formatExportTags(product: Product): string {
  const tags = [...(product.tags ?? [])];
  const season = product.season?.trim();
  if (season && !tags.some((tag) => tag.toLowerCase() === season.toLowerCase())) {
    tags.push(season);
  }
  return tags.join(', ');
}

function mapPublished(status: ProductStatus): string {
  if (status === ProductStatus.active) {
    return 'TRUE';
  }
  if (status === ProductStatus.archived) {
    return 'archived';
  }
  return 'FALSE';
}

function toBodyHtml(description: string | null): string {
  const trimmed = description?.trim();
  if (!trimmed) {
    return '';
  }
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed;
  }
  return `<p>${trimmed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
}

export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
