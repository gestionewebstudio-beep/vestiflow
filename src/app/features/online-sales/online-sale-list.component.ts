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
import { ButtonComponent } from '@shared/components/button/button.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { OnlineSaleTableComponent } from './components/online-sale-table/online-sale-table.component';
import type { OnlineSaleListQuery, OnlineSaleRow } from './models/online-sale.model';
import { OnlineSalesService } from './services/online-sales.service';

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const EMPTY_META: PageMeta = { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 };

type ListState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly sales: readonly OnlineSaleRow[];
      readonly meta: PageMeta;
    }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Registro Vendite online (fase 3 §4): solo vendite generate dagli ordini
 * evasi (regola invariante 3). Read-only: nessuna schermata crea o modifica
 * vendite. URL come fonte di verità (page, search, canale, periodo evasione).
 */
@Component({
  selector: 'app-online-sale-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    DateInputComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PaginationComponent,
    SelectMenuComponent,
    TableSkeletonComponent,
    OnlineSaleTableComponent,
  ],
  templateUrl: './online-sale-list.component.html',
  styleUrl: './online-sale-list.component.scss',
})
export class OnlineSaleListComponent {
  private readonly service = inject(OnlineSalesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly skeletonColumns = 8;
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  protected readonly channelOptions: readonly SelectMenuOption[] = [
    { value: 'online', label: 'Shopify online' },
    { value: 'pos', label: 'Shopify POS' },
  ];

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  protected readonly query = computed((): OnlineSaleListQuery => {
    const params = this.queryParams();
    const page = Number(params.get('page'));
    const pageSize = Number(params.get('pageSize'));
    const fulfilledFrom = params.get('fulfilledFrom') ?? '';
    const fulfilledTo = params.get('fulfilledTo') ?? '';
    return {
      page: Number.isInteger(page) && page > 0 ? page : 1,
      pageSize:
        Number.isInteger(pageSize) && PAGE_SIZE_OPTIONS.includes(pageSize)
          ? pageSize
          : DEFAULT_PAGE_SIZE,
      search: params.get('search')?.trim() || undefined,
      channel: params.get('channel') ?? undefined,
      fulfilledFrom: ISO_DATE.test(fulfilledFrom) ? fulfilledFrom : undefined,
      fulfilledTo: ISO_DATE.test(fulfilledTo) ? fulfilledTo : undefined,
    };
  });

  private readonly refreshTick = signal(0);
  protected readonly searchDraft = signal(this.route.snapshot.queryParamMap.get('search') ?? '');

  private readonly request = computed(() => ({ query: this.query(), tick: this.refreshTick() }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query }) =>
        this.service.getOnlineSales(query).pipe(
          map(
            (response): ListState => ({
              status: 'success',
              sales: response.data,
              meta: response.meta,
            }),
          ),
          startWith<ListState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<ListState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies ListState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly sales = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.sales : [];
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
    return Boolean(q.search ?? q.channel ?? q.fulfilledFrom ?? q.fulfilledTo);
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

  protected onChannelFilterChange(value: string | null): void {
    this.updateParams({ channel: value, page: null }, true);
  }

  protected onFulfilledFromChange(value: string): void {
    this.updateParams({ fulfilledFrom: value || null, page: null }, true);
  }

  protected onFulfilledToChange(value: string): void {
    this.updateParams({ fulfilledTo: value || null, page: null }, true);
  }

  protected resetFilters(): void {
    this.searchDraft.set('');
    this.updateParams(
      { search: null, channel: null, fulfilledFrom: null, fulfilledTo: null, page: null },
      true,
    );
  }

  protected goToPage(page: number): void {
    this.updateParams({ page: page <= 1 ? null : page });
  }

  protected onPageSizeChange(size: number): void {
    this.updateParams({ pageSize: size === DEFAULT_PAGE_SIZE ? null : size, page: null });
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected openSale(sale: OnlineSaleRow): void {
    void this.router.navigate(['/app/sales/online', sale.id]);
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
