import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { StockMovementType } from '@core/models/stock-movement.model';

import { InventoryService } from './inventory.service';

const API_BASE = 'http://localhost:3000/api/v1';

describe('InventoryService (HTTP)', () => {
  let service: InventoryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InventoryService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: APP_CONFIG,
          useValue: {
            apiBaseUrl: API_BASE,
          },
        },
      ],
    });
    service = TestBed.inject(InventoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getLocations mappa le location dall API', async () => {
    const promise = firstValueFrom(service.getLocations());

    const req = httpMock.expectOne(`${API_BASE}/inventory/locations`);
    req.flush([
      {
        id: 'loc-1',
        tenantId: 'tenant-1',
        name: 'Negozio',
        isActive: true,
        shopifySyncStatus: 'not_connected',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const locations = await promise;
    expect(locations.length).toBe(1);
    expect(locations[0]?.name).toBe('Negozio');
  });

  it('registerMovement invia POST e mappa la risposta', async () => {
    const promise = firstValueFrom(
      service.registerMovement({
        type: StockMovementType.Load,
        variantId: 'var-1',
        sku: 'SKU-1',
        locationId: 'loc-1',
        quantity: 3,
        createdBy: 'user-1',
        createdByName: 'Test',
      }),
    );

    const req = httpMock.expectOne(`${API_BASE}/inventory/movements`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({
      type: StockMovementType.Load,
      variantId: 'var-1',
      locationId: 'loc-1',
      quantity: 3,
    });

    req.flush({
      id: 'mov-1',
      tenantId: 'tenant-1',
      type: StockMovementType.Load,
      variantId: 'var-1',
      sku: 'SKU-1',
      locationId: 'loc-1',
      quantity: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdByName: 'API',
    });

    const movement = await promise;
    expect(movement.id).toBe('mov-1');
    expect(movement.quantity).toBe(3);
  });

  it('registerRetailScan invia POST e mappa la risposta', async () => {
    const promise = firstValueFrom(
      service.registerRetailScan({
        code: '8001234567890',
        locationId: 'loc-1',
        action: 'sale',
      }),
    );

    const req = httpMock.expectOne(`${API_BASE}/inventory/retail-scans`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      code: '8001234567890',
      locationId: 'loc-1',
      action: 'sale',
    });

    req.flush({
      movement: { id: 'mov-sale' },
      variantId: 'var-1',
      productId: 'prod-1',
      sku: 'SKU-1',
      productName: 'Maglietta',
      remainingAvailable: 4,
    });

    const result = await promise;
    expect(result.movementId).toBe('mov-sale');
    expect(result.productName).toBe('Maglietta');
    expect(result.remainingAvailable).toBe(4);
  });

  it('registerRetailScan supporta storno', async () => {
    const promise = firstValueFrom(
      service.registerRetailScan({
        code: 'SKU-1',
        locationId: 'loc-1',
        action: 'return',
      }),
    );

    const req = httpMock.expectOne(`${API_BASE}/inventory/retail-scans`);
    expect(req.request.body).toMatchObject({ action: 'return' });
    req.flush({
      movement: { id: 'mov-return' },
      variantId: 'var-1',
      productId: 'prod-1',
      sku: 'SKU-1',
      productName: 'Maglietta',
      remainingAvailable: 6,
    });

    const result = await promise;
    expect(result.movementId).toBe('mov-return');
    expect(result.remainingAvailable).toBe(6);
  });

  it('getMovements mappa la lista paginata', async () => {
    const promise = firstValueFrom(service.getMovements());

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/movements`),
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [
        {
          id: 'mov-2',
          tenantId: 'tenant-1',
          type: StockMovementType.Unload,
          variantId: 'var-1',
          sku: 'SKU-1',
          locationId: 'loc-1',
          quantity: 2,
          createdAt: '2026-01-02T00:00:00.000Z',
          createdByName: 'Test User',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });

    const movements = await promise;
    expect(movements.data.length).toBe(1);
    expect(movements.data[0]?.type).toBe(StockMovementType.Unload);
    expect(movements.meta.total).toBe(1);
  });

  it('getMovements passa filtri server-side', async () => {
    const promise = firstValueFrom(
      service.getMovements({
        page: 2,
        pageSize: 10,
        locationId: 'loc-1',
        type: StockMovementType.Sale,
      }),
    );

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/movements`),
    );
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('10');
    expect(req.request.params.get('locationId')).toBe('loc-1');
    expect(req.request.params.get('type')).toBe(StockMovementType.Sale);
    req.flush({ items: [], total: 0, page: 2, pageSize: 10 });

    const response = await promise;
    expect(response.data).toEqual([]);
    expect(response.meta.page).toBe(2);
  });

  it('getLevels mappa le giacenze', async () => {
    const promise = firstValueFrom(service.getLevels());

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/levels`),
    );
    req.flush({
      items: [
        {
          id: 'lvl-1',
          tenantId: 'tenant-1',
          variantId: 'var-1',
          locationId: 'loc-1',
          onHand: 10,
          available: 8,
          committed: 1,
          incoming: 0,
          reserved: 1,
          minThreshold: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });

    const levels = await promise;
    expect(levels.data[0]?.available).toBe(8);
    expect(levels.meta.total).toBe(1);
  });

  it('getLevels passa filtri server-side', async () => {
    const promise = firstValueFrom(
      service.getLevels({ page: 1, pageSize: 20, locationId: 'loc-1', lowStockOnly: true }),
    );

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/levels`),
    );
    expect(req.request.params.get('locationId')).toBe('loc-1');
    expect(req.request.params.get('lowStockOnly')).toBe('true');
    req.flush({ items: [], total: 0, page: 1, pageSize: 20 });

    await promise;
  });

  it('updateLevelMinThreshold invia PATCH', async () => {
    const promise = firstValueFrom(service.updateLevelMinThreshold('lvl-1', 5));

    const req = httpMock.expectOne(`${API_BASE}/inventory/levels/lvl-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ minThreshold: 5 });
    req.flush({
      id: 'lvl-1',
      tenantId: 'tenant-1',
      variantId: 'var-1',
      locationId: 'loc-1',
      onHand: 10,
      available: 8,
      committed: 1,
      incoming: 0,
      reserved: 1,
      minThreshold: 5,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const level = await promise;
    expect(level.minThreshold).toBe(5);
  });

  it('getLocationById legge dalla cache delle location', async () => {
    const locations = firstValueFrom(service.getLocations());
    const listReq = httpMock.expectOne(`${API_BASE}/inventory/locations`);
    listReq.flush([
      {
        id: 'loc-1',
        tenantId: 'tenant-1',
        name: 'Negozio',
        isActive: true,
        shopifySyncStatus: 'not_connected',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    await locations;

    const location = await firstValueFrom(service.getLocationById('loc-1'));
    expect(location.name).toBe('Negozio');
  });
});
