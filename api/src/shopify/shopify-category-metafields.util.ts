import type { ShopifyMetafieldRef } from './shopify-product-metadata.types';
import type { ShopifyCategoryMetafieldValue } from './shopify-category-metafields.types';
import { SHOPIFY_CATEGORY_METAFIELD_NAMESPACE } from './shopify-category-metafields.types';

export function isShopifyCategoryMetafield(metafield: ShopifyMetafieldRef): boolean {
  return metafield.namespace === SHOPIFY_CATEGORY_METAFIELD_NAMESPACE;
}

export function parseMetafieldGidList(raw: string): readonly string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return trimmed.startsWith('gid://') ? [trimmed] : [];
    }
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  } catch {
    return trimmed.startsWith('gid://') ? [trimmed] : [];
  }
}

export function parseCategoryMetafieldsJson(raw: unknown): ShopifyCategoryMetafieldValue[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }
    const row = entry as Record<string, unknown>;
    const attributeId = typeof row['attributeId'] === 'string' ? row['attributeId'] : '';
    const attributeName = typeof row['attributeName'] === 'string' ? row['attributeName'] : '';
    const namespace = typeof row['namespace'] === 'string' ? row['namespace'] : '';
    const key = typeof row['key'] === 'string' ? row['key'] : '';
    const metafieldType = typeof row['metafieldType'] === 'string' ? row['metafieldType'] : '';
    const valuesRaw = row['values'];
    const values = Array.isArray(valuesRaw)
      ? valuesRaw.flatMap((value) => {
          if (typeof value !== 'object' || value === null) {
            return [];
          }
          const item = value as Record<string, unknown>;
          const id = typeof item['id'] === 'string' ? item['id'] : '';
          const name = typeof item['name'] === 'string' ? item['name'] : '';
          return id ? [{ id, name: name || id }] : [];
        })
      : [];

    if (!attributeId || !key || !namespace) {
      return [];
    }

    return [
      {
        attributeId,
        attributeName: attributeName || key,
        namespace,
        key,
        metafieldType,
        values,
      },
    ];
  });
}

export function taxonomyAttributeNumericId(attributeGid: string): number | null {
  const match = /TaxonomyAttribute\/(\d+)/.exec(attributeGid);
  if (!match?.[1]) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function standardMetafieldDefinitionGid(attributeGid: string): string | null {
  const numericId = taxonomyAttributeNumericId(attributeGid);
  if (numericId == null) {
    return null;
  }
  return `gid://shopify/StandardMetafieldDefinition/${numericId + 10_000}`;
}

export function serializeTaxonomyValueListGids(values: readonly { readonly id: string }[]): string {
  return JSON.stringify(values.map((entry) => entry.id));
}

export function serializeMetaobjectGidList(gids: readonly string[]): string {
  return JSON.stringify([...gids]);
}
