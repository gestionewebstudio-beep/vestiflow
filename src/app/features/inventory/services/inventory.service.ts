import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, of, type Observable, shareReplay, switchMap, throwError, timeout } from 'rxjs';

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
  InventoryExportQuery,
  InventoryImportPreview,
  InventoryImportResult,
} from '../models/inventory-import.model';

import {
  mapInventoryCountLineApiRow,
  mapInventoryCountSessionApiRow,
  type InventoryCountLineApiRow,
  type InventoryCountSessionApiRow,
} from '../models/inventory-count.mapper';

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
const LIST_PAGE_SIZE = 100;
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
  }

  getLocationById(locationId: EntityId): Observable<Location> {
    return this.getLocations().pipe(
      map((locations) => locations.find((candidate) => candidate.id === locationId)),
      switchMap((location) => (location ? of(location) : throwError(() => this.notFoundError()))),
    );
  }

  getLevels(): Observable<readonly InventoryLevel[]> {
    const params = new HttpParams().set('page', '1').set('pageSize', String(LIST_PAGE_SIZE));
    return this.http
      .get<ApiPaginated<InventoryLevelApiRow>>(this.url('/inventory/levels'), { params })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((response) => toPaginatedResponse(response).data.map(mapInventoryLevelApiRow)),
      );
  }

  getLevelsByVariant(variantId: EntityId): Observable<readonly InventoryLevel[]> {
    return this.getLevels().pipe(
      map((levels) => levels.filter((level) => level.variantId === variantId)),
    );
  }

  getLevelsByLocation(locationId: EntityId): Observable<readonly InventoryLevel[]> {
    return this.getLevels().pipe(
      map((levels) => levels.filter((level) => level.locationId === locationId)),
    );
  }

  getMovements(): Observable<readonly StockMovement[]> {
    const params = new HttpParams().set('page', '1').set('pageSize', String(LIST_PAGE_SIZE));
    return this.http
      .get<ApiPaginated<StockMovementApiRow>>(this.url('/inventory/movements'), { params })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        map((response) => toPaginatedResponse(response).data.map(mapStockMovementApiRow)),
      );
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
    const params = new HttpParams().set('page', '1').set('pageSize', String(LIST_PAGE_SIZE));
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
      .pipe(timeout(EXPORT_HTTP_TIMEOUT_MS));
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

    return this.http
      .get(this.url('/inventory/levels/export/csv'), { params, responseType: 'blob' })
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
