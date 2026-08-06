export function isShopifyImportedLocationCode(code: string | null | undefined): boolean {
  return /^LOC-\d+$/i.test(code?.trim() ?? '');
}

export interface ShopifyLocationImportCandidate {
  readonly shopifyLocationId: string | null;
  readonly shopifyLastSyncAt: Date | null;
  readonly code: string | null;
  readonly name: string;
  readonly addressLine1: string | null;
}

/**
 * Distingue sedi importate/sincronizzate da Shopify dalla sede LOC-01 di onboarding.
 * Dopo disconnect i metadati Shopify possono essere azzerati: si usa codice, nome e indirizzo.
 */
export function isShopifyManagedImportLocation(
  location: ShopifyLocationImportCandidate,
  primaryStoreName: string | null,
): boolean {
  if (location.shopifyLocationId || location.shopifyLastSyncAt) {
    return true;
  }

  if (!isShopifyImportedLocationCode(location.code)) {
    return false;
  }

  const code = location.code?.trim().toUpperCase() ?? '';
  if (code !== 'LOC-01') {
    return true;
  }

  if (!location.addressLine1?.trim()) {
    return false;
  }

  if (primaryStoreName && location.name.trim() !== primaryStoreName.trim()) {
    return true;
  }

  return false;
}
