import { HttpParams, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SILENT_HTTP_ERROR } from './http-context.util';
import { ApiHttpClient } from './api-http.client';

describe('ApiHttpClient', () => {
  let client: ApiHttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    client = TestBed.inject(ApiHttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('imposta SILENT_HTTP_ERROR nel context di ogni richiesta GET', async () => {
    const promise = firstValueFrom(client.get<{ ok: boolean }>('/api/test'));

    const req = httpMock.expectOne('/api/test');
    expect(req.request.context.get(SILENT_HTTP_ERROR)).toBe(true);
    req.flush({ ok: true });

    await expect(promise).resolves.toEqual({ ok: true });
  });

  it('supporta export blob con params', async () => {
    const params = new HttpParams().set('page', '1');
    const promise = firstValueFrom(client.get('/api/export.csv', { params, responseType: 'blob' }));

    const req = httpMock.expectOne(
      (r) => r.url === '/api/export.csv' && r.params.get('page') === '1',
    );
    expect(req.request.responseType).toBe('blob');
    expect(req.request.context.get(SILENT_HTTP_ERROR)).toBe(true);
    req.flush(new Blob(['a,b']));

    const blob = await promise;
    expect(blob).toBeInstanceOf(Blob);
  });

  it('imposta SILENT_HTTP_ERROR anche sulle mutazioni POST', async () => {
    const promise = firstValueFrom(client.post<{ id: string }>('/api/items', { name: 'Test' }));

    const req = httpMock.expectOne('/api/items');
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SILENT_HTTP_ERROR)).toBe(true);
    req.flush({ id: '1' });

    await expect(promise).resolves.toEqual({ id: '1' });
  });
});
