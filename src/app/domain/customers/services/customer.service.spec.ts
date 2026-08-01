import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';

import { CustomerService } from './customer.service';

const API_BASE = 'http://localhost:3000/api/v1';

describe('CustomerService (HTTP)', () => {
  let service: CustomerService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CustomerService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(CustomerService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getCustomers mappa risposta paginata', async () => {
    const promise = firstValueFrom(
      service.getCustomers({ page: 1, pageSize: 10, search: 'mario' }),
    );

    const req = httpMock.expectOne((r) => r.url.startsWith(`${API_BASE}/customers`));
    expect(req.request.params.get('search')).toBe('mario');
    req.flush({
      items: [
        {
          id: 'cust-1',
          tenantId: 'tenant-1',
          firstName: 'Mario',
          lastName: 'Rossi',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });

    const result = await promise;
    expect(result.data[0]?.firstName).toBe('Mario');
    expect(result.meta.total).toBe(1);
  });

  it('getCustomerById mappa singolo cliente', async () => {
    const promise = firstValueFrom(service.getCustomerById('cust-1'));

    const req = httpMock.expectOne(`${API_BASE}/customers/cust-1`);
    req.flush({
      id: 'cust-1',
      tenantId: 'tenant-1',
      firstName: 'Luigi',
      lastName: 'Verdi',
      email: 'luigi@test.it',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const customer = await promise;
    expect(customer.email).toBe('luigi@test.it');
  });

  it('exportCustomersCsv richiede blob', async () => {
    const promise = firstValueFrom(service.exportCustomersCsv({ search: 'rossi' }));

    const req = httpMock.expectOne((r) => r.url.includes('/customers/export/csv'));
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['id,email'], { type: 'text/csv' }));

    const blob = await promise;
    expect(blob.type).toContain('text/csv');
  });
});
