const SHOPIFY_LOCATION_GID_PATTERN = /^gid:\/\/shopify\/Location\/(\d+)$/i;

/** Normalizza l'id location Shopify (numerico REST o GID GraphQL) per confronti sicuri. */
export function normalizeShopifyLocationId(id: string | null | undefined): string | null {
  if (id == null) {
    return null;
  }

  const trimmed = id.trim();
  if (!trimmed) {
    return null;
  }

  const gidMatch = SHOPIFY_LOCATION_GID_PATTERN.exec(trimmed);
  return gidMatch?.[1] ?? trimmed;
}

export function isSameShopifyLocationId(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalizedLeft = normalizeShopifyLocationId(left);
  const normalizedRight = normalizeShopifyLocationId(right);
  return normalizedLeft != null && normalizedRight != null && normalizedLeft === normalizedRight;
}
