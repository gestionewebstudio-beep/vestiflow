import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, timeout, type Observable } from 'rxjs';

import { toPaginatedResponse } from '@core/api/api-pagination.mapper';
import type { ApiPaginated } from '@core/api/api-paginated.model';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { PaginatedResponse } from '@core/models/api.model';
import type { EntityId } from '@core/models/common.model';

import { mapInventoryStatus } from '@domain/sales-orders/services/sales-order-api.mapper';

import type {
  OnlineSaleDetail,
  OnlineSaleListQuery,
  OnlineSaleRow,
} from '../models/online-sale.model';

const HTTP_TIMEOUT_MS = 15000;

/** Righe API con stati come stringhe grezze (mappate nei modelli frontend). */
type OnlineSaleApiRow = Omit<OnlineSaleRow, 'inventoryStatus'> & {
  readonly inventoryStatus: string;
};

type OnlineSaleApiDetail = Omit<OnlineSaleDetail, 'inventoryStatus'> & {
  readonly inventoryStatus: string;
};

function mapOnlineSaleRow(row: OnlineSaleApiRow): OnlineSaleRow {
  return { ...row, inventoryStatus: mapInventoryStatus(row.inventoryStatus) };
}

function mapOnlineSaleDetail(row: OnlineSaleApiDetail): OnlineSaleDetail {
  return { ...row, inventoryStatus: mapInventoryStatus(row.inventoryStatus) };
}

/**
 * Accesso al registro Vendite online (fase 3 §4): snapshot di sistema, sola
 * lettura. Nessuna schermata li crea o li modifica.
 *
 * ⚠️ Qui c'erano anche i tre metodi del registro Corrispettivi legacy
 * (`/online-sales/register/entries`). Sono caduti il 17/08/2026 insieme alle
 * loro tabelle: il Registro attuale è una vista **derivata** che aggrega
 * vendite e documenti per periodo, e vive in `features/reports`.
 */
@Injectable({ providedIn: 'root' })
export class OnlineSalesService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  getOnlineSales(query: OnlineSaleListQuery = {}): Observable<PaginatedResponse<OnlineSaleRow>> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('pageSize', String(query.pageSize ?? 20));
    params = appendIfPresent(params, {
      search: query.search,
      channel: query.channel,
      fulfilledFrom: query.fulfilledFrom,
      fulfilledTo: query.fulfilledTo,
    });

    return this.http
      .get<ApiPaginated<OnlineSaleApiRow>>(this.url('/online-sales'), { params })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((response) => {
          const paginated = toPaginatedResponse(response);
          return { data: paginated.data.map(mapOnlineSaleRow), meta: paginated.meta };
        }),
      );
  }

  getOnlineSaleById(id: EntityId): Observable<OnlineSaleDetail> {
    return this.http
      .get<OnlineSaleApiDetail>(this.url(`/online-sales/${id}`))
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapOnlineSaleDetail));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}

function appendIfPresent(
  params: HttpParams,
  values: Record<string, string | number | boolean | undefined>,
): HttpParams {
  let next = params;
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') {
      next = next.set(key, String(value));
    }
  }
  return next;
}
