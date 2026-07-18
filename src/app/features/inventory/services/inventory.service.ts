import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  map,
  of,
  Subject,
  tap,
  type Observable,
  shareReplay,
  switchMap,
  throwError,
  timeout,
} from 'rxjs';

import { toPaginatedResponse } from '@core/api/api-pagination.mapper';
import type { ApiPaginated } from '@core/api/api-paginated.model';
import {
  mapInventoryLevelApiRow,
  mapLocationApiRow,
  mapStockMovementApiRow,
  type InventoryLevelApiRow,
  type LocationApiRow,
  type StockMovementApiRow,
} from '@core/api/domain-api.mapper';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import { AppErrorKind } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { PaginatedResponse } from '@core/models/api.model';
import type { EntityId } from '@core/models/common.model';
import type { InventoryLevel } from '@core/models/inventory-level.model';
import type {
  CreateInventoryCountInput,
  InventoryCountLine,
  InventoryCountSession,
} from '@core/models/inventory-count.model';
import type { Location } from '@core/models/location.model';
import type { StockMovement } from '@core/models/stock-movement.model';

import type {
  CorrispettiviExportQuery,
  InventoryExportQuery,
  InventoryImportPreview,
  InventoryImportResult,
} from '../models/inventory-import.model';
import type {
  InventoryLevelsListQuery,
  StockMovementsListQuery,
} from '../models/inventory-list-query.model';
import { DEFAULT_INVENTORY_PAGE_SIZE } from '../models/inventory-list-query.model';
import {
  mapInventoryLevelListItem,
  type InventoryLevelListItem,
} from '../models/inventory-list.mapper';

import {
  mapInventoryCountLineApiRow,
  mapInventoryCountSessionApiRow,
  type InventoryCountLineApiRow,
  type InventoryCountSessionApiRow,
} from '../models/inventory-count.mapper';
import type { StockReservationRow } from '../models/stock-reservation.model';

/** Input per la registrazione di un movimento manuale (carico/scarico/rettifica/trasferimento). */
export interface RegisterMovementInput {
  readonly type: StockMovement['type'];
  readonly variantId: EntityId;
  /** SKU snapshot per display/audit (non inviato all'API: il server usa lo snapshot). */
  readonly sku: string;
  readonly locationId: EntityId;
  readonly targetLocationId?: EntityId;
  readonly quantity: number;
  readonly direction?: StockMovement['direction'];
  readonly reason?: string;
  readonly createdBy: EntityId;
  readonly createdByName: string;
}

const HTTP_TIMEOUT_MS = 15000;
const EXPORT_HTTP_TIMEOUT_MS = 120000;
const IMPORT_HTTP_TIMEOUT_MS = 300000;
const LEVELS_BY_VARIANT_PAGE_SIZE = 100;

export interface LocationInventoryReportRow {
  readonly locationId: EntityId;
  readonly locationName: string;
  readonly trackedVariants: number;
  readonly availableUnits: number;
  readonly lowStockCount: number;
  readonly stockValueMinor: number;
  readonly currencyCode: string;
}
const LOCATIONS_CACHE_MS = 5 * 60_000;

interface TimedCache<T> {
  readonly expiresAt: number;
  readonly value$: Observable<T>;
}

/**
 * Accesso HTTP a location, giacenze e movimenti (NestJS + Supabase).
 * Ogni modifica inventariale passa da registerMovement sul backend (transazionale).
 */
@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  private locationsCache: TimedCache<readonly Location[]> | null = null;
  private readonly locationsInvalidatedSubject = new Subject<void>();

  /** Emesso quando la cache location va ricaricata (sync Shopify, licenze, ecc.). */
  watchLocationsInvalidated(): Observable<void> {
    return this.locationsInvalidatedSubject.asObservable();
  }

  getLocations(): Observable<readonly Location[]> {
    if (!this.locationsCache || this.locationsCache.expiresAt <= Date.now()) {
      this.locationsCache = {
        expiresAt: Date.now() + LOCATIONS_CACHE_MS,
        value$: this.http.get<readonly LocationApiRow[]>(this.url('/inventory/locations')).pipe(
          timeout(HTTP_TIMEOUT_MS),
          map((rows) => rows.map(mapLocationApiRow)),
          shareReplay({ bufferSize: 1, refCount: false }),
        ),
      };
    }
    return this.locationsCache.value$;
  }

  /** Forza il refresh dopo creazione/modifica location (futuro). */
  invalidateLocationsCache(): void {
    this.locationsCache = null;
    this.locationsInvalidatedSubject.next();
  }

  setLicensedLocations(locationIds: readonly string[]): Observable<{
    readonly licensedLocationCount: number;
    readonly licensedLocationActiveCount: number;
    readonly locationSelectionLocked: boolean;
    readonly locationSelectionChangeGranted: boolean;
    readonly canChangeLicensedLocations: boolean;
  }> {
    return this.http
      .put<{
        readonly licensedLocationCount: number;
        readonly licensedLocationActiveCount: number;
        readonly locationSelectionLocked: boolean;
        readonly locationSelectionChangeGranted: boolean;
        readonly canChangeLicensedLocations: boolean;
      }>(this.url('/inventory/locations/licensed'), { locationIds })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        tap(() => this.invalidateLocationsCache()),
      );
  }

  getLocationById(locationId: EntityId): Observable<Location> {
    return this.getLocations().pipe(
      map((locations) => locations.find((candidate) => candidate.id === locationId)),
      switchMap((location) => (location ? of(location) : throwError(() => this.notFoundError()))),
    );
  }

  getLevels(
    query: InventoryLevelsListQuery = {},
  ): Observable<PaginatedResponse<InventoryLevelListItem>> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('pageSize', String(query.pageSize ?? DEFAULT_INVENTORY_PAGE_SIZE));

    if (query.locationId) params = params.set('locationId', query.locationId);
    if (query.search) params = params.set('search', query.search);
    if (query.variantId) params = params.set('variantId', query.variantId);
    if (query.lowStockOnly) params = params.set('lowStockOnly', 'true');

    return this.http
      .get<ApiPaginated<InventoryLevelApiRow>>(this.url('/inventory/levels'), { params })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((response) => {
          const paginated = toPaginatedResponse(response);
          return {
            data: paginated.data.map(mapInventoryLevelListItem),
            meta: paginated.meta,
          };
        }),
      );
  }

  getLevelsByVariant(variantId: EntityId): Observable<readonly InventoryLevelListItem[]> {
    return this.getLevels({
      variantId,
      page: 1,
      pageSize: LEVELS_BY_VARIANT_PAGE_SIZE,
    }).pipe(map((response) => response.data));
  }

  getLevelsByLocation(locationId: EntityId): Observable<readonly InventoryLevelListItem[]> {
    return this.getLevels({ locationId, page: 1, pageSize: LEVELS_BY_VARIANT_PAGE_SIZE }).pipe(
      map((response) => response.data),
    );
  }

  getLocationInventoryReport(): Observable<readonly LocationInventoryReportRow[]> {
    return this.http
      .get<readonly LocationInventoryReportRow[]>(this.url('/inventory/reports/location-summary'))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  getMovements(query: StockMovementsListQuery = {}): Observable<PaginatedResponse<StockMovement>> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('pageSize', String(query.pageSize ?? DEFAULT_INVENTORY_PAGE_SIZE));

    if (query.locationId) params = params.set('locationId', query.locationId);
    if (query.search) params = params.set('search', query.search);
    if (query.type) params = params.set('type', query.type);
    if (query.origin) params = params.set('origin', query.origin);
    if (query.variantId) params = params.set('variantId', query.variantId);
    if (query.partyId) params = params.set('partyId', query.partyId);
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);

    return this.http
      .get<ApiPaginated<StockMovementApiRow>>(this.url('/inventory/movements'), { params })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((response) => {
          const paginated = toPaginatedResponse(response);
          return {
            data: paginated.data.map(mapStockMovementApiRow),
            meta: paginated.meta,
          };
        }),
      );
  }

  /** Impegni attivi che compongono la Impegnata di una variante × location. */
  getReservations(
    variantId: EntityId,
    locationId: EntityId,
  ): Observable<readonly StockReservationRow[]> {
    const params = new HttpParams().set('variantId', variantId).set('locationId', locationId);
    return this.http
      .get<readonly StockReservationRow[]>(this.url('/inventory/reservations'), { params })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  updateLevelMinThreshold(id: EntityId, minThreshold: number): Observable<InventoryLevel> {
    return this.http
      .patch<InventoryLevelApiRow>(this.url(`/inventory/levels/${id}`), { minThreshold })
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapInventoryLevelApiRow));
  }

  registerMovement(input: RegisterMovementInput): Observable<StockMovement> {
    const body = {
      type: input.type,
      variantId: input.variantId,
      locationId: input.locationId,
      targetLocationId: input.targetLocationId,
      quantity: input.quantity,
      direction: input.direction,
      reason: input.reason,
    };
    return this.http
      .post<StockMovementApiRow>(this.url('/inventory/movements'), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapStockMovementApiRow));
  }

  listInventoryCounts(): Observable<readonly InventoryCountSession[]> {
    const params = new HttpParams()
      .set('page', '1')
      .set('pageSize', String(LEVELS_BY_VARIANT_PAGE_SIZE));
    return this.http
      .get<ApiPaginated<InventoryCountSessionApiRow>>(this.url('/inventory/counts'), { params })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((response) => toPaginatedResponse(response).data.map(mapInventoryCountSessionApiRow)),
      );
  }

  getInventoryCount(id: EntityId): Observable<InventoryCountSession> {
    return this.http
      .get<InventoryCountSessionApiRow>(this.url(`/inventory/counts/${id}`))
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapInventoryCountSessionApiRow));
  }

  createInventoryCount(input: CreateInventoryCountInput): Observable<InventoryCountSession> {
    return this.http
      .post<InventoryCountSessionApiRow>(this.url('/inventory/counts'), input)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapInventoryCountSessionApiRow));
  }

  updateInventoryCountLine(
    sessionId: EntityId,
    lineId: EntityId,
    countedQuantity: number,
  ): Observable<InventoryCountLine> {
    return this.http
      .patch<InventoryCountLineApiRow>(this.url(`/inventory/counts/${sessionId}/lines/${lineId}`), {
        countedQuantity,
      })
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapInventoryCountLineApiRow));
  }

  submitInventoryCount(sessionId: EntityId): Observable<InventoryCountSession> {
    return this.http
      .post<InventoryCountSessionApiRow>(this.url(`/inventory/counts/${sessionId}/submit`), {})
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapInventoryCountSessionApiRow));
  }

  finalizeInventoryCount(sessionId: EntityId): Observable<InventoryCountSession> {
    return this.http
      .post<InventoryCountSessionApiRow>(this.url(`/inventory/counts/${sessionId}/finalize`), {})
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapInventoryCountSessionApiRow));
  }

  cancelInventoryCount(sessionId: EntityId): Observable<InventoryCountSession> {
    return this.http
      .post<InventoryCountSessionApiRow>(this.url(`/inventory/counts/${sessionId}/cancel`), {})
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapInventoryCountSessionApiRow));
  }

  deleteInventoryCount(sessionId: EntityId): Observable<void> {
    return this.http
      .delete<void>(this.url(`/inventory/counts/${sessionId}`))
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  previewInventoryImport(file: File): Observable<InventoryImportPreview> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http
      .post<InventoryImportPreview>(this.url('/inventory/levels/import/preview'), formData)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  importInventoryCsv(file: File, keys?: readonly string[]): Observable<InventoryImportResult> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    if (keys?.length) {
      for (const key of keys) {
        formData.append('keys[]', key);
      }
    }
    return this.http
      .post<InventoryImportResult>(this.url('/inventory/levels/import'), formData)
      .pipe(timeout(IMPORT_HTTP_TIMEOUT_MS));
  }

  exportInventoryCsv(query: InventoryExportQuery): Observable<Blob> {
    let params = new HttpParams();
    if (query.locationId) {
      params = params.set('locationId', query.locationId);
    }
    if (query.search) {
      params = params.set('search', query.search);
    }
    if (query.stockStatus) {
      params = params.set('stockStatus', query.stockStatus);
    }
    if (query.columns) {
      params = params.set('columns', query.columns);
    }

    return this.http
      .get(this.url('/inventory/levels/export/csv'), { params, responseType: 'blob' })
      .pipe(timeout(EXPORT_HTTP_TIMEOUT_MS));
  }

  /** Export CSV corrispettivi: vendite/storni in un periodo, per canale e location. */
  exportCorrispettiviCsv(query: CorrispettiviExportQuery): Observable<Blob> {
    let params = new HttpParams();
    if (query.locationId) {
      params = params.set('locationId', query.locationId);
    }
    if (query.origin) {
      params = params.set('origin', query.origin);
    }
    if (query.from) {
      params = params.set('from', query.from);
    }
    if (query.to) {
      params = params.set('to', query.to);
    }

    return this.http
      .get(this.url('/inventory/movements/export/corrispettivi'), {
        params,
        responseType: 'blob',
      })
      .pipe(timeout(EXPORT_HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }

  private notFoundError(): AppError {
    return {
      kind: AppErrorKind.NotFound,
      message: 'Location non trovata.',
      status: 404,
    };
  }
}
