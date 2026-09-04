import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';

import { tenantOwnerGuard } from './tenant-owner.guard';

function userWithRole(role: User['role']): User {
  return {
    id: 'u1',
    tenantId: 't1',
    email: 'u@b.it',
    displayName: 'Utente',
    avatarUrl: null,
    role,
    storeIds: [],
    isActive: true,
    isPlatformAdmin: false,
    tenantChannelProfile: TenantChannelProfile.Gestionale,
    manualUnloadEnabled: true,
    tenantName: 'Cliente test',
    hasAllLocationsAccess: true,
    assignedLocationIds: [],
    assignedLocations: [],
    defaultLocationId: null,
    defaultLocation: null,
    permissions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('tenantOwnerGuard', () => {
  const createUrlTreeMock = vi.fn((commands: unknown[]) => ({ commands }));

  beforeEach(() => {
    createUrlTreeMock.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser: vi.fn() } },
        { provide: Router, useValue: { createUrlTree: createUrlTreeMock } },
      ],
    });
  });

  it('consente il titolare', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.currentUser).mockReturnValue(userWithRole(UserRole.Owner));

    const result = TestBed.runInInjectionContext(() => tenantOwnerGuard({} as never, {} as never));
    expect(result).toBe(true);
  });

  it('redirige gli altri ruoli (anche admin) alle Impostazioni', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.currentUser).mockReturnValue(userWithRole(UserRole.Admin));

    const result = TestBed.runInInjectionContext(() => tenantOwnerGuard({} as never, {} as never));
    expect(createUrlTreeMock).toHaveBeenCalledWith(['/app/settings']);
    expect(result).not.toBe(true);
  });
});
