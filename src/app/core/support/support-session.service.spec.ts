import { DOCUMENT } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { AppErrorKind } from '@core/models/app-error.model';
import { UserRole } from '@core/models/user.model';

import { SUPPORT_SESSION_STORAGE_KEY } from './support-session.constants';
import { SupportSessionService } from './support-session.service';

const API_BASE = 'http://localhost:3000/api/v1';

const SESSION = {
  sessionId: 'session-1',
  targetTenantId: 'tenant-client',
  targetTenantName: 'Cliente Demo',
  expiresAt: '2026-06-24T16:00:00.000Z',
};

describe('SupportSessionService', () => {
  let service: SupportSessionService;
  let httpMock: HttpTestingController;
  let auth: { getToken: ReturnType<typeof vi.fn>; setCurrentUser: ReturnType<typeof vi.fn> };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  let sessionStorage: {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    sessionStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    auth = {
      getToken: vi.fn().mockReturnValue(of('token-abc')),
      setCurrentUser: vi.fn(),
    };
    router = { navigateByUrl: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      providers: [
        SupportSessionService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        {
          provide: DOCUMENT,
          useValue: { defaultView: { sessionStorage } },
        },
      ],
    });

    service = TestBed.inject(SupportSessionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('restoreFromStorage ripristina sessionId da sessionStorage', () => {
    sessionStorage.getItem.mockReturnValue('session-1');

    service.restoreFromStorage();

    expect(sessionStorage.getItem).toHaveBeenCalledWith(SUPPORT_SESSION_STORAGE_KEY);
    expect(service.sessionId()).toBe('session-1');
  });

  it('startSession chiama POST, persiste e aggiorna profilo', async () => {
    const promise = firstValueFrom(service.startSession('tenant-client'));

    const startReq = httpMock.expectOne(`${API_BASE}/admin/tenants/tenant-client/support-session`);
    expect(startReq.request.method).toBe('POST');
    startReq.flush(SESSION);

    const meReq = httpMock.expectOne(`${API_BASE}/auth/me`);
    meReq.flush({
      id: 'op-1',
      tenantId: SESSION.targetTenantId,
      email: 'admin@vestiflow.it',
      displayName: 'Operatore',
      role: UserRole.Owner,
      storeIds: [],
      isActive: true,
      isPlatformAdmin: true,
      supportSession: SESSION,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(promise).resolves.toEqual(SESSION);
    expect(sessionStorage.setItem).toHaveBeenCalledWith(SUPPORT_SESSION_STORAGE_KEY, 'session-1');
    expect(auth.setCurrentUser).toHaveBeenCalled();
  });

  it('endSession chiama DELETE e pulisce storage', async () => {
    service.syncFromProfile(SESSION);

    const promise = firstValueFrom(service.endSession());

    const deleteReq = httpMock.expectOne(`${API_BASE}/admin/support-sessions/current`);
    expect(deleteReq.request.method).toBe('DELETE');
    deleteReq.flush(null);

    const meReq = httpMock.expectOne(`${API_BASE}/auth/me`);
    meReq.flush({
      id: 'op-1',
      tenantId: 'tenant-op',
      email: 'admin@vestiflow.it',
      displayName: 'Operatore',
      role: UserRole.Owner,
      storeIds: [],
      isActive: true,
      isPlatformAdmin: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await promise;
    expect(service.sessionId()).toBeNull();
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(SUPPORT_SESSION_STORAGE_KEY);
  });

  it('clearSession rimuove stato e sessionStorage', () => {
    service.syncFromProfile(SESSION);

    service.clearSession();

    expect(service.sessionId()).toBeNull();
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(SUPPORT_SESSION_STORAGE_KEY);
  });

  it('mapStartError restituisce messaggio AppError o fallback', () => {
    expect(service.mapStartError({ kind: AppErrorKind.Forbidden, message: 'Accesso negato' })).toBe(
      'Accesso negato',
    );
    expect(service.mapStartError(new Error('boom'))).toBe(
      'Impossibile aprire la sessione assistenza. Riprova.',
    );
  });
});
