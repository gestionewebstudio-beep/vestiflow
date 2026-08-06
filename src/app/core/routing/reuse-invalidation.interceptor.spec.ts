import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reuseInvalidationInterceptor } from './reuse-invalidation.interceptor';
import { TabRouteReuseStrategy } from './tab-route-reuse.strategy';

describe('reuseInvalidationInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let invalidate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invalidate = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: TabRouteReuseStrategy, useValue: { invalidate } },
        provideHttpClient(withInterceptors([reuseInvalidationInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  it('una GET non tocca la cache di reuse', () => {
    http.get('/api/products').subscribe();
    controller.expectOne('/api/products').flush([]);

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('una scrittura (POST) invalida la cache di reuse', () => {
    http.post('/api/products', {}).subscribe();
    controller.expectOne('/api/products').flush({});

    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
