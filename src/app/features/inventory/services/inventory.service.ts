import { Injectable } from '@angular/core';
import { type Observable, delay, of, switchMap, throwError } from 'rxjs';

import { AppErrorKind } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { EntityId } from '@core/models/common.model';
import type { InventoryLevel } from '@core/models/inventory-level.model';
import type { Location } from '@core/models/location.model';

import { MOCK_INVENTORY_LEVELS, MOCK_LOCATIONS } from './inventory.mock-data';

const LOCATIONS_LATENCY_MS = 300;
const LEVELS_LATENCY_MS = 400;

// Sentinel di sviluppo: un id pari a 'error' forza un errore server (test stato error).
const ERROR_SENTINEL = 'error';

/**
 * Accesso in sola lettura a location e giacenze. Implementazione mock (in
 * memoria) con latenza ed errori simulati, coerente con ProductService.
 * Solo orchestrazione/lettura: nessuna mutazione stock, trasferimento o
 * movimento (regole-gestionale). Le aggregazioni vivono in inventory.util.
 * Sostituibile con un client HTTP (NestJS/Railway, PostgreSQL/Supabase) senza
 * cambiare l'API pubblica.
 */
@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly locations: readonly Location[] = [...MOCK_LOCATIONS];
  private readonly levels: readonly InventoryLevel[] = [...MOCK_INVENTORY_LEVELS];

  /** Tutte le location del tenant corrente. */
  getLocations(): Observable<readonly Location[]> {
    return of(this.locations).pipe(delay(LOCATIONS_LATENCY_MS));
  }

  /** Singola location per id; AppError NotFound se assente. */
  getLocationById(locationId: EntityId): Observable<Location> {
    if (locationId === ERROR_SENTINEL) {
      return this.failWith(this.serverError(), LOCATIONS_LATENCY_MS);
    }
    const location = this.locations.find((candidate) => candidate.id === locationId);
    if (!location) {
      return this.failWith(this.notFoundError(), LOCATIONS_LATENCY_MS);
    }
    return of(location).pipe(delay(LOCATIONS_LATENCY_MS));
  }

  /** Giacenze di una variante su tutte le location (per aggregazioni cross-location). */
  getLevelsByVariant(variantId: EntityId): Observable<readonly InventoryLevel[]> {
    if (variantId === ERROR_SENTINEL) {
      return this.failWith(this.serverError(), LEVELS_LATENCY_MS);
    }
    const result = this.levels.filter((level) => level.variantId === variantId);
    return of(result).pipe(delay(LEVELS_LATENCY_MS));
  }

  /** Giacenze presenti in una location (tutte le varianti con stock tracciato lì). */
  getLevelsByLocation(locationId: EntityId): Observable<readonly InventoryLevel[]> {
    if (locationId === ERROR_SENTINEL) {
      return this.failWith(this.serverError(), LEVELS_LATENCY_MS);
    }
    const result = this.levels.filter((level) => level.locationId === locationId);
    return of(result).pipe(delay(LEVELS_LATENCY_MS));
  }

  // Errore simulato dopo la stessa latenza della chiamata "felice".
  private failWith<T>(error: AppError, latencyMs: number): Observable<T> {
    return of(null).pipe(
      delay(latencyMs),
      switchMap(() => throwError(() => error)),
    );
  }

  private serverError(): AppError {
    return {
      kind: AppErrorKind.Server,
      message: 'Errore nel caricamento delle giacenze. Riprova piu\u0027 tardi.',
      status: 500,
    };
  }

  private notFoundError(): AppError {
    return {
      kind: AppErrorKind.NotFound,
      message: 'Location non trovata.',
      status: 404,
    };
  }
}
