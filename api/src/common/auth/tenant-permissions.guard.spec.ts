import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '../../auth/tenant-permission.constants';
import type { UserProfileDto } from '../../auth/dto/user-profile.dto';
import { TenantPermissionsGuard } from './tenant-permissions.guard';
import {
  TENANT_PERMISSION_GROUPS_KEY,
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
    mustChangePassword: false,
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

  /** Contesto che distingue handler e classe: serve ai test sui gruppi. */
  const createSplitContext = (appUser: UserProfileDto) => {
    const handler = { name: 'handler' };
    const cls = { name: 'class' };
    return {
      ctx: {
        switchToHttp: () => ({ getRequest: () => ({ appUser }) }),
        getHandler: () => handler,
        getClass: () => cls,
      } as never,
      handler,
      cls,
    };
  };

  beforeEach(() => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReset();
    vi.spyOn(reflector, 'get').mockReset();
  });

  it('consente accesso se nessun permesso richiesto', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(createContext(clerkUser([])))).toBe(true);
  });

  it('consente accesso con permesso richiesto', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === TENANT_PERMISSIONS_KEY) {
        return [TenantPermission.SectionReports];
      }
      return undefined;
    });

    expect(
      guard.canActivate(
        createContext(clerkUser([TenantPermission.SectionReports])),
      ),
    ).toBe(true);
  });

  it('nega accesso se manca il permesso', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === TENANT_PERMISSIONS_KEY) {
        return [TenantPermission.SectionReports];
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
        return [TenantPermission.SectionReports, TenantPermission.SectionCustomers];
      }
      return undefined;
    });

    expect(
      guard.canActivate(
        createContext(clerkUser([TenantPermission.SectionCustomers])),
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

  // ── Forma a gruppi: «una di queste E quella» ────────────────────────────
  // È ciò che tiene insieme «porta di sezione» e «contenuto»: se cede, o si
  // apre una rotta a chiunque, o si chiude al titolare. Nessuna delle due
  // cose farebbe fallire un altro test.

  describe('RequireAllPermissionGroups', () => {
    /** Programma i gruppi su classe e handler separatamente. */
    function withGroups(
      handlerRef: object,
      classRef: object,
      groups: { readonly onClass?: string[][]; readonly onHandler?: string[][] },
    ): void {
      vi.spyOn(reflector, 'get').mockImplementation((key, target) => {
        if (key !== TENANT_PERMISSION_GROUPS_KEY) {
          return undefined;
        }
        if (target === classRef) {
          return groups.onClass;
        }
        if (target === handlerRef) {
          return groups.onHandler;
        }
        return undefined;
      });
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    }

    it('richiede almeno un permesso da OGNI gruppo', () => {
      const { ctx, handler, cls } = createSplitContext(
        clerkUser([TenantPermission.SectionReports, TenantPermission.ReportsExport]),
      );
      withGroups(handler, cls, {
        onHandler: [[TenantPermission.SectionReports], [TenantPermission.ReportsExport]],
      });

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('nega se manca il permesso di UN SOLO gruppo', () => {
      const { ctx, handler, cls } = createSplitContext(
        clerkUser([TenantPermission.ReportsExport]),
      );
      withGroups(handler, cls, {
        onHandler: [[TenantPermission.SectionCustomers], [TenantPermission.ReportsExport]],
      });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('i gruppi di CLASSE e di HANDLER si SOMMANO: la sezione non sparisce', () => {
      // Il difetto che questo test previene: con getAllAndOverride il gruppo
      // dell'handler cancellava quello di classe, e la porta di sezione
      // spariva senza che nulla fallisse.
      const { ctx, handler, cls } = createSplitContext(
        clerkUser([TenantPermission.ReportsExport]),
      );
      withGroups(handler, cls, {
        onClass: [[TenantPermission.SectionSales]],
        onHandler: [[TenantPermission.ReportsExport]],
      });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('con entrambi i gruppi soddisfatti passa', () => {
      const { ctx, handler, cls } = createSplitContext(
        clerkUser([TenantPermission.SectionSales, TenantPermission.ReportsExport]),
      );
      withGroups(handler, cls, {
        onClass: [[TenantPermission.SectionSales]],
        onHandler: [[TenantPermission.ReportsExport]],
      });

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('un gruppo VUOTO nega, non apre: è un errore di programmazione', () => {
      const { ctx, handler, cls } = createSplitContext(
        clerkUser([TenantPermission.SectionSales]),
      );
      withGroups(handler, cls, { onHandler: [[]] });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('la sessione assistenza attraversa i gruppi', () => {
      const handler = { name: 'h' };
      const cls = { name: 'c' };
      vi.spyOn(reflector, 'get').mockImplementation((key, target) =>
        key === TENANT_PERMISSION_GROUPS_KEY && target === cls
          ? [[TenantPermission.SectionSales]]
          : undefined,
      );
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({ appUser: clerkUser([]), supportSession: { sessionId: 's1' } }),
        }),
        getHandler: () => handler,
        getClass: () => cls,
      } as never;

      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
