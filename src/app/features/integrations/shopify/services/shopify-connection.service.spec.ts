import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { UserRole } from '@core/models/user.model';
import type { User } from '@core/models/user.model';

import { ShopifyConnectionService } from './shopify-connection.service';

const API_BASE = 'http://localhost:3000/api/v1';

function authUserOwner(): User {
  return {
    id: 'u1',
    tenantId: 'tenant-1',
    email: 'owner@test.it',
    displayName: 'Owner',
    avatarUrl: null,
    role: UserRole.Owner,
    storeIds: [],
    isActive: true,
    isPlatformAdmin: false,
    tenantChannelProfile: TenantChannelProfile.Shopify,
    tenantName: 'Test',
    assignedLocationId: null,
    assignedLocationName: null,
    permissions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('ShopifyConnectionService (HTTP)', () => {
  let service: ShopifyConnectionService;
  let httpMock: HttpTestingController;
  const authMock = { currentUser: vi.fn(() => authUserOwner()) };

  beforeEach(() => {
    authMock.currentUser.mockImplementation(() => authUserOwner());
    TestBed.configureTestingModule({
      providers: [
        ShopifyConnectionService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
        {
          provide: AuthService,
          useValue: authMock,
        },
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

  it('getConnection non chiama API senza ruolo titolare', async () => {
    authMock.currentUser.mockReturnValue({
      ...authUserOwner(),
      role: UserRole.Clerk,
      permissions: [TenantPermission.CatalogImportExport],
    });

    await expect(firstValueFrom(service.getConnection())).rejects.toThrow();
    httpMock.expectNone(`${API_BASE}/shopify/connection`);
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

  it('syncLocations invia POST e invalida cache connessione', async () => {
    const promise = firstValueFrom(service.syncLocations());

    const req = httpMock.expectOne(`${API_BASE}/shopify/sync/locations`);
    expect(req.request.method).toBe('POST');
    req.flush({ synced: true, matchedCount: 1, importedCount: 2, totalCount: 3 });

    const result = await promise;
    expect(result.importedCount).toBe(2);
  });

  it('previewShopChange legge anteprima purge', async () => {
    const promise = firstValueFrom(service.previewShopChange());

    const req = httpMock.expectOne(`${API_BASE}/shopify/shop-change/preview`);
    expect(req.request.method).toBe('GET');
    req.flush({
      currentShopDomain: 'store.myshopify.com',
      counts: {
        shopifyProducts: 10,
        shopifyVariants: 25,
        shopifyCustomers: 5,
        shopifySalesOrders: 3,
        inventoryLevels: 20,
        stockMovements: 0,
        shopifyLinkedLocations: 2,
        removableShopifyLocations: 1,
      },
      blockers: [],
    });

    const result = await promise;
    expect(result.currentShopDomain).toBe('store.myshopify.com');
    expect(result.counts.shopifyProducts).toBe(10);
  });

  it('purgeShopifyData invia payload conferma dominio', async () => {
    const body = {
      confirmShopDomain: 'store.myshopify.com',
      purgeCatalog: true,
      purgeCustomers: true,
      purgeOrders: true,
    };
    const promise = firstValueFrom(service.purgeShopifyData(body));

    const req = httpMock.expectOne(`${API_BASE}/shopify/shop-change/purge`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({
      purged: {
        products: 10,
        customers: 5,
        salesOrders: 3,
        stockMovements: 0,
        inventoryLevels: 20,
        inventoryCountLines: 0,
        locations: 2,
      },
    });

    const result = await promise;
    expect(result.purged.products).toBe(10);
  });
});
