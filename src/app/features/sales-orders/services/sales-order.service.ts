import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { EMPTY, expand, map, reduce, type Observable, timeout } from 'rxjs';

import { toPaginatedResponse } from '@core/api/api-pagination.mapper';
import type { ApiPaginated } from '@core/api/api-paginated.model';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { PaginatedResponse } from '@core/models/api.model';
import type { EntityId } from '@core/models/common.model';
import type { SalesOrder } from '@core/models/sales-order.model';

import type {
  SalesOrderListQuery,
  SalesOrderExportQuery,
} from '../models/sales-order-list-query.model';
import { mapSalesOrderApiRow, type SalesOrderApiRow } from './sales-order-api.mapper';

const HTTP_TIMEOUT_MS = 15000;
const EXPORT_HTTP_TIMEOUT_MS = 60_000;
const REPORT_FETCH_PAGE_SIZE = 100;
/** Limite di sicurezza: evita fetch illimitato in memoria su storico vendite enorme. */
const MAX_REPORT_PAGES = 20;

/**
 * Accesso read-only alle vendite via NestJS. Shopify è owner: nessuna scrittura
 * lato gestionale; snapshot popolati da sync.
 */
@Injectable({ providedIn: 'root' })
export class SalesOrderService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  getSalesOrders(query: SalesOrderListQuery = {}): Observable<PaginatedResponse<SalesOrder>> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('pageSize', String(query.pageSize ?? 20));

    params = this.appendSalesOrderFilters(params, query);

    return this.http
      .get<ApiPaginated<SalesOrderApiRow>>(this.url('/sales-orders'), { params })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((response) => {
          const paginated = toPaginatedResponse(response);
          return {
            data: paginated.data.map(mapSalesOrderApiRow),
            meta: paginated.meta,
          };
        }),
      );
  }

  getSalesOrderById(id: EntityId): Observable<SalesOrder> {
    return this.http
      .get<SalesOrderApiRow>(this.url(`/sales-orders/${id}`))
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapSalesOrderApiRow));
  }

  /** Scarica tutte le vendite che matchano i filtri (paginazione automatica). */
  getAllSalesOrders(
    query: Omit<SalesOrderListQuery, 'page' | 'pageSize'>,
  ): Observable<readonly SalesOrder[]> {
    return this.getSalesOrders({ ...query, page: 1, pageSize: REPORT_FETCH_PAGE_SIZE }).pipe(
      expand((response) =>
        response.meta.page < response.meta.totalPages && response.meta.page < MAX_REPORT_PAGES
          ? this.getSalesOrders({
              ...query,
              page: response.meta.page + 1,
              pageSize: REPORT_FETCH_PAGE_SIZE,
            })
          : EMPTY,
      ),
      map((response) => response.data),
      reduce(
        (accumulator, pageOrders) => [...accumulator, ...pageOrders],
        [] as readonly SalesOrder[],
      ),
    );
  }

  exportSalesOrdersCsv(query: SalesOrderExportQuery): Observable<Blob> {
    const params = this.appendSalesOrderFilters(new HttpParams(), query);

    return this.http
      .get(this.url('/sales-orders/export/csv'), { params, responseType: 'blob' })
      .pipe(timeout(EXPORT_HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }

  private appendSalesOrderFilters(params: HttpParams, query: SalesOrderExportQuery): HttpParams {
    let next = params;
    if (query.search) {
      next = next.set('search', query.search);
    }
    if (query.financialStatus) {
      next = next.set('financialStatus', query.financialStatus);
    }
    if (query.source) {
      next = next.set('source', query.source);
    }
    if (query.placedFrom) {
      next = next.set('placedFrom', query.placedFrom);
    }
    if (query.placedTo) {
      next = next.set('placedTo', query.placedTo);
    }
    return next;
  }
}
