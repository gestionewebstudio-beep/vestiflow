import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { withSilentHttpError } from '@core/http/http-context.util';
import { ObservabilityService } from '@core/services/observability.service';
import { ToastService } from '@core/services/toast.service';

import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let showError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    showError = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://localhost:3000/api/v1' } },
        { provide: ToastService, useValue: { showError } },
        { provide: ObservabilityService, useValue: { captureException: vi.fn() } },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('mostra un toast per errori server e rilancia AppError', async () => {
    const promise = firstValueFrom(http.get('/api/v1/products'));

    const req = httpMock.expectOne((request) => request.url.includes('/api/v1/products'));
    req.flush('fail', { status: 500, statusText: 'Server Error' });

    await expect(promise).rejects.toMatchObject({
      kind: 'server',
    });
    expect(showError).toHaveBeenCalled();
  });

  it('non mostra toast quando SILENT_HTTP_ERROR è attivo', async () => {
    const promise = firstValueFrom(http.get('/api/v1/products', withSilentHttpError()));

    const req = httpMock.expectOne((request) => request.url.includes('/api/v1/products'));
    req.flush('fail', { status: 500, statusText: 'Server Error' });

    await expect(promise).rejects.toMatchObject({ kind: 'server' });
    expect(showError).not.toHaveBeenCalled();
  });

  it('non mostra toast per errori 404 attesi', async () => {
    const promise = firstValueFrom(http.get('/api/v1/products/missing'));

    const req = httpMock.expectOne((request) => request.url.includes('/api/v1/products/missing'));
    req.flush('missing', { status: 404, statusText: 'Not Found' });

    await expect(promise).rejects.toMatchObject({
      kind: 'not_found',
    });
    expect(showError).not.toHaveBeenCalled();
  });
});
