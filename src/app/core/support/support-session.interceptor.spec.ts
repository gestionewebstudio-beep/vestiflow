import { DOCUMENT } from '@angular/common';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';

import { SUPPORT_SESSION_HEADER } from './support-session.constants';
import { supportSessionInterceptor } from './support-session.interceptor';
import { SupportSessionService } from './support-session.service';

const API_BASE = 'http://localhost:3000/api/v1';

describe('supportSessionInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let activeSessionId: string | null = null;

  beforeEach(() => {
    activeSessionId = null;

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([supportSessionInterceptor])),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
        { provide: SupportSessionService, useValue: { sessionId: () => activeSessionId } },
        {
          provide: DOCUMENT,
          useValue: {
            defaultView: { location: { href: 'http://localhost:4200/app/dashboard' } },
          },
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('non aggiunge header se sessione assente', async () => {
    const promise = firstValueFrom(http.get(`${API_BASE}/auth/me`));

    const req = httpMock.expectOne(`${API_BASE}/auth/me`);
    expect(req.request.headers.has(SUPPORT_SESSION_HEADER)).toBe(false);
    req.flush({});

    await promise;
  });

  it('aggiunge header sessione assistenza alle richieste API', async () => {
    activeSessionId = 'session-1';

    const promise = firstValueFrom(http.get(`${API_BASE}/auth/me`));

    const req = httpMock.expectOne(`${API_BASE}/auth/me`);
    expect(req.request.headers.get(SUPPORT_SESSION_HEADER)).toBe('session-1');
    req.flush({});

    await promise;
  });

  it('ignora richieste verso origini diverse dall API', async () => {
    activeSessionId = 'session-1';

    const promise = firstValueFrom(http.get('https://cdn.example.com/asset.json'));

    const req = httpMock.expectOne('https://cdn.example.com/asset.json');
    expect(req.request.headers.has(SUPPORT_SESSION_HEADER)).toBe(false);
    req.flush({});

    await promise;
  });
});
