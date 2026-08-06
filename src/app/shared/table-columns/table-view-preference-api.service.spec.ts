import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';

import type { TableViewState } from './table-column.model';
import { TableViewPreferenceApiService } from './table-view-preference-api.service';

const API_BASE = 'http://localhost:3000/api/v1';

const STATE: TableViewState = {
  presetId: 'custom',
  columnOrder: ['code', 'name', 'qty'],
  hiddenColumnIds: ['qty'],
  pinnedColumnIds: ['code'],
  columnWidths: { name: 220 },
};

describe('TableViewPreferenceApiService (HTTP)', () => {
  let service: TableViewPreferenceApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TableViewPreferenceApiService,
        ApiHttpClient,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(TableViewPreferenceApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('load legge la vista dal endpoint e ne fa il parse', async () => {
    const promise = firstValueFrom(service.load('products'));

    const req = httpMock.expectOne(`${API_BASE}/users/me/table-views/products`);
    expect(req.request.method).toBe('GET');
    req.flush({ stateJson: JSON.stringify(STATE) });

    expect(await promise).toEqual(STATE);
  });

  it('load risponde null quando il server non ha una preferenza salvata', async () => {
    const promise = firstValueFrom(service.load('products'));

    httpMock.expectOne(`${API_BASE}/users/me/table-views/products`).flush(null);

    expect(await promise).toBeNull();
  });

  it('load risponde null su stateJson corrotto', async () => {
    const promise = firstValueFrom(service.load('products'));

    httpMock
      .expectOne(`${API_BASE}/users/me/table-views/products`)
      .flush({ stateJson: '{non-json' });

    expect(await promise).toBeNull();
  });

  it('load risponde null su errore HTTP senza propagare', async () => {
    const promise = firstValueFrom(service.load('products'));

    httpMock
      .expectOne(`${API_BASE}/users/me/table-views/products`)
      .flush('boom', { status: 500, statusText: 'Server Error' });

    expect(await promise).toBeNull();
  });

  it('save invia PUT con lo stato serializzato', async () => {
    const promise = firstValueFrom(service.save('movements', STATE));

    const req = httpMock.expectOne(`${API_BASE}/users/me/table-views/movements`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ stateJson: JSON.stringify(STATE) });
    req.flush({ stateJson: JSON.stringify(STATE) });

    expect(await promise).toBeUndefined();
  });

  it('save inghiotte gli errori HTTP: la preferenza non blocca la UI', async () => {
    const promise = firstValueFrom(service.save('movements', STATE));

    httpMock
      .expectOne(`${API_BASE}/users/me/table-views/movements`)
      .flush('boom', { status: 500, statusText: 'Server Error' });

    expect(await promise).toBeUndefined();
  });
});
