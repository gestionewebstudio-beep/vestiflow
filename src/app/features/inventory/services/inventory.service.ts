import { Injectable } from '@angular/core';
import { type Observable, delay, of, switchMap, throwError } from 'rxjs';

import { AppErrorKind } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { EntityId, IsoDateString } from '@core/models/common.model';
import type { InventoryLevel } from '@core/models/inventory-level.model';
import type { Location } from '@core/models/location.model';
import { AdjustmentDirection, StockMovementType } from '@core/models/stock-movement.model';
import type { StockMovement } from '@core/models/stock-movement.model';

import { MOCK_INVENTORY_LEVELS, MOCK_LOCATIONS } from './inventory.mock-data';
import { MOCK_STOCK_MOVEMENTS } from './stock-movements.mock-data';

const LOCATIONS_LATENCY_MS = 300;
const LEVELS_LATENCY_MS = 400;
const MOVEMENTS_LATENCY_MS = 400;
const WRITE_LATENCY_MS = 600;

const MOCK_TENANT_ID: EntityId = 'tenant-demo';
const DEFAULT_MIN_THRESHOLD = 5;

// Sentinel di sviluppo: un id pari a 'error' forza un errore server (test stato error).
const ERROR_SENTINEL = 'error';

/** Input per la registrazione di un movimento manuale (carico/scarico/rettifica/trasferimento). */
export interface RegisterMovementInput {
  readonly type: StockMovementType;
  readonly variantId: EntityId;
  /** SKU snapshot per display/audit. */
  readonly sku: string;
  /** Location interessata; per i trasferimenti e' l'origine. */
  readonly locationId: EntityId;
  /** Solo trasferimenti: location di destinazione. */
  readonly targetLocationId?: EntityId;
  readonly quantity: number;
  /** Solo rettifiche: verso della correzione. */
  readonly direction?: AdjustmentDirection;
  readonly reason?: string;
  readonly createdBy: EntityId;
  readonly createdByName: string;
}

/**
 * Accesso a location, giacenze e movimenti. Implementazione mock (in memoria)
 * con latenza ed errori simulati, coerente con ProductService.
 * Ogni modifica inventariale passa SOLO da registerMovement: aggiorna le
 * giacenze E produce il movimento tracciabile (regole-gestionale, mai update
 * silenziosi). Sostituibile con un client HTTP (NestJS/Railway) senza cambiare
 * l'API pubblica.
 */
@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly locations: readonly Location[] = [...MOCK_LOCATIONS];
  // Mutabili: registerMovement persiste per la sessione corrente.
  private levels: InventoryLevel[] = [...MOCK_INVENTORY_LEVELS];
  private movements: StockMovement[] = [...MOCK_STOCK_MOVEMENTS];

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

  /** Tutte le giacenze del tenant (overview magazzino cross-location). */
  getLevels(): Observable<readonly InventoryLevel[]> {
    return of([...this.levels] as readonly InventoryLevel[]).pipe(delay(LEVELS_LATENCY_MS));
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

  /** Storico movimenti (piu' recenti per primi). */
  getMovements(): Observable<readonly StockMovement[]> {
    const sorted = [...this.movements].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return of(sorted as readonly StockMovement[]).pipe(delay(MOVEMENTS_LATENCY_MS));
  }

  /**
   * Registra un movimento e aggiorna le giacenze interessate in modo atomico
   * (mock). 422 se l'input non e' coerente (qty < 1, rettifica senza motivo,
   * trasferimento senza destinazione o con origine = destinazione).
   */
  registerMovement(input: RegisterMovementInput): Observable<StockMovement> {
    const validation = this.validateMovement(input);
    if (validation) {
      return this.failWith(validation, WRITE_LATENCY_MS);
    }

    const movement: StockMovement = {
      id: crypto.randomUUID(),
      tenantId: MOCK_TENANT_ID,
      type: input.type,
      variantId: input.variantId,
      sku: input.sku,
      locationId: input.locationId,
      quantity: input.quantity,
      direction: input.direction,
      reason: input.reason?.trim() || undefined,
      targetLocationId: input.targetLocationId,
      createdAt: this.now(),
      createdBy: input.createdBy,
      createdByName: input.createdByName,
    };

    this.applyMovement(movement);
    this.movements = [movement, ...this.movements];

    return of(movement).pipe(delay(WRITE_LATENCY_MS));
  }

  /** Delta sulle giacenze in funzione del tipo (direzione data dal type). */
  private applyMovement(movement: StockMovement): void {
    const qty = movement.quantity;
    switch (movement.type) {
      case StockMovementType.Load:
      case StockMovementType.Return:
        this.adjustLevel(movement.variantId, movement.locationId, qty);
        break;
      case StockMovementType.Unload:
      case StockMovementType.Sale:
        this.adjustLevel(movement.variantId, movement.locationId, -qty);
        break;
      case StockMovementType.Adjustment:
        this.adjustLevel(
          movement.variantId,
          movement.locationId,
          movement.direction === AdjustmentDirection.Decrease ? -qty : qty,
        );
        break;
      case StockMovementType.Transfer:
        this.adjustLevel(movement.variantId, movement.locationId, -qty);
        if (movement.targetLocationId) {
          this.adjustLevel(movement.variantId, movement.targetLocationId, qty);
        }
        break;
    }
  }

  /** Applica un delta a onHand/available; crea la riga giacenza se mancante. */
  private adjustLevel(variantId: EntityId, locationId: EntityId, deltaQty: number): void {
    const existing = this.levels.find(
      (level) => level.variantId === variantId && level.locationId === locationId,
    );
    if (existing) {
      this.levels = this.levels.map((level) =>
        level === existing
          ? { ...level, onHand: level.onHand + deltaQty, available: level.available + deltaQty }
          : level,
      );
      return;
    }
    this.levels = [
      ...this.levels,
      {
        id: `inv-${locationId}-${variantId}`,
        variantId,
        locationId,
        onHand: deltaQty,
        available: deltaQty,
        committed: 0,
        incoming: 0,
        reserved: 0,
        minThreshold: DEFAULT_MIN_THRESHOLD,
      },
    ];
  }

  private validateMovement(input: RegisterMovementInput): AppError | null {
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      return this.validationError('La quantita\u0027 deve essere un intero maggiore di zero.');
    }
    if (input.type === StockMovementType.Adjustment) {
      if (!input.reason?.trim()) {
        return this.validationError('Una rettifica richiede sempre un motivo.');
      }
      if (!input.direction) {
        return this.validationError('Una rettifica richiede il verso (aumento o diminuzione).');
      }
    }
    if (input.type === StockMovementType.Transfer) {
      if (!input.targetLocationId) {
        return this.validationError('Un trasferimento richiede la location di destinazione.');
      }
      if (input.targetLocationId === input.locationId) {
        return this.validationError('Origine e destinazione devono essere diverse.');
      }
    }
    return null;
  }

  // Errore simulato dopo la stessa latenza della chiamata "felice".
  private failWith<T>(error: AppError, latencyMs: number): Observable<T> {
    return of(null).pipe(
      delay(latencyMs),
      switchMap(() => throwError(() => error)),
    );
  }

  private now(): IsoDateString {
    return new Date().toISOString();
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

  private validationError(message: string): AppError {
    return {
      kind: AppErrorKind.Validation,
      message,
      status: 422,
    };
  }
}
