import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { toPaginatedResponse } from '@core/api/api-pagination.mapper';
import type { ApiPaginated } from '@core/api/api-paginated.model';
import { APP_CONFIG } from '@core/config/app-config.token';
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

/**
 * Accesso read-only alle vendite via NestJS. Shopify è owner: nessuna scrittura
 * lato gestionale; snapshot popolati da sync.
 */
@Injectable({ providedIn: 'root' })
export class SalesOrderService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  getSalesOrders(query: SalesOrderListQuery = {}): Observable<PaginatedResponse<SalesOrder>> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('pageSize', String(query.pageSize ?? 20));

    if (query.search) {
      params = params.set('search', query.search);
    }
    if (query.financialStatus) {
      params = params.set('financialStatus', query.financialStatus);
    }
    if (query.source) {
      params = params.set('source', query.source);
    }

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

  exportSalesOrdersCsv(query: SalesOrderExportQuery): Observable<Blob> {
    let params = new HttpParams();
    if (query.search) {
      params = params.set('search', query.search);
    }
    if (query.financialStatus) {
      params = params.set('financialStatus', query.financialStatus);
    }
    if (query.source) {
      params = params.set('source', query.source);
    }

    return this.http
      .get(this.url('/sales-orders/export/csv'), { params, responseType: 'blob' })
      .pipe(timeout(EXPORT_HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}
