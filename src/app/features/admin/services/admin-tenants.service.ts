import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';

import type {
  CreateTenantPayload,
  ProvisionedTenant,
  TenantSummary,
} from '../models/admin-tenant.model';

const HTTP_TIMEOUT_MS = 15000;

@Injectable({ providedIn: 'root' })
export class AdminTenantsService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  listTenants(): Observable<readonly TenantSummary[]> {
    return this.http
      .get<readonly TenantSummary[]>(`${this.config.apiBaseUrl}/admin/tenants`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  createTenant(payload: CreateTenantPayload): Observable<ProvisionedTenant> {
    return this.http
      .post<ProvisionedTenant>(`${this.config.apiBaseUrl}/admin/tenants`, payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }
}
