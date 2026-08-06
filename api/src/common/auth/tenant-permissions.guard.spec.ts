import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '../../auth/tenant-permission.constants';
import type { UserProfileDto } from '../../auth/dto/user-profile.dto';
import { TenantPermissionsGuard } from './tenant-permissions.guard';
import {
  TENANT_PERMISSIONS_KEY,
  TENANT_PERMISSIONS_MODE_KEY,
} from './tenant-permissions.decorator';

function clerkUser(permissions: readonly string[]): UserProfileDto {
  return {
    id: 'u1',
    tenantId: 't1',
    tenantName: 'Negozio',
    tenantChannelProfile: 'gestionale',
    email: 'clerk@test.com',
    displayName: 'Clerk',
    avatarUrl: null,
    role: 'clerk',
    storeIds: [],
    hasAllLocationsAccess: false,
    assignedLocationIds: [],
    assignedLocations: [],
    defaultLocationId: null,
    defaultLocation: null,
    permissions: [...permissions],
    isActive: true,
    isPlatformAdmin: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('TenantPermissionsGuard', () => {
  const reflector = new Reflector();
  const guard = new TenantPermissionsGuard(reflector);

  const createContext = (appUser: UserProfileDto) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ appUser }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as never;

  beforeEach(() => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReset();
  });

  it('consente accesso se nessun permesso richiesto', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(createContext(clerkUser([])))).toBe(true);
  });

  it('consente accesso con permesso richiesto', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === TENANT_PERMISSIONS_KEY) {
        return [TenantPermission.ReportsView];
      }
      return undefined;
    });

    expect(
      guard.canActivate(
        createContext(clerkUser([TenantPermission.ReportsView])),
      ),
    ).toBe(true);
  });

  it('nega accesso se manca il permesso', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === TENANT_PERMISSIONS_KEY) {
        return [TenantPermission.ReportsView];
      }
      return undefined;
    });

    expect(() =>
      guard.canActivate(createContext(clerkUser([TenantPermission.InventoryManage]))),
    ).toThrow(ForbiddenException);
  });

  it('consente accesso con almeno uno dei permessi (mode any)', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === TENANT_PERMISSIONS_KEY) {
        return [TenantPermission.ReportsView, TenantPermission.CustomersView];
      }
      return undefined;
    });

    expect(
      guard.canActivate(
        createContext(clerkUser([TenantPermission.CustomersView])),
      ),
    ).toBe(true);
  });

  it('nega accesso in mode all se manca un permesso', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === TENANT_PERMISSIONS_KEY) {
        return [TenantPermission.CatalogManage, TenantPermission.CatalogDelete];
      }
      if (key === TENANT_PERMISSIONS_MODE_KEY) {
        return 'all';
      }
      return undefined;
    });

    expect(() =>
      guard.canActivate(
        createContext(clerkUser([TenantPermission.CatalogManage])),
      ),
    ).toThrow(ForbiddenException);
  });
});
