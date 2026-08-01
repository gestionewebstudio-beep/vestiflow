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
          status: SupplierOrderStatus.Confirmed,
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

  it('getMeta espone anteprima numerazione', async () => {
    const promise = firstValueFrom(service.getMeta());

    const req = httpMock.expectOne(`${API_BASE}/supplier-orders/meta`);
    expect(req.request.method).toBe('GET');
    req.flush({ nextReferencePreview: 'OF-2026-0042' });

    await expect(promise).resolves.toEqual({ nextReferencePreview: 'OF-2026-0042' });
  });

  it('exportPdf richiede il blob PDF', async () => {
    const promise = firstValueFrom(service.exportPdf('ord-1'));

    const req = httpMock.expectOne(`${API_BASE}/supplier-orders/ord-1/export/pdf`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['%PDF-test'], { type: 'application/pdf' }));

    const blob = await promise;
    expect(blob.type).toBe('application/pdf');
  });

  it('deleteOrder invia DELETE', async () => {
    const promise = firstValueFrom(service.deleteOrder('ord-1'));

    const req = httpMock.expectOne(`${API_BASE}/supplier-orders/ord-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    await expect(promise).resolves.toBeNull();
  });
});
