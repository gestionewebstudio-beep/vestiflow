import { Injectable } from '@angular/core';
import { type Observable, delay, of, switchMap, throwError } from 'rxjs';

import { AppErrorKind } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { PaginatedResponse } from '@core/models/api.model';
import type { EntityId } from '@core/models/common.model';
import type { SupplierOrder } from '@core/models/supplier-order.model';

import type { SupplierOrderListQuery } from '../models/supplier-order-list-query.model';
import { MOCK_SUPPLIER_ORDERS } from './supplier-orders.mock-data';

const LIST_LATENCY_MS = 500;
const DETAIL_LATENCY_MS = 400;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

// Sentinel di sviluppo: cercare "errore" (lista) o un id "errore" (dettaglio)
// forza un errore server, per testare lo stato error in UI.
const ERROR_SENTINEL = 'errore';

/**
 * Accesso in sola lettura agli ordini fornitori. Creazione/ricezione ordine
 * arriveranno con il backend reale: la ricezione e' un'azione sensibile che
 * deve produrre movimenti di magazzino lato server. Implementazione mock con
 * latenza ed errori simulati, coerente con gli altri service.
 */
@Injectable({ providedIn: 'root' })
export class SupplierOrderService {
  // Piu' recenti per primi: ordinamento stabile applicato una volta.
  private readonly orders: readonly SupplierOrder[] = [...MOCK_SUPPLIER_ORDERS].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  /** Lista paginata e filtrata (paginazione simulata lato "server"). */
  getSupplierOrders(
    query: SupplierOrderListQuery = {},
  ): Observable<PaginatedResponse<SupplierOrder>> {
    if (query.search?.trim().toLowerCase() === ERROR_SENTINEL) {
      return this.failWith(this.serverError(), LIST_LATENCY_MS);
    }

    const filtered = this.applyFilters(this.orders, query);

    const page = Math.max(1, query.page ?? DEFAULT_PAGE);
    const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE);
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const data = filtered.slice(start, start + pageSize);

    const response: PaginatedResponse<SupplierOrder> = {
      data,
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };

    return of(response).pipe(delay(LIST_LATENCY_MS));
  }

  /** Singolo ordine per id; AppError NotFound se assente. */
  getSupplierOrderById(id: EntityId): Observable<SupplierOrder> {
    if (id === ERROR_SENTINEL) {
      return this.failWith(this.serverError(), DETAIL_LATENCY_MS);
    }
    const order = this.orders.find((candidate) => candidate.id === id);
    if (!order) {
      return this.failWith(this.notFoundError(), DETAIL_LATENCY_MS);
    }
    return of(order).pipe(delay(DETAIL_LATENCY_MS));
  }

  private applyFilters(
    orders: readonly SupplierOrder[],
    query: SupplierOrderListQuery,
  ): readonly SupplierOrder[] {
    const search = query.search?.trim().toLowerCase();

    return orders.filter((order) => {
      if (query.status && order.status !== query.status) {
        return false;
      }
      if (search) {
        const haystack = `${order.reference} ${order.supplierName}`.toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }
      return true;
    });
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
      message: 'Errore nel caricamento degli ordini fornitori. Riprova piu\u0027 tardi.',
      status: 500,
    };
  }

  private notFoundError(): AppError {
    return {
      kind: AppErrorKind.NotFound,
      message: 'Ordine fornitore non trovato.',
      status: 404,
    };
  }
}
