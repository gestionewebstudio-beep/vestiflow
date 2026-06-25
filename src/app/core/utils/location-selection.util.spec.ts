import { describe, expect, it } from 'vitest';

import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import type { Location } from '@core/models/location.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';

import {
  filterLocationsForSettings,
  filterLocationsForTopbar,
  isLicensedOperationalLocation,
  isShopifyImportResidualLocation,
  isShopifyManagedLocation,
} from './location-selection.util';

function createLocation(partial: Partial<Location> & Pick<Location, 'id' | 'name'>): Location {
  return {
    tenantId: 'tenant-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isActive: true,
    licensedInVf: true,
    ...partial,
  };
}

describe('location-selection.util', () => {
  it('isShopifyManagedLocation richiede shopifyId collegato', () => {
    expect(
      isShopifyManagedLocation(
        createLocation({
          id: 'loc-ghost',
          name: 'Fantasma',
          shopify: { status: ShopifySyncStatus.Synced },
        }),
      ),
    ).toBe(false);
  });

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

  it('isShopifyImportResidualLocation distingue LOC-01 onboarding da import Shopify', () => {
    expect(
      isShopifyImportResidualLocation(
        createLocation({ id: 'local', name: 'Mimmo Test VF', code: 'LOC-01' }),
        'Mimmo Test VF',
      ),
    ).toBe(false);

    expect(
      isShopifyImportResidualLocation(
        createLocation({
          id: 'shopify',
          name: 'My Custom Location',
          code: 'LOC-01',
          address: {
            line1: '123 Main St',
            city: 'Toronto',
            postalCode: 'A1A 1A1',
            country: 'CA',
          },
        }),
        'Mimmo Test VF',
      ),
    ).toBe(true);
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

  it('filterLocationsForTopbar con Shopify scollegato non mostra sedi operative', () => {
    const locations = [
      createLocation({
        id: 'residual',
        name: 'My Custom Location',
        code: 'LOC-01',
      }),
    ];

    const filtered = filterLocationsForTopbar(locations, {
      channelProfile: TenantChannelProfile.Shopify,
      shopifyConnectionStatus: ShopifyConnectionStatus.NotConnected,
      primaryStoreName: 'Mimmo Test VF',
    });

    expect(filtered).toEqual([]);
  });

  it('filterLocationsForSettings con Shopify connesso mostra solo sedi Shopify', () => {
    const locations = [
      createLocation({ id: 'local', name: 'Mimmo Test VF', code: 'LOC-01' }),
      createLocation({
        id: 'shop',
        name: 'Shop location',
        shopify: { status: ShopifySyncStatus.Synced, shopifyId: '2' },
      }),
      createLocation({
        id: 'residual',
        name: 'My Custom Location',
        code: 'LOC-02',
      }),
    ];

    const filtered = filterLocationsForSettings(locations, {
      channelProfile: TenantChannelProfile.Shopify,
      shopifyConnectionStatus: ShopifyConnectionStatus.Connected,
    });

    expect(filtered.map((location) => location.id)).toEqual(['shop']);
  });

  it('filterLocationsForSettings con Shopify scollegato mantiene sede locale', () => {
    const locations = [
      createLocation({ id: 'local', name: 'Mimmo Test VF', code: 'LOC-01' }),
      createLocation({ id: 'residual', name: 'My Custom Location', code: 'LOC-02' }),
    ];

    const filtered = filterLocationsForSettings(locations, {
      channelProfile: TenantChannelProfile.Shopify,
      shopifyConnectionStatus: ShopifyConnectionStatus.NotConnected,
      primaryStoreName: 'Mimmo Test VF',
    });

    expect(filtered.map((location) => location.id)).toEqual(['local']);
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

  it('isLicensedOperationalLocation richiede licensedInVf e isActive', () => {
    expect(
      isLicensedOperationalLocation(
        createLocation({ id: 'active', name: 'Attiva', licensedInVf: true, isActive: true }),
      ),
    ).toBe(true);
    expect(
      isLicensedOperationalLocation(
        createLocation({ id: 'inactive', name: 'Off', licensedInVf: false, isActive: true }),
      ),
    ).toBe(false);
    expect(
      isLicensedOperationalLocation(
        createLocation({ id: 'shopify-off', name: 'Off', licensedInVf: true, isActive: false }),
      ),
    ).toBe(false);
  });

  it('filterLocationsForTopbar esclude sedi non licenziate anche se attive su Shopify', () => {
    const locations = [
      createLocation({
        id: 'licensed',
        name: 'Shop location',
        licensedInVf: true,
        shopify: { status: ShopifySyncStatus.Synced, shopifyId: '1' },
      }),
      createLocation({
        id: 'unlicensed',
        name: 'Snow City Warehouse',
        licensedInVf: false,
        shopify: { status: ShopifySyncStatus.Synced, shopifyId: '2' },
      }),
    ];

    const filtered = filterLocationsForTopbar(locations, {
      channelProfile: TenantChannelProfile.Shopify,
      shopifyConnectionStatus: ShopifyConnectionStatus.Connected,
    });

    expect(filtered.map((location) => location.id)).toEqual(['licensed']);
  });
});
