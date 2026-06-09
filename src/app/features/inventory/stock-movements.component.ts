import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Location } from '@core/models/location.model';
import { StockMovementType } from '@core/models/stock-movement.model';
import type { StockMovement } from '@core/models/stock-movement.model';
import { AdjustmentDirection } from '@core/models/stock-movement.model';
import { formatDateTime } from '@core/utils/date.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { InventoryTabsComponent } from './components/inventory-tabs/inventory-tabs.component';
import { MovementTableComponent } from './components/movement-table/movement-table.component';
import type { StockMovementRow } from './models/inventory-view.model';
import { InventoryService } from './services/inventory.service';

interface MovementsData {
  readonly movements: readonly StockMovement[];
  readonly locations: readonly Location[];
}

type MovementsState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: MovementsData }
  | { readonly status: 'error'; readonly error: AppError };

/** Storico movimenti di magazzino (smart): log immutabile, filtri locali. */
@Component({
  selector: 'app-stock-movements',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    InventoryTabsComponent,
    MovementTableComponent,
  ],
  templateUrl: './stock-movements.component.html',
  styleUrl: './stock-movements.component.scss',
})
export class StockMovementsComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly router = inject(Router);

  protected readonly skeletonColumns = 6;

  private readonly refreshTick = signal(0);

  protected readonly typeFilter = signal('');
  protected readonly locationFilter = signal('');

  private readonly state = toSignal(
    toObservable(this.refreshTick).pipe(
      switchMap(() =>
        forkJoin({
          movements: this.inventoryService.getMovements(),
          locations: this.inventoryService.getLocations(),
        }).pipe(
          map((data): MovementsState => ({ status: 'success', data })),
          startWith<MovementsState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<MovementsState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies MovementsState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly locations = computed<readonly Location[]>(() => {
    const current = this.state();
    return current.status === 'success' ? current.data.locations : [];
  });

  private readonly allRows = computed<readonly StockMovementRow[]>(() => {
    const current = this.state();
    if (current.status !== 'success') {
      return [];
    }
    const locationById = new Map(current.data.locations.map((location) => [location.id, location]));
    const nameOf = (id: string): string => locationById.get(id)?.name ?? id;

    return current.data.movements.map(
      (movement): StockMovementRow => ({
        id: movement.id,
        type: movement.type,
        sku: movement.sku,
        signedQuantity: this.signedQuantity(movement),
        locationLabel:
          movement.type === StockMovementType.Transfer && movement.targetLocationId
            ? `${nameOf(movement.locationId)} → ${nameOf(movement.targetLocationId)}`
            : nameOf(movement.locationId),
        direction: movement.direction,
        reason: movement.reason,
        createdAtLabel: formatDateTime(movement.createdAt),
        createdByName: movement.createdByName,
      }),
    );
  });

  protected readonly rows = computed<readonly StockMovementRow[]>(() => {
    const type = this.typeFilter();
    const location = this.locationFilter();
    const current = this.state();
    if (current.status !== 'success') {
      return [];
    }
    // Filtro per id movimento originale: ricostruito dal dataset completo.
    const allowedIds = new Set(
      current.data.movements
        .filter((movement) => {
          if (type && movement.type !== type) {
            return false;
          }
          if (
            location &&
            movement.locationId !== location &&
            movement.targetLocationId !== location
          ) {
            return false;
          }
          return true;
        })
        .map((movement) => movement.id),
    );
    return this.allRows().filter((row) => allowedIds.has(row.id));
  });

  protected readonly isEmpty = computed(
    () => this.state().status === 'success' && this.rows().length === 0,
  );

  protected readonly hasActiveFilters = computed(() =>
    Boolean(this.typeFilter() || this.locationFilter()),
  );

  protected onTypeChange(event: Event): void {
    this.typeFilter.set((event.target as HTMLSelectElement).value);
  }

  protected onLocationChange(event: Event): void {
    this.locationFilter.set((event.target as HTMLSelectElement).value);
  }

  protected resetFilters(): void {
    this.typeFilter.set('');
    this.locationFilter.set('');
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected newMovement(): void {
    void this.router.navigateByUrl('/app/inventory/movements/new');
  }

  /** '+' per ingressi, '−' per uscite, nuda per i trasferimenti (neutri). */
  private signedQuantity(movement: StockMovement): string {
    switch (movement.type) {
      case StockMovementType.Load:
      case StockMovementType.Return:
        return `+${movement.quantity}`;
      case StockMovementType.Unload:
      case StockMovementType.Sale:
        return `\u2212${movement.quantity}`;
      case StockMovementType.Adjustment:
        return movement.direction === AdjustmentDirection.Decrease
          ? `\u2212${movement.quantity}`
          : `+${movement.quantity}`;
      case StockMovementType.Transfer:
        return `${movement.quantity}`;
    }
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
