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
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { ProductStatus } from '@core/models/product.model';
import type { Product } from '@core/models/product.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { ProductPaginationComponent } from './components/product-pagination/product-pagination.component';
import { ProductTableComponent } from './components/product-table/product-table.component';
import { ProductToolbarComponent } from './components/product-toolbar/product-toolbar.component';
import type {
  ProductFilterChange,
  ProductStatusOption,
} from './components/product-toolbar/product-toolbar.component';
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
    ProductToolbarComponent,
    ProductTableComponent,
    ProductPaginationComponent,
  ],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.scss',
})
export class ProductListComponent {
  private readonly service = inject(ProductService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly skeletonColumns = 5;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly pageSizeOptions = PRODUCT_PAGE_SIZE_OPTIONS;

  // URL come fonte di verita': la query deriva (pura) dai query param.
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly query = computed(() => parseProductListQuery(this.queryParams()));

  // Tick di refresh per il retry (la query da URL e' identica dopo un errore).
  private readonly refreshTick = signal(0);

  // Testo ricerca "draft": locale, debounced. Inizializzato una volta dall'URL.
  protected readonly searchDraft = signal(this.route.snapshot.queryParamMap.get('search') ?? '');

  protected readonly filterOptions = toSignal(this.service.getFilterOptions(), {
    initialValue: { categories: [], brands: [], seasons: [] },
  });

  private readonly request = computed(() => ({
    query: this.query(),
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query }) =>
        this.service.getProducts(query).pipe(
          map(
            (response): ProductListState => ({
              status: 'success',
              products: response.data,
              meta: response.meta,
            }),
          ),
          startWith<ProductListState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<ProductListState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
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
  }

  protected onSearchInput(value: string): void {
    this.searchDraft.set(value);
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

  protected createProduct(): void {
    void this.router.navigateByUrl('/app/products/new');
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
}
