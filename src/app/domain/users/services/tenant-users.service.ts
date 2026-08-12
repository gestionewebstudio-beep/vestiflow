import { inject, Injectable } from '@angular/core';
import { type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';

import type {
  CreateTenantUserPayload,
  TenantUser,
  UpdateTenantUserPayload,
} from '../models/tenant-user.model';

const HTTP_TIMEOUT_MS = 15000;

/**
 * Gestione utenti in mano al titolare (Impostazioni → Utenti). Il tenant è
 * implicito nel JWT: gli endpoint /tenant/users non accettano id tenant.
 * Gli invarianti (no self-edit, titolari intoccabili, niente ruolo owner)
 * vivono lato server; la UI li rispecchia soltanto.
 */
@Injectable({ providedIn: 'root' })
export class TenantUsersService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  listUsers(): Observable<readonly TenantUser[]> {
    return this.http
      .get<readonly TenantUser[]>(`${this.config.apiBaseUrl}/tenant/users`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  createUser(payload: CreateTenantUserPayload): Observable<TenantUser> {
    return this.http
      .post<TenantUser>(`${this.config.apiBaseUrl}/tenant/users`, payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  updateUser(userId: string, payload: UpdateTenantUserPayload): Observable<TenantUser> {
    return this.http
      .patch<TenantUser>(`${this.config.apiBaseUrl}/tenant/users/${userId}`, payload)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  deleteUser(userId: string): Observable<void> {
    return this.http
      .delete<void>(`${this.config.apiBaseUrl}/tenant/users/${userId}`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }
}
