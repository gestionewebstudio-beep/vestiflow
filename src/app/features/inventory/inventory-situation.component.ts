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
  map,
  of,
  skip,
  startWith,
  switchMap,
} from 'rxjs';
import type { Subscription } from 'rxjs';

import { AuthService } from '@core/auth';
import type { PageMeta } from '@core/models/api.model';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { canManageSupplierOrders } from '@core/permissions/tenant-permissions.util';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { canSwitchOperationalLocation } from '@core/utils/user-location-scope.util';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { ListActionsBarComponent } from '@shared/components/list-actions-bar/list-actions-bar.component';
import type { ListAction } from '@shared/models/list-selection.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableViewId } from '@shared/table-columns/table-column.model';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import { ProductService } from '@domain/products/services/product.service';
import {
  SUPPLIER_ORDER_PREFILL_STATE_KEY,
  type SupplierOrderPrefill,
} from '@domain/supplier-orders/models/supplier-order-prefill.model';
import { SupplierService } from '@domain/suppliers/services/supplier.service';

import { InventoryTabsComponent } from './components/inventory-tabs/inventory-tabs.component';
import { SituationTableComponent } from './components/situation-table/situation-table.component';
import {
  DEFAULT_INVENTORY_PAGE_SIZE,
  INVENTORY_PAGE_SIZE_OPTIONS,
} from '@domain/inventory/models/inventory-list-query.model';
import {
  INVENTORY_SITUATION_COLUMN_DEFS,
  INVENTORY_SITUATION_COLUMN_PRESETS,
} from './models/inventory-situation-table-columns.config';
import type {
  InventorySituationListQuery,
  InventorySituationRow,
} from '@domain/inventory/models/inventory-situation.model';
import { InventoryService } from '@domain/inventory/services/inventory.service';

interface SituationData {
  readonly rows: readonly InventorySituationRow[];
  readonly meta: PageMeta;
}

type SituationState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: SituationData }
  | { readonly status: 'error'; readonly error: AppError };

const SEARCH_DEBOUNCE_MS = 300;

const EMPTY_META: PageMeta = {
  page: 1,
  pageSize: DEFAULT_INVENTORY_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

/**
 * Tab Situazione (smart): fotografia del magazzino per variante con giacenze
 * aggregate, dati economici e stato scorte.
 *
 * ⭐ Selezione checkbox → «Nuovo ordine fornitore», che **apre un ordine nuovo
 * precompilato** — una riga per articolo, quantità 1 — e lascia salvare
 * all'operatore. ⛔ Fino al 29/08/2026 l'ordine lo creava lei chiamando l'API,
 * e si finiva a correggere le quantità su un documento già emesso.
 */
@Component({
  selector: 'app-inventory-situation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ListActionsBarComponent,
    ListPageComponent,
    ButtonComponent,
    SelectMenuComponent,
    SlidePanelComponent,
    PaginationComponent,
    InventoryTabsComponent,
    SituationTableComponent,
  ],
  templateUrl: './inventory-situation.component.html',
  styleUrl: './inventory-situation.component.scss',
})
export class InventorySituationComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly supplierService = inject(SupplierService);
  private readonly productService = inject(ProductService);
  private readonly authService = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly columnPreferences = inject(TableColumnPreferenceService);

  protected readonly tableViewId = TableViewId.InventorySituation;
  protected readonly tableColumns: ReturnType<TableColumnPreferenceService['visibleColumns']>;

  protected readonly skeletonColumns = 8;
  protected readonly pageSizeOptions = INVENTORY_PAGE_SIZE_OPTIONS;

  protected readonly stockStatusOptions: readonly SelectMenuOption[] = [
    { value: 'ok', label: 'Disponibile' },
    { value: 'low', label: 'Sotto soglia' },
    { value: 'empty', label: 'Esaurito' },
  ];

  private readonly refreshTick = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_INVENTORY_PAGE_SIZE);

  protected readonly statusFilter = signal('');
  protected readonly supplierFilter = signal('');
  protected readonly categoryFilter = signal('');
  protected readonly searchDraft = signal('');
  private readonly search = signal('');
  // La location parte dal contesto globale (selettore topbar).
  protected readonly locationFilter = signal(this.locationContext.activeLocationId() ?? '');

  // Selezione per il riordino: Map così le righe scelte sopravvivono al
  // cambio pagina/filtri e restano disponibili per le righe ordine.
  private readonly selectedRows = signal<ReadonlyMap<string, InventorySituationRow>>(new Map());
  protected readonly selectedIds = computed<ReadonlySet<string>>(
    () => new Set(this.selectedRows().keys()),
  );
  protected readonly selectedCount = computed(() => this.selectedRows().size);

  protected readonly selectedRowIds = computed(() => [...this.selectedRows().keys()]);

  /**
   * ⭐ **Le funzioni dell'elenco, sempre visibili** (`14` §5.1): a selezione
   * vuota l'azione è **spenta col motivo**, non assente.
   *
   * ⛔ Prima compariva solo con righe spuntate, e chi non sapeva che si
   * selezionano non vedeva nemmeno che l'ordine si poteva creare.
   * _Decisione del proprietario, 29/08/2026, sul riferimento Danea._
   */
  protected readonly selectionActions = computed<readonly ListAction[]>(() =>
    this.canCreateSupplierOrder()
      ? [
          {
            id: 'supplier-order',
            label: 'Nuovo ordine fornitore',
            icon: 'pi-shopping-bag',
            requires: 'oneOrMore',
            ariaLabel: 'Crea un ordine fornitore dagli articoli selezionati',
            run: () => this.openOrderPanel(),
          },
        ]
      : [],
  );

  // Pannello «Nuovo ordine fornitore».
  protected readonly orderPanelOpen = signal(false);
  protected readonly orderSupplierId = signal('');
  protected readonly newSupplierMode = signal(false);
  protected readonly newSupplierName = signal('');
  protected readonly orderSubmitting = signal(false);
  protected readonly orderError = signal<string | null>(null);

  protected readonly canCreateSupplierOrder = computed(() =>
    canManageSupplierOrders(this.authService.currentUser()),
  );

  protected readonly supplierOptions = toSignal(
    this.supplierService.getSuppliers().pipe(
      map((suppliers): readonly SelectMenuOption[] =>
        suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
      ),
      catchError(() => of([] as readonly SelectMenuOption[])),
    ),
    { initialValue: [] as readonly SelectMenuOption[] },
  );

  protected readonly categoryOptions = toSignal(
    this.productService.getFilterOptions().pipe(
      map((options): readonly SelectMenuOption[] =>
        options.categories.map((category) => ({ value: category, label: category })),
      ),
      catchError(() => of([] as readonly SelectMenuOption[])),
    ),
    { initialValue: [] as readonly SelectMenuOption[] },
  );

  protected readonly locationOptions = computed<readonly SelectMenuOption[]>(() =>
    this.operationalLocations.locations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  );

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private readonly searchSubscription: Subscription;

  constructor() {
    this.columnPreferences.registerView(
      TableViewId.InventorySituation,
      INVENTORY_SITUATION_COLUMN_DEFS,
      INVENTORY_SITUATION_COLUMN_PRESETS,
    );
    this.tableColumns = this.columnPreferences.visibleColumns(TableViewId.InventorySituation);

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
    status: this.statusFilter(),
    supplier: this.supplierFilter(),
    category: this.categoryFilter(),
    location: this.locationFilter(),
    search: this.search(),
  }));

  private readonly query = computed((): InventorySituationListQuery => ({
    page: this.page(),
    pageSize: this.pageSize(),
    locationId: this.locationFilter() || undefined,
    supplierId: this.supplierFilter() || undefined,
    category: this.categoryFilter() || undefined,
    stockStatus: this.statusFilter() || undefined,
    search: this.search().trim() || undefined,
  }));

  private readonly request = computed(() => ({
    query: this.query(),
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query }) =>
        this.inventoryService.getSituation(query).pipe(
          map((response): SituationState => ({
            status: 'success',
            data: { rows: response.data, meta: response.meta },
          })),
          startWith<SituationState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<SituationState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies SituationState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly rows = computed<readonly InventorySituationRow[]>(() => {
    const current = this.state();
    return current.status === 'success' ? current.data.rows : [];
  });

  protected readonly meta = computed<PageMeta>(() => {
    const current = this.state();
    return current.status === 'success' ? current.data.meta : EMPTY_META;
  });

  protected readonly isEmpty = computed(
    () => this.state().status === 'success' && this.meta().total === 0,
  );

  protected readonly hasActiveFilters = computed(() =>
    Boolean(
      this.statusFilter() ||
      this.supplierFilter() ||
      this.categoryFilter() ||
      this.locationFilter() ||
      this.search().trim(),
    ),
  );

  protected onSearchInput(event: Event): void {
    this.searchDraft.set((event.target as HTMLInputElement).value);
  }

  protected onStatusFilterChange(value: string | null): void {
    this.statusFilter.set(value ?? '');
  }

  protected onSupplierFilterChange(value: string | null): void {
    this.supplierFilter.set(value ?? '');
  }

  protected onCategoryFilterChange(value: string | null): void {
    this.categoryFilter.set(value ?? '');
  }

  protected onLocationFilterChange(value: string | null): void {
    this.locationFilter.set(value ?? '');
  }

  protected resetFilters(): void {
    this.statusFilter.set('');
    this.supplierFilter.set('');
    this.categoryFilter.set('');
    this.locationFilter.set('');
    this.searchDraft.set('');
    this.search.set('');
    this.page.set(1);
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

  // ── Selezione articoli ────────────────────────────────────────────────────

  protected onRowToggle(row: InventorySituationRow): void {
    this.selectedRows.update((current) => {
      const next = new Map(current);
      if (next.has(row.variantId)) {
        next.delete(row.variantId);
      } else {
        next.set(row.variantId, row);
      }
      return next;
    });
  }

  protected onPageToggle(checked: boolean): void {
    const pageRows = this.rows();
    this.selectedRows.update((current) => {
      const next = new Map(current);
      for (const row of pageRows) {
        if (checked) {
          next.set(row.variantId, row);
        } else {
          next.delete(row.variantId);
        }
      }
      return next;
    });
  }

  protected clearSelection(): void {
    this.selectedRows.set(new Map());
  }

  // ── Nuovo ordine fornitore dagli articoli selezionati ─────────────────────

  protected openOrderPanel(): void {
    // ⛔ Qui il fornitore si proponeva da solo quando gli articoli selezionati
    //    ne avevano uno solo. Tolto il 29/08/2026 su indicazione del
    //    proprietario: il pannello il fornitore lo CHIEDE comunque, quindi una
    //    proposta automatica aggiunge un comportamento da spiegare senza
    //    togliere un passo.
    this.orderSupplierId.set('');
    this.newSupplierMode.set(false);
    this.newSupplierName.set('');
    this.orderError.set(null);
    this.orderPanelOpen.set(true);
  }

  protected closeOrderPanel(): void {
    if (this.orderSubmitting()) {
      return;
    }
    this.orderPanelOpen.set(false);
  }

  protected toggleNewSupplierMode(): void {
    this.newSupplierMode.update((mode) => !mode);
    this.orderError.set(null);
  }

  protected onOrderSupplierChange(value: string | null): void {
    this.orderSupplierId.set(value ?? '');
  }

  protected onNewSupplierNameInput(event: Event): void {
    this.newSupplierName.set((event.target as HTMLInputElement).value);
  }

  protected readonly canSubmitOrder = computed(() => {
    if (this.orderSubmitting() || this.selectedCount() === 0) {
      return false;
    }
    return this.newSupplierMode()
      ? this.newSupplierName().trim().length > 0
      : Boolean(this.orderSupplierId());
  });

  protected submitOrder(): void {
    if (!this.canSubmitOrder()) {
      return;
    }
    this.orderSubmitting.set(true);
    this.orderError.set(null);

    const supplier$ = this.newSupplierMode()
      ? this.supplierService
          .createSupplier({ name: this.newSupplierName().trim() })
          .pipe(map((supplier) => supplier.id))
      : of(this.orderSupplierId());

    supplier$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (supplierId) => {
        // ⛔ **Qui l'ordine si CREAVA**, con una chiamata all'API, e poi si
        //    apriva la sua modifica: esisteva nel database prima che
        //    l'operatore avesse visto una riga. Le quantità nascono tutte a 1 e
        //    vanno quasi sempre corrette — cioè si finiva per modificare un
        //    documento emesso invece di compilarne uno.
        //
        // ⭐ Ora la Situazione **propone**: apre un ordine nuovo precompilato,
        //    e a salvare è l'operatore (decisione del proprietario, 29/08/2026).
        const prefill: SupplierOrderPrefill = {
          supplierId,
          variantIds: [...this.selectedRows().values()].map((row) => row.variantId),
        };

        this.orderSubmitting.set(false);
        this.orderPanelOpen.set(false);
        this.clearSelection();
        void this.router.navigate(['/app/orders/new'], {
          state: { [SUPPLIER_ORDER_PREFILL_STATE_KEY]: prefill },
        });
      },
      error: (err: unknown) => {
        this.orderSubmitting.set(false);
        this.orderError.set(this.extractErrorMessage(err));
      },
    });
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }

  private extractErrorMessage(err: unknown): string {
    if (isAppError(err)) {
      return err.message;
    }
    return 'Operazione non riuscita. Riprova.';
  }
}
