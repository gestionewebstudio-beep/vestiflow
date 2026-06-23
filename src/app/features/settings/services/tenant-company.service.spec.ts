import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';

import { TenantCompanyService } from './tenant-company.service';

const API_BASE = 'http://localhost:3000/api/v1';

describe('TenantCompanyService (HTTP)', () => {
  let service: TenantCompanyService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TenantCompanyService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(TenantCompanyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getCompany mappa anagrafica tenant', async () => {
    const promise = firstValueFrom(service.getCompany());

    const req = httpMock.expectOne(`${API_BASE}/tenant/company`);
    expect(req.request.method).toBe('GET');
    req.flush({
      name: 'Boutique Demo',
      channelProfile: TenantChannelProfile.Shopify,
      storeName: 'Negozio Centro',
      profile: {
        legalName: 'Boutique Demo Srl',
        vatNumber: 'IT12345678901',
        fiscalCode: null,
        phone: '+39 081 0000000',
        pec: null,
        sdiCode: null,
        addressLine1: 'Via Roma 1',
        addressLine2: null,
        city: 'Napoli',
        province: 'NA',
        postalCode: '80100',
        countryCode: 'IT',
      },
    });

    const result = await promise;
    expect(result.name).toBe('Boutique Demo');
    expect(result.storeName).toBe('Negozio Centro');
    expect(result.channelProfile).toBe(TenantChannelProfile.Shopify);
    expect(result.profile.vatNumber).toBe('IT12345678901');
  });
});
