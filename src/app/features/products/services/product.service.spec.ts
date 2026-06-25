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

  it('checkSkuAvailability con lista vuota ritorna available true', async () => {
    const result = await firstValueFrom(service.checkSkuAvailability([]));
    expect(result).toEqual({ available: true, taken: [] });
  });

  it('checkBarcodeAvailability aggrega barcode non disponibili', async () => {
    const promise = firstValueFrom(
      service.checkBarcodeAvailability(['8001111111111', '8002222222222']),
    );

    const requests = httpMock.match((req) => req.url.includes('/products/barcode-availability'));
    expect(requests.length).toBe(2);
    requests[0]!.flush({ barcode: '8001111111111', available: true });
    requests[1]!.flush({ barcode: '8002222222222', available: false });

    const result = await promise;
    expect(result.available).toBe(false);
    expect(result.taken).toEqual(['8002222222222']);
  });

  it('checkBarcodeAvailability con lista vuota ritorna available true', async () => {
    const result = await firstValueFrom(service.checkBarcodeAvailability([]));
    expect(result).toEqual({ available: true, taken: [] });
  });

  it('getProductById mappa il prodotto', async () => {
    const promise = firstValueFrom(service.getProductById('prod-1'));

    const req = httpMock.expectOne(`${API_BASE}/products/prod-1`);
    req.flush({
      id: 'prod-1',
      tenantId: 'tenant-1',
      name: 'Giacca',
      status: ProductStatus.Active,
      options: [],
      shopifySyncStatus: 'not_connected',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      variants: [],
    });

    const product = await promise;
    expect(product.name).toBe('Giacca');
  });

  it('findVariantByCode interroga endpoint dedicato', async () => {
    const promise = firstValueFrom(service.findVariantByCode('SKU-XYZ'));

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/products/variants/by-code`),
    );
    expect(req.request.params.get('code')).toBe('SKU-XYZ');
    req.flush({
      variantId: 'var-1',
      productId: 'prod-1',
      sku: 'SKU-XYZ',
      barcode: null,
      productName: 'Prodotto',
    });

    const result = await promise;
    expect(result.sku).toBe('SKU-XYZ');
  });

  it('getFilterOptions interroga /products/facets e riusa la cache', async () => {
    const firstPromise = firstValueFrom(service.getFilterOptions());
    const secondPromise = firstValueFrom(service.getFilterOptions());

    const req = httpMock.expectOne(`${API_BASE}/products/facets`);
    req.flush({
      categories: ['Maglieria'],
      brands: ['Brand A'],
      seasons: ['SS26'],
    });

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.categories).toContain('Maglieria');
    expect(second.brands).toContain('Brand A');
  });

  it('searchVariantSummaries interroga endpoint paginato dedicato', async () => {
    const promise = firstValueFrom(
      service.searchVariantSummaries({ search: 'magli', pageSize: 10 }),
    );

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/products/variants/summaries`),
    );
    expect(req.request.params.get('search')).toBe('magli');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({
      items: [
        {
          variantId: 'var-1',
          productId: 'prod-1',
          sku: 'SKU-M',
          productName: 'Maglietta',
          title: 'Maglietta — M',
          sellingPrice: { amountMinor: 2990, currencyCode: 'EUR' },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });

    const result = await promise;
    expect(result.length).toBe(1);
    expect(result[0]?.sku).toBe('SKU-M');
  });
});
