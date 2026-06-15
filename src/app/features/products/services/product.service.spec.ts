import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ProductStatus } from '@core/models/product.model';

import { ProductService } from './product.service';

const API_BASE = 'http://localhost:3000/api/v1';

describe('ProductService (HTTP)', () => {
  let service: ProductService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProductService,
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
    service = TestBed.inject(ProductService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getProducts mappa la risposta paginata dell API', async () => {
    const promise = firstValueFrom(
      service.getProducts({ page: 1, pageSize: 10, sort: 'name', order: 'asc' }),
    );

    const req = httpMock.expectOne((request) => request.url.startsWith(`${API_BASE}/products`));
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [
        {
          id: 'prod-1',
          tenantId: 'tenant-1',
          name: 'Maglietta',
          status: ProductStatus.Active,
          options: [],
          shopifySyncStatus: 'not_connected',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          variants: [],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });

    const result = await promise;
    expect(result.data.length).toBe(1);
    expect(result.data[0]?.name).toBe('Maglietta');
    expect(result.meta.total).toBe(1);
  });

  it('checkSkuAvailability aggrega SKU non disponibili', async () => {
    const promise = firstValueFrom(service.checkSkuAvailability(['SKU-OK', 'SKU-BAD']));

    const requests = httpMock.match((req) => req.url.includes('/products/sku-availability'));
    expect(requests.length).toBe(2);
    requests[0]!.flush({ sku: 'SKU-OK', available: true });
    requests[1]!.flush({ sku: 'SKU-BAD', available: false });

    const result = await promise;
    expect(result.available).toBe(false);
    expect(result.taken).toEqual(['SKU-BAD']);
  });
});
