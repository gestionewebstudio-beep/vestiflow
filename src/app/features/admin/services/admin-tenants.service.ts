import { inject, Injectable } from '@angular/core';
import { type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';

import type {
  CreateTenantPayload,
  ProvisionedTenant,
  TenantDetail,
  TenantSummary,
  UpdateTenantPayload,
} from '../models/admin-tenant.model';

const HTTP_TIMEOUT_MS = 15000;

@Injectable({ providedIn: 'root' })
export class AdminTenantsService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  listTenants(): Observable<readonly TenantSummary[]> {
    return this.http
      .get<readonly TenantSummary[]>(`${this.config.apiBaseUrl}/admin/tenants`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  getTenant(id: string): Observable<TenantDetail> {
    return this.http
      .get<TenantDetail>(`${this.config.apiBaseUrl}/admin/tenants/${id}`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  createTenant(payload: CreateTenantPayload): Observable<ProvisionedTenant> {
    return this.http
      .post<ProvisionedTenant>(`${this.config.apiBaseUrl}/admin/tenants`, payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  updateTenant(id: string, payload: UpdateTenantPayload): Observable<TenantDetail> {
    return this.http
      .patch<TenantDetail>(`${this.config.apiBaseUrl}/admin/tenants/${id}`, payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  deleteTenant(id: string): Observable<void> {
    return this.http
      .delete<void>(`${this.config.apiBaseUrl}/admin/tenants/${id}`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  resendOwnerInvite(tenantId: string): Observable<{ readonly ownerEmail: string }> {
    return this.http
      .post<{
        readonly ownerEmail: string;
      }>(`${this.config.apiBaseUrl}/admin/tenants/${tenantId}/resend-owner-invite`, {})
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  grantLocationSelectionChange(tenantId: string): Observable<{
    readonly licensedLocationCount: number;
    readonly licensedLocationActiveCount: number;
    readonly locationSelectionLocked: boolean;
    readonly locationSelectionChangeGranted: boolean;
    readonly canChangeLicensedLocations: boolean;
  }> {
    return this.http
      .post<{
        readonly licensedLocationCount: number;
        readonly licensedLocationActiveCount: number;
        readonly locationSelectionLocked: boolean;
        readonly locationSelectionChangeGranted: boolean;
        readonly canChangeLicensedLocations: boolean;
      }>(`${this.config.apiBaseUrl}/admin/tenants/${tenantId}/grant-location-selection-change`, {})
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }
}
