import { HttpClient, HttpParams } from '@angular/common/http';
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
import { AppErrorKind } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { EntityId } from '@core/models/common.model';
import type { InventoryLevel } from '@core/models/inventory-level.model';
import type { Location } from '@core/models/location.model';
import type { StockMovement } from '@core/models/stock-movement.model';

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
  private readonly http = inject(HttpClient);
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
