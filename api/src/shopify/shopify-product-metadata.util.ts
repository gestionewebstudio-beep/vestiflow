import type { ShopifyMetafieldRef } from './shopify-product-metadata.types';
import {
  VESTIFLOW_METAFIELD_NAMESPACE,
  VESTIFLOW_SEASON_METAFIELD_KEY,
} from './shopify-product-metadata.types';

export function parseShopifyTags(raw: string | null | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function formatShopifyTags(tags: readonly string[]): string {
  return tags.join(', ');
}

export function extractSeoFromMetafields(metafields: readonly ShopifyMetafieldRef[]): {
  seoTitle: string | null;
  seoDescription: string | null;
} {
  const seoTitle =
    metafields.find((field) => field.namespace === 'global' && field.key === 'title_tag')?.value ??
    null;
  const seoDescription =
    metafields.find((field) => field.namespace === 'global' && field.key === 'description_tag')
      ?.value ?? null;
  return { seoTitle, seoDescription };
}

export function extractSeasonFromMetafields(
  metafields: readonly ShopifyMetafieldRef[],
): string | null {
  const value = metafields.find(
    (field) =>
      field.namespace === VESTIFLOW_METAFIELD_NAMESPACE &&
      field.key === VESTIFLOW_SEASON_METAFIELD_KEY,
  )?.value;
  return value?.trim() || null;
}

export function mapMetafieldRows(
  rows: readonly {
    namespace: string;
    key: string;
    value: string;
    type?: string;
  }[],
): ShopifyMetafieldRef[] {
  return rows.map((row) => ({
    namespace: row.namespace,
    key: row.key,
    value: row.value,
    type: row.type,
  }));
}
