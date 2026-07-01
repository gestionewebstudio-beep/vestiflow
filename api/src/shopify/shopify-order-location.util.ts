import { shopifyGid } from './shopify-money.util';

/** Estrae l'id numerico location da payload ordine Shopify (REST). */
export function extractShopifyOrderLocationId(
  order: Record<string, unknown>,
): string | null {
  const direct = order.location_id;
  if (direct != null && String(direct).trim() !== '') {
    return shopifyGid('Location', String(direct));
  }

  const fulfillments = order.fulfillments as Record<string, unknown>[] | undefined;
  if (fulfillments?.length) {
    for (const fulfillment of fulfillments) {
      const locId = fulfillment.location_id;
      if (locId != null && String(locId).trim() !== '') {
        return shopifyGid('Location', String(locId));
      }
    }
  }

  return null;
}
