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

// ── Ordine cliente manuale (maschera /app/sales) ────────────────────────────

/** Riga in salvataggio (payload POST sales-orders/manual/save). */
export interface SaveManualOrderLineInput {
  readonly id?: EntityId;
  readonly variantId?: EntityId;
  readonly sku?: string;
  readonly barcode?: string;
  readonly title: string;
  readonly quantity: number;
  readonly unitPriceMinor?: number;
  /** Sconto a cascata: "10%", "4+10%", "2+5+8%". */
  readonly discount?: string;
  readonly vatCodeId?: string;
  readonly commitsStock?: boolean;
  readonly unitOfMeasure?: string;
}

/** Salvataggio unico testata + righe + impegni (stessa impostazione Arrivo merce). */
export interface SaveManualOrderInput {
  readonly id?: EntityId;
  readonly customerId: EntityId;
  readonly locationId?: EntityId;
  readonly documentDate: string;
  readonly externalRef?: string;
  readonly expectedDeliveryDate?: string;
  readonly status?: 'confirmed' | 'cancelled';
  readonly notes?: string;
  readonly paymentTerms?: string;
  /** Sconto extra % documento (0-100), dopo gli sconti riga. */
  readonly documentDiscountPercent?: number;
  /** Righe opzionali: l'ordine può esistere con la sola testata. */
  readonly lines: readonly SaveManualOrderLineInput[];
}

/** Impegno attivo dell'ordine (per il calcolo della Q.tà disponibile in modifica). */
export interface ManualOrderReservation {
  readonly variantId: EntityId;
  readonly remainingQuantity: number;
}

export interface SaveManualOrderResult {
  readonly order: SalesOrder;
  readonly reservations: readonly ManualOrderReservation[];
  /** Avvisi disponibilità NON bloccanti (§CONTROLLI). */
  readonly warnings: readonly string[];
}

export interface ManualOrderMeta {
  readonly nextReferencePreview: string;
  /** Tipi di documento di scarico disponibili oggi (enum API, es. sales_ddt). */
  readonly unloadDocumentTypes: readonly string[];
}

export interface ConcludeManualOrderResult {
  readonly documentId: EntityId;
  readonly documentType: string;
}

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

  // ── Ordine cliente manuale ─────────────────────────────────────────────

  getManualOrderMeta(): Observable<ManualOrderMeta> {
    return this.http
      .get<ManualOrderMeta>(this.url('/sales-orders/manual/meta'))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  saveManualOrder(input: SaveManualOrderInput): Observable<SaveManualOrderResult> {
    return this.http
      .post<{
        order: SalesOrderApiRow;
        reservations: readonly ManualOrderReservation[];
        warnings: readonly string[];
      }>(this.url('/sales-orders/manual/save'), input)
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((result) => ({
          order: mapSalesOrderApiRow(result.order),
          reservations: result.reservations,
          warnings: result.warnings,
        })),
      );
  }

  /** Elimina un ordine cliente manuale dall'elenco (rilascia gli impegni). */
  deleteManualOrder(id: EntityId): Observable<void> {
    return this.http
      .delete<void>(this.url(`/sales-orders/manual/${id}`))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /** Duplica un ordine in un nuovo ordine cliente manuale col cliente scelto. */
  duplicateManualOrder(id: EntityId, customerId: EntityId): Observable<SalesOrder> {
    return this.http
      .post<{ order: SalesOrderApiRow }>(this.url(`/sales-orders/manual/${id}/duplicate`), {
        customerId,
      })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((result) => mapSalesOrderApiRow(result.order)),
      );
  }

  getManualOrderReservations(id: EntityId): Observable<readonly ManualOrderReservation[]> {
    return this.http
      .get<readonly ManualOrderReservation[]>(this.url(`/sales-orders/manual/${id}/reservations`))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /** "Concludi ordine": genera il documento di scarico precompilato (bozza). */
  concludeManualOrder(id: EntityId, documentType: string): Observable<ConcludeManualOrderResult> {
    return this.http
      .post<ConcludeManualOrderResult>(this.url(`/sales-orders/manual/${id}/conclude`), {
        documentType,
      })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  /** Forza a Concluso un ordine Parzialmente concluso (prompt DDT). */
  forceConcludeManualOrder(id: EntityId): Observable<{ ok: true }> {
    return this.http
      .post<{ ok: true }>(this.url(`/sales-orders/manual/${id}/force-conclude`), {})
      .pipe(timeout(HTTP_TIMEOUT_MS));
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
    if (query.fulfillmentStatus) {
      next = next.set('fulfillmentStatus', query.fulfillmentStatus);
    }
    if (query.source) {
      next = next.set('source', query.source);
    }
    if (query.state) {
      next = next.set('state', query.state);
    }
    if (query.customerId) {
      next = next.set('customerId', query.customerId);
    }
    if (query.locationId) {
      next = next.set('locationId', query.locationId);
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
