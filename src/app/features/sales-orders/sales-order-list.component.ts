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
import type { SalesOrder } from '@core/models/sales-order.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { SalesOrderTableComponent } from './components/sales-order-table/sales-order-table.component';
import {
  DEFAULT_SALES_PAGE_SIZE,
  SALES_PAGE_SIZE_OPTIONS,
  parseSalesOrderListQuery,
} from './models/sales-order-list-query.model';
import { SalesOrderService } from './services/sales-order.service';

const SEARCH_DEBOUNCE_MS = 300;

const EMPTY_META: PageMeta = {
  page: 1,
  pageSize: DEFAULT_SALES_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

type SalesListState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly orders: readonly SalesOrder[]; readonly meta: PageMeta }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Lista vendite read-only (smart). URL come fonte di verita' (page, search,
 * financialStatus, source); Shopify e' autoritativo: nessuna azione di
 * creazione/modifica.
 */
@Component({
  selector: 'app-sales-order-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PaginationComponent,
    TableSkeletonComponent,
    SalesOrderTableComponent,
  ],
  templateUrl: './sales-order-list.component.html',
  styleUrl: './sales-order-list.component.scss',
})
export class SalesOrderListComponent {
  private readonly service = inject(SalesOrderService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly skeletonColumns = 6;
  protected readonly pageSizeOptions = SALES_PAGE_SIZE_OPTIONS;

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly query = computed(() => parseSalesOrderListQuery(this.queryParams()));

  private readonly refreshTick = signal(0);

  protected readonly searchDraft = signal(this.route.snapshot.queryParamMap.get('search') ?? '');

  private readonly request = computed(() => ({ query: this.query(), tick: this.refreshTick() }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query }) =>
        this.service.getSalesOrders(query).pipe(
          map(
            (response): SalesListState => ({
              status: 'success',
              orders: response.data,
              meta: response.meta,
            }),
          ),
          startWith<SalesListState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<SalesListState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies SalesListState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly orders = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.orders : [];
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
    return Boolean(q.search ?? q.financialStatus ?? q.source);
  });

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private readonly searchSubscription: Subscription;

  constructor() {
    this.searchSubscription = toObservable(this.searchDraft)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => this.applySearch(value));
  }

  protected onSearchInput(event: Event): void {
    this.searchDraft.set((event.target as HTMLInputElement).value);
  }

  protected onFinancialChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.updateParams({ financialStatus: value || null, page: null }, true);
  }

  protected onSourceChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.updateParams({ source: value || null, page: null }, true);
  }

  protected resetFilters(): void {
    this.searchDraft.set('');
    this.updateParams({ search: null, financialStatus: null, source: null, page: null }, true);
  }

  protected goToPage(page: number): void {
    this.updateParams({ page: page <= 1 ? null : page });
  }

  protected onPageSizeChange(size: number): void {
    this.updateParams({ pageSize: size === DEFAULT_SALES_PAGE_SIZE ? null : size, page: null });
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected openOrder(order: SalesOrder): void {
    void this.router.navigate(['/app/sales', order.id]);
  }

  private updateParams(params: Record<string, string | number | null>, replace = false): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: replace,
    });
  }

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
