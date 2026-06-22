import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import type { Location } from '@core/models/location.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';

/** Location collegata o sincronizzata con Shopify (sede operativa ecommerce). */
export function isShopifyManagedLocation(location: Location): boolean {
  const status = location.shopify?.status;
  return (
    status === ShopifySyncStatus.Synced ||
    status === ShopifySyncStatus.Syncing ||
    status === ShopifySyncStatus.OutOfSync ||
    status === ShopifySyncStatus.Error ||
    Boolean(location.shopify?.shopifyId)
  );
}

export interface TopbarLocationFilterContext {
  readonly channelProfile: TenantChannelProfile | undefined;
  readonly shopifyConnectionStatus: ShopifyConnectionStatus | null;
}

/**
 * Location mostrate nel selettore topbar: sedi operative, non la sede locale
 * di onboarding creata in fase di registrazione cliente.
 */
export function filterLocationsForTopbar(
  locations: readonly Location[],
  context: TopbarLocationFilterContext,
): readonly Location[] {
  const activeLocations = locations.filter((location) => location.isActive);

  if (
    context.channelProfile !== TenantChannelProfile.Shopify ||
    context.shopifyConnectionStatus !== ShopifyConnectionStatus.Connected
  ) {
    return activeLocations;
  }

  const shopifyLocations = activeLocations.filter(isShopifyManagedLocation);
  return shopifyLocations.length > 0 ? shopifyLocations : activeLocations;
}
