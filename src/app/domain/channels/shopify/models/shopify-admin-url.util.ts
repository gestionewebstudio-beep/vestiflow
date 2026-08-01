import { normalizeShopDomainInput } from './normalize-shop-domain.util';

const SHOPIFY_GID_PATTERN = /^gid:\/\/shopify\/([^/]+)\/(\d+)$/;

/** Estrae la parte numerica da un GID Shopify (es. Order, Product). */
export function parseShopifyGidNumericId(shopifyGid: string): string | null {
  const match = SHOPIFY_GID_PATTERN.exec(shopifyGid.trim());
  return match?.[2] ?? null;
}

/** URL admin Shopify per aprire un ordine; null se mancano dominio o GID valido. */
export function buildShopifyAdminOrderUrl(
  shopDomain: string | undefined,
  shopifyOrderGid: string | undefined,
): string | null {
  if (!shopDomain?.trim() || !shopifyOrderGid?.trim()) {
    return null;
  }

  const numericId = parseShopifyGidNumericId(shopifyOrderGid);
  if (!numericId) {
    return null;
  }

  const host = normalizeShopDomainInput(shopDomain);
  return `https://${host}/admin/orders/${numericId}`;
}
