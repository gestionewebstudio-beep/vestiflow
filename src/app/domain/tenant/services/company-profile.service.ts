import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';

import {
  companyProfileFromDto,
  type CompanyProfile,
  type CompanyProfileDto,
} from '../models/company-profile.model';

const HTTP_TIMEOUT_MS = 15_000;

/**
 * Anagrafica dell'azienda gestita. L'API la riserva al titolare: per chiunque
 * altro queste chiamate rispondono 403, ed è previsto — la maschera non gli
 * viene nemmeno mostrata.
 */
@Injectable({ providedIn: 'root' })
export class CompanyProfileService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  private get url(): string {
    return `${this.config.apiBaseUrl}/tenant/company-profile`;
  }

  get(): Observable<CompanyProfile> {
    return this.http
      .get<CompanyProfileDto>(this.url)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(companyProfileFromDto));
  }

  update(
    payload: Record<string, string | number | boolean | undefined>,
  ): Observable<CompanyProfile> {
    return this.http
      .patch<CompanyProfileDto>(this.url, payload)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(companyProfileFromDto));
  }
}
