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
import { MovementOrigin, StockMovementType } from '@core/models/stock-movement.model';
import type { StockMovement } from '@core/models/stock-movement.model';
import { AdjustmentDirection } from '@core/models/stock-movement.model';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { formatDateTime } from '@core/utils/date.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';

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
    DateInputComponent,
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

  /**
   * Canale (origine movimento) per il filtro di consultazione del registro.
   * Le opzioni del canale ecommerce dipendono dal profilo del tenant:
   * solo Shopify per i tenant Shopify, solo TikTok per i tenant TikTok.
   */
  protected readonly originOptions = computed((): readonly SelectMenuOption[] => {
    const options: SelectMenuOption[] = [
      { value: MovementOrigin.VestiflowPos, label: 'Negozio fisico' },
    ];

    const profile = this.authService.currentUser()?.tenantChannelProfile;
    if (profile === TenantChannelProfile.Shopify) {
      options.push({ value: MovementOrigin.Shopify, label: 'Shopify' });
    } else if (profile === TenantChannelProfile.TikTokShop) {
      options.push({ value: MovementOrigin.Tiktok, label: 'TikTok Shop' });
    }

    options.push({
      value: MovementOrigin.VestiflowOnline,
      label: 'Vendita online esterna',
    });

    return options;
  });

  private readonly refreshTick = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_INVENTORY_PAGE_SIZE);

  protected readonly typeFilter = signal('');
  protected readonly originFilter = signal('');
  protected readonly fromFilter = signal('');
  protected readonly toFilter = signal('');
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
    origin: this.originFilter(),
    from: this.fromFilter(),
    to: this.toFilter(),
    location: this.locationFilter(),
  }));

  private readonly query = computed((): StockMovementsListQuery => {
    const type = this.typeFilter();
    const origin = this.originFilter();
    const locationId = this.locationFilter();
    return {
      page: this.page(),
      pageSize: this.pageSize(),
      type: type ? (type as StockMovementType) : undefined,
      origin: origin ? (origin as MovementOrigin) : undefined,
      locationId: locationId || undefined,
      from: this.isoFrom(),
      to: this.isoTo(),
    };
  });

  /** Inizio giornata (ora locale) per il filtro 'da'. */
  private isoFrom(): string | undefined {
    const value = this.fromFilter();
    return value ? `${value}T00:00:00` : undefined;
  }

  /** Fine giornata (ora locale) per includere tutto il giorno 'a'. */
  private isoTo(): string | undefined {
    const value = this.toFilter();
    return value ? `${value}T23:59:59.999` : undefined;
  }

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
    Boolean(
      this.typeFilter() ||
      this.originFilter() ||
      this.fromFilter() ||
      this.toFilter() ||
      this.locationFilter(),
    ),
  );

  protected onTypeFilterChange(value: string | null): void {
    this.typeFilter.set(value ?? '');
  }

  protected onOriginFilterChange(value: string | null): void {
    this.originFilter.set(value ?? '');
  }

  protected onLocationFilterChange(value: string | null): void {
    this.locationFilter.set(value ?? '');
  }

  protected onFromFilterChange(value: string): void {
    this.fromFilter.set(value);
  }

  protected onToFilterChange(value: string): void {
    this.toFilter.set(value);
  }

  protected resetFilters(): void {
    this.typeFilter.set('');
    this.originFilter.set('');
    this.fromFilter.set('');
    this.toFilter.set('');
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
