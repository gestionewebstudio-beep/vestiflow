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

  /**
   * ⭐ **L'elenco clienti non impagina più** (30/08/2026): `tutto` fa sparire la
   * finestra lato API, quindi arriva l'intero risultato del filtro.
   *
   * ⛔ **Il default resta PAGINATO**, e non è timidezza: quattro schermate
   * chiamano questo metodo con `pageSize: 100` per riempire un elenco a tendina —
   * Registro documenti, maschera vendita, ordini cliente, ricerca globale. Con
   * `all` acceso per tutti, ognuna scaricherebbe l'anagrafica intera. È lo stesso
   * difetto già misurato sui prodotti col contatore delle bozze.
   */
  getCustomers(
    query: CustomerListQuery = {},
    opzioni: { readonly tutto?: boolean } = {},
  ): Observable<PaginatedResponse<Customer>> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('pageSize', String(query.pageSize ?? 20));

    if (opzioni.tutto) {
      params = params.set('all', '1');
    }

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
   * ⭐ **Elimina la scheda cliente**, non la sua storia: documenti, ordini e
   * vendite online conservano il nome fotografato e perdono solo il collegamento
   * (deciso il 30/08/2026, stesso criterio dell'unità di misura e del Codice IVA).
   */
  /**
   * ⭐ **Duplica la scheda**: una copia col prossimo codice, che si apre per
   * rifinirla. Partita IVA e codice fiscale non si copiano — due anagrafiche con
   * la stessa partita IVA non sono una copia, sono un errore.
   */
  duplicateCustomer(id: string): Observable<{ readonly id: string }> {
    return this.http
      .post<{ readonly id: string }>(this.url(`/customers/${id}/duplicate`), {})
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  deleteCustomer(id: string): Observable<void> {
    return this.http.delete<void>(this.url(`/customers/${id}`)).pipe(timeout(HTTP_TIMEOUT_MS));
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
