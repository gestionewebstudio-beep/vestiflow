import { describe, expect, it } from 'vitest';

import { isShopifyManagedImportLocation } from './shopify-location-import.util';

describe('isShopifyManagedImportLocation', () => {
  it('riconosce sedi con shopifyLocationId', () => {
    expect(
      isShopifyManagedImportLocation(
        {
          shopifyLocationId: '1001',
          shopifyLastSyncAt: null,
          code: 'LOC-02',
          name: 'Shop',
          addressLine1: null,
        },
        'Negozio',
      ),
    ).toBe(true);
  });

  it('riconosce LOC-02+ senza metadati Shopify', () => {
    expect(
      isShopifyManagedImportLocation(
        {
          shopifyLocationId: null,
          shopifyLastSyncAt: null,
          code: 'LOC-02',
          name: 'My Custom Location',
          addressLine1: '123 Main St',
        },
        'Negozio',
      ),
    ).toBe(true);
  });

  it('esclude LOC-01 onboarding senza indirizzo', () => {
    expect(
      isShopifyManagedImportLocation(
        {
          shopifyLocationId: null,
          shopifyLastSyncAt: null,
          code: 'LOC-01',
          name: 'Negozio',
          addressLine1: null,
        },
        'Negozio',
      ),
    ).toBe(false);
  });

  it('riconosce LOC-01 con indirizzo e nome diverso dal negozio', () => {
    expect(
      isShopifyManagedImportLocation(
        {
          shopifyLocationId: null,
          shopifyLastSyncAt: null,
          code: 'LOC-01',
          name: 'My Custom Location',
          addressLine1: '123 Main St',
        },
        'Negozio',
      ),
    ).toBe(true);
  });
});
