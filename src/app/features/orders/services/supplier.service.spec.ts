import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';

import { SupplierService } from './supplier.service';

const API_BASE = 'http://localhost:3000/api/v1';

describe('SupplierService (HTTP)', () => {
  let service: SupplierService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SupplierService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(SupplierService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getSuppliers restituisce lista fornitori', async () => {
    const promise = firstValueFrom(service.getSuppliers());

    const req = httpMock.expectOne(`${API_BASE}/suppliers`);
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        id: 'sup-1',
        tenantId: 'tenant-1',
        name: 'Fornitore ABC',
        email: 'ordini@abc.it',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const suppliers = await promise;
    expect(suppliers[0]?.name).toBe('Fornitore ABC');
  });

  it('createSupplier invia POST con payload', async () => {
    const input = { name: 'Nuovo Fornitore', email: 'info@nuovo.it' };
    const promise = firstValueFrom(service.createSupplier(input));

    const req = httpMock.expectOne(`${API_BASE}/suppliers`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    req.flush({
      id: 'sup-2',
      tenantId: 'tenant-1',
      ...input,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    const created = await promise;
    expect(created.id).toBe('sup-2');
  });
});
