import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';

import { CashApiService } from './cash-api.service';

describe('CashApiService — contratto checkout HTTP', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: '/api/v1' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('traduce totaleMinor e restoMinor del server senza ricavare importi dal carrello', async () => {
    const payload = {
      locationId: 'location',
      sessionId: 'session',
      creationIntentId: 'intent',
      lines: [],
      payments: [],
    };
    const result = firstValueFrom(TestBed.inject(CashApiService).checkout(payload));
    const request = http.expectOne('/api/v1/cash-sessions/checkout');
    expect(request.request.body).toEqual(payload);
    request.flush({ documentId: 'sale', reference: 'VN-0001', totaleMinor: 3656, restoMinor: 344 });
    await expect(result).resolves.toEqual({
      documentId: 'sale',
      reference: 'VN-0001',
      totalMinor: 3656,
      changeMinor: 344,
    });
  });
});
