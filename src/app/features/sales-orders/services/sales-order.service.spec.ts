import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';

import { SalesOrderService } from './sales-order.service';

const API_BASE = 'http://localhost:3000/api/v1';

describe('SalesOrderService (HTTP)', () => {
  let service: SalesOrderService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SalesOrderService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(SalesOrderService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getSalesOrders applica filtri query', async () => {
    const promise = firstValueFrom(
      service.getSalesOrders({
        page: 1,
        pageSize: 20,
        financialStatus: 'paid',
        source: 'online',
      }),
    );

    const req = httpMock.expectOne((r) => r.url.startsWith(`${API_BASE}/sales-orders`));
    expect(req.request.params.get('financialStatus')).toBe('paid');
    expect(req.request.params.get('source')).toBe('online');
    req.flush({
      items: [
        {
          id: 'ord-1',
          tenantId: 'tenant-1',
          orderNumber: '#1001',
          source: 'shopify_online',
          financialStatus: 'paid',
          fulfillmentStatus: 'fulfilled',
          customerName: 'Cliente',
          currency: 'EUR',
          subtotalMinor: 5000,
          totalMinor: 5000,
          placedAt: '2026-06-01T00:00:00.000Z',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const result = await promise;
    expect(result.data[0]?.orderNumber).toBe('#1001');
  });

  it('getSalesOrderById mappa dettaglio ordine', async () => {
    const promise = firstValueFrom(service.getSalesOrderById('ord-1'));

    const req = httpMock.expectOne(`${API_BASE}/sales-orders/ord-1`);
    req.flush({
      id: 'ord-1',
      tenantId: 'tenant-1',
      orderNumber: '#1002',
      source: 'shopify_pos',
      financialStatus: 'pending',
      fulfillmentStatus: 'unfulfilled',
      customerName: 'Mario',
      currency: 'EUR',
      subtotalMinor: 1000,
      totalMinor: 1000,
      placedAt: '2026-06-02T00:00:00.000Z',
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
      lines: [],
    });

    const order = await promise;
    expect(order.total.amountMinor).toBe(1000);
  });

  it('exportSalesOrdersCsv richiede blob CSV', async () => {
    const promise = firstValueFrom(service.exportSalesOrdersCsv({ financialStatus: 'paid' }));

    const req = httpMock.expectOne((r) => r.url.includes('/sales-orders/export/csv'));
    req.flush(new Blob(['csv'], { type: 'text/csv' }));

    await expect(promise).resolves.toBeInstanceOf(Blob);
  });
});
