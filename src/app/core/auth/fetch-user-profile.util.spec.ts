import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { UserRole } from '@core/models/user.model';

import {
  fetchUserProfile,
  mapUserProfileFromApi,
  type UserProfileApi,
} from './fetch-user-profile.util';

const API_BASE = 'http://localhost:3000/api/v1';

describe('fetch-user-profile.util', () => {
  describe('mapUserProfileFromApi', () => {
    it('usa Shopify come default per tenantChannelProfile', () => {
      const row: UserProfileApi = {
        id: 'user-1',
        tenantId: 'tenant-1',
        email: 'admin@negozio.it',
        displayName: 'Admin Negozio',
        role: UserRole.Admin,
        storeIds: ['store-1'],
        isActive: true,
        isPlatformAdmin: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      const user = mapUserProfileFromApi(row);
      expect(user.tenantChannelProfile).toBe(TenantChannelProfile.Shopify);
      expect(user.role).toBe(UserRole.Admin);
    });

    it('preserva tenantChannelProfile esplicito', () => {
      const row: UserProfileApi = {
        id: 'user-2',
        tenantId: 'tenant-2',
        email: 'owner@gestionale.it',
        displayName: 'Titolare',
        role: UserRole.Owner,
        storeIds: [],
        isActive: true,
        isPlatformAdmin: false,
        tenantChannelProfile: TenantChannelProfile.Gestionale,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      const user = mapUserProfileFromApi(row);
      expect(user.tenantChannelProfile).toBe(TenantChannelProfile.Gestionale);
      expect(user.avatarUrl).toBeNull();
    });

    it('preserva supportSession dal profilo API', () => {
      const supportSession = {
        sessionId: 'session-1',
        targetTenantId: 'tenant-client',
        targetTenantName: 'Cliente Demo',
        expiresAt: '2026-06-24T16:00:00.000Z',
      };
      const row: UserProfileApi = {
        id: 'op-1',
        tenantId: 'tenant-client',
        email: 'admin@vestiflow.it',
        displayName: 'Operatore',
        role: UserRole.Owner,
        storeIds: [],
        isActive: true,
        isPlatformAdmin: true,
        supportSession,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      const user = mapUserProfileFromApi(row);
      expect(user.supportSession).toEqual(supportSession);
      expect(user.tenantId).toBe('tenant-client');
    });
  });

  describe('fetchUserProfile', () => {
    let http: HttpClient;
    let httpMock: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      http = TestBed.inject(HttpClient);
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
      httpMock.verify();
    });

    it('chiama GET /auth/me con Bearer token', async () => {
      const promise = firstValueFrom(fetchUserProfile(http, API_BASE, 'token-abc'));

      const req = httpMock.expectOne(`${API_BASE}/auth/me`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer token-abc');
      req.flush({
        id: 'user-1',
        tenantId: 'tenant-1',
        email: 'admin@negozio.it',
        displayName: 'Admin',
        role: UserRole.Admin,
        storeIds: [],
        isActive: true,
        isPlatformAdmin: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      const user = await promise;
      expect(user.email).toBe('admin@negozio.it');
      expect(user.tenantChannelProfile).toBe(TenantChannelProfile.Shopify);
    });
  });
});
