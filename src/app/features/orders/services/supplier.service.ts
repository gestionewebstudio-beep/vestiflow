import { inject, Injectable } from '@angular/core';
import { type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { CreateSupplierInput, Supplier } from '@core/models/supplier.model';

const HTTP_TIMEOUT_MS = 15000;

/** Accesso HTTP all'anagrafica fornitori (NestJS). */
@Injectable({ providedIn: 'root' })
export class SupplierService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  getSuppliers(): Observable<readonly Supplier[]> {
    return this.http
      .get<Supplier[]>(`${this.config.apiBaseUrl}/suppliers`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  createSupplier(input: CreateSupplierInput): Observable<Supplier> {
    return this.http
      .post<Supplier>(`${this.config.apiBaseUrl}/suppliers`, input)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }
}
