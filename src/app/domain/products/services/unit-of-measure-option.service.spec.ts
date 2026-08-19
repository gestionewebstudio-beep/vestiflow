import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';

import { UnitOfMeasureOptionService } from './unit-of-measure-option.service';

const API_BASE = 'http://localhost:3000/api/v1';
const ENDPOINT = `${API_BASE}/unit-of-measure-options`;

interface ApiRow {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly isSystem: boolean;
  readonly isActive: boolean;
}

const ROW_PZ: ApiRow = { id: 'um-1', name: 'pz', sortOrder: 1, isSystem: true, isActive: true };
const ROW_KG: ApiRow = { id: 'um-2', name: 'kg', sortOrder: 2, isSystem: false, isActive: false };

describe('UnitOfMeasureOptionService (HTTP)', () => {
  let service: UnitOfMeasureOptionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        UnitOfMeasureOptionService,
        ApiHttpClient,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(UnitOfMeasureOptionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('chiamate al server', () => {
    it('list legge le unità dal proprio endpoint e ne mappa i campi', async () => {
      const promise = firstValueFrom(service.list());

      const req = httpMock.expectOne(ENDPOINT);
      expect(req.request.method).toBe('GET');
      req.flush([ROW_PZ, ROW_KG]);

      expect(await promise).toEqual([
        { id: 'um-1', name: 'pz', sortOrder: 1, isSystem: true, isActive: true },
        { id: 'um-2', name: 'kg', sortOrder: 2, isSystem: false, isActive: false },
      ]);
    });

    it('list non trascina nel modello i campi che il server aggiunge', async () => {
      const promise = firstValueFrom(service.list());

      httpMock
        .expectOne(ENDPOINT)
        .flush([{ ...ROW_PZ, tenantId: 'tenant-1', createdAt: '2026-08-19T00:00:00.000Z' }]);

      expect(await promise).toEqual([
        { id: 'um-1', name: 'pz', sortOrder: 1, isSystem: true, isActive: true },
      ]);
    });

    it('list restituisce un elenco vuoto quando il tenant non ha voci', async () => {
      const promise = firstValueFrom(service.list());

      httpMock.expectOne(ENDPOINT).flush([]);

      expect(await promise).toEqual([]);
    });

    it('list propaga l errore HTTP: chi chiama decide cosa mostrare', async () => {
      const promise = firstValueFrom(service.list());

      httpMock.expectOne(ENDPOINT).flush('boom', { status: 500, statusText: 'Server Error' });

      await expect(promise).rejects.toBeTruthy();
    });

    it('create invia POST con il solo nome e mappa la voce creata', async () => {
      const promise = firstValueFrom(service.create('conf'));

      const req = httpMock.expectOne(ENDPOINT);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'conf' });
      req.flush({ id: 'um-3', name: 'conf', sortOrder: 3, isSystem: false, isActive: true });

      expect(await promise).toEqual({
        id: 'um-3',
        name: 'conf',
        sortOrder: 3,
        isSystem: false,
        isActive: true,
      });
    });

    it('update invia PATCH sull id con il corpo ricevuto', async () => {
      const promise = firstValueFrom(service.update('um-2', { name: 'Kg', isActive: true }));

      const req = httpMock.expectOne(`${ENDPOINT}/um-2`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ name: 'Kg', isActive: true });
      req.flush({ ...ROW_KG, name: 'Kg', isActive: true });

      expect(await promise).toEqual({
        id: 'um-2',
        name: 'Kg',
        sortOrder: 2,
        isSystem: false,
        isActive: true,
      });
    });

    it('update accetta un corpo parziale, anche col solo ordinamento', async () => {
      const promise = firstValueFrom(service.update('um-1', { sortOrder: 9 }));

      const req = httpMock.expectOne(`${ENDPOINT}/um-1`);
      expect(req.request.body).toEqual({ sortOrder: 9 });
      req.flush({ ...ROW_PZ, sortOrder: 9 });

      expect((await promise).sortOrder).toBe(9);
    });

    it('delete invia DELETE sull id e non restituisce corpo', async () => {
      const promise = firstValueFrom(service.delete('um-2'));

      const req = httpMock.expectOne(`${ENDPOINT}/um-2`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);

      expect(await promise).toBeNull();
    });
  });

  describe('elenco condiviso fra le celle U.M.', () => {
    it('options innesca il caricamento e pubblica l elenco nel segnale', () => {
      const options = service.options();
      expect(options()).toEqual([]);

      httpMock.expectOne(ENDPOINT).flush([ROW_PZ, ROW_KG]);

      expect(options().map((option) => option.name)).toEqual(['pz', 'kg']);
    });

    it('trenta celle che chiedono l elenco insieme fanno UNA sola chiamata', () => {
      for (let i = 0; i < 30; i += 1) {
        service.options();
      }

      httpMock.expectOne(ENDPOINT).flush([ROW_PZ]);
    });

    it('a elenco già caricato ensureLoaded non richiama il server', () => {
      service.ensureLoaded();
      httpMock.expectOne(ENDPOINT).flush([ROW_PZ]);

      service.ensureLoaded();
      service.options();

      httpMock.expectNone(ENDPOINT);
    });

    it('un elenco vuoto non conta come caricato: la richiesta dopo riprova', () => {
      service.ensureLoaded();
      httpMock.expectOne(ENDPOINT).flush([]);

      service.ensureLoaded();

      httpMock.expectOne(ENDPOINT).flush([ROW_PZ]);
      expect(
        service
          .options()()
          .map((option) => option.name),
      ).toEqual(['pz']);
    });

    it('l errore lascia l elenco vuoto senza propagare, e il tentativo dopo riprova', () => {
      service.ensureLoaded();
      httpMock.expectOne(ENDPOINT).flush('boom', { status: 500, statusText: 'Server Error' });

      expect(service.options()()).toEqual([]);

      httpMock.expectOne(ENDPOINT).flush([ROW_KG]);
      expect(
        service
          .options()()
          .map((option) => option.name),
      ).toEqual(['kg']);
    });

    it('reload sostituisce l elenco già in cache dopo una modifica dal pannello', () => {
      const options = service.options();
      httpMock.expectOne(ENDPOINT).flush([ROW_PZ]);
      expect(options()).toHaveLength(1);

      service.reload();
      httpMock.expectOne(ENDPOINT).flush([ROW_PZ, ROW_KG]);

      expect(options().map((option) => option.name)).toEqual(['pz', 'kg']);
    });
  });
});
