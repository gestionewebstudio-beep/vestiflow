import { describe, expect, it } from 'vitest';

import { UserRole } from '@core/models/user.model';
import { TenantPermission } from '@core/models/tenant-permission.model';

import {
  canSwitchOperationalLocation,
  canViewAllOperationalLocations,
  filterLocationsForRead,
  isFixedSingleStoreUser,
  resolveFixedOperationalLocationId,
} from './user-location-scope.util';

describe('user-location-scope.util', () => {
  const locations = [
    {
      id: 'loc-nap',
      tenantId: 't1',
      name: 'Napoli',
      isActive: true,
      licensedInVf: true,
      shopifyLocationId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'loc-rom',
      tenantId: 't1',
      name: 'Roma',
      isActive: true,
      licensedInVf: true,
      shopifyLocationId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  it('canSwitchOperationalLocation per titolare/admin/manager (preset), non commesso base', () => {
    expect(canSwitchOperationalLocation({ role: UserRole.Owner } as never)).toBe(true);
    expect(canSwitchOperationalLocation({ role: UserRole.Admin } as never)).toBe(true);
    expect(canSwitchOperationalLocation({ role: UserRole.Manager } as never)).toBe(true);
    expect(canSwitchOperationalLocation({ role: UserRole.Clerk } as never)).toBe(false);
  });

  it('canSwitchOperationalLocation falso commesso con preset senza view_all_locations', () => {
    expect(
      canSwitchOperationalLocation({
        role: UserRole.Clerk,
        permissions: [TenantPermission.InventoryManage],
      } as never),
    ).toBe(false);
  });

  it('canSwitchOperationalLocation per commesso con view_all_locations', () => {
    const clerkWithViewAll = {
      role: UserRole.Clerk,
      permissions: [TenantPermission.InventoryViewAllLocations],
    } as never;

    expect(canViewAllOperationalLocations(clerkWithViewAll)).toBe(true);
    expect(canSwitchOperationalLocation(clerkWithViewAll)).toBe(true);
  });

  it('filterLocationsForRead limita alla sede assegnata senza view_all_locations', () => {
    expect(
      filterLocationsForRead(locations, {
        role: UserRole.Clerk,
        assignedLocationId: 'loc-rom',
        permissions: [],
      } as never),
    ).toEqual([locations[1]]);
  });

  it('filterLocationsForRead espone tutte le sedi con view_all_locations', () => {
    expect(
      filterLocationsForRead(locations, {
        role: UserRole.Clerk,
        assignedLocationId: 'loc-rom',
        permissions: ['inventory.view_all_locations'],
      } as never),
    ).toHaveLength(2);
  });

  it('resolveFixedOperationalLocationId per commesso con sede assegnata', () => {
    expect(
      resolveFixedOperationalLocationId({
        role: UserRole.Clerk,
        assignedLocationId: 'loc-rom',
      } as never),
    ).toBe('loc-rom');
    expect(
      isFixedSingleStoreUser({ role: UserRole.Clerk, assignedLocationId: 'loc-rom' } as never),
    ).toBe(true);
  });
});
