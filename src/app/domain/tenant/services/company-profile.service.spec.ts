import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';

import { CompanyProfileService } from './company-profile.service';

const API_BASE = 'http://localhost:3000/api/v1';
const URL = `${API_BASE}/tenant/company-profile`;

const EMPTY_DTO = {
  legalName: null,
  vatNumber: null,
  fiscalCode: null,
  phone: null,
  pec: null,
  sdiCode: null,
  iban: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  province: null,
  postalCode: null,
  countryCode: null,
};

describe('CompanyProfileService (HTTP)', () => {
  let service: CompanyProfileService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CompanyProfileService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(CompanyProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('get mappa profilo e precompilazione', async () => {
    const promise = firstValueFrom(service.get());

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush({
      profile: { ...EMPTY_DTO, legalName: '  Boutique Demo Srl  ', vatNumber: '12345678901' },
      activationDefaults: { ...EMPTY_DTO, legalName: 'Cliente VestiFlow Srl' },
    });

    const result = await promise;
    expect(result.profile?.legalName).toBe('Boutique Demo Srl');
    expect(result.activationDefaults.legalName).toBe('Cliente VestiFlow Srl');
  });

  it('profilo mai compilato resta null (non un oggetto vuoto)', async () => {
    const promise = firstValueFrom(service.get());

    httpMock.expectOne(URL).flush({ profile: null, activationDefaults: EMPTY_DTO });

    await expect(promise.then((r) => r.profile)).resolves.toBeNull();
  });

  it('update invia una PATCH col payload ricevuto', async () => {
    const promise = firstValueFrom(service.update({ legalName: 'Boutique Demo Srl' }));

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ legalName: 'Boutique Demo Srl' });
    req.flush({
      profile: { ...EMPTY_DTO, legalName: 'Boutique Demo Srl' },
      activationDefaults: EMPTY_DTO,
    });

    await expect(promise.then((r) => r.profile?.legalName)).resolves.toBe('Boutique Demo Srl');
  });
});
