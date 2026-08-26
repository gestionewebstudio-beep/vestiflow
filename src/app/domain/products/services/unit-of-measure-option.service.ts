import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map, take, type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { EntityId } from '@core/models/common.model';

import type { UnitOfMeasureOption } from '@domain/products/models/unit-of-measure-option.model';

const HTTP_TIMEOUT_MS = 15000;

interface UnitOfMeasureOptionApiRow {
  readonly id: EntityId;
  readonly name: string;
  readonly sortOrder: number;
  readonly isSystem: boolean;
  readonly isActive: boolean;
  readonly isDefault?: boolean;
}

export interface UpsertUnitOfMeasureOptionBody {
  readonly name?: string;
  readonly isActive?: boolean;
  readonly sortOrder?: number;
  readonly isDefault?: boolean;
}

function mapOption(row: UnitOfMeasureOptionApiRow): UnitOfMeasureOption {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    isSystem: row.isSystem,
    isActive: row.isActive,
    // ⚠️ `=== true`: una risposta che non porta il campo (API più vecchia) deve
    //   dire «non predefinita», non «forse».
    isDefault: row.isDefault === true,
  };
}

/**
 * Accesso HTTP all'elenco delle unità di misura del tenant (seed lazy lato
 * server: la prima lettura di un tenant nuovo lo popola con le unità comuni).
 */
@Injectable({ providedIn: 'root' })
export class UnitOfMeasureOptionService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _cached = signal<readonly UnitOfMeasureOption[]>([]);
  /**
   * L'elenco condiviso da tutte le celle U.M. aperte.
   *
   * Vive qui e non nelle maschere per una ragione aritmetica: la cella sta su
   * **ogni riga**, e se ognuna caricasse il proprio elenco un documento da
   * trenta righe farebbe trenta chiamate identiche. `ensureLoaded()` è
   * idempotente e la prima cella che si monta paga per tutte.
   */
  private readonly cached = this._cached.asReadonly();
  private loading = false;

  /**
   * L'elenco, caricandolo se serve. Si legge una volta sola — in un campo del
   * componente — e da lì in poi è un segnale come un altro: chiederlo **è** ciò
   * che innesca il caricamento, così non esiste il modo di dimenticarselo.
   */
  options(): typeof this.cached {
    this.ensureLoaded();
    return this.cached;
  }

  /**
   * **Il codice dell’unità predefinita del tenant, o `null`.**
   *
   * ⚠️ Serve a UNA cosa sola: precompilare un articolo NUOVO. Non sostituisce il
   * default della riga documento, che continua a venire dall’articolo, e non
   * riscrive niente di esistente — deciso dal proprietario il 26/08/2026.
   *
   * ⛔ `null` è un valore legittimo, non un guasto: chi ha articoli misti non
   * vuole una predefinita, e la spunta si può togliere.
   */
  defaultCode(): string | null {
    // ⚠️ `isActive` ANCHE qui, benché il server ormai non lasci più esistere una
    //   predefinita spenta: le righe scritte prima del 26/08/2026 potrebbero,
    //   e una predefinita che non compare nella tendina non deve seminare niente.
    return this.options()().find((o) => o.isDefault && o.isActive)?.name ?? null;
  }

  /** Carica l'elenco se non c'è ancora. Chiamarla più volte non costa niente. */
  ensureLoaded(): void {
    if (this.loading || this._cached().length > 0) {
      return;
    }
    this.reload();
  }

  /** Ricarica dopo una modifica fatta nel pannello di gestione. */
  reload(): void {
    this.loading = true;
    this.list()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (options) => {
          this.loading = false;
          this._cached.set(options);
        },
        // Senza elenco la cella resta un campo di testo libero: si digita
        // l'unità e si va avanti. È il caso peggiore, e non blocca niente.
        error: () => {
          this.loading = false;
        },
      });
  }

  list(): Observable<readonly UnitOfMeasureOption[]> {
    return this.http.get<readonly UnitOfMeasureOptionApiRow[]>(this.url('')).pipe(
      timeout(HTTP_TIMEOUT_MS),
      map((rows) => rows.map(mapOption)),
    );
  }

  create(name: string): Observable<UnitOfMeasureOption> {
    return this.http
      .post<UnitOfMeasureOptionApiRow>(this.url(''), { name })
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapOption));
  }

  update(id: EntityId, body: UpsertUnitOfMeasureOptionBody): Observable<UnitOfMeasureOption> {
    return this.http
      .patch<UnitOfMeasureOptionApiRow>(this.url(`/${id}`), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapOption));
  }

  /**
   * Elimina la voce. Nessun conteggio d'uso da mostrare prima, a differenza dei
   * tipi documento: qui non c'è niente che punti a questa riga, e ciò che è
   * scritto sui documenti resta scritto.
   */
  delete(id: EntityId): Observable<void> {
    return this.http.delete<void>(this.url(`/${id}`)).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}/unit-of-measure-options${path}`;
  }
}
