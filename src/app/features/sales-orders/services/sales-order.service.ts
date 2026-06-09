import { Injectable } from '@angular/core';
import { type Observable, delay, of, switchMap, throwError } from 'rxjs';

import { AppErrorKind } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { PaginatedResponse } from '@core/models/api.model';
import type { EntityId } from '@core/models/common.model';
import type { SalesOrder } from '@core/models/sales-order.model';

import type { SalesOrderListQuery } from '../models/sales-order-list-query.model';
import { MOCK_SALES_ORDERS } from './sales-orders.mock-data';

const LIST_LATENCY_MS = 500;
const DETAIL_LATENCY_MS = 400;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

// Sentinel di sviluppo: cercare "errore" (lista) o un id "errore" (dettaglio)
// forza un errore server, per testare lo stato error in UI.
const ERROR_SENTINEL = 'errore';

/**
 * Accesso in SOLA LETTURA alle vendite. Shopify e' autoritativo su vendite e
 * clienti: nessuna scrittura (create/update/cancel/refund/fulfill) e nessun
 * impatto su giacenze. Implementazione mock (in memoria) con latenza ed errori
 * simulati, coerente con ProductService/InventoryService. Ritorna modelli di
 * dominio: sostituibile con un client HTTP (NestJS/Railway) senza cambiare l'API.
 */
@Injectable({ providedIn: 'root' })
export class SalesOrderService {
  // Piu' recenti per prime: ordinamento stabile applicato una volta.
  private readonly orders: readonly SalesOrder[] = [...MOCK_SALES_ORDERS].sort((a, b) =>
    b.placedAt.localeCompare(a.placedAt),
  );

  /** Lista paginata e filtrata (paginazione simulata lato "server"). */
  getSalesOrders(query: SalesOrderListQuery = {}): Observable<PaginatedResponse<SalesOrder>> {
    if (query.search?.trim().toLowerCase() === ERROR_SENTINEL) {
      return this.failWith(this.serverError(), LIST_LATENCY_MS);
    }

    const filtered = this.applyFilters(this.orders, query);

    const page = Math.max(1, query.page ?? DEFAULT_PAGE);
    const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE);
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const data = filtered.slice(start, start + pageSize);

    const response: PaginatedResponse<SalesOrder> = {
      data,
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };

    return of(response).pipe(delay(LIST_LATENCY_MS));
  }

  /** Singola vendita per id; AppError NotFound se assente. */
  getSalesOrderById(id: EntityId): Observable<SalesOrder> {
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
    orders: readonly SalesOrder[],
    query: SalesOrderListQuery,
  ): readonly SalesOrder[] {
    const search = query.search?.trim().toLowerCase();

    return orders.filter((order) => {
      if (query.financialStatus && order.financialStatus !== query.financialStatus) {
        return false;
      }
      if (query.source && order.source !== query.source) {
        return false;
      }
      if (search) {
        const haystack = `${order.orderNumber} ${order.customerName}`.toLowerCase();
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
      message: 'Errore nel caricamento delle vendite. Riprova piu\u0027 tardi.',
      status: 500,
    };
  }

  private notFoundError(): AppError {
    return {
      kind: AppErrorKind.NotFound,
      message: 'Vendita non trovata.',
      status: 404,
    };
  }
}
