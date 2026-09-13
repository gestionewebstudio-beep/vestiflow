/**
 * Il prossimo codice `LOC-NN` libero. Era una funzione privata del sync delle
 * sedi, che creava sedi da solo; da B7 (11/09/2026) la sede la crea la SCELTA
 * dell'operatore (`ShopifySetupService`), e il codice si calcola qui.
 */
export function prossimoCodiceSede(
  locations: readonly { readonly code: string | null }[],
): string {
  const numerici = locations
    .map((location) => location.code?.match(/^LOC-(\d+)$/i)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));
  const indice = numerici.length === 0 ? locations.length + 1 : Math.max(...numerici) + 1;
  return `LOC-${String(indice).padStart(2, '0')}`;
}

/** L'indirizzo di una location Shopify nella forma della sede VestiFlow. */
export function indirizzoDaShopify(shopifyLocation: {
  readonly address1?: string | null;
  readonly address2?: string | null;
  readonly city?: string | null;
  readonly province?: string | null;
  readonly zip?: string | null;
  readonly country_code?: string | null;
}) {
  return {
    addressLine1: shopifyLocation.address1?.trim() || null,
    addressLine2: shopifyLocation.address2?.trim() || null,
    city: shopifyLocation.city?.trim() || null,
    province: shopifyLocation.province?.trim() || null,
    postalCode: shopifyLocation.zip?.trim() || null,
    countryCode: shopifyLocation.country_code?.trim().toUpperCase() || 'IT',
  };
}

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
