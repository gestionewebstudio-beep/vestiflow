import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LoadingService } from './loading.service';

describe('LoadingService', () => {
  it('isLoading segue il contatore richieste attive', () => {
    TestBed.configureTestingModule({ providers: [LoadingService] });
    const service = TestBed.inject(LoadingService);

    expect(service.isLoading()).toBe(false);
    expect(service.activeRequests()).toBe(0);

    service.start();
    service.start();
    expect(service.isLoading()).toBe(true);
    expect(service.activeRequests()).toBe(2);

    service.stop();
    expect(service.isLoading()).toBe(true);
    expect(service.activeRequests()).toBe(1);

    service.stop();
    expect(service.isLoading()).toBe(false);
  });

  it('stop non scende sotto zero', () => {
    TestBed.configureTestingModule({ providers: [LoadingService] });
    const service = TestBed.inject(LoadingService);

    service.stop();
    service.stop();
    expect(service.activeRequests()).toBe(0);
    expect(service.isLoading()).toBe(false);
  });
});
