import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';

import type { ShopifySetupDto } from '../models/shopify-setup.dto';
import { ShopifyConnectionRefreshService } from './shopify-connection-refresh.service';
import { ShopifySetupService } from './shopify-setup.service';

const API_BASE = 'http://localhost:3000/api/v1';

const STATO: ShopifySetupDto = {
  presente: true,
  status: 'sedi',
  direction: 'shopify_to_vestiflow',
  locations: [],
  sediVestiFlow: [],
  anteprima: null,
  esito: null,
  confirmedAt: null,
  activatedAt: null,
  blocchiAttivazione: [],
  irrisolti: [],
  trasferimentoInCorso: false,
  situazione: { calcolataAt: '2026-09-13T01:00:00.000Z', problemi: [] },
};

describe('ShopifySetupService (HTTP) — un endpoint per fase', () => {
  let service: ShopifySetupService;
  let httpMock: HttpTestingController;
  const refresh = { notifyInvalidated: vi.fn() };

  beforeEach(() => {
    refresh.notifyInvalidated.mockClear();
    TestBed.configureTestingModule({
      providers: [
        ShopifySetupService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
        { provide: ShopifyConnectionRefreshService, useValue: refresh },
      ],
    });
    service = TestBed.inject(ShopifySetupService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('stato: GET shopify/setup', async () => {
    const promise = firstValueFrom(service.stato());
    const req = httpMock.expectOne(`${API_BASE}/shopify/setup`);
    expect(req.request.method).toBe('GET');
    req.flush(STATO);
    await expect(promise).resolves.toEqual(STATO);
  });

  it('scegliDirezione: PUT setup/direction col corpo atteso', async () => {
    const promise = firstValueFrom(service.scegliDirezione('vestiflow_to_shopify'));
    const req = httpMock.expectOne(`${API_BASE}/shopify/setup/direction`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ direction: 'vestiflow_to_shopify' });
    req.flush(STATO);
    await promise;
  });

  it('scegliSede: PUT setup/locations/:id con la scelta, e la connessione in cache si invalida', async () => {
    const promise = firstValueFrom(
      service.scegliSede('11', { choice: 'collega', locationId: 'loc-1' }),
    );
    const req = httpMock.expectOne(`${API_BASE}/shopify/setup/locations/11`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ choice: 'collega', locationId: 'loc-1' });
    req.flush(STATO);
    await promise;
    expect(refresh.notifyInvalidated).toHaveBeenCalledTimes(1);
  });

  it('anteprima, conferma, indietro, attiva: i quattro POST', async () => {
    const p1 = firstValueFrom(service.anteprima());
    httpMock.expectOne(`${API_BASE}/shopify/setup/preview`).flush(STATO);
    await p1;

    const p2 = firstValueFrom(service.conferma());
    httpMock.expectOne(`${API_BASE}/shopify/setup/confirm`).flush(STATO);
    await p2;

    const p3 = firstValueFrom(service.tornaA('scelte'));
    const back = httpMock.expectOne(`${API_BASE}/shopify/setup/back`);
    expect(back.request.body).toEqual({ fase: 'scelte' });
    back.flush(STATO);
    await p3;

    const p4 = firstValueFrom(service.attiva());
    httpMock.expectOne(`${API_BASE}/shopify/setup/activate`).flush(STATO);
    await p4;
    expect(refresh.notifyInvalidated).toHaveBeenCalledTimes(1);
  });
});
