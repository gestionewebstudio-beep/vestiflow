import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { toPaginatedResponse } from '@core/api/api-pagination.mapper';
import type { ApiPaginated } from '@core/api/api-paginated.model';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { PaginatedResponse } from '@core/models/api.model';
import type { EntityId } from '@core/models/common.model';
import type { SupplierOrder } from '@core/models/supplier-order.model';

import type { SupplierOrderListQuery } from '../models/supplier-order-list-query.model';
import {
  mapSupplierOrderApiRow,
  type CreateSupplierOrderBody,
  type SupplierOrderApiRow,
  type UpdateSupplierOrderBody,
} from './supplier-order-api.mapper';

const HTTP_TIMEOUT_MS = 15000;

/**
 * Accesso HTTP agli ordini fornitori (NestJS). Ricezione merce via POST receive.
 */
@Injectable({ providedIn: 'root' })
export class SupplierOrderService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  getSupplierOrders(
    query: SupplierOrderListQuery = {},
  ): Observable<PaginatedResponse<SupplierOrder>> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('pageSize', String(query.pageSize ?? 20));

    if (query.search) params = params.set('search', query.search);
    if (query.status) params = params.set('status', query.status);

    return this.http
      .get<ApiPaginated<SupplierOrderApiRow>>(this.url('/supplier-orders'), { params })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((response) => {
          const paginated = toPaginatedResponse(response);
          return {
            data: paginated.data.map(mapSupplierOrderApiRow),
            meta: paginated.meta,
          };
        }),
      );
  }

  getSupplierOrderById(id: EntityId): Observable<SupplierOrder> {
    return this.http
      .get<SupplierOrderApiRow>(this.url(`/supplier-orders/${id}`))
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapSupplierOrderApiRow));
  }

  createOrder(body: CreateSupplierOrderBody): Observable<SupplierOrder> {
    return this.http
      .post<SupplierOrderApiRow>(this.url('/supplier-orders'), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapSupplierOrderApiRow));
  }

  sendOrder(id: EntityId): Observable<SupplierOrder> {
    return this.http
      .post<SupplierOrderApiRow>(this.url(`/supplier-orders/${id}/send`), {})
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapSupplierOrderApiRow));
  }

  receiveOrder(
    id: EntityId,
    lines: readonly { lineId: EntityId; quantity: number }[],
  ): Observable<SupplierOrder> {
    return this.http
      .post<SupplierOrderApiRow>(this.url(`/supplier-orders/${id}/receive`), { lines })
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapSupplierOrderApiRow));
  }

  updateOrder(id: EntityId, body: UpdateSupplierOrderBody): Observable<SupplierOrder> {
    return this.http
      .patch<SupplierOrderApiRow>(this.url(`/supplier-orders/${id}`), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapSupplierOrderApiRow));
  }

  cancelOrder(id: EntityId): Observable<SupplierOrder> {
    return this.http
      .post<SupplierOrderApiRow>(this.url(`/supplier-orders/${id}/cancel`), {})
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapSupplierOrderApiRow));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}
