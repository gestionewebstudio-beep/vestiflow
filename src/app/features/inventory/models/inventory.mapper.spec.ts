import { describe, expect, it } from 'vitest';

import { ShopifySyncStatus } from '@core/models/shopify.model';

import type { InventoryLevelDto } from './inventory-level.dto';
import type { LocationDto } from './location.dto';
import {
  inventoryLevelFromDto,
  inventoryLevelToDto,
  locationFromDto,
  locationToDto,
} from './inventory.mapper';

const locationDto: LocationDto = {
  id: 'loc-1',
  tenantId: 'tenant-1',
  name: 'Magazzino Napoli',
  code: 'NAP',
  address: {
    line1: 'Via Roma 1',
    city: 'Napoli',
    postalCode: '80100',
    country: 'IT',
  },
  isActive: true,
  licensedInVf: true,
  storeId: 'store-1',
  shopify: { status: ShopifySyncStatus.Synced, shopifyId: 'gid://shopify/Location/1' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const levelDto: InventoryLevelDto = {
  id: 'lvl-1',
  variantId: 'var-1',
  locationId: 'loc-1',
  onHand: 10,
  available: 8,
  committed: 2,
  incoming: 0,
  reserved: 0,
  minThreshold: 3,
};

describe('inventory.mapper', () => {
  it('locationFromDto / locationToDto sono round-trip', () => {
    const domain = locationFromDto(locationDto);
    expect(domain.name).toBe('Magazzino Napoli');
    expect(locationToDto(domain)).toEqual(locationDto);
  });

  it('inventoryLevelFromDto / inventoryLevelToDto sono round-trip', () => {
    const domain = inventoryLevelFromDto(levelDto);
    expect(domain.available).toBe(8);
    expect(inventoryLevelToDto(domain)).toEqual(levelDto);
  });
});
