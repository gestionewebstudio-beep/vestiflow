import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';

import { AuthService } from '@core/auth';
import type { PageMeta } from '@core/models/api.model';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Supplier } from '@core/models/supplier.model';
import { canManageSupplierOrders } from '@core/permissions/tenant-permissions.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableViewId } from '@shared/table-columns/table-column.model';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import { SupplierTableComponent } from './components/supplier-table/supplier-table.component';
import {
  SUPPLIER_LIST_COLUMN_DEFS,
  SUPPLIER_LIST_COLUMN_PRESETS,
} from './models/supplier-table-columns.config';
import {
  DEFAULT_SUPPLIER_PAGE_SIZE,
  parseSupplierListQuery,
  SUPPLIER_PAGE_SIZE_OPTIONS,
  supplierListQueryToParams,
} from './models/supplier-list-query.model';
import { SupplierService } from './services/supplier.service';

const SEARCH_DEBOUNCE_MS = 300;

const EMPTY_META: PageMeta = {
  page: 1,
  pageSize: DEFAULT_SUPPLIER_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

type SupplierListState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly suppliers: readonly Supplier[];
      readonly meta: PageMeta;
    }
  | { readonly status: 'error'; readonly error: AppError };

@Component({
  selector: 'app-supplier-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PaginationComponent,
    TableSkeletonComponent,
    SupplierTableComponent,
    TableColumnPickerComponent,
  ],
  templateUrl: './supplier-list.component.html',
  styleUrl: './supplier-list.component.scss',
})
export class SupplierListComponent {
  private readonly service = inject(SupplierService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private readonly columnPreferences = inject(TableColumnPreferenceService);

  protected readonly tableViewId = TableViewId.SuppliersList;
  protected readonly tableColumns: ReturnType<TableColumnPreferenceService['visibleColumns']>;

  protected readonly skeletonColumns = 5;
  protected readonly pageSizeOptions = SUPPLIER_PAGE_SIZE_OPTIONS;
  protected readonly canManage = computed(() =>
    canManageSupplierOrders(this.authService.currentUser()),
  );

  private readonly refreshTick = signal(0);
  protected readonly searchDraft = signal('');
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  private readonly listQuery = computed(() => ({
    ...parseSupplierListQuery(this.queryParams()),
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.listQuery).pipe(
      switchMap(({ page, pageSize, search }) =>
        this.service.list({ page, pageSize, search }).pipe(
          map(
            (response): SupplierListState => ({
              status: 'success',
              suppliers: response.data,
              meta: response.meta,
            }),
          ),
          startWith<SupplierListState>({ status: 'loading' }),
          catchError((err: unknown) => of(this.toErrorState(err))),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies SupplierListState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });
  protected readonly suppliers = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.suppliers : [];
  });
  protected readonly meta = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.meta : EMPTY_META;
  });
  protected readonly isEmpty = computed(
    () => this.state().status === 'success' && this.suppliers().length === 0,
  );
  protected readonly hasActiveFilters = computed(
    () => parseSupplierListQuery(this.queryParams()).search.trim().length > 0,
  );

  constructor() {
    this.columnPreferences.registerView(
      TableViewId.SuppliersList,
      SUPPLIER_LIST_COLUMN_DEFS,
      SUPPLIER_LIST_COLUMN_PRESETS,
    );
    this.tableColumns = this.columnPreferences.visibleColumns(TableViewId.SuppliersList);

    toObservable(this.queryParams)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.searchDraft.set(params.get('search') ?? '');
      });

    toObservable(this.searchDraft)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((search) => {
        const current = parseSupplierListQuery(this.queryParams());
        if (search === current.search) {
          return;
        }
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: supplierListQueryToParams({ ...current, page: 1, search }),
        });
      });
  }

  protected onSearchInput(event: Event): void {
    this.searchDraft.set((event.target as HTMLInputElement).value);
  }

  protected resetFilters(): void {
    const current = parseSupplierListQuery(this.queryParams());
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: supplierListQueryToParams({ ...current, page: 1, search: '' }),
    });
  }

  protected goToPage(page: number): void {
    const current = parseSupplierListQuery(this.queryParams());
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: supplierListQueryToParams({ ...current, page }),
    });
  }

  protected onPageSizeChange(pageSize: number): void {
    const current = parseSupplierListQuery(this.queryParams());
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: supplierListQueryToParams({ ...current, page: 1, pageSize }),
    });
  }

  protected openSupplier(supplier: Supplier): void {
    void this.router.navigate(['/app/suppliers', supplier.id]);
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected goToNew(): void {
    void this.router.navigate(['/app/suppliers/new']);
  }

  private toErrorState(err: unknown): SupplierListState {
    if (isAppError(err)) {
      return { status: 'error', error: err };
    }
    return { status: 'error', error: { kind: AppErrorKind.Unknown, message: 'Errore imprevisto' } };
  }
}
