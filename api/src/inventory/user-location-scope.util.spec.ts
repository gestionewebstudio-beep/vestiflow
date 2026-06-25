import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { TenantPermission } from '../auth/tenant-permission.constants';

import {
  applyReadLocationScope,
  assertUserCanAccessLocation,
  hasUnrestrictedLocationAccess,
} from './user-location-scope.util';

const baseUser = (overrides: Partial<UserProfileDto> = {}): UserProfileDto =>
  ({
    id: 'u1',
    tenantId: 't1',
    tenantName: 'Test',
    tenantChannelProfile: 'shopify',
    email: 'a@test.it',
    displayName: 'Test',
    avatarUrl: null,
    role: UserRole.clerk,
    storeIds: [],
    isActive: true,
    isPlatformAdmin: false,
    assignedLocationId: 'loc-rome',
    assignedLocationName: 'Roma',
    permissions: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }) as UserProfileDto;

describe('user-location-scope.util', () => {
  it('hasUnrestrictedLocationAccess per owner e admin', () => {
    expect(hasUnrestrictedLocationAccess({ role: UserRole.owner })).toBe(true);
    expect(hasUnrestrictedLocationAccess({ role: UserRole.admin })).toBe(true);
    expect(hasUnrestrictedLocationAccess({ role: UserRole.clerk })).toBe(false);
  });

  it('applyReadLocationScope limita commesso senza view_all alla sede assegnata', () => {
    expect(
      applyReadLocationScope(
        ['loc-nap', 'loc-rome'],
        baseUser({ permissions: [] }),
      ),
    ).toEqual(['loc-rome']);
  });

  it('applyReadLocationScope espone tutte le sedi con view_all_locations', () => {
    expect(
      applyReadLocationScope(
        ['loc-nap', 'loc-rome'],
        baseUser({ permissions: [TenantPermission.InventoryViewAllLocations] }),
      ),
    ).toEqual(['loc-nap', 'loc-rome']);
  });

  it('assertUserCanAccessLocation blocca commesso senza inventory.manage', () => {
    expect(() =>
      assertUserCanAccessLocation(
        baseUser({ permissions: [TenantPermission.InventoryViewAllLocations] }),
        'loc-rome',
      ),
    ).toThrow(ForbiddenException);
  });

  it('assertUserCanAccessLocation consente commesso con manage sulla sede assegnata', () => {
    expect(() =>
      assertUserCanAccessLocation(
        baseUser({ permissions: [TenantPermission.InventoryManage] }),
        'loc-rome',
      ),
    ).not.toThrow();
  });

  it('assertUserCanAccessLocation consente destinazione trasferimento su altra sede licenziata', () => {
    expect(() =>
      assertUserCanAccessLocation(
        baseUser({ permissions: [TenantPermission.InventoryManage] }),
        'loc-nap',
        'transferDestination',
      ),
    ).not.toThrow();
  });

  it('assertUserCanAccessLocation blocca destinazione trasferimento senza inventory.manage', () => {
    expect(() =>
      assertUserCanAccessLocation(
        baseUser({ permissions: [TenantPermission.InventoryViewAllLocations] }),
        'loc-nap',
        'transferDestination',
      ),
    ).toThrow(ForbiddenException);
  });
});
