import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
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
import { canExportOperationalData } from '@core/permissions/tenant-permissions.util';
import { SALES_ORDERS_CORRISPETTIVI_CSV_EXPORT_ID } from '@core/export/background-blob-export.constants';
import { vestiflowExportFilename } from '@core/export/background-blob-export-filename.util';
import { BackgroundBlobExportService } from '@core/services/background-blob-export.service';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import type { SalesOrder } from '@core/models/sales-order.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { ShopifySyncFeedbackComponent } from '@features/integrations/shopify/components/shopify-sync-feedback/shopify-sync-feedback.component';
import {
  canSyncShopifyCustomersOrOrders,
  isShopifyConnected,
} from '@features/integrations/shopify/models/shopify-page-sync.util';
import {
  formatShopifyOrdersSyncFeedback,
  type ShopifySyncFeedback,
} from '@features/integrations/shopify/models/shopify-sync-feedback.util';
import { ShopifyConnectionService } from '@features/integrations/shopify/services/shopify-connection.service';
import { ShopifySyncWatchService } from '@features/integrations/shopify/services/shopify-sync-watch.service';
import { ReportCorrispettiviExportComponent } from '@features/reports/components/report-corrispettivi-export/report-corrispettivi-export.component';
import {
  formatReportPeriodLabel,
  parseSalesCorrispettiviPeriodQuery,
  ReportPeriodPreset,
  resolveReportDateRange,
} from '@features/reports/models/report-list-query.model';
import {
  SalesOrderTableComponent,
  type SalesOrderTableProfile,
} from './components/sales-order-table/sales-order-table.component';
import {
  DEFAULT_SALES_PAGE_SIZE,
  SALES_PAGE_SIZE_OPTIONS,
  parseSalesOrderListQuery,
  withShopifySourceScope,
} from './models/sales-order-list-query.model';
import { SalesOrderService } from './services/sales-order.service';

const SEARCH_DEBOUNCE_MS = 300;
const SHOPIFY_FEEDBACK_DISMISS_MS = 8000;

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
    SelectMenuComponent,
    TableSkeletonComponent,
    ReportCorrispettiviExportComponent,
    SalesOrderTableComponent,
    ShopifySyncFeedbackComponent,
  ],
  templateUrl: './sales-order-list.component.html',
  styleUrl: './sales-order-list.component.scss',
})
export class SalesOrderListComponent {
  private readonly service = inject(SalesOrderService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly blobExport = inject(BackgroundBlobExportService);
  private readonly authService = inject(AuthService);
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly shopifySyncWatch = inject(ShopifySyncWatchService);

  private shopifyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly skeletonColumns = 9;
  protected readonly pageSizeOptions = SALES_PAGE_SIZE_OPTIONS;

  private readonly routeData = toSignal(this.route.data, {
    initialValue: this.route.snapshot.data,
  });

  /** Vista: registro generale «Ordini cliente» o canale «Ordini Shopify» (fase 3 §2-§3). */
  protected readonly listProfile = computed(
    (): SalesOrderTableProfile =>
      (this.routeData()['salesListProfile'] as SalesOrderTableProfile | undefined) ??
      'customer-orders',
  );

  protected readonly isShopifyView = computed(() => this.listProfile() === 'shopify-orders');

  protected readonly financialStatusOptions: readonly SelectMenuOption[] = [
    { value: 'pending', label: 'In attesa' },
    { value: 'paid', label: 'Pagato' },
    { value: 'partially_refunded', label: 'Rimborso parziale' },
    { value: 'refunded', label: 'Rimborsato' },
    { value: 'voided', label: 'Annullato' },
  ];

  /** Filtro origine del registro generale (fase 3 §2). */
  protected readonly sourceOptions = computed((): readonly SelectMenuOption[] => {
    if (this.isShopifyView()) {
      return [
        { value: 'online', label: 'Shopify online' },
        { value: 'pos', label: 'Shopify POS' },
      ];
    }
    return [
      { value: 'manual', label: 'Manuale' },
      { value: 'online', label: 'Shopify online' },
      { value: 'pos', label: 'Shopify POS' },
    ];
  });

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly query = computed(() => parseSalesOrderListQuery(this.queryParams()));

  /** Periodo corrispettivi Shopify (query param dedicati, indipendenti dalla lista). */
  private readonly corrispettiviPeriodQuery = computed(() =>
    parseSalesCorrispettiviPeriodQuery(this.queryParams()),
  );
  private readonly uiCorrispettiviPeriod = signal<ReportPeriodPreset | null>(null);

  protected readonly corrispettiviDisplayPeriod = computed(
    () => this.uiCorrispettiviPeriod() ?? this.corrispettiviPeriodQuery().period,
  );

  protected readonly corrispettiviPeriodLabel = computed(() =>
    formatReportPeriodLabel({
      ...this.corrispettiviPeriodQuery(),
      period: this.corrispettiviDisplayPeriod(),
    }),
  );

  protected readonly corrispettiviDateFromDraft = computed(() => {
    if (this.corrispettiviDisplayPeriod() !== ReportPeriodPreset.Custom) {
      return '';
    }
    return this.corrispettiviPeriodQuery().dateFrom ?? todayIsoDate();
  });

  protected readonly corrispettiviDateToDraft = computed(() => {
    if (this.corrispettiviDisplayPeriod() !== ReportPeriodPreset.Custom) {
      return '';
    }
    return this.corrispettiviPeriodQuery().dateTo ?? todayIsoDate();
  });

  private readonly refreshTick = signal(0);

  protected readonly searchDraft = signal(this.route.snapshot.queryParamMap.get('search') ?? '');
  protected readonly shopifyOrdersLoading = signal(false);
  protected readonly exportingCorrispettivi = computed(() =>
    this.blobExport.isActive(SALES_ORDERS_CORRISPETTIVI_CSV_EXPORT_ID),
  );
  protected readonly shopifyFeedback = signal<ShopifySyncFeedback | null>(null);
  protected readonly shopifySyncError = signal<string | null>(null);

  private readonly shopifyConnection = toSignal(
    this.shopifyConnectionService.getConnection().pipe(catchError(() => of(null))),
    { initialValue: null as ShopifyConnection | null },
  );

  protected readonly showShopifyOrdersSync = computed(
    () =>
      this.isShopifyView() &&
      isShopifyConnected(this.shopifyConnection()) &&
      canSyncShopifyCustomersOrOrders(this.authService.currentUser()),
  );

  protected readonly canExportData = computed(
    () => this.isShopifyView() && canExportOperationalData(this.authService.currentUser()),
  );

  protected readonly pageTitle = computed(() =>
    this.isShopifyView() ? 'Ordini Shopify' : 'Ordini cliente',
  );

  protected readonly pageSubtitle = computed(() =>
    this.isShopifyView()
      ? 'Tutti gli ordini canonici del canale Shopify, qualunque sia lo stato: evasi, annullati, rimborsati o trasformati in Vendita online.'
      : 'Registro generale multicanale degli ordini: manuali, Shopify e piattaforme future. Shopify resta la fonte autoritativa dei propri ordini.',
  );

  /** Query effettiva verso l'API: la vista Shopify limita ai canali Shopify. */
  private readonly effectiveQuery = computed(() =>
    this.isShopifyView() ? withShopifySourceScope(this.query()) : this.query(),
  );

  private readonly request = computed(() => ({
    query: this.effectiveQuery(),
    tick: this.refreshTick(),
  }));

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
    effect(() => {
      this.corrispettiviPeriodQuery();
      this.uiCorrispettiviPeriod.set(null);
    });

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
      .subscribe(() => this.reload());
  }

  protected onSearchInput(event: Event): void {
    this.searchDraft.set((event.target as HTMLInputElement).value);
  }

  protected onFinancialFilterChange(value: string | null): void {
    this.updateParams({ financialStatus: value, page: null }, true);
  }

  protected onSourceFilterChange(value: string | null): void {
    this.updateParams({ source: value, page: null }, true);
  }

  protected onCorrispettiviPeriodChange(period: ReportPeriodPreset): void {
    this.uiCorrispettiviPeriod.set(period);
    if (period === ReportPeriodPreset.Custom) {
      const today = todayIsoDate();
      this.updateParams({ corrPeriod: period, corrFrom: today, corrTo: today });
      return;
    }
    this.updateParams({ corrPeriod: period, corrFrom: null, corrTo: null });
  }

  protected onCorrispettiviDateFromChange(value: string): void {
    this.updateParams({
      corrFrom: value || null,
      corrPeriod: ReportPeriodPreset.Custom,
    });
  }

  protected onCorrispettiviDateToChange(value: string): void {
    this.updateParams({
      corrTo: value || null,
      corrPeriod: ReportPeriodPreset.Custom,
    });
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

  protected syncOrdersFromShopify(): void {
    if (this.shopifyOrdersLoading()) {
      return;
    }

    this.shopifyOrdersLoading.set(true);
    this.clearShopifyFeedback();
    this.shopifySyncError.set(null);

    this.shopifyConnectionService
      .syncOrders()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.shopifyOrdersLoading.set(false);
          this.showShopifyFeedback(formatShopifyOrdersSyncFeedback(result));
          this.reload();
        },
        error: (err: unknown) => {
          this.shopifyOrdersLoading.set(false);
          this.shopifySyncError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected exportCorrispettiviShopify(): void {
    if (this.exportingCorrispettivi()) {
      return;
    }

    const range = resolveReportDateRange({
      ...this.corrispettiviPeriodQuery(),
      period: this.corrispettiviDisplayPeriod(),
    });

    this.blobExport.start({
      exportId: SALES_ORDERS_CORRISPETTIVI_CSV_EXPORT_ID,
      request: this.service.exportSalesOrdersCsv({
        placedFrom: range.placedFrom,
        placedTo: range.placedTo,
      }),
      filename: vestiflowExportFilename('corrispettivi-shopify', 'csv'),
      inProgressMessage: 'Export corrispettivi Shopify in corso. Puoi continuare a navigare.',
      successMessage: 'Export corrispettivi Shopify completato: download avviato.',
      errorMessage: 'Export corrispettivi non riuscito. Riprova tra qualche istante.',
    });
  }

  protected dismissShopifyFeedback(): void {
    this.clearShopifyFeedback();
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

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
