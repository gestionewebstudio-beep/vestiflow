import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { BackgroundBlobExportService } from '@core/services/background-blob-export.service';
import { INVENTORY_LEVELS_CSV_EXPORT_ID } from '@core/export/background-blob-export.constants';
import { vestiflowExportFilename } from '@core/export/background-blob-export-filename.util';
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
import { BarcodeDetectionService } from '@core/services/barcode-detection.service';
import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import {
  canImportExportInventory,
  canSyncInventoryFromShopify,
} from '@core/permissions/tenant-permissions.util';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { InventoryLevel } from '@core/models/inventory-level.model';
import { StockStatus } from '@core/models/inventory-level.model';
import type { Location } from '@core/models/location.model';
import { stockStatusOf } from '@core/utils/inventory.util';
import { ListActionsBarComponent } from '@shared/components/list-actions-bar/list-actions-bar.component';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { comando, voceEsporta } from '@shared/models/list-action-catalog';
import type { ListAction } from '@shared/models/list-selection.model';
import { BarcodeScannerComponent } from '@shared/components/barcode-scanner/barcode-scanner.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import { ProductService } from '@domain/products/services/product.service';
import { ShopifySyncFeedbackComponent } from '@domain/channels/shopify/components/shopify-sync-feedback/shopify-sync-feedback.component';
import { showShopifyIntegration } from '@core/models/tenant-channel-profile.model';
import { canSwitchOperationalLocation } from '@core/utils/user-location-scope.util';
import {
  formatShopifyInventorySyncFeedback,
  type ShopifySyncFeedback,
} from '@domain/channels/shopify/models/shopify-sync-feedback.util';
import { ShopifyConnectionService } from '@domain/channels/shopify/services/shopify-connection.service';
import { ShopifySyncWatchService } from '@domain/channels/shopify/services/shopify-sync-watch.service';

import { TableViewId } from '@shared/table-columns/table-column.model';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import { InventoryLevelTableComponent } from './components/inventory-level-table/inventory-level-table.component';
import { InventoryTabsComponent } from './components/inventory-tabs/inventory-tabs.component';
import {
  reservationChannelLabel,
  type StockReservationRow,
} from '@domain/inventory/models/stock-reservation.model';
import type { InventoryLevelListItem } from '@domain/inventory/models/inventory-list.mapper';
import type { InventoryLevelRow } from './models/inventory-view.model';
import {
  INVENTORY_LEVEL_COLUMN_DEFS,
  INVENTORY_LEVEL_COLUMN_PRESETS,
} from './models/inventory-levels-table-columns.config';
import { DEFAULT_INVENTORY_PAGE_SIZE } from '@domain/inventory/models/inventory-list-query.model';
import type { InventoryLevelsListQuery } from '@domain/inventory/models/inventory-list-query.model';
import { InventoryService } from '@domain/inventory/services/inventory.service';

interface LevelsData {
  readonly levels: readonly InventoryLevelListItem[];
  readonly locations: readonly Location[];
  readonly meta: PageMeta;
}

type LevelsState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: LevelsData }
  | { readonly status: 'error'; readonly error: AppError };

const SHOPIFY_FEEDBACK_DISMISS_MS = 8000;
const SEARCH_DEBOUNCE_MS = 300;

const EMPTY_META: PageMeta = {
  page: 1,
  pageSize: DEFAULT_INVENTORY_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

/**
 * Giacenze per variante × location (smart). Filtri e paginazione server-side;
 * SKU/titolo dalla risposta API (ref variante inclusi).
 */
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';

import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';

import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { createListSelection } from '@shared/utils/list-selection';
import { createSelectionMode } from '@shared/utils/selection-mode';

@Component({
  selector: 'app-inventory-levels',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ListActionsBarComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    ListPageComponent,
    BarcodeScannerComponent,
    SelectMenuComponent,
    InventoryTabsComponent,
    InventoryLevelTableComponent,
    ShopifySyncFeedbackComponent,
    SlidePanelComponent,
  ],
  templateUrl: './inventory-levels.component.html',
  styleUrl: './inventory-levels.component.scss',
})
export class InventoryLevelsComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly productService = inject(ProductService);
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly shopifySyncWatch = inject(ShopifySyncWatchService);
  private readonly authService = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly router = inject(Router);
  private readonly blobExport = inject(BackgroundBlobExportService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly columnPreferences = inject(TableColumnPreferenceService);
  private readonly config = inject(APP_CONFIG);

  protected readonly tableViewId = TableViewId.InventoryLevels;
  protected readonly tableColumns: ReturnType<TableColumnPreferenceService['visibleColumns']>;

  private shopifyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  // La stessa risposta di tutti gli altri: bandiera d'ambiente, fotocamera
  // presente, e schermo compatto. Su scrivania resta il lettore HID.
  protected readonly barcodeScannerEnabled = inject(BarcodeDetectionService).cameraScanOffered;
  protected readonly scanFeedback = signal<string | null>(null);

  protected readonly skeletonColumns = 6;

  protected readonly stockStatusOptions: readonly SelectMenuOption[] = [
    { value: 'ok', label: 'Disponibile' },
    { value: 'low', label: 'Sotto soglia' },
    { value: 'empty', label: 'Esaurito' },
  ];

  private readonly refreshTick = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_INVENTORY_PAGE_SIZE);

  // La location parte dal contesto globale (selettore topbar).
  protected readonly locationFilter = signal(this.locationContext.activeLocationId() ?? '');
  protected readonly statusFilter = signal('');
  protected readonly variantIdFilter = signal('');
  protected readonly searchDraft = signal('');
  private readonly search = signal('');
  protected readonly shopifyInventoryLoading = signal(false);
  protected readonly exporting = computed(() =>
    this.blobExport.isActive(INVENTORY_LEVELS_CSV_EXPORT_ID),
  );
  protected readonly shopifyFeedback = signal<ShopifySyncFeedback | null>(null);
  protected readonly shopifySyncError = signal<string | null>(null);

  // Drill-down Impegnata (§10 fase 1): ordini che compongono la quantità.
  protected readonly reservationsTarget = signal<InventoryLevelRow | null>(null);
  protected readonly reservationsPanelOpen = computed(() => this.reservationsTarget() !== null);
  protected readonly reservations = signal<readonly StockReservationRow[]>([]);
  protected readonly reservationsLoading = signal(false);
  protected readonly reservationsError = signal<string | null>(null);
  protected readonly channelLabel = reservationChannelLabel;

  protected readonly showShopifyInventorySync = computed(() => {
    const user = this.authService.currentUser();
    if (!canSyncInventoryFromShopify(user)) {
      return false;
    }
    return showShopifyIntegration(user?.tenantChannelProfile);
  });

  protected readonly canImportExportInventory = computed(() =>
    canImportExportInventory(this.authService.currentUser()),
  );

  private readonly listFilters = computed(() => ({
    location: this.locationFilter(),
    status: this.statusFilter(),
    search: this.search(),
    variantId: this.variantIdFilter(),
  }));

  private readonly levelsQuery = computed((): InventoryLevelsListQuery => {
    const status = this.statusFilter();
    const variantId = this.variantIdFilter();
    return {
      page: this.page(),
      pageSize: this.pageSize(),
      locationId: this.locationFilter() || undefined,
      search: this.search().trim() || undefined,
      variantId: variantId || undefined,
      lowStockOnly: status === 'low' ? true : undefined,
    };
  });

  private readonly request = computed(() => ({
    query: this.levelsQuery(),
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query }) =>
        forkJoin({
          // ⭐ `tutto`: l'elenco mostra tutte le righe del filtro, non una pagina.
          levels: this.inventoryService.getLevels(query, { tutto: true }),
          locations: this.inventoryService.getLocations(),
        }).pipe(
          map(({ levels, locations }): LevelsState => ({
            status: 'success',
            data: {
              levels: levels.data,
              locations,
              meta: levels.meta,
            },
          })),
          startWith<LevelsState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<LevelsState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies LevelsState },
  );

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private readonly searchSubscription: Subscription;

  constructor() {
    this.columnPreferences.registerView(
      TableViewId.InventoryLevels,
      INVENTORY_LEVEL_COLUMN_DEFS,
      INVENTORY_LEVEL_COLUMN_PRESETS,
    );
    this.tableColumns = this.columnPreferences.visibleColumns(TableViewId.InventoryLevels);

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
      .subscribe((value) => {
        this.search.set(value);
        this.page.set(1);
      });

    toObservable(this.listFilters)
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.page.set(1));

    this.shopifySyncWatch
      .watchRemoteDataChanged()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reload());
  }

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

  /** Righe per tabella; filtri ok/empty restano client-side (API gestisce low stock e variantId). */
  protected readonly rows = computed<readonly InventoryLevelRow[]>(() => {
    const current = this.state();
    if (current.status !== 'success') {
      return [];
    }
    const { levels, locations } = current.data;
    const locationById = new Map(locations.map((location) => [location.id, location]));
    const status = this.statusFilter();

    return levels
      .map((level): InventoryLevelRow => ({
        id: level.id,
        variantId: level.variantId,
        locationId: level.locationId,
        sku: level.displaySku,
        articleCode: level.articleCode,
        title: level.displayTitle,
        locationName:
          level.locationName ?? locationById.get(level.locationId)?.name ?? level.locationId,
        available: level.available,
        onHand: level.onHand,
        committed: level.committed,
        incoming: level.incoming,
        minThreshold: level.minThreshold,
        status: this.statusOf(level),
      }))
      .filter((row) => {
        if (status === StockStatus.Empty && row.status !== StockStatus.Empty) {
          return false;
        }
        if (status === StockStatus.Ok && row.status !== StockStatus.Ok) {
          return false;
        }
        return true;
      })
      .sort(
        (a, b) => a.title.localeCompare(b.title) || a.locationName.localeCompare(b.locationName),
      );
  });

  protected readonly isEmpty = computed(
    () => this.state().status === 'success' && this.rows().length === 0,
  );

  protected onScanned(code: string): void {
    this.scanFeedback.set(null);
    this.productService
      .findVariantByCode(code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (variant) => {
          this.variantIdFilter.set(variant.variantId);
          this.searchDraft.set(variant.sku);
        },
        error: () => {
          this.variantIdFilter.set('');
          this.scanFeedback.set('Nessuna variante trovata per questo SKU o barcode.');
        },
      });
  }

  protected onLocationFilterChange(value: string | null): void {
    this.locationFilter.set(value ?? '');
  }

  protected onStatusFilterChange(value: string | null): void {
    this.statusFilter.set(value ?? '');
  }

  protected resetFilters(): void {
    this.locationFilter.set('');
    this.statusFilter.set('');
    this.searchDraft.set('');
    this.search.set('');
    this.variantIdFilter.set('');
    this.scanFeedback.set(null);
    this.page.set(1);
  }

  /**
   * ⭐ **I comandi dell'elenco, tutti nella barra in basso** (`14` §0.2).
   *
   * ⚠️ I permessi stanno QUI, non nel template: la condizione che decide se un
   * comando esiste sta dove il comando si dichiara.
   */
  // ── Selezione ─────────────────────────────────────────────────────────────
  //
  // ⚠️ **L'identità è la COPPIA variante-sede**: la stessa variante compare una
  //    volta per ogni sede, e col solo `variantId` si selezionerebbero tutte le
  //    sue righe insieme.
  private readonly selection = createListSelection('multiple');

  /**
   * ⭐ **La modalità «Seleziona» della vista a card**, dal telaio.
   *
   * ⛔ Non è scritta qui: `createSelectionMode` porta con sé la regola che
   * spegnerla AZZERA la selezione — a modalità spenta il tocco torna ad aprire
   * la riga, e non resta nessun gesto per deselezionare.
   */
  protected readonly modoSelezione = createSelectionMode(this.selection);

  protected readonly selectedRowIds = this.selection.ids;

  /** ⛔ Al cambio di filtro la selezione si restringe alle righe caricate. */
  private readonly potaturaSelezione = toObservable(this.rows)
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe((righe) => this.selection.prune(righe.map((r) => `${r.variantId}-${r.locationId}`)));

  protected toggleRowSelection(rowId: string, selected: boolean): void {
    this.selection.toggle(rowId, selected);
  }

  protected toggleSelectAllRows(selected: boolean): void {
    this.selection.setAll(
      this.rows().map((r) => `${r.variantId}-${r.locationId}`),
      selected,
    );
  }

  protected clearSelection(): void {
    this.selection.clear();
  }

  protected readonly listActions = computed<readonly ListAction[]>(() => {
    const azioni: ListAction[] = [];

    if (this.canImportExportInventory()) {
      azioni.push(
        // ⭐ **Esporta è il MENU dei tracciati**, non un pulsante per formato
        //    (`14` §5.2, deciso dal proprietario il 30/08/2026). Qui era
        //    «Esporta CSV» diretto, e su altre pagine «Esporta» con le voci:
        //    la stessa cosa aveva due forme.
        comando('export', {
          busy: this.exporting(),
          ariaLabel: 'Esporta le giacenze',
          items: [voceEsporta('csv', () => this.exportInventory())],
        }),
        {
          id: 'import',
          label: 'Importa CSV',
          icon: 'pi-upload',
          requires: 'none',
          ariaLabel: 'Importa le giacenze da CSV',
          run: () => this.importInventory(),
        },
      );
    }

    if (this.showShopifyInventorySync()) {
      azioni.push({
        id: 'shopify-sync',
        label: 'Riallinea su Shopify',
        icon: 'pi-sync',
        requires: 'none',
        busy: this.shopifyInventoryLoading(),
        ariaLabel: 'Riallinea le giacenze su Shopify',
        run: () => this.syncInventoryFromShopify(),
      });
    }

    return azioni;
  });

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected openReservations(row: InventoryLevelRow): void {
    this.reservationsTarget.set(row);
    this.loadReservations(row);
  }

  protected closeReservations(): void {
    this.reservationsTarget.set(null);
    this.reservations.set([]);
    this.reservationsError.set(null);
  }

  protected reloadReservations(): void {
    const target = this.reservationsTarget();
    if (target) {
      this.loadReservations(target);
    }
  }

  private loadReservations(row: InventoryLevelRow): void {
    this.reservationsLoading.set(true);
    this.reservationsError.set(null);
    this.inventoryService
      .getReservations(row.variantId, row.locationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.reservations.set(rows);
          this.reservationsLoading.set(false);
        },
        error: (err: unknown) => {
          this.reservationsLoading.set(false);
          this.reservationsError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected importInventory(): void {
    void this.router.navigateByUrl('/app/inventory/import');
  }

  protected exportInventory(): void {
    if (this.exporting()) {
      return;
    }

    this.blobExport.start({
      exportId: INVENTORY_LEVELS_CSV_EXPORT_ID,
      request: this.inventoryService.exportInventoryCsv({
        locationId: this.locationFilter() || undefined,
        search: this.search().trim() || undefined,
        stockStatus: this.statusFilter() || undefined,
        columns: this.columnPreferences.visibleColumnIds(TableViewId.InventoryLevels).join(','),
      }),
      filename: vestiflowExportFilename('giacenze', 'csv'),
      inProgressMessage: 'Export giacenze in corso. Puoi continuare a navigare.',
      successMessage: 'Export giacenze completato: download avviato.',
      errorMessage: 'Export giacenze non riuscito. Riprova tra qualche istante.',
    });
  }

  protected syncInventoryFromShopify(): void {
    if (this.shopifyInventoryLoading()) {
      return;
    }

    this.shopifyInventoryLoading.set(true);
    this.clearShopifyFeedback();
    this.shopifySyncError.set(null);

    this.shopifyConnectionService
      .syncInventory()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.shopifyInventoryLoading.set(false);
          this.showShopifyFeedback(formatShopifyInventorySyncFeedback(result));
          this.reload();
        },
        error: (err: unknown) => {
          this.shopifyInventoryLoading.set(false);
          this.shopifySyncError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected dismissShopifyFeedback(): void {
    this.clearShopifyFeedback();
  }

  private statusOf(level: InventoryLevel): StockStatus {
    return stockStatusOf(level);
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }

  private showShopifyFeedback(feedback: ShopifySyncFeedback): void {
    this.clearShopifyFeedback();
    this.shopifyFeedback.set(feedback);
    this.shopifyFeedbackTimer = setTimeout(() => {
      this.shopifyFeedback.set(null);
      this.shopifyFeedbackTimer = null;
    }, SHOPIFY_FEEDBACK_DISMISS_MS);
  }

  private clearShopifyFeedback(): void {
    if (this.shopifyFeedbackTimer) {
      clearTimeout(this.shopifyFeedbackTimer);
      this.shopifyFeedbackTimer = null;
    }
    this.shopifyFeedback.set(null);
  }

  private extractErrorMessage(err: unknown): string {
    if (isAppError(err)) {
      return err.message;
    }
    return 'Operazione non riuscita. Riprova.';
  }
}
