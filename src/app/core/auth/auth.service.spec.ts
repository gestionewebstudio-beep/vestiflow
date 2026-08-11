import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserRole } from '@core/models/user.model';

import { AUTH_GATEWAY } from './auth-gateway';
import { AuthService } from './auth.service';

const user = {
  id: 'u1',
  tenantId: 't1',
  email: 'a@b.it',
  displayName: 'Admin',
  avatarUrl: null,
  role: UserRole.Owner,
  storeIds: [],
  isActive: true,
  isPlatformAdmin: false,
  tenantChannelProfile: 'shopify' as const,
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

describe('AuthService', () => {
  const gateway = {
    restoreSession: vi.fn(),
    login: vi.fn(),
    verifyMfa: vi.fn(),
    logout: vi.fn(),
    getToken: vi.fn(),
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [AuthService, { provide: AUTH_GATEWAY, useValue: gateway }],
    });
  });

  it('initialize applica sessione autenticata', async () => {
    gateway.restoreSession.mockReturnValue(of({ user, accessToken: 'tok' }));
    const service = TestBed.inject(AuthService);

    await new Promise<void>((resolve) => {
      service.initialize().subscribe(() => resolve());
    });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()?.email).toBe('a@b.it');
  });

  it('initialize fallisce in unauthenticated', async () => {
    gateway.restoreSession.mockReturnValue(throwError(() => new Error('no session')));
    const service = TestBed.inject(AuthService);

    await new Promise<void>((resolve) => {
      service.initialize().subscribe(() => resolve());
    });

    expect(service.isAuthenticated()).toBe(false);
  });

  it('login aggiorna utente corrente', async () => {
    gateway.login.mockReturnValue(of({ user, accessToken: 'tok' }));
    const service = TestBed.inject(AuthService);

    const loggedIn = await new Promise((resolve) => {
      service.login({ email: 'a@b.it', password: 'secret' }).subscribe((u) => resolve(u));
    });

    expect(loggedIn).toEqual(user);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('logout azzera stato', async () => {
    gateway.logout.mockReturnValue(of(undefined));
    const service = TestBed.inject(AuthService);
    service.setCurrentUser(user);

    await new Promise<void>((resolve) => {
      service.logout().subscribe(() => resolve());
    });

    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
  });

  // Il primo accesso chiude con una chiamata autenticata che spegne il
  // promemoria «cambia la password». Chiudendo la sessione durante il cambio,
  // quella chiamata rispondeva 401 e il promemoria restava acceso: l'operatore
  // rientrava e si ritrovava la stessa schermata, all'infinito.
  it('al primo accesso chiede di tenere aperta la sessione', async () => {
    gateway.updatePassword.mockReturnValue(of(undefined));
    const service = TestBed.inject(AuthService);

    await new Promise<void>((resolve) => {
      service.updatePassword('nuova-password', true).subscribe(() => resolve());
    });

    expect(gateway.updatePassword).toHaveBeenCalledWith('nuova-password', true);
  });

  it('dal link ricevuto via email la sessione si chiude, come prima', async () => {
    gateway.updatePassword.mockReturnValue(of(undefined));
    const service = TestBed.inject(AuthService);

    await new Promise<void>((resolve) => {
      service.updatePassword('nuova-password').subscribe(() => resolve());
    });

    expect(gateway.updatePassword).toHaveBeenCalledWith('nuova-password', false);
  });
});
