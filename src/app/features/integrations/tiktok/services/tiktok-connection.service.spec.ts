import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { TikTokConnectionStatus } from '@core/models/tiktok-connection.model';

import { TikTokConnectionService } from './tiktok-connection.service';

const API_BASE = 'http://localhost:3000/api/v1';

describe('TikTokConnectionService (HTTP)', () => {
  let service: TikTokConnectionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TikTokConnectionService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(TikTokConnectionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getConnection mappa lo stato TikTok', async () => {
    const promise = firstValueFrom(service.getConnection());

    const req = httpMock.expectOne(`${API_BASE}/tiktok/connection`);
    req.flush({
      id: 'tt-1',
      tenantId: 'tenant-1',
      status: TikTokConnectionStatus.Connected,
      shopId: 'shop-123',
      displayName: 'Negozio TikTok',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const result = await promise;
    expect(result.status).toBe(TikTokConnectionStatus.Connected);
    expect(result.shopId).toBe('shop-123');
  });

  it('beginAuth restituisce authorizeUrl', async () => {
    const promise = firstValueFrom(service.beginAuth());

    const req = httpMock.expectOne(`${API_BASE}/tiktok/auth/begin`);
    expect(req.request.method).toBe('POST');
    req.flush({ authorizeUrl: 'https://tiktok.com/oauth' });

    expect(await promise).toEqual({ authorizeUrl: 'https://tiktok.com/oauth' });
  });

  it('clearErrors resetta errori connessione', async () => {
    const promise = firstValueFrom(service.clearErrors());

    const req = httpMock.expectOne(`${API_BASE}/tiktok/connection/clear-errors`);
    req.flush({ cleared: true, productsReset: 2 });

    expect(await promise).toEqual({ cleared: true, productsReset: 2 });
  });
});
