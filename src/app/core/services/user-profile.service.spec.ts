import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { UserRole } from '@core/models/user.model';

import { UserProfileService } from './user-profile.service';

const API_BASE = 'http://localhost:3000/api/v1';
const setCurrentUserMock = vi.fn();

describe('UserProfileService', () => {
  let service: UserProfileService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    setCurrentUserMock.mockClear();
    TestBed.configureTestingModule({
      providers: [
        UserProfileService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: APP_CONFIG,
          useValue: { apiBaseUrl: API_BASE },
        },
        {
          provide: AuthService,
          useValue: { setCurrentUser: setCurrentUserMock },
        },
      ],
    });
    service = TestBed.inject(UserProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('uploadAvatar invia FormData e aggiorna utente corrente', async () => {
    const file = new File(['x'], 'avatar.jpg', { type: 'image/jpeg' });
    const promise = firstValueFrom(service.uploadAvatar(file));

    const req = httpMock.expectOne(`${API_BASE}/auth/avatar`);
    expect(req.request.method).toBe('POST');
    req.flush({
      id: 'u1',
      tenantId: 't1',
      email: 'a@b.it',
      displayName: 'Admin',
      role: UserRole.Owner,
      storeIds: [],
      isActive: true,
      isPlatformAdmin: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    await promise;
    expect(setCurrentUserMock).toHaveBeenCalled();
  });

  it('rifiuta file troppo grande', () => {
    const big = new File([new Uint8Array(3 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    expect(() => service.uploadAvatar(big)).toThrow(/2 MB/);
  });

  it('rifiuta formato non supportato', () => {
    const gif = new File(['x'], 'a.gif', { type: 'image/gif' });
    expect(() => service.uploadAvatar(gif)).toThrow(/Formato non supportato/);
  });
});
