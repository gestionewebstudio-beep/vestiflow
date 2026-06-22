import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';

import { ShopifyConnectionService } from './shopify-connection.service';

const API_BASE = 'http://localhost:3000/api/v1';

describe('ShopifyConnectionService (HTTP)', () => {
  let service: ShopifyConnectionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ShopifyConnectionService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(ShopifyConnectionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getConnection mappa lo stato connessione', async () => {
    const promise = firstValueFrom(service.getConnection());

    const req = httpMock.expectOne(`${API_BASE}/shopify/connection`);
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 'conn-1',
      tenantId: 'tenant-1',
      status: ShopifyConnectionStatus.Connected,
      shopDomain: 'store.myshopify.com',
      scopes: ['read_products'],
      autoSyncEnabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const result = await promise;
    expect(result.status).toBe(ShopifyConnectionStatus.Connected);
    expect(result.shopDomain).toBe('store.myshopify.com');
  });

  it('beginAuth invia shop e restituisce authorizeUrl', async () => {
    const promise = firstValueFrom(service.beginAuth('mystore.myshopify.com'));

    const req = httpMock.expectOne(`${API_BASE}/shopify/auth/begin`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ shop: 'mystore.myshopify.com' });
    req.flush({ authorizeUrl: 'https://shopify.com/oauth' });

    expect(await promise).toEqual({ authorizeUrl: 'https://shopify.com/oauth' });
  });

  it('syncProducts invia POST al endpoint catalogo', async () => {
    const promise = firstValueFrom(service.syncProducts());

    const req = httpMock.expectOne(`${API_BASE}/shopify/sync/products`);
    expect(req.request.method).toBe('POST');
    req.flush({ imported: 2, updated: 1, failed: [], remoteProductCount: 3, unchanged: 0 });

    const result = await promise;
    expect(result.imported).toBe(2);
  });

  it('disconnect elimina la connessione', async () => {
    const promise = firstValueFrom(service.disconnect());

    const req = httpMock.expectOne(`${API_BASE}/shopify/connection`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ disconnected: true });

    expect(await promise).toEqual({ disconnected: true });
  });
});
