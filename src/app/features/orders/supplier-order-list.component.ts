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
import { canManageSupplierOrders } from '@core/permissions/tenant-permissions.util';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { SupplierOrder } from '@core/models/supplier-order.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { SupplierOrderTableComponent } from './components/supplier-order-table/supplier-order-table.component';
import {
  DEFAULT_SUPPLIER_ORDER_PAGE_SIZE,
  SUPPLIER_ORDER_PAGE_SIZE_OPTIONS,
  parseSupplierOrderListQuery,
} from './models/supplier-order-list-query.model';
import { SupplierOrderService } from './services/supplier-order.service';

const SEARCH_DEBOUNCE_MS = 300;

const EMPTY_META: PageMeta = {
  page: 1,
  pageSize: DEFAULT_SUPPLIER_ORDER_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

type OrderListState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly orders: readonly SupplierOrder[];
      readonly meta: PageMeta;
    }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Lista ordini fornitori (smart). URL come fonte di verita' (page, search, status).
 */
@Component({
  selector: 'app-supplier-order-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PaginationComponent,
    SelectMenuComponent,
    TableSkeletonComponent,
    SupplierOrderTableComponent,
  ],
  templateUrl: './supplier-order-list.component.html',
  styleUrl: './supplier-order-list.component.scss',
})
export class SupplierOrderListComponent {
  private readonly service = inject(SupplierOrderService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly canManageSupplierOrders = computed(() =>
    canManageSupplierOrders(this.authService.currentUser()),
  );

  protected readonly skeletonColumns = 5;
  protected readonly pageSizeOptions = SUPPLIER_ORDER_PAGE_SIZE_OPTIONS;

  protected readonly statusOptions: readonly SelectMenuOption[] = [
    { value: 'draft', label: 'Bozza' },
    { value: 'sent', label: 'Inviato' },
    { value: 'partially_received', label: 'Ricevuto parziale' },
    { value: 'received', label: 'Ricevuto' },
    { value: 'cancelled', label: 'Annullato' },
  ];

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly query = computed(() => parseSupplierOrderListQuery(this.queryParams()));

  private readonly refreshTick = signal(0);

  protected readonly searchDraft = signal(this.route.snapshot.queryParamMap.get('search') ?? '');

  private readonly request = computed(() => ({ query: this.query(), tick: this.refreshTick() }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query }) =>
        this.service.getSupplierOrders(query).pipe(
          map(
            (response): OrderListState => ({
              status: 'success',
              orders: response.data,
              meta: response.meta,
            }),
          ),
          startWith<OrderListState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<OrderListState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies OrderListState },
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
    return Boolean(q.search ?? q.status);
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

  protected onStatusFilterChange(value: string | null): void {
    this.updateParams({ status: value, page: null }, true);
  }

  protected resetFilters(): void {
    this.searchDraft.set('');
    this.updateParams({ search: null, status: null, page: null }, true);
  }

  protected goToPage(page: number): void {
    this.updateParams({ page: page <= 1 ? null : page });
  }

  protected onPageSizeChange(size: number): void {
    this.updateParams({
      pageSize: size === DEFAULT_SUPPLIER_ORDER_PAGE_SIZE ? null : size,
      page: null,
    });
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected openOrder(order: SupplierOrder): void {
    void this.router.navigate(['/app/orders', order.id]);
  }

  protected createOrder(): void {
    void this.router.navigate(['/app/orders/new']);
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
