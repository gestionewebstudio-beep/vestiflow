import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import type { Subscription } from 'rxjs';

import type { PageMeta } from '@core/models/api.model';
import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { canManageCatalog } from '@core/permissions/tenant-permissions.util';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { ProductStatus } from '@core/models/product.model';
import type { Product } from '@core/models/product.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { ProductTableComponent } from './components/product-table/product-table.component';
import { ProductToolbarComponent } from './components/product-toolbar/product-toolbar.component';
import { ProductLabelPrintService } from './services/product-label-print.service';
import type {
  ProductFilterChange,
  ProductStatusOption,
} from './components/product-toolbar/product-toolbar.component';
import { ShopifySyncFeedbackComponent } from '@features/integrations/shopify/components/shopify-sync-feedback/shopify-sync-feedback.component';
import {
  canManageShopifySync,
  isShopifyConnected,
} from '@features/integrations/shopify/models/shopify-page-sync.util';
import {
  formatShopifyProductsSyncFeedback,
  type ShopifySyncFeedback,
} from '@features/integrations/shopify/models/shopify-sync-feedback.util';
import { ShopifyConnectionService } from '@features/integrations/shopify/services/shopify-connection.service';
import { ShopifySyncWatchService } from '@features/integrations/shopify/services/shopify-sync-watch.service';
import {
  DEFAULT_PRODUCT_ORDER,
  DEFAULT_PRODUCT_PAGE_SIZE,
  DEFAULT_PRODUCT_SORT,
  PRODUCT_PAGE_SIZE_OPTIONS,
  parseProductListQuery,
} from './models/product-list-query.model';
import type { ProductSortField } from './models/product-list-query.model';
import { ProductService } from './services/product.service';

const SEARCH_DEBOUNCE_MS = 300;
const SHOPIFY_FEEDBACK_DISMISS_MS = 8000;

const STATUS_OPTIONS: readonly ProductStatusOption[] = [
  { value: ProductStatus.Active, label: 'Attivo' },
  { value: ProductStatus.Draft, label: 'Bozza' },
  { value: ProductStatus.Archived, label: 'Archiviato' },
];

const EMPTY_META: PageMeta = {
  page: 1,
  pageSize: DEFAULT_PRODUCT_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

type ProductListState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly products: readonly Product[]; readonly meta: PageMeta }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Container lista prodotti (smart). URL = unica fonte di verita': i query param
 * generano la query, i controlli UI navigano (merge) e il flusso e' a senso
 * unico (UI -> router -> URL -> query -> fetch). Niente sync fragile o loop.
 */
@Component({
  selector: 'app-product-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    PaginationComponent,
    ProductToolbarComponent,
    ProductTableComponent,
    ShopifySyncFeedbackComponent,
  ],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.scss',
})
export class ProductListComponent {
  private readonly service = inject(ProductService);
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly shopifySyncWatch = inject(ShopifySyncWatchService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly labelPrintService = inject(ProductLabelPrintService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly config = inject(APP_CONFIG);

  private shopifyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly barcodeScannerEnabled = this.config.features.barcodeScanner;
  protected readonly scanFeedback = signal<string | null>(null);

  private lastFetchQueryKey = '';

  protected readonly skeletonColumns = computed(() => (this.showShopifyColumn() ? 7 : 6));
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly pageSizeOptions = PRODUCT_PAGE_SIZE_OPTIONS;

  // URL come fonte di verita': la query deriva (pura) dai query param.
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly query = computed(() => parseProductListQuery(this.queryParams()));

  // Tick di refresh per il retry (la query da URL e' identica dopo un errore).
  private readonly refreshTick = signal(0);
  /** Refresh silenzioso (es. webhook Shopify): niente skeleton se query invariata. */
  private readonly softRefreshTick = signal(0);

  // Testo ricerca "draft": locale, debounced. Inizializzato una volta dall'URL.
  protected readonly searchDraft = signal(this.route.snapshot.queryParamMap.get('search') ?? '');
  protected readonly exporting = signal(false);
  protected readonly shopifyCatalogLoading = signal(false);
  protected readonly shopifyFeedback = signal<ShopifySyncFeedback | null>(null);
  protected readonly shopifySyncError = signal<string | null>(null);

  private readonly shopifyConnection = toSignal(
    this.shopifyConnectionService.getConnection().pipe(catchError(() => of(null))),
    { initialValue: null as ShopifyConnection | null },
  );

  protected readonly showShopifyCatalogImport = computed(
    () =>
      isShopifyConnected(this.shopifyConnection()) &&
      canManageShopifySync(this.authService.currentUser()),
  );

  protected readonly showShopifyColumn = computed(() =>
    isShopifyConnected(this.shopifyConnection()),
  );

  protected readonly canManageCatalog = computed(() =>
    canManageCatalog(this.authService.currentUser()),
  );

  protected readonly filterOptions = toSignal(this.service.getFilterOptions(), {
    initialValue: { categories: [], brands: [], seasons: [] },
  });

  private readonly request = computed(() => ({
    query: this.query(),
    tick: this.refreshTick(),
    softTick: this.softRefreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query, tick, softTick }) => {
        const queryKey = JSON.stringify(query);
        const silentRefresh = softTick > 0 && tick === 0 && queryKey === this.lastFetchQueryKey;
        this.lastFetchQueryKey = queryKey;

        const fetch$ = this.service.getProducts(query).pipe(
          map(
            (response): ProductListState => ({
              status: 'success',
              products: response.data,
              meta: response.meta,
            }),
          ),
          catchError((err: unknown) =>
            of<ProductListState>({ status: 'error', error: this.toAppError(err) }),
          ),
        );

        return silentRefresh
          ? fetch$
          : fetch$.pipe(startWith<ProductListState>({ status: 'loading' }));
      }),
    ),
    { initialValue: { status: 'loading' } satisfies ProductListState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly products = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.products : [];
  });

  protected readonly meta = computed<PageMeta>(() => {
    const current = this.state();
    return current.status === 'success' ? current.meta : EMPTY_META;
  });

  protected readonly isEmpty = computed(() => {
    const current = this.state();
    return current.status === 'success' && current.meta.total === 0;
  });

  protected readonly hasActiveFilters = computed(() => {
    const q = this.query();
    return Boolean(q.search ?? q.category ?? q.brand ?? q.season ?? q.status);
  });

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private readonly searchSubscription: Subscription;

  constructor() {
    // Debounce ricerca: il draft locale guida la navigazione (idempotente).
    this.searchSubscription = toObservable(this.searchDraft)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => this.applySearch(value));

    this.shopifySyncWatch
      .watchRemoteDataChanged()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.softRefreshTick.update((tick) => tick + 1);
      });
  }

  protected onSearchInput(value: string): void {
    this.scanFeedback.set(null);
    this.searchDraft.set(value);
  }

  protected onBarcodeScanned(code: string): void {
    this.scanFeedback.set(null);
    this.service
      .findVariantByCode(code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (variant) => {
          void this.router.navigate(['/app/products', variant.productId]);
        },
        error: () => {
          this.scanFeedback.set('Nessun prodotto trovato per questo SKU o barcode.');
        },
      });
  }

  protected onFilterChange(change: ProductFilterChange): void {
    // Ricerca/filtri/sort: replaceUrl per non intasare la history di tappe intermedie.
    this.updateParams({ [change.key]: change.value, page: null }, true);
  }

  protected onResetFilters(): void {
    this.searchDraft.set('');
    this.updateParams(
      { search: null, category: null, brand: null, season: null, status: null, page: null },
      true,
    );
  }

  protected onSortChange(field: ProductSortField): void {
    const q = this.query();
    const order = q.sort === field && q.order === 'asc' ? 'desc' : 'asc';
    this.updateParams(
      {
        sort: field === DEFAULT_PRODUCT_SORT ? null : field,
        order: order === DEFAULT_PRODUCT_ORDER ? null : order,
        page: null,
      },
      true,
    );
  }

  protected goToPage(page: number): void {
    // Paginazione: history normale, cosi' il back torna alla pagina precedente.
    this.updateParams({ page: page <= 1 ? null : page });
  }

  protected onPageSizeChange(size: number): void {
    this.updateParams({ pageSize: size === DEFAULT_PRODUCT_PAGE_SIZE ? null : size, page: null });
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected openProduct(product: Product): void {
    void this.router.navigate(['/app/products', product.id]);
  }

  protected printProductLabels(product: Product): void {
    this.labelPrintService.triggerDirectPrint(product.id);
  }

  protected createProduct(): void {
    void this.router.navigateByUrl('/app/products/new');
  }

  protected importProducts(): void {
    void this.router.navigateByUrl('/app/products/import');
  }

  protected importCatalogFromShopify(): void {
    if (this.shopifyCatalogLoading()) {
      return;
    }

    this.shopifyCatalogLoading.set(true);
    this.clearShopifyFeedback();
    this.shopifySyncError.set(null);

    this.shopifyConnectionService
      .syncProducts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.shopifyCatalogLoading.set(false);
          this.showShopifyFeedback(formatShopifyProductsSyncFeedback(result));
          this.reload();
        },
        error: (err: unknown) => {
          this.shopifyCatalogLoading.set(false);
          this.shopifySyncError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected dismissShopifyFeedback(): void {
    this.clearShopifyFeedback();
  }

  protected exportProducts(): void {
    if (this.exporting()) {
      return;
    }

    const {
      page: _page,
      pageSize: _pageSize,
      sort: _sort,
      order: _order,
      ...filters
    } = this.query();

    this.exporting.set(true);
    this.service.exportProductsCsv(filters).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        this.downloadCsvBlob(blob);
      },
      error: () => {
        this.exporting.set(false);
      },
    });
  }

  private downloadCsvBlob(blob: Blob): void {
    const stamp = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `prodotti-vestiflow-${stamp}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /** Naviga solo modificando i param indicati (merge); null rimuove la chiave. */
  private updateParams(params: Record<string, string | number | null>, replace = false): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: replace,
    });
  }

  /** Applica la ricerca all'URL solo se diversa da quella corrente (no loop). */
  private applySearch(value: string): void {
    const trimmed = value.trim();
    const current = this.query().search ?? '';
    if (trimmed === current) {
      return;
    }
    this.updateParams({ search: trimmed || null, page: null }, true);
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
