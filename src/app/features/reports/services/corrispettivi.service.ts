import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { toPaginatedResponse } from '@core/api/api-pagination.mapper';
import type { ApiPaginated } from '@core/api/api-paginated.model';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { PaginatedResponse } from '@core/models/api.model';
import type { EntityId } from '@core/models/common.model';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';

import type {
  CorrispettiviDelivery,
  CorrispettiviListQuery,
  CorrispettiviOrder,
  CorrispettiviSummary,
  MarkCorrispettiviDeliveredRequest,
  SalesOrderFiscalStatus,
} from '../models/corrispettivi.model';

const HTTP_TIMEOUT_MS = 15000;
const EXPORT_HTTP_TIMEOUT_MS = 60_000;

interface CorrispettiviOrderApiRow {
  readonly id: EntityId;
  readonly orderNumber: string;
  readonly source: string;
  readonly financialStatus: string;
  readonly fiscalStatus: SalesOrderFiscalStatus;
  readonly customerName: string;
  readonly currency: string;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly shippingMinor: number;
  readonly discountMinor: number;
  readonly totalMinor: number;
  readonly placedAt: string;
  readonly fiscalDeliveredAt?: string | null;
  readonly fiscalNote?: string | null;
  readonly customer?: { readonly email?: string | null } | null;
}

interface CorrispettiviSummaryApi {
  readonly orderCount: number;
  readonly refundsCount: number;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly shippingMinor: number;
  readonly discountMinor: number;
  readonly totalMinor: number;
  readonly taxableMinor: number;
  readonly pendingDeliveryCount: number;
}

interface CorrispettiviDeliveryApi {
  readonly id: EntityId;
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly channelFilter: string;
  readonly orderCount: number;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly shippingMinor: number;
  readonly totalMinor: number;
  readonly refundsCount: number;
  readonly note?: string | null;
  readonly createdByName: string;
  readonly createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class CorrispettiviService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  listOrders(
    query: CorrispettiviListQuery = {},
  ): Observable<PaginatedResponse<CorrispettiviOrder>> {
    return this.http
      .get<ApiPaginated<CorrispettiviOrderApiRow>>(this.url('/corrispettivi/orders'), {
        params: this.buildParams(query),
      })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((response) => {
          const paginated = toPaginatedResponse(response);
          return {
            data: paginated.data.map(mapOrder),
            meta: paginated.meta,
          };
        }),
      );
  }

  getSummary(query: CorrispettiviListQuery = {}): Observable<CorrispettiviSummary> {
    return this.http
      .get<CorrispettiviSummaryApi>(this.url('/corrispettivi/summary'), {
        params: this.buildParams(query),
      })
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapSummary));
  }

  listDeliveries(page = 1, pageSize = 10): Observable<PaginatedResponse<CorrispettiviDelivery>> {
    const params = new HttpParams().set('page', String(page)).set('pageSize', String(pageSize));

    return this.http
      .get<ApiPaginated<CorrispettiviDeliveryApi>>(this.url('/corrispettivi/deliveries'), {
        params,
      })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((response) => {
          const paginated = toPaginatedResponse(response);
          return {
            data: paginated.data.map(mapDelivery),
            meta: paginated.meta,
          };
        }),
      );
  }

  markDelivered(request: MarkCorrispettiviDeliveredRequest): Observable<CorrispettiviDelivery> {
    return this.http
      .post<CorrispettiviDeliveryApi>(this.url('/corrispettivi/mark-delivered'), request)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapDelivery));
  }

  exportAccountantCsv(query: CorrispettiviListQuery = {}): Observable<Blob> {
    return this.http
      .get(this.url('/corrispettivi/export/csv'), {
        params: this.buildParams(query),
        responseType: 'blob',
      })
      .pipe(timeout(EXPORT_HTTP_TIMEOUT_MS));
  }

  exportSpreadsheet(query: CorrispettiviListQuery = {}): Observable<Blob> {
    return this.http
      .get(this.url('/corrispettivi/export/spreadsheet'), {
        params: this.buildParams(query),
        responseType: 'blob',
      })
      .pipe(timeout(EXPORT_HTTP_TIMEOUT_MS));
  }

  exportPdf(query: CorrispettiviListQuery = {}): Observable<Blob> {
    return this.http
      .get(this.url('/corrispettivi/export/pdf'), {
        params: this.buildParams(query),
        responseType: 'blob',
      })
      .pipe(timeout(EXPORT_HTTP_TIMEOUT_MS));
  }

  private buildParams(query: CorrispettiviListQuery): HttpParams {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('pageSize', String(query.pageSize ?? 25));

    if (query.search?.trim()) {
      params = params.set('search', query.search.trim());
    }
    if (query.financialStatus) {
      params = params.set('financialStatus', query.financialStatus);
    }
    if (query.source) {
      params = params.set('source', query.source);
    }
    if (query.fiscalStatus) {
      params = params.set('fiscalStatus', query.fiscalStatus);
    }
    if (query.placedFrom) {
      params = params.set('placedFrom', query.placedFrom);
    }
    if (query.placedTo) {
      params = params.set('placedTo', query.placedTo);
    }
    if (query.onlineOnly) {
      params = params.set('onlineOnly', 'true');
    }
    if (query.posOnly) {
      params = params.set('posOnly', 'true');
    }
    if (query.pendingDeliveryOnly) {
      params = params.set('pendingDeliveryOnly', 'true');
    }
    if (query.refundsOnly) {
      params = params.set('refundsOnly', 'true');
    }

    return params;
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}

function mapOrder(row: CorrispettiviOrderApiRow): CorrispettiviOrder {
  const currency = row.currency || DEFAULT_CURRENCY;
  const taxableMinor = Math.max(0, row.subtotalMinor - row.discountMinor);
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    source: row.source,
    financialStatus: row.financialStatus,
    fiscalStatus: row.fiscalStatus,
    customerName: row.customerName,
    customerEmail: row.customer?.email ?? undefined,
    currency,
    subtotal: money(row.subtotalMinor, currency),
    tax: money(row.taxMinor, currency),
    shipping: money(row.shippingMinor, currency),
    discount: money(row.discountMinor, currency),
    total: money(row.totalMinor, currency),
    taxable: money(taxableMinor, currency),
    placedAt: row.placedAt,
    fiscalDeliveredAt: row.fiscalDeliveredAt ?? undefined,
    fiscalNote: row.fiscalNote ?? undefined,
  };
}

function mapSummary(row: CorrispettiviSummaryApi): CorrispettiviSummary {
  return {
    orderCount: row.orderCount,
    refundsCount: row.refundsCount,
    subtotal: money(row.subtotalMinor),
    tax: money(row.taxMinor),
    shipping: money(row.shippingMinor),
    discount: money(row.discountMinor),
    total: money(row.totalMinor),
    taxable: money(row.taxableMinor),
    pendingDeliveryCount: row.pendingDeliveryCount,
  };
}

function mapDelivery(row: CorrispettiviDeliveryApi): CorrispettiviDelivery {
  return {
    id: row.id,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    channelFilter: row.channelFilter,
    orderCount: row.orderCount,
    subtotal: money(row.subtotalMinor),
    tax: money(row.taxMinor),
    shipping: money(row.shippingMinor),
    total: money(row.totalMinor),
    refundsCount: row.refundsCount,
    note: row.note ?? undefined,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
  };
}

function money(amountMinor: number, currencyCode = DEFAULT_CURRENCY) {
  return { amountMinor, currencyCode };
}
