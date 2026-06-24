import { inject, Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { EntityId } from '@core/models/common.model';

import type { DashboardSummary } from '../models/dashboard-summary.model';

const HTTP_TIMEOUT_MS = 15000;

/**
 * Accesso ai KPI aggregati della dashboard: una sola chiamata server-side
 * (conteggi + giacenze + ordini in arrivo) invece di N fetch separate.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  getSummary(locationId?: EntityId | null): Observable<DashboardSummary> {
    let params = new HttpParams();
    if (locationId) {
      params = params.set('locationId', locationId);
    }

    return this.http
      .get<DashboardSummary>(`${this.config.apiBaseUrl}/dashboard/summary`, { params })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }
}
