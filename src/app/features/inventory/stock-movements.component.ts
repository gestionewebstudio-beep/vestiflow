import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, forkJoin, map, of, skip, startWith, switchMap } from 'rxjs';

import type { PageMeta } from '@core/models/api.model';
import { AuthService } from '@core/auth';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { canManageInventory } from '@core/permissions/tenant-permissions.util';
import { canSwitchOperationalLocation } from '@core/utils/user-location-scope.util';
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
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import { InventoryTabsComponent } from './components/inventory-tabs/inventory-tabs.component';
import { MovementTableComponent } from './components/movement-table/movement-table.component';
import { movementOriginLabel } from './models/inventory-labels.util';
import type { StockMovementRow } from './models/inventory-view.model';
import {
  DEFAULT_INVENTORY_PAGE_SIZE,
  INVENTORY_PAGE_SIZE_OPTIONS,
} from './models/inventory-list-query.model';
import type { StockMovementsListQuery } from './models/inventory-list-query.model';
import { InventoryService } from './services/inventory.service';

interface MovementsData {
  readonly movements: readonly StockMovement[];
  readonly locations: readonly Location[];
  readonly meta: PageMeta;
}

type MovementsState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: MovementsData }
  | { readonly status: 'error'; readonly error: AppError };

const EMPTY_META: PageMeta = {
  page: 1,
  pageSize: DEFAULT_INVENTORY_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

/** Storico movimenti di magazzino (smart): filtri e paginazione server-side. */
@Component({
  selector: 'app-stock-movements',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    SelectMenuComponent,
    PaginationComponent,
    InventoryTabsComponent,
    MovementTableComponent,
  ],
  templateUrl: './stock-movements.component.html',
  styleUrl: './stock-movements.component.scss',
})
export class StockMovementsComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly authService = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly skeletonColumns = 8;
  protected readonly pageSizeOptions = INVENTORY_PAGE_SIZE_OPTIONS;

  protected readonly movementTypeOptions: readonly SelectMenuOption[] = [
    { value: StockMovementType.Load, label: 'Carico' },
    { value: StockMovementType.Unload, label: 'Scarico' },
    { value: StockMovementType.Transfer, label: 'Trasferimento' },
    { value: StockMovementType.Adjustment, label: 'Rettifica' },
    { value: StockMovementType.Sale, label: 'Vendita' },
    { value: StockMovementType.Return, label: 'Reso' },
  ];

  private readonly refreshTick = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_INVENTORY_PAGE_SIZE);

  protected readonly typeFilter = signal('');
  // La location parte dal contesto globale (selettore topbar).
  protected readonly locationFilter = signal(this.locationContext.activeLocationId() ?? '');

  protected readonly canManageInventory = computed(() =>
    canManageInventory(this.authService.currentUser()),
  );

  constructor() {
    effect(() => {
      if (!canSwitchOperationalLocation(this.authService.currentUser())) {
        return;
      }
      this.locationFilter.set(this.locationContext.activeLocationId() ?? '');
    });

    toObservable(this.filters)
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.page.set(1));
  }

  private readonly filters = computed(() => ({
    type: this.typeFilter(),
    location: this.locationFilter(),
  }));

  private readonly query = computed((): StockMovementsListQuery => {
    const type = this.typeFilter();
    const locationId = this.locationFilter();
    return {
      page: this.page(),
      pageSize: this.pageSize(),
      type: type ? (type as StockMovementType) : undefined,
      locationId: locationId || undefined,
    };
  });

  private readonly request = computed(() => ({
    query: this.query(),
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query }) =>
        forkJoin({
          movements: this.inventoryService.getMovements(query),
          locations: this.inventoryService.getLocations(),
        }).pipe(
          map(
            ({ movements, locations }): MovementsState => ({
              status: 'success',
              data: {
                movements: movements.data,
                locations,
                meta: movements.meta,
              },
            }),
          ),
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

  protected readonly locationOptions = computed<readonly SelectMenuOption[]>(() =>
    this.operationalLocations.locations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  );

  protected readonly meta = computed<PageMeta>(() => {
    const current = this.state();
    return current.status === 'success' ? current.data.meta : EMPTY_META;
  });

  protected readonly rows = computed<readonly StockMovementRow[]>(() => {
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
        origin: movement.origin,
        originLabel: movementOriginLabel(movement.origin),
      }),
    );
  });

  protected readonly isEmpty = computed(() => {
    const current = this.state();
    return current.status === 'success' && current.data.meta.total === 0;
  });

  protected readonly hasActiveFilters = computed(() =>
    Boolean(this.typeFilter() || this.locationFilter()),
  );

  protected onTypeFilterChange(value: string | null): void {
    this.typeFilter.set(value ?? '');
  }

  protected onLocationFilterChange(value: string | null): void {
    this.locationFilter.set(value ?? '');
  }

  protected resetFilters(): void {
    this.typeFilter.set('');
    this.locationFilter.set('');
  }

  protected goToPage(page: number): void {
    this.page.set(page);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
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
