import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';

import {
  tenantCompanyFromDto,
  type TenantCompany,
  type TenantCompanyDto,
} from '../models/tenant-company.model';

const HTTP_TIMEOUT_MS = 15_000;

@Injectable({ providedIn: 'root' })
export class TenantCompanyService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  getCompany(): Observable<TenantCompany> {
    return this.http
      .get<TenantCompanyDto>(`${this.config.apiBaseUrl}/tenant/company`)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(tenantCompanyFromDto));
  }
}
