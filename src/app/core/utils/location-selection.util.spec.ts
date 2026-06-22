import { describe, expect, it } from 'vitest';

import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import type { Location } from '@core/models/location.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';

import { filterLocationsForTopbar, isShopifyManagedLocation } from './location-selection.util';

function createLocation(partial: Partial<Location> & Pick<Location, 'id' | 'name'>): Location {
  return {
    tenantId: 'tenant-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isActive: true,
    ...partial,
  };
}

describe('location-selection.util', () => {
  it('isShopifyManagedLocation riconosce sedi collegate a Shopify', () => {
    expect(
      isShopifyManagedLocation(
        createLocation({
          id: 'loc-1',
          name: 'Shop',
          shopify: { status: ShopifySyncStatus.Synced, shopifyId: '1' },
        }),
      ),
    ).toBe(true);
    expect(
      isShopifyManagedLocation(
        createLocation({
          id: 'loc-2',
          name: 'Locale',
          shopify: { status: ShopifySyncStatus.NotConnected },
        }),
      ),
    ).toBe(false);
  });

  it('filterLocationsForTopbar esclude sede locale se Shopify è connesso', () => {
    const locations = [
      createLocation({ id: 'local', name: 'Mimmo Test VF', code: 'LOC-01' }),
      createLocation({
        id: 'shop',
        name: 'Shop location',
        shopify: { status: ShopifySyncStatus.Synced, shopifyId: '2' },
      }),
    ];

    const filtered = filterLocationsForTopbar(locations, {
      channelProfile: TenantChannelProfile.Shopify,
      shopifyConnectionStatus: ShopifyConnectionStatus.Connected,
    });

    expect(filtered.map((location) => location.id)).toEqual(['shop']);
  });

  it('filterLocationsForTopbar mantiene tutte le sedi per profilo gestionale', () => {
    const locations = [
      createLocation({ id: 'local', name: 'Magazzino' }),
      createLocation({ id: 'shop', name: 'Negozio' }),
    ];

    const filtered = filterLocationsForTopbar(locations, {
      channelProfile: TenantChannelProfile.Gestionale,
      shopifyConnectionStatus: null,
    });

    expect(filtered).toHaveLength(2);
  });
});
