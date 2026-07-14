import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { TenantPermission } from '../auth/tenant-permission.constants';

import {
  applyReadLocationScope,
  assertLocationInUserScope,
  assertLocationReadableInUserScope,
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
    hasAllLocationsAccess: false,
    assignedLocationIds: ['loc-rome'],
    permissions: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }) as UserProfileDto;

describe('user-location-scope.util', () => {
  it('hasUnrestrictedLocationAccess per owner e admin', () => {
    expect(hasUnrestrictedLocationAccess(baseUser({ role: UserRole.owner }))).toBe(true);
    expect(
      hasUnrestrictedLocationAccess(
        baseUser({ role: UserRole.admin, hasAllLocationsAccess: true }),
      ),
    ).toBe(true);
    expect(
      hasUnrestrictedLocationAccess(
        baseUser({ role: UserRole.admin, hasAllLocationsAccess: false }),
      ),
    ).toBe(false);
    expect(hasUnrestrictedLocationAccess(baseUser({ role: UserRole.clerk }))).toBe(false);
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

  describe('assertLocationInUserScope', () => {
    it('blocca utente senza alcuna sede assegnata', () => {
      expect(() =>
        assertLocationInUserScope(baseUser({ assignedLocationIds: [] }), 'loc-rome'),
      ).toThrow(ForbiddenException);
    });

    it('consente utente con la sede assegnata richiesta', () => {
      expect(() =>
        assertLocationInUserScope(baseUser({ assignedLocationIds: ['loc-rome'] }), 'loc-rome'),
      ).not.toThrow();
    });

    it('blocca utente con sede assegnata diversa da quella richiesta', () => {
      expect(() =>
        assertLocationInUserScope(baseUser({ assignedLocationIds: ['loc-rome'] }), 'loc-nap'),
      ).toThrow(ForbiddenException);
    });

    it('consente sempre titolare indipendentemente dalla sede', () => {
      expect(() =>
        assertLocationInUserScope(
          baseUser({ role: UserRole.owner, assignedLocationIds: [] }),
          'loc-nap',
        ),
      ).not.toThrow();
    });

    it('consente sempre utente con hasAllLocationsAccess indipendentemente dalla sede', () => {
      expect(() =>
        assertLocationInUserScope(
          baseUser({ hasAllLocationsAccess: true, assignedLocationIds: [] }),
          'loc-nap',
        ),
      ).not.toThrow();
    });
  });

  describe('assertLocationReadableInUserScope', () => {
    it('passa quando l’utente è assente (chiamate interne senza contesto utente)', () => {
      expect(() => assertLocationReadableInUserScope(undefined, 'loc-nap')).not.toThrow();
    });

    it('passa quando la risorsa non ha una sede (locationId null/undefined)', () => {
      expect(() => assertLocationReadableInUserScope(baseUser(), null)).not.toThrow();
      expect(() => assertLocationReadableInUserScope(baseUser(), undefined)).not.toThrow();
    });

    it('consente sempre il titolare', () => {
      expect(() =>
        assertLocationReadableInUserScope(
          baseUser({ role: UserRole.owner, assignedLocationIds: [] }),
          'loc-nap',
        ),
      ).not.toThrow();
    });

    it('consente utente con hasAllLocationsAccess', () => {
      expect(() =>
        assertLocationReadableInUserScope(
          baseUser({ hasAllLocationsAccess: true, assignedLocationIds: [] }),
          'loc-nap',
        ),
      ).not.toThrow();
    });

    it('consente utente con permesso inventory.view_all_locations su sede non assegnata', () => {
      expect(() =>
        assertLocationReadableInUserScope(
          baseUser({ permissions: [TenantPermission.InventoryViewAllLocations] }),
          'loc-nap',
        ),
      ).not.toThrow();
    });

    it('consente la sede assegnata e blocca le altre con il messaggio dedicato', () => {
      expect(() => assertLocationReadableInUserScope(baseUser(), 'loc-rome')).not.toThrow();
      expect(() =>
        assertLocationReadableInUserScope(baseUser(), 'loc-nap', 'Accesso negato al documento.'),
      ).toThrowError('Accesso negato al documento.');
      expect(() => assertLocationReadableInUserScope(baseUser(), 'loc-nap')).toThrow(
        ForbiddenException,
      );
    });
  });
});
