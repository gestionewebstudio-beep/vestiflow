import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';

import { SupplierOrderService } from './supplier-order.service';

const API_BASE = 'http://localhost:3000/api/v1';

describe('SupplierOrderService (HTTP)', () => {
  let service: SupplierOrderService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SupplierOrderService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: APP_CONFIG,
          useValue: { apiBaseUrl: API_BASE },
        },
      ],
    });
    service = TestBed.inject(SupplierOrderService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getSupplierOrders mappa righe paginate', async () => {
    const promise = firstValueFrom(service.getSupplierOrders({ page: 1, pageSize: 10 }));

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/supplier-orders`),
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [
        {
          id: 'ord-1',
          tenantId: 'tenant-1',
          reference: 'PO-001',
          supplierId: 'sup-1',
          supplierName: 'Fornitore',
          destinationLocationId: 'loc-1',
          status: SupplierOrderStatus.Draft,
          currency: 'EUR',
          totalMinor: 1000,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          lines: [],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });

    const result = await promise;
    expect(result.data[0]?.reference).toBe('PO-001');
    expect(result.data[0]?.totalAmount.amountMinor).toBe(1000);
    expect(result.meta.total).toBe(1);
  });

  it('receiveOrder invia POST con righe ricevute', async () => {
    const promise = firstValueFrom(
      service.receiveOrder('ord-1', [{ lineId: 'line-1', quantity: 5 }]),
    );

    const req = httpMock.expectOne(`${API_BASE}/supplier-orders/ord-1/receive`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ lines: [{ lineId: 'line-1', quantity: 5 }] });
    req.flush({
      id: 'ord-1',
      tenantId: 'tenant-1',
      reference: 'PO-001',
      supplierId: 'sup-1',
      supplierName: 'Fornitore',
      destinationLocationId: 'loc-1',
      status: SupplierOrderStatus.PartiallyReceived,
      currency: 'EUR',
      totalMinor: 1000,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      lines: [
        {
          id: 'line-1',
          orderId: 'ord-1',
          variantId: 'var-1',
          sku: 'SKU-1',
          orderedQuantity: 10,
          receivedQuantity: 5,
          unitCostMinor: 100,
        },
      ],
    });

    const result = await promise;
    expect(result.status).toBe(SupplierOrderStatus.PartiallyReceived);
    expect(result.lines[0]?.receivedQuantity).toBe(5);
  });

  it('deleteOrder invia DELETE', async () => {
    const promise = firstValueFrom(service.deleteOrder('ord-1'));

    const req = httpMock.expectOne(`${API_BASE}/supplier-orders/ord-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    await expect(promise).resolves.toBeNull();
  });
});
