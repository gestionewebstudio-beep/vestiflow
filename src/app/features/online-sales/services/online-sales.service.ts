import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, timeout, type Observable } from 'rxjs';

import { toPaginatedResponse } from '@core/api/api-pagination.mapper';
import type { ApiPaginated } from '@core/api/api-paginated.model';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { PaginatedResponse } from '@core/models/api.model';
import type { EntityId } from '@core/models/common.model';

import {
  mapCorrispettivoStatus,
  mapInventoryStatus,
} from '@features/sales-orders/services/sales-order-api.mapper';

import type {
  CorrispettivoEntryDetail,
  CorrispettivoEntryListQuery,
  CorrispettivoEntryRow,
  CorrispettivoEntryUpdate,
  OnlineSaleDetail,
  OnlineSaleListQuery,
  OnlineSaleRow,
} from '../models/online-sale.model';

const HTTP_TIMEOUT_MS = 15000;

/** Righe API con stati come stringhe grezze (mappate nei modelli frontend). */
type OnlineSaleApiRow = Omit<OnlineSaleRow, 'inventoryStatus' | 'corrispettivoStatus'> & {
  readonly inventoryStatus: string;
  readonly corrispettivoStatus: string | null;
};

type OnlineSaleApiDetail = Omit<
  OnlineSaleDetail,
  'inventoryStatus' | 'corrispettivoStatus' | 'corrispettivo'
> & {
  readonly inventoryStatus: string;
  readonly corrispettivoStatus: string | null;
  readonly corrispettivo: {
    readonly id: EntityId;
    readonly reference: string;
    readonly fiscalDate: string;
    readonly status: string;
  } | null;
};

type CorrispettivoEntryApiRow = Omit<CorrispettivoEntryRow, 'status'> & {
  readonly status: string;
};

type CorrispettivoEntryApiDetail = Omit<CorrispettivoEntryDetail, 'status'> & {
  readonly status: string;
};

function mapOnlineSaleRow(row: OnlineSaleApiRow): OnlineSaleRow {
  return {
    ...row,
    inventoryStatus: mapInventoryStatus(row.inventoryStatus),
    corrispettivoStatus: row.corrispettivoStatus
      ? mapCorrispettivoStatus(row.corrispettivoStatus)
      : null,
  };
}

function mapOnlineSaleDetail(row: OnlineSaleApiDetail): OnlineSaleDetail {
  return {
    ...row,
    inventoryStatus: mapInventoryStatus(row.inventoryStatus),
    corrispettivoStatus: row.corrispettivoStatus
      ? mapCorrispettivoStatus(row.corrispettivoStatus)
      : null,
    corrispettivo: row.corrispettivo
      ? { ...row.corrispettivo, status: mapCorrispettivoStatus(row.corrispettivo.status) }
      : null,
  };
}

function mapEntryRow(row: CorrispettivoEntryApiRow): CorrispettivoEntryRow {
  return { ...row, status: mapCorrispettivoStatus(row.status) };
}

function mapEntryDetail(row: CorrispettivoEntryApiDetail): CorrispettivoEntryDetail {
  return { ...row, status: mapCorrispettivoStatus(row.status) };
}

/**
 * Accesso al registro Vendite online e al registro Corrispettivi (fase 3
 * §4-§5). Le vendite sono read-only (snapshot di sistema); sulle voci
 * corrispettivo sono modificabili solo stato, data fiscale ed esclusioni.
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

  getCorrispettivoEntries(
    query: CorrispettivoEntryListQuery = {},
  ): Observable<PaginatedResponse<CorrispettivoEntryRow>> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('pageSize', String(query.pageSize ?? 20));
    params = appendIfPresent(params, {
      search: query.search,
      channel: query.channel,
      status: query.status,
      fiscalFrom: query.fiscalFrom,
      fiscalTo: query.fiscalTo,
      invoiceIssued: query.invoiceIssued,
      excludedFromSummary: query.excludedFromSummary,
      vatRatePercent: query.vatRatePercent,
    });

    return this.http
      .get<ApiPaginated<CorrispettivoEntryApiRow>>(this.url('/online-sales/register/entries'), {
        params,
      })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((response) => {
          const paginated = toPaginatedResponse(response);
          return { data: paginated.data.map(mapEntryRow), meta: paginated.meta };
        }),
      );
  }

  getCorrispettivoEntryById(id: EntityId): Observable<CorrispettivoEntryDetail> {
    return this.http
      .get<CorrispettivoEntryApiDetail>(this.url(`/online-sales/register/entries/${id}`))
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapEntryDetail));
  }

  updateCorrispettivoEntry(
    id: EntityId,
    update: CorrispettivoEntryUpdate,
  ): Observable<CorrispettivoEntryRow> {
    return this.http
      .patch<CorrispettivoEntryApiRow>(this.url(`/online-sales/register/entries/${id}`), update)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapEntryRow));
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
