import { inject, Injectable } from '@angular/core';
import { type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';

import type {
  TenantFeatureSettings,
  UpdateTenantFeatureSettingsBody,
} from '../models/tenant-feature-settings.model';

const HTTP_TIMEOUT_MS = 15_000;

@Injectable({ providedIn: 'root' })
export class TenantFeatureSettingsService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  getSettings(): Observable<TenantFeatureSettings> {
    return this.http
      .get<TenantFeatureSettings>(`${this.config.apiBaseUrl}/tenant/feature-settings`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  updateSettings(body: UpdateTenantFeatureSettingsBody): Observable<TenantFeatureSettings> {
    return this.http
      .patch<TenantFeatureSettings>(`${this.config.apiBaseUrl}/tenant/feature-settings`, body)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }
}
