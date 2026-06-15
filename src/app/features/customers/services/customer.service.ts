import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { toPaginatedResponse } from '@core/api/api-pagination.mapper';
import type { ApiPaginated } from '@core/api/api-paginated.model';
import { APP_CONFIG } from '@core/config/app-config.token';
import type { PaginatedResponse } from '@core/models/api.model';
import type { Customer } from '@core/models/customer.model';
import type { EntityId } from '@core/models/common.model';

import type { CustomerListQuery } from '../models/customer-list-query.model';
import { mapCustomerApiRow, type CustomerApiRow } from './customer-api.mapper';

const HTTP_TIMEOUT_MS = 15000;

/**
 * Anagrafica clienti read-only via NestJS. Owner Shopify per ecommerce:
 * nessun CRUD locale; i dati arrivano da sync.
 */
@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  getCustomers(query: CustomerListQuery = {}): Observable<PaginatedResponse<Customer>> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('pageSize', String(query.pageSize ?? 20));

    if (query.search) {
      params = params.set('search', query.search);
    }

    return this.http.get<ApiPaginated<CustomerApiRow>>(this.url('/customers'), { params }).pipe(
      timeout(HTTP_TIMEOUT_MS),
      map((response) => {
        const paginated = toPaginatedResponse(response);
        return {
          data: paginated.data.map(mapCustomerApiRow),
          meta: paginated.meta,
        };
      }),
    );
  }

  getCustomerById(id: EntityId): Observable<Customer> {
    return this.http
      .get<CustomerApiRow>(this.url(`/customers/${id}`))
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapCustomerApiRow));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}
