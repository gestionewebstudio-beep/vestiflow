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
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { LocationContextService } from '@core/services/location-context.service';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import type { InventoryLevel } from '@core/models/inventory-level.model';
import type { Location } from '@core/models/location.model';
import { stockStatusOf } from '@core/utils/inventory.util';
import type { StockStatus } from '@core/models/inventory-level.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type { VariantSummary } from '@features/products/models/variant-summary.model';
import { ProductService } from '@features/products/services/product.service';
import { ShopifySyncFeedbackComponent } from '@features/integrations/shopify/components/shopify-sync-feedback/shopify-sync-feedback.component';
import {
  canManageShopifySync,
  isShopifyConnected,
} from '@features/integrations/shopify/models/shopify-page-sync.util';
import {
  formatShopifyInventorySyncFeedback,
  type ShopifySyncFeedback,
} from '@features/integrations/shopify/models/shopify-sync-feedback.util';
import { ShopifyConnectionService } from '@features/integrations/shopify/services/shopify-connection.service';

import { InventoryLevelTableComponent } from './components/inventory-level-table/inventory-level-table.component';
import { InventoryTabsComponent } from './components/inventory-tabs/inventory-tabs.component';
import type { InventoryLevelRow } from './models/inventory-view.model';
import { InventoryService } from './services/inventory.service';

interface LevelsData {
  readonly levels: readonly InventoryLevel[];
  readonly locations: readonly Location[];
  readonly summaries: readonly VariantSummary[];
}

type LevelsState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: LevelsData }
  | { readonly status: 'error'; readonly error: AppError };

const SHOPIFY_FEEDBACK_DISMISS_MS = 8000;

/**
 * Giacenze per variante × location (smart). Join client-side di livelli,
 * location e catalogo; filtri locali immediati (dataset compatto, niente
 * round-trip simulato per filtro).
 */
@Component({
  selector: 'app-inventory-levels',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    SelectMenuComponent,
    InventoryTabsComponent,
    InventoryLevelTableComponent,
    ShopifySyncFeedbackComponent,
  ],
  templateUrl: './inventory-levels.component.html',
  styleUrl: './inventory-levels.component.scss',
})
export class InventoryLevelsComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly productService = inject(ProductService);
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly authService = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private shopifyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly skeletonColumns = 6;

  protected readonly stockStatusOptions: readonly SelectMenuOption[] = [
    { value: 'ok', label: 'Disponibile' },
    { value: 'low', label: 'Sotto soglia' },
    { value: 'empty', label: 'Esaurito' },
  ];

  private readonly refreshTick = signal(0);

  // Filtri locali (client-side: dataset compatto già caricato).
  // La location parte dal contesto globale (selettore topbar).
  protected readonly locationFilter = signal(this.locationContext.activeLocationId() ?? '');
  protected readonly statusFilter = signal('');
  protected readonly search = signal('');
  protected readonly shopifyInventoryLoading = signal(false);
  protected readonly shopifyFeedback = signal<ShopifySyncFeedback | null>(null);
  protected readonly shopifySyncError = signal<string | null>(null);

  private readonly shopifyConnection = toSignal(
    this.shopifyConnectionService.getConnection().pipe(catchError(() => of(null))),
    { initialValue: null as ShopifyConnection | null },
  );

  protected readonly showShopifyInventorySync = computed(
    () =>
      isShopifyConnected(this.shopifyConnection()) &&
      canManageShopifySync(this.authService.currentUser()),
  );

  constructor() {
    // Il cambio dal selettore topbar si riflette sul filtro di pagina
    // (azione esplicita dell'utente: prevale sulla scelta locale).
    effect(() => {
      this.locationFilter.set(this.locationContext.activeLocationId() ?? '');
    });
  }

  private readonly state = toSignal(
    toObservable(this.refreshTick).pipe(
      switchMap(() =>
        forkJoin({
          levels: this.inventoryService.getLevels(),
          locations: this.inventoryService.getLocations(),
          summaries: this.productService.getVariantSummaries(),
        }).pipe(
          map((data): LevelsState => ({ status: 'success', data })),
          startWith<LevelsState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<LevelsState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies LevelsState },
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
    this.locations().map((location) => ({ value: location.id, label: location.name })),
  );

  /** Tutte le righe join-ate (prima dei filtri). */
  private readonly allRows = computed<readonly InventoryLevelRow[]>(() => {
    const current = this.state();
    if (current.status !== 'success') {
      return [];
    }
    const { levels, locations, summaries } = current.data;
    const locationById = new Map(locations.map((location) => [location.id, location]));
    const summaryByVariant = new Map(summaries.map((summary) => [summary.variantId, summary]));

    return levels
      .map((level): InventoryLevelRow => {
        const summary = summaryByVariant.get(level.variantId);
        return {
          id: level.id,
          variantId: level.variantId,
          sku: summary?.sku ?? level.variantId,
          title: summary?.title ?? level.variantId,
          locationName: locationById.get(level.locationId)?.name ?? level.locationId,
          available: level.available,
          onHand: level.onHand,
          committed: level.committed,
          incoming: level.incoming,
          minThreshold: level.minThreshold,
          status: this.statusOf(level),
        };
      })
      .sort(
        (a, b) => a.title.localeCompare(b.title) || a.locationName.localeCompare(b.locationName),
      );
  });

  protected readonly rows = computed<readonly InventoryLevelRow[]>(() => {
    const location = this.locationFilter();
    const status = this.statusFilter();
    const search = this.search().trim().toLowerCase();
    const locationName = location
      ? (this.locations().find((candidate) => candidate.id === location)?.name ?? '')
      : '';

    return this.allRows().filter((row) => {
      if (locationName && row.locationName !== locationName) {
        return false;
      }
      if (status && row.status !== status) {
        return false;
      }
      if (search && !`${row.title} ${row.sku}`.toLowerCase().includes(search)) {
        return false;
      }
      return true;
    });
  });

  protected readonly isEmpty = computed(
    () => this.state().status === 'success' && this.rows().length === 0,
  );

  protected readonly hasActiveFilters = computed(() =>
    Boolean(this.locationFilter() || this.statusFilter() || this.search().trim()),
  );

  protected onSearchInput(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
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
    this.search.set('');
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected newMovement(): void {
    void this.router.navigateByUrl('/app/inventory/movements/new');
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
