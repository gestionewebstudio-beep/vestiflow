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

/**
 * `gid://shopify/Location/123` da un id numerico o da un GID già formato.
 *
 * ⚠️ Accetta entrambi i dialetti per la stessa ragione degli altri GID: REST
 *    manda numeri, GraphQL manda GID, e raddoppiare il prefisso produrrebbe un
 *    identificativo che Shopify non riconosce.
 */
export function gidSede(id: string | null | undefined): string | null {
  const numerico = normalizeShopifyLocationId(id);
  return numerico === null ? null : `gid://shopify/Location/${numerico}`;
}

export function isSameShopifyLocationId(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalizedLeft = normalizeShopifyLocationId(left);
  const normalizedRight = normalizeShopifyLocationId(right);
  return normalizedLeft != null && normalizedRight != null && normalizedLeft === normalizedRight;
}
