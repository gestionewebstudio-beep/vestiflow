import { TestBed } from '@angular/core/testing';
import { Router, type ActivatedRouteSnapshot } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { UserRole } from '@core/models/user.model';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { TenantPermission } from '@core/models/tenant-permission.model';
import {
  REQUIRED_TENANT_PERMISSIONS_KEY,
  REQUIRED_TENANT_PERMISSIONS_MODE_KEY,
} from '@core/permissions/tenant-permissions.util';

import { tenantPermissionGuard } from './tenant-permission.guard';

describe('tenantPermissionGuard', () => {
  const createUrlTreeMock = vi.fn((commands: unknown[]) => ({ commands }));

  beforeEach(() => {
    createUrlTreeMock.mockClear();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { currentUser: vi.fn() },
        },
        {
          provide: Router,
          useValue: { createUrlTree: createUrlTreeMock },
        },
      ],
    });
  });

  it('consente accesso se nessun permesso richiesto', () => {
    const route = { data: {} } as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() => tenantPermissionGuard(route, {} as never));
    expect(result).toBe(true);
  });

  it('consente accesso con almeno uno dei permessi richiesti (mode any)', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.currentUser).mockReturnValue({
      id: 'u1',
      tenantId: 't1',
      email: 'clerk@example.com',
      displayName: 'Clerk',
      avatarUrl: null,
      role: UserRole.Clerk,
      storeIds: [],
      isActive: true,
      isPlatformAdmin: false,
      tenantChannelProfile: TenantChannelProfile.Gestionale,
      tenantName: 'Negozio',
      assignedLocationId: null,
      assignedLocationName: null,
      permissions: [TenantPermission.CustomersView],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const route = {
      data: {
        [REQUIRED_TENANT_PERMISSIONS_KEY]: [
          TenantPermission.ReportsView,
          TenantPermission.CustomersView,
        ],
      },
    } as unknown as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() => tenantPermissionGuard(route, {} as never));
    expect(result).toBe(true);
  });

  it('reindirizza alla dashboard se manca il permesso', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.currentUser).mockReturnValue({
      id: 'u1',
      tenantId: 't1',
      email: 'clerk@example.com',
      displayName: 'Clerk',
      avatarUrl: null,
      role: UserRole.Clerk,
      storeIds: [],
      isActive: true,
      isPlatformAdmin: false,
      tenantChannelProfile: TenantChannelProfile.Gestionale,
      tenantName: 'Negozio',
      assignedLocationId: null,
      assignedLocationName: null,
      permissions: [TenantPermission.InventoryManage],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const route = {
      data: {
        [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.ReportsView,
      },
    } as unknown as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() => tenantPermissionGuard(route, {} as never));
    expect(createUrlTreeMock).toHaveBeenCalledWith(['/app/dashboard']);
    expect(result).toEqual({ commands: ['/app/dashboard'] });
  });

  it('richiede tutti i permessi in mode all', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.currentUser).mockReturnValue({
      id: 'u1',
      tenantId: 't1',
      email: 'mgr@example.com',
      displayName: 'Manager',
      avatarUrl: null,
      role: UserRole.Manager,
      storeIds: [],
      isActive: true,
      isPlatformAdmin: false,
      tenantChannelProfile: TenantChannelProfile.Gestionale,
      tenantName: 'Negozio',
      assignedLocationId: null,
      assignedLocationName: null,
      permissions: [TenantPermission.CatalogManage],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const route = {
      data: {
        [REQUIRED_TENANT_PERMISSIONS_KEY]: [
          TenantPermission.CatalogManage,
          TenantPermission.CatalogDelete,
        ],
        [REQUIRED_TENANT_PERMISSIONS_MODE_KEY]: 'all',
      },
    } as unknown as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() => tenantPermissionGuard(route, {} as never));
    expect(createUrlTreeMock).toHaveBeenCalledWith(['/app/dashboard']);
    expect(result).toEqual({ commands: ['/app/dashboard'] });
  });
});
