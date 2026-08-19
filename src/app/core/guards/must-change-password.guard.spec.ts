import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';

import { mustChangePasswordGuard } from './must-change-password.guard';

function userWithFlag(mustChangePassword: boolean | undefined): User {
  return {
    id: 'u1',
    tenantId: 't1',
    email: 'u@b.it',
    displayName: 'Utente',
    avatarUrl: null,
    role: UserRole.Clerk,
    storeIds: [],
    isActive: true,
    isPlatformAdmin: false,
    tenantChannelProfile: TenantChannelProfile.Gestionale,
    tenantName: 'Cliente test',
    hasAllLocationsAccess: true,
    assignedLocationIds: [],
    assignedLocations: [],
    defaultLocationId: null,
    defaultLocation: null,
    permissions: [],
    ...(mustChangePassword === undefined ? {} : { mustChangePassword }),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('mustChangePasswordGuard', () => {
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

  it('porta alla pagina cambio password chi ha la password iniziale', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.currentUser).mockReturnValue(userWithFlag(true));

    const result = TestBed.runInInjectionContext(() =>
      mustChangePasswordGuard({} as never, {} as never),
    );
    expect(createUrlTreeMock).toHaveBeenCalledWith(['/cambia-password']);
    expect(result).not.toBe(true);
  });

  it('lascia passare chi ha già una password propria', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.currentUser).mockReturnValue(userWithFlag(false));

    const result = TestBed.runInInjectionContext(() =>
      mustChangePasswordGuard({} as never, {} as never),
    );
    expect(result).toBe(true);
  });

  it('lascia passare i profili storici senza il campo (nessun blocco retroattivo)', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.currentUser).mockReturnValue(userWithFlag(undefined));

    const result = TestBed.runInInjectionContext(() =>
      mustChangePasswordGuard({} as never, {} as never),
    );
    expect(result).toBe(true);
  });
});
