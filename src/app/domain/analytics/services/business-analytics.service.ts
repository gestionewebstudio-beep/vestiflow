import { inject, Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';

import type {
  BusinessAnalyticsQuery,
  BusinessAnalyticsSummary,
} from '../models/business-analytics.model';

const HTTP_TIMEOUT_MS = 20000;

@Injectable({ providedIn: 'root' })
export class BusinessAnalyticsService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  getSummary(query: BusinessAnalyticsQuery = {}): Observable<BusinessAnalyticsSummary> {
    let params = new HttpParams();
    if (query.period) {
      params = params.set('period', query.period);
    }
    if (query.from) {
      params = params.set('from', query.from);
    }
    if (query.to) {
      params = params.set('to', query.to);
    }
    if (query.locationId) {
      params = params.set('locationId', query.locationId);
    }

    return this.http
      .get<BusinessAnalyticsSummary>(`${this.config.apiBaseUrl}/analytics/business-summary`, {
        params,
      })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }
}
