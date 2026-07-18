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
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  map,
  of,
  skip,
  startWith,
  switchMap,
} from 'rxjs';
import type { Subscription } from 'rxjs';

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
import { formatDateTime } from '@core/utils/date.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';

import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableViewId } from '@shared/table-columns/table-column.model';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import { CustomerService } from '@features/customers/services/customer.service';
import { SupplierService } from '@features/suppliers/services/supplier.service';

import { InventoryTabsComponent } from './components/inventory-tabs/inventory-tabs.component';
import { MovementTableComponent } from './components/movement-table/movement-table.component';
import { movementActorLabel, movementOriginLabel } from './models/inventory-labels.util';
import type { StockMovementRow } from './models/inventory-view.model';
import {
  STOCK_MOVEMENT_COLUMN_DEFS,
  STOCK_MOVEMENT_COLUMN_PRESETS,
} from './models/stock-movements-table-columns.config';
import {
  DEFAULT_INVENTORY_PAGE_SIZE,
  INVENTORY_PAGE_SIZE_OPTIONS,
} from './models/inventory-list-query.model';
import type { StockMovementsListQuery } from './models/inventory-list-query.model';
import { MovementPeriodPreset, resolveMovementPeriodRange } from './models/movement-period.util';
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

const SEARCH_DEBOUNCE_MS = 300;

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
    TableColumnPickerComponent,
  ],
  templateUrl: './stock-movements.component.html',
  styleUrl: './stock-movements.component.scss',
})
export class StockMovementsComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly customerService = inject(CustomerService);
  private readonly supplierService = inject(SupplierService);
  private readonly authService = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly columnPreferences = inject(TableColumnPreferenceService);

  protected readonly tableViewId = TableViewId.StockMovements;
  protected readonly tableColumns: ReturnType<TableColumnPreferenceService['visibleColumns']>;

  protected readonly skeletonColumns = 8;
  protected readonly pageSizeOptions = INVENTORY_PAGE_SIZE_OPTIONS;

  protected readonly movementTypeOptions: readonly SelectMenuOption[] = [
    { value: StockMovementType.Load, label: 'Carico' },
    { value: StockMovementType.Unload, label: 'Scarico' },
    { value: StockMovementType.Transfer, label: 'Trasferimento' },
    { value: StockMovementType.Adjustment, label: 'Rettifica' },
    { value: StockMovementType.Sale, label: 'Vendita' },
    { value: StockMovementType.OnlineSale, label: 'Vendita online' },
    { value: StockMovementType.Return, label: 'Reso' },
  ];

  /**
   * Origine del movimento: tutte le origini reali del registro (qui compare
   * OGNI movimento che tocca le giacenze, qualunque sia la fonte). Etichette
   * coerenti con la colonna Origine (movementOriginLabel).
   */
  protected readonly originOptions = computed((): readonly SelectMenuOption[] => {
    const profile = this.authService.currentUser()?.tenantChannelProfile;
    return [
      MovementOrigin.Manual,
      MovementOrigin.Shopify,
      MovementOrigin.Tiktok,
      MovementOrigin.VestiflowPos,
      MovementOrigin.VestiflowOnline,
    ].map((origin) => ({ value: origin, label: movementOriginLabel(origin, profile) }));
  });

  /** Operatori che hanno generato movimenti (snapshot createdByName). */
  protected readonly operatorOptions = toSignal(
    this.inventoryService.getMovementOperators().pipe(
      map((operators): readonly SelectMenuOption[] =>
        operators.map((name) => ({ value: name, label: movementActorLabel(name) })),
      ),
      catchError(() => of([] as readonly SelectMenuOption[])),
    ),
    { initialValue: [] as readonly SelectMenuOption[] },
  );

  /** Scelte rapide periodo; il valore vuoto (placeholder «Tutti») non filtra. */
  protected readonly periodOptions: readonly SelectMenuOption[] = [
    { value: MovementPeriodPreset.ThisMonth, label: 'Mese corrente' },
    { value: MovementPeriodPreset.LastMonth, label: 'Mese scorso' },
    { value: MovementPeriodPreset.ThisYear, label: 'Anno corrente' },
    { value: MovementPeriodPreset.LastYear, label: 'Anno scorso' },
    { value: MovementPeriodPreset.Custom, label: 'Personalizzato' },
  ];

  /** Controparti (fornitori + clienti) per il dropdown con ricerca. */
  protected readonly partyOptions = toSignal(
    forkJoin({
      suppliers: this.supplierService.getSuppliers().pipe(catchError(() => of([]))),
      customers: this.customerService.getAllCustomers().pipe(catchError(() => of([]))),
    }).pipe(
      map(({ suppliers, customers }): readonly SelectMenuOption[] => [
        ...suppliers.map((supplier) => ({
          value: supplier.id,
          label: supplier.name,
          detail: 'Fornitore',
        })),
        ...customers.map((customer) => ({
          value: customer.id,
          label: `${customer.firstName} ${customer.lastName}`.trim(),
          detail: 'Cliente',
        })),
      ]),
    ),
    { initialValue: [] as readonly SelectMenuOption[] },
  );

  protected readonly emptyStateCtaLabel = computed(() =>
    this.canManageInventory() ? 'Registra movimento' : undefined,
  );

  private readonly refreshTick = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_INVENTORY_PAGE_SIZE);

  protected readonly typeFilter = signal('');
  protected readonly originFilter = signal('');
  protected readonly periodFilter = signal<MovementPeriodPreset>(MovementPeriodPreset.All);
  // Dal/Al: usati solo con periodo «Personalizzato».
  protected readonly fromFilter = signal('');
  protected readonly toFilter = signal('');
  protected readonly partyFilter = signal('');
  protected readonly operatorFilter = signal('');
  protected readonly searchDraft = signal('');
  private readonly search = signal('');
  // La location parte dal contesto globale (selettore topbar).
  protected readonly locationFilter = signal(this.locationContext.activeLocationId() ?? '');

  protected readonly isCustomPeriod = computed(
    () => this.periodFilter() === MovementPeriodPreset.Custom,
  );

  protected readonly canManageInventory = computed(() =>
    canManageInventory(this.authService.currentUser()),
  );

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private readonly searchSubscription: Subscription;

  constructor() {
    this.columnPreferences.registerView(
      TableViewId.StockMovements,
      STOCK_MOVEMENT_COLUMN_DEFS,
      STOCK_MOVEMENT_COLUMN_PRESETS,
    );
    this.tableColumns = this.columnPreferences.visibleColumns(TableViewId.StockMovements);

    effect(() => {
      if (!canSwitchOperationalLocation(this.authService.currentUser())) {
        return;
      }
      this.locationFilter.set(this.locationContext.activeLocationId() ?? '');
    });

    this.searchSubscription = toObservable(this.searchDraft)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => this.search.set(value));

    toObservable(this.filters)
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.page.set(1));
  }

  private readonly filters = computed(() => ({
    type: this.typeFilter(),
    origin: this.originFilter(),
    period: this.periodFilter(),
    from: this.fromFilter(),
    to: this.toFilter(),
    location: this.locationFilter(),
    search: this.search(),
    party: this.partyFilter(),
    operator: this.operatorFilter(),
  }));

  /** Estremi data effettivi: preset rapido o intervallo custom Dal/Al. */
  private readonly dateRange = computed(() =>
    resolveMovementPeriodRange(this.periodFilter(), this.fromFilter(), this.toFilter()),
  );

  private readonly query = computed((): StockMovementsListQuery => {
    const type = this.typeFilter();
    const origin = this.originFilter();
    const locationId = this.locationFilter();
    const range = this.dateRange();
    return {
      page: this.page(),
      pageSize: this.pageSize(),
      type: type ? (type as StockMovementType) : undefined,
      origin: origin ? (origin as MovementOrigin) : undefined,
      locationId: locationId || undefined,
      search: this.search().trim() || undefined,
      partyId: this.partyFilter() || undefined,
      createdBy: this.operatorFilter() || undefined,
      // Inizio/fine giornata (ora locale) per includere i giorni estremi interi.
      from: range.from ? `${range.from}T00:00:00` : undefined,
      to: range.to ? `${range.to}T23:59:59.999` : undefined,
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

    const profile = this.authService.currentUser()?.tenantChannelProfile;

    return current.data.movements.map(
      (movement): StockMovementRow => ({
        id: movement.id,
        type: movement.type,
        sku: movement.sku,
        articleCode: movement.articleCode ?? '',
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
        originLabel: movementOriginLabel(movement.origin, profile),
        productTitle: movement.productTitle,
        documentReference: movement.documentReference,
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
      this.periodFilter() ||
      this.fromFilter() ||
      this.toFilter() ||
      this.locationFilter() ||
      this.search().trim() ||
      this.partyFilter() ||
      this.operatorFilter(),
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

  protected onPeriodFilterChange(value: string | null): void {
    const preset = (value ?? MovementPeriodPreset.All) as MovementPeriodPreset;
    this.periodFilter.set(preset);
    // Le date custom valgono solo con «Personalizzato»: altrove vanno azzerate.
    if (preset !== MovementPeriodPreset.Custom) {
      this.fromFilter.set('');
      this.toFilter.set('');
    }
  }

  protected onPartyFilterChange(value: string | null): void {
    this.partyFilter.set(value ?? '');
  }

  protected onOperatorFilterChange(value: string | null): void {
    this.operatorFilter.set(value ?? '');
  }

  protected onSearchInput(event: Event): void {
    this.searchDraft.set((event.target as HTMLInputElement).value);
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
    this.periodFilter.set(MovementPeriodPreset.All);
    this.fromFilter.set('');
    this.toFilter.set('');
    this.locationFilter.set('');
    this.partyFilter.set('');
    this.operatorFilter.set('');
    this.searchDraft.set('');
    this.search.set('');
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

  protected onEmptyStateAction(): void {
    this.newMovement();
  }

  /** '+' per ingressi, '−' per uscite, nuda per i trasferimenti (neutri). */
  private signedQuantity(movement: StockMovement): string {
    switch (movement.type) {
      case StockMovementType.Load:
      case StockMovementType.Return:
        return `+${movement.quantity}`;
      case StockMovementType.Unload:
      case StockMovementType.Sale:
      case StockMovementType.OnlineSale:
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
