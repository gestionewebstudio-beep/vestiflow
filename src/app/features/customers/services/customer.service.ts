import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { toPaginatedResponse } from '@core/api/api-pagination.mapper';
import type { ApiPaginated } from '@core/api/api-paginated.model';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { PaginatedResponse } from '@core/models/api.model';
import type { Customer, CustomerInput } from '@core/models/customer.model';
import type { EntityId } from '@core/models/common.model';

import type { CustomerListQuery, CustomerExportQuery } from '../models/customer-list-query.model';
import { mapCustomerApiRow, type CustomerApiRow } from './customer-api.mapper';

const HTTP_TIMEOUT_MS = 15000;
const EXPORT_HTTP_TIMEOUT_MS = 60_000;

/** Anagrafica clienti via NestJS (CRUD locale + sync Shopify). */
@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  getCustomers(query: CustomerListQuery = {}): Observable<PaginatedResponse<Customer>> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('pageSize', String(query.pageSize ?? 20));

    if (query.search) {
      params = params.set('search', query.search);
    }
    if (query.active) {
      params = params.set('active', 'true');
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

  /**
   * Elenco completo dei clienti ATTIVI per le select inline (Ordine cliente),
   * speculare a getSuppliers() dell'Arrivo merce: endpoint dedicato senza
   * paginazione (la lista paginata ha pageSize massimo 100).
   */
  getAllCustomers(): Observable<readonly Customer[]> {
    return this.http.get<CustomerApiRow[]>(this.url('/customers/all')).pipe(
      timeout(HTTP_TIMEOUT_MS),
      map((rows) => rows.map(mapCustomerApiRow)),
    );
  }

  getCustomerById(id: EntityId): Observable<Customer> {
    return this.http
      .get<CustomerApiRow>(this.url(`/customers/${id}`))
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapCustomerApiRow));
  }

  createCustomer(input: CustomerInput): Observable<Customer> {
    return this.http
      .post<CustomerApiRow>(this.url('/customers'), input)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapCustomerApiRow));
  }

  updateCustomer(id: EntityId, input: Partial<CustomerInput>): Observable<Customer> {
    return this.http
      .patch<CustomerApiRow>(this.url(`/customers/${id}`), input)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapCustomerApiRow));
  }

  exportCustomersCsv(query: CustomerExportQuery): Observable<Blob> {
    let params = new HttpParams();
    if (query.search) {
      params = params.set('search', query.search);
    }

    return this.http
      .get(this.url('/customers/export/csv'), { params, responseType: 'blob' })
      .pipe(timeout(EXPORT_HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}
