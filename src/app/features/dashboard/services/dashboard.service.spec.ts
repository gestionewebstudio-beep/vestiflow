import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';

import { DashboardService } from './dashboard.service';

const API_BASE = 'http://localhost:3000/api/v1';

describe('DashboardService (HTTP)', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DashboardService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getSummary chiama GET /dashboard/summary', async () => {
    const promise = firstValueFrom(service.getSummary());

    const req = httpMock.expectOne(`${API_BASE}/dashboard/summary`);
    expect(req.request.method).toBe('GET');
    req.flush({
      productCount: 42,
      incomingSupplierOrders: 3,
      levels: [
        {
          variantId: 'var-1',
          locationId: 'loc-1',
          sku: 'SKU-1',
          title: 'Maglietta M',
          available: 2,
          minThreshold: 5,
          locationName: 'Magazzino',
        },
      ],
      locations: [{ id: 'loc-1', name: 'Magazzino' }],
    });

    const summary = await promise;
    expect(summary.productCount).toBe(42);
    expect(summary.levels[0]?.sku).toBe('SKU-1');
  });
});
