import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import type { Location } from '@core/models/location.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';

/** Location collegata o sincronizzata con Shopify (sede operativa ecommerce). */
export function isShopifyManagedLocation(location: Location): boolean {
  const shopify = location.shopify;
  if (!shopify?.shopifyId) {
    return false;
  }

  const status = shopify.status;
  return (
    status === ShopifySyncStatus.Synced ||
    status === ShopifySyncStatus.Syncing ||
    status === ShopifySyncStatus.OutOfSync ||
    status === ShopifySyncStatus.Error
  );
}

function isShopifyImportedLocationCode(code: string | null | undefined): boolean {
  return /^LOC-\d+$/i.test(code?.trim() ?? '');
}

/**
 * Residuo di import/sync Shopify (non la sede LOC-01 creata in onboarding).
 * Usato solo per la UI quando Shopify non è connesso.
 */
export function isShopifyImportResidualLocation(
  location: Location,
  primaryStoreName?: string | null,
): boolean {
  if (!location.isActive) {
    return false;
  }

  if (isShopifyManagedLocation(location)) {
    return true;
  }

  if (location.shopify?.lastSyncedAt) {
    return true;
  }

  const code = location.code?.trim().toUpperCase() ?? '';
  if (!isShopifyImportedLocationCode(code)) {
    return false;
  }

  if (code !== 'LOC-01') {
    return true;
  }

  if (primaryStoreName && location.name.trim() !== primaryStoreName.trim()) {
    return true;
  }

  return false;
}

export interface LocationFilterContext {
  readonly channelProfile: TenantChannelProfile | undefined;
  readonly shopifyConnectionStatus: ShopifyConnectionStatus | null;
  /** Nome negozio principale del tenant (onboarding), per distinguere LOC-01 locale. */
  readonly primaryStoreName?: string | null;
}

/**
 * Location mostrate nel selettore topbar: sedi operative per il magazzino.
 * Con Shopify connesso: solo sedi sincronizzate. Con Shopify scollegato: nessuna
 * sede operativa finché non si riconnette e si sincronizza.
 */
export function filterLocationsForTopbar(
  locations: readonly Location[],
  context: LocationFilterContext,
): readonly Location[] {
  const activeLocations = locations.filter((location) => location.isActive);

  if (context.channelProfile !== TenantChannelProfile.Shopify) {
    return activeLocations;
  }

  if (context.shopifyConnectionStatus !== ShopifyConnectionStatus.Connected) {
    return [];
  }

  const shopifyLocations = activeLocations.filter(isShopifyManagedLocation);
  return shopifyLocations.length > 0 ? shopifyLocations : activeLocations;
}

/** Location visibili in Impostazioni (include sede locale, esclude residui Shopify). */
export function filterLocationsForSettings(
  locations: readonly Location[],
  context: LocationFilterContext,
): readonly Location[] {
  const activeLocations = locations.filter((location) => location.isActive);

  if (context.channelProfile !== TenantChannelProfile.Shopify) {
    return activeLocations;
  }

  if (context.shopifyConnectionStatus === ShopifyConnectionStatus.Connected) {
    const shopifyLocations = activeLocations.filter(isShopifyManagedLocation);
    if (shopifyLocations.length > 0) {
      return shopifyLocations;
    }

    return activeLocations.filter(
      (location) => !isShopifyImportResidualLocation(location, context.primaryStoreName),
    );
  }

  return activeLocations.filter(
    (location) => !isShopifyImportResidualLocation(location, context.primaryStoreName),
  );
}
