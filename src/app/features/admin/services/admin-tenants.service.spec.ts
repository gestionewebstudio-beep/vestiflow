import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';

import { AdminTenantsService } from './admin-tenants.service';
import type { CreateTenantPayload } from '../models/admin-tenant.model';

const API_BASE = 'http://localhost:3000/api/v1';

describe('AdminTenantsService (HTTP)', () => {
  let service: AdminTenantsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AdminTenantsService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(AdminTenantsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('listTenants chiama GET /admin/tenants', async () => {
    const promise = firstValueFrom(service.listTenants());

    const req = httpMock.expectOne(`${API_BASE}/admin/tenants`);
    req.flush([
      {
        id: 'tenant-1',
        name: 'Negozio Demo',
        channelProfile: TenantChannelProfile.Shopify,
        createdAt: '2026-01-01T00:00:00.000Z',
        ownerEmail: 'owner@test.it',
        ownerDisplayName: 'Titolare',
        vatNumber: null,
      },
    ]);

    const tenants = await promise;
    expect(tenants[0]?.name).toBe('Negozio Demo');
  });

  it('createTenant invia POST e restituisce tenant provisionato', async () => {
    const payload = {
      tenantName: 'Nuovo Cliente',
      channelProfile: TenantChannelProfile.Gestionale,
      ownerEmail: 'owner@test.it',
      ownerDisplayName: 'Titolare',
      ownerPassword: 'Password123!',
    };
    const promise = firstValueFrom(service.createTenant(payload));

    const req = httpMock.expectOne(`${API_BASE}/admin/tenants`);
    expect(req.request.method).toBe('POST');
    expect((req.request.body as CreateTenantPayload).ownerPassword).toBe('Password123!');
    req.flush({
      tenantId: 'tenant-2',
      tenantName: 'Nuovo Cliente',
      channelProfile: TenantChannelProfile.Gestionale,
      ownerUserId: 'user-1',
      ownerEmail: 'owner@test.it',
      ownerDisplayName: 'Titolare',
      role: 'owner',
      storeId: 'store-1',
      storeName: 'Negozio',
      locationId: 'loc-1',
      locationName: 'Magazzino',
      ownerInviteSent: false,
    });

    const result = await promise;
    expect(result.tenantId).toBe('tenant-2');
  });

  it('deleteTenant invia DELETE', async () => {
    const promise = firstValueFrom(service.deleteTenant('tenant-1'));

    const req = httpMock.expectOne(`${API_BASE}/admin/tenants/tenant-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    await promise;
  });

  it('resendOwnerInvite invia POST al endpoint dedicato', async () => {
    const promise = firstValueFrom(service.resendOwnerInvite('tenant-2'));

    const req = httpMock.expectOne(`${API_BASE}/admin/tenants/tenant-2/resend-owner-invite`);
    expect(req.request.method).toBe('POST');
    req.flush({ ownerEmail: 'owner@test.it' });

    const result = await promise;
    expect(result.ownerEmail).toBe('owner@test.it');
  });
});
