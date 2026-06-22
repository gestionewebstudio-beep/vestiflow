import { TestBed } from '@angular/core/testing';
import { Router, type ActivatedRouteSnapshot } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { UserRole } from '@core/models/user.model';
import { TENANT_ROUTE_PERMISSION_KEY } from '@core/permissions/tenant-permissions.util';

import { tenantRoleGuard } from './tenant-role.guard';

describe('tenantRoleGuard', () => {
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

  it('consente accesso se permesso route assente', () => {
    const route = { data: {} } as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() => tenantRoleGuard(route, {} as never));
    expect(result).toBe(true);
  });

  it('consente accesso se utente manager', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.currentUser).mockReturnValue({
      id: 'u1',
      tenantId: 't1',
      email: 'm@b.it',
      displayName: 'Manager',
      avatarUrl: null,
      role: UserRole.Manager,
      storeIds: [],
      isActive: true,
      isPlatformAdmin: false,
      tenantChannelProfile: 'shopify',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const route = {
      data: { [TENANT_ROUTE_PERMISSION_KEY]: 'manager' },
    } as unknown as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() => tenantRoleGuard(route, {} as never));
    expect(result).toBe(true);
  });

  it('redirige clerk senza permesso manager', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.currentUser).mockReturnValue({
      id: 'u1',
      tenantId: 't1',
      email: 'c@b.it',
      displayName: 'Clerk',
      avatarUrl: null,
      role: UserRole.Clerk,
      storeIds: [],
      isActive: true,
      isPlatformAdmin: false,
      tenantChannelProfile: 'shopify',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const route = {
      data: { [TENANT_ROUTE_PERMISSION_KEY]: 'manager' },
    } as unknown as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() => tenantRoleGuard(route, {} as never));
    expect(createUrlTreeMock).toHaveBeenCalledWith(['/app/dashboard']);
    expect(result).not.toBe(true);
  });

  it('redirige manager su route admin-only', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.currentUser).mockReturnValue({
      id: 'u1',
      tenantId: 't1',
      email: 'm@b.it',
      displayName: 'Manager',
      avatarUrl: null,
      role: UserRole.Manager,
      storeIds: [],
      isActive: true,
      isPlatformAdmin: false,
      tenantChannelProfile: 'shopify',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const route = {
      data: { [TENANT_ROUTE_PERMISSION_KEY]: 'admin' },
    } as unknown as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() => tenantRoleGuard(route, {} as never));
    expect(createUrlTreeMock).toHaveBeenCalledWith(['/app/dashboard']);
    expect(result).not.toBe(true);
  });

  it('consente owner su route admin-only', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.currentUser).mockReturnValue({
      id: 'u1',
      tenantId: 't1',
      email: 'o@b.it',
      displayName: 'Owner',
      avatarUrl: null,
      role: UserRole.Owner,
      storeIds: [],
      isActive: true,
      isPlatformAdmin: false,
      tenantChannelProfile: 'shopify',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const route = {
      data: { [TENANT_ROUTE_PERMISSION_KEY]: 'admin' },
    } as unknown as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() => tenantRoleGuard(route, {} as never));
    expect(result).toBe(true);
  });
});
