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
  CorrispettiviListQuery,
  CorrispettiviLocation,
  CorrispettiviRefundKind,
  CorrispettiviRegisterRow,
  CorrispettiviRowKind,
  CorrispettiviSummary,
} from '../models/corrispettivi.model';

const HTTP_TIMEOUT_MS = 15000;
const EXPORT_HTTP_TIMEOUT_MS = 60_000;

interface CorrispettiviRegisterApiRow {
  readonly rowId: string;
  readonly kind: CorrispettiviRowKind;
  readonly salesOrderId: EntityId | null;
  readonly manualReceiptId?: EntityId | null;
  readonly orderNumber: string;
  readonly occurredAt: string;
  readonly source: string;
  readonly customerName: string;
  readonly customerEmail?: string | null;
  readonly locationId?: EntityId | null;
  readonly locationName?: string | null;
  readonly currency: string;
  readonly taxableMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly financialStatus?: string | null;
  readonly refundKind?: CorrispettiviRefundKind | null;
  readonly note?: string | null;
}

interface CorrispettiviSummaryApi {
  readonly orderCount: number;
  readonly undatedFulfilmentCount: number;
  readonly refundsCount: number;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly shippingMinor: number;
  readonly discountMinor: number;
  readonly totalMinor: number;
  readonly taxableMinor: number;
  readonly refundCount: number;
  readonly refundTotalMinor: number;
  readonly refundTaxMinor: number;
  readonly cancellationCount: number;
  readonly cancellationTotalMinor: number;
  readonly netTotalMinor: number;
  readonly netTaxMinor: number;
  readonly netTaxableMinor: number;
  readonly locationUndeterminedExcludedCount?: number;
  readonly perGiornata?: readonly {
    readonly giorno: string;
    readonly totali: {
      readonly netTaxableMinor: number;
      readonly netTaxMinor: number;
      readonly netTotalMinor: number;
      readonly orderCount: number;
      readonly refundCount: number;
    };
  }[];
}

@Injectable({ providedIn: 'root' })
export class CorrispettiviService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  listOrders(
    query: CorrispettiviListQuery = {},
  ): Observable<PaginatedResponse<CorrispettiviRegisterRow>> {
    return this.http
      .get<ApiPaginated<CorrispettiviRegisterApiRow>>(this.url('/corrispettivi/orders'), {
        params: this.buildParams(query),
      })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((response) => {
          const paginated = toPaginatedResponse(response);
          return {
            data: paginated.data.map(mapRegisterRow),
            meta: paginated.meta,
          };
        }),
      );
  }

  /**
   * Le sedi del filtro. Chiede la CONSULTAZIONE del Registro, non il diritto di
   * registrare: chi può solo leggere deve poter comunque filtrare per sede.
   */
  listLocations(): Observable<readonly CorrispettiviLocation[]> {
    return this.http
      .get<readonly CorrispettiviLocation[]>(this.url('/corrispettivi/locations'))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  getSummary(query: CorrispettiviListQuery = {}): Observable<CorrispettiviSummary> {
    return this.http
      .get<CorrispettiviSummaryApi>(this.url('/corrispettivi/summary'), {
        params: this.buildParams(query),
      })
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapSummary));
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

    if (query.placedFrom) {
      params = params.set('placedFrom', query.placedFrom);
    }
    if (query.placedTo) {
      params = params.set('placedTo', query.placedTo);
    }
    if (query.ambito && query.ambito !== 'all') {
      params = params.set('ambito', query.ambito);
    }
    if (query.canale && query.canale !== 'all') {
      params = params.set('canale', query.canale);
    }
    if (query.origine && query.origine !== 'all') {
      params = params.set('origine', query.origine);
    }
    if (query.locationId) {
      params = params.set('locationId', query.locationId);
    }

    if (query.refundsOnly) {
      params = params.set('refundsOnly', 'true');
    }
    if (query.rowType) {
      params = params.set('rowType', query.rowType);
    }

    // ── I filtri a INSIEME (`docs/10` §16) ──────────────────────────────
    //
    // ⚠️ **Un insieme vuoto NON parte.** Non è un'ottimizzazione: «vuoto» qui
    // significa «nessuna restrizione», e mandarlo lo farebbe diventare un
    // `in: []` lato Prisma — che non è «tutti», è nessuna riga.
    if (query.origini?.length) {
      params = params.set('origini', query.origini.join(','));
    }
    if (query.tipi?.length) {
      params = params.set('tipi', query.tipi.join(','));
    }
    if (query.sedi?.length) {
      params = params.set('sedi', query.sedi.join(','));
    }
    // Lo stato opposto, e per questo un parametro suo: zero righe, non tutte.
    if (query.nessunRisultato) {
      params = params.set('nessunRisultato', 'true');
    }

    // Presentazione: la mandano solo PDF ed Excel. «Nessun raggruppamento» non
    // parte, come ogni altro valore che significa «niente restrizione».
    if (query.raggruppa && query.raggruppa !== 'none') {
      params = params.set('raggruppa', query.raggruppa);
    }
    if (query.colonne?.length) {
      params = params.set('colonne', query.colonne.join(','));
    }

    return params;
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}

function mapRegisterRow(row: CorrispettiviRegisterApiRow): CorrispettiviRegisterRow {
  const currency = row.currency || DEFAULT_CURRENCY;
  return {
    rowId: row.rowId,
    kind: row.kind,
    salesOrderId: row.salesOrderId ?? undefined,
    manualReceiptId: row.manualReceiptId ?? undefined,
    orderNumber: row.orderNumber,
    occurredAt: row.occurredAt,
    source: row.source,
    customerName: row.customerName,
    customerEmail: row.customerEmail ?? undefined,
    locationId: row.locationId ?? undefined,
    locationName: row.locationName ?? undefined,
    currency,
    // Gli importi arrivano già col segno: sulle rettifiche sono negativi, ed è
    // quel segno che rende la colonna sommabile a occhio.
    taxable: money(row.taxableMinor, currency),
    tax: money(row.taxMinor, currency),
    total: money(row.totalMinor, currency),
    financialStatus: row.financialStatus ?? undefined,
    refundKind: row.refundKind ?? undefined,
    note: row.note ?? undefined,
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
    undatedFulfilmentCount: row.undatedFulfilmentCount,
    refundCount: row.refundCount,
    refundTotal: money(row.refundTotalMinor),
    refundTax: money(row.refundTaxMinor),
    cancellationCount: row.cancellationCount,
    cancellationTotal: money(row.cancellationTotalMinor),
    netTotal: money(row.netTotalMinor),
    netTax: money(row.netTaxMinor),
    netTaxable: money(row.netTaxableMinor),
    locationUndeterminedExcludedCount: row.locationUndeterminedExcludedCount ?? 0,
    // ⚠️ Il subtotale di giornata NON si ricalcola qui dalle righe: arriva
    // dallo stesso accumulatore che ha prodotto il totale del periodo, di cui
    // è un addendo. Sommarlo a parte sarebbe la seconda matematica.
    perGiornata: (row.perGiornata ?? []).map((g) => ({
      giorno: g.giorno,
      taxable: money(g.totali.netTaxableMinor),
      tax: money(g.totali.netTaxMinor),
      total: money(g.totali.netTotalMinor),
      orderCount: g.totali.orderCount,
      refundCount: g.totali.refundCount,
    })),
  };
}

function money(amountMinor: number, currencyCode = DEFAULT_CURRENCY) {
  return { amountMinor, currencyCode };
}
