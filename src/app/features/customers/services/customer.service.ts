import { Injectable } from '@angular/core';
import { type Observable, delay, of, switchMap, throwError } from 'rxjs';

import { AppErrorKind } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { PaginatedResponse } from '@core/models/api.model';
import type { Customer } from '@core/models/customer.model';
import type { EntityId } from '@core/models/common.model';

import type { CustomerListQuery } from '../models/customer-list-query.model';
import { MOCK_CUSTOMERS } from './customers.mock-data';

const LIST_LATENCY_MS = 450;
const DETAIL_LATENCY_MS = 350;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

// Sentinel di sviluppo: cercare "errore" (lista) o un id "errore" (dettaglio)
// forza un errore server, per testare lo stato error in UI.
const ERROR_SENTINEL = 'errore';

/**
 * Anagrafica clienti in sola lettura. Con l'integrazione reale i clienti
 * arriveranno principalmente da Shopify (authoritative sui clienti ecommerce);
 * l'editing locale verra' valutato col backend. Implementazione mock con
 * latenza ed errori simulati, coerente con gli altri service.
 */
@Injectable({ providedIn: 'root' })
export class CustomerService {
  // Ordinamento stabile per cognome/nome, applicato una volta.
  private readonly customers: readonly Customer[] = [...MOCK_CUSTOMERS].sort(
    (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
  );

  /** Lista paginata e filtrata (paginazione simulata lato "server"). */
  getCustomers(query: CustomerListQuery = {}): Observable<PaginatedResponse<Customer>> {
    if (query.search?.trim().toLowerCase() === ERROR_SENTINEL) {
      return this.failWith(this.serverError(), LIST_LATENCY_MS);
    }

    const search = query.search?.trim().toLowerCase();
    const filtered = search
      ? this.customers.filter((customer) =>
          `${customer.firstName} ${customer.lastName} ${customer.email ?? ''}`
            .toLowerCase()
            .includes(search),
        )
      : this.customers;

    const page = Math.max(1, query.page ?? DEFAULT_PAGE);
    const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE);
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const data = filtered.slice(start, start + pageSize);

    const response: PaginatedResponse<Customer> = {
      data,
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };

    return of(response).pipe(delay(LIST_LATENCY_MS));
  }

  /** Singolo cliente per id; AppError NotFound se assente. */
  getCustomerById(id: EntityId): Observable<Customer> {
    if (id === ERROR_SENTINEL) {
      return this.failWith(this.serverError(), DETAIL_LATENCY_MS);
    }
    const customer = this.customers.find((candidate) => candidate.id === id);
    if (!customer) {
      return this.failWith(this.notFoundError(), DETAIL_LATENCY_MS);
    }
    return of(customer).pipe(delay(DETAIL_LATENCY_MS));
  }

  // Errore simulato dopo la stessa latenza della chiamata "felice".
  private failWith<T>(error: AppError, latencyMs: number): Observable<T> {
    return of(null).pipe(
      delay(latencyMs),
      switchMap(() => throwError(() => error)),
    );
  }

  private serverError(): AppError {
    return {
      kind: AppErrorKind.Server,
      message: 'Errore nel caricamento dei clienti. Riprova piu\u0027 tardi.',
      status: 500,
    };
  }

  private notFoundError(): AppError {
    return {
      kind: AppErrorKind.NotFound,
      message: 'Cliente non trovato.',
      status: 404,
    };
  }
}
