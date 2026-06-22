import { inject, Injectable } from '@angular/core';
import { type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';

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

  getSummary(): Observable<DashboardSummary> {
    return this.http
      .get<DashboardSummary>(`${this.config.apiBaseUrl}/dashboard/summary`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }
}
