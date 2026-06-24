import { formatDateTime } from '@core/utils/date.util';
import type { ShopifyLink } from '@core/models/shopify.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import type { DetailFact } from '@shared/components/detail-facts/detail-facts.component';
import { buildShopifyAdminOrderUrl } from '@features/integrations/shopify/models/shopify-admin-url.util';

/** Etichetta Shopify leggibile per il dettaglio vendita (niente GID grezzo). */
export function salesOrderShopifyDetailFact(
  shopify: ShopifyLink | undefined,
  shopDomain: string | undefined,
): DetailFact {
  if (!shopify?.shopifyId || shopify.status !== ShopifySyncStatus.Synced) {
    return { label: 'Shopify', value: 'Non sincronizzato' };
  }

  const href = buildShopifyAdminOrderUrl(shopDomain, shopify.shopifyId);
  const value = shopify.lastSyncedAt
    ? `Sincronizzato il ${formatDateTime(shopify.lastSyncedAt)}`
    : 'Sincronizzato da Shopify';

  return {
    label: 'Shopify',
    value,
    href: href ?? undefined,
    linkLabel: href ? 'Apri in Shopify Admin' : undefined,
  };
}
