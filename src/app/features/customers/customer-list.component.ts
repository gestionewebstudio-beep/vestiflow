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
import {
  canExportOperationalData,
  canManageCustomers,
} from '@core/permissions/tenant-permissions.util';
import { CUSTOMERS_CSV_EXPORT_ID } from '@core/export/background-blob-export.constants';
import { vestiflowExportFilename } from '@core/export/background-blob-export-filename.util';
import { BackgroundBlobExportService } from '@core/services/background-blob-export.service';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import type { Customer } from '@core/models/customer.model';
import { ListActionsBarComponent } from '@shared/components/list-actions-bar/list-actions-bar.component';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { comando, voceEsporta } from '@shared/models/list-action-catalog';
import type { ListAction } from '@shared/models/list-selection.model';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import { ShopifySyncFeedbackComponent } from '@domain/channels/shopify/components/shopify-sync-feedback/shopify-sync-feedback.component';
import {
  canSyncShopifyCustomersOrOrders,
  isShopifyConnected,
} from '@domain/channels/shopify/models/shopify-page-sync.util';
import {
  formatShopifyCustomersSyncFeedback,
  type ShopifySyncFeedback,
} from '@domain/channels/shopify/models/shopify-sync-feedback.util';
import { ShopifyConnectionService } from '@domain/channels/shopify/services/shopify-connection.service';
import { ShopifySyncWatchService } from '@domain/channels/shopify/services/shopify-sync-watch.service';
import { CustomerTableComponent } from './components/customer-table/customer-table.component';
import {
  CUSTOMER_PAGE_SIZE_OPTIONS,
  DEFAULT_CUSTOMER_PAGE_SIZE,
  parseCustomerListQuery,
} from '@domain/customers/models/customer-list-query.model';
import { CustomerService } from '@domain/customers/services/customer.service';
import {
  CUSTOMER_LIST_COLUMN_DEFS,
  CUSTOMER_LIST_COLUMN_PRESETS,
  CUSTOMER_LIST_VIEW,
} from './models/customer-table-columns.config';

const SEARCH_DEBOUNCE_MS = 300;
const SHOPIFY_FEEDBACK_DISMISS_MS = 8000;

const EMPTY_META: PageMeta = {
  page: 1,
  pageSize: DEFAULT_CUSTOMER_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

type CustomerListState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly customers: readonly Customer[];
      readonly meta: PageMeta;
    }
  | { readonly status: 'error'; readonly error: AppError };

/** Lista clienti (smart). URL come fonte di verita' (page, search). */
@Component({
  selector: 'app-customer-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ListActionsBarComponent,
    ListPageComponent,
    PaginationComponent,
    CustomerTableComponent,
    ShopifySyncFeedbackComponent,
  ],
  templateUrl: './customer-list.component.html',
  styleUrl: './customer-list.component.scss',
})
export class CustomerListComponent {
  private readonly service = inject(CustomerService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly blobExport = inject(BackgroundBlobExportService);
  private readonly authService = inject(AuthService);
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly shopifySyncWatch = inject(ShopifySyncWatchService);
  private readonly columnPreferences = inject(TableColumnPreferenceService);

  protected readonly customerListView = CUSTOMER_LIST_VIEW;
  protected readonly tableColumns: ReturnType<TableColumnPreferenceService['visibleColumns']>;

  private shopifyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly skeletonColumns = 5;
  protected readonly pageSizeOptions = CUSTOMER_PAGE_SIZE_OPTIONS;

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly query = computed(() => parseCustomerListQuery(this.queryParams()));

  private readonly refreshTick = signal(0);

  protected readonly searchDraft = signal(this.route.snapshot.queryParamMap.get('search') ?? '');
  protected readonly shopifyCustomersLoading = signal(false);
  protected readonly exporting = computed(() => this.blobExport.isActive(CUSTOMERS_CSV_EXPORT_ID));
  protected readonly shopifyFeedback = signal<ShopifySyncFeedback | null>(null);
  protected readonly shopifySyncError = signal<string | null>(null);

  private readonly shopifyConnection = toSignal(
    this.shopifyConnectionService.getConnection().pipe(catchError(() => of(null))),
    { initialValue: null as ShopifyConnection | null },
  );

  protected readonly showShopifyCustomersSync = computed(
    () =>
      isShopifyConnected(this.shopifyConnection()) &&
      canSyncShopifyCustomersOrOrders(this.authService.currentUser()),
  );

  protected readonly canManage = computed(() => canManageCustomers(this.authService.currentUser()));

  protected readonly canExportData = computed(() =>
    canExportOperationalData(this.authService.currentUser()),
  );

  private readonly request = computed(() => ({ query: this.query(), tick: this.refreshTick() }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query }) =>
        this.service.getCustomers(query).pipe(
          map(
            (response): CustomerListState => ({
              status: 'success',
              customers: response.data,
              meta: response.meta,
            }),
          ),
          startWith<CustomerListState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<CustomerListState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies CustomerListState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly customers = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.customers : [];
  });

  protected readonly meta = computed<PageMeta>(() => {
    const current = this.state();
    return current.status === 'success' ? current.meta : EMPTY_META;
  });

  protected readonly isEmpty = computed(() => {
    const current = this.state();
    return current.status === 'success' && current.meta.total === 0;
  });

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private readonly searchSubscription: Subscription;

  constructor() {
    this.columnPreferences.registerView(
      CUSTOMER_LIST_VIEW,
      CUSTOMER_LIST_COLUMN_DEFS,
      CUSTOMER_LIST_COLUMN_PRESETS,
    );
    this.tableColumns = this.columnPreferences.visibleColumns(CUSTOMER_LIST_VIEW);

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

  protected resetFilters(): void {
    this.searchDraft.set('');
    this.updateParams({ search: null, page: null }, true);
  }

  protected goToPage(page: number): void {
    this.updateParams({ page: page <= 1 ? null : page });
  }

  protected onPageSizeChange(size: number): void {
    this.updateParams({ pageSize: size === DEFAULT_CUSTOMER_PAGE_SIZE ? null : size, page: null });
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected syncCustomersFromShopify(): void {
    if (this.shopifyCustomersLoading()) {
      return;
    }

    this.shopifyCustomersLoading.set(true);
    this.clearShopifyFeedback();
    this.shopifySyncError.set(null);

    this.shopifyConnectionService
      .syncCustomers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.shopifyCustomersLoading.set(false);
          this.showShopifyFeedback(formatShopifyCustomersSyncFeedback(result));
          this.reload();
        },
        error: (err: unknown) => {
          this.shopifyCustomersLoading.set(false);
          this.shopifySyncError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected exportCustomers(): void {
    if (this.exporting()) {
      return;
    }

    const { page: _page, pageSize: _pageSize, ...filters } = this.query();

    this.blobExport.start({
      exportId: CUSTOMERS_CSV_EXPORT_ID,
      request: this.service.exportCustomersCsv(filters),
      filename: vestiflowExportFilename('clienti', 'csv'),
      inProgressMessage: 'Export clienti in corso. Puoi continuare a navigare.',
      successMessage: 'Export clienti completato: download avviato.',
      errorMessage: 'Export clienti non riuscito. Riprova tra qualche istante.',
    });
  }

  protected dismissShopifyFeedback(): void {
    this.clearShopifyFeedback();
  }

  /**
   * ⭐ **I comandi dell'elenco, tutti nella barra in basso** (`14` §0.2).
   *
   * ⚠️ I permessi stanno QUI, non nel template: la condizione che decide se un
   * comando esiste sta dove il comando si dichiara, non in un `@if` altrove.
   */
  protected readonly listActions = computed<readonly ListAction[]>(() => {
    const azioni: ListAction[] = [];

    if (this.canManage()) {
      azioni.push(
        comando('new', {
          ariaLabel: 'Nuovo cliente',
          run: () => void this.router.navigate(['/app/customers/new']),
        }),
      );
    }

    if (this.canExportData()) {
      // ⭐ **Esporta è il MENU dei tracciati**, non un pulsante per formato
      //    (`14` §5.2, deciso dal proprietario il 30/08/2026). Qui era
      //    «Esporta CSV» diretto, e su altre pagine «Esporta» con le voci:
      //    la stessa cosa aveva due forme.
      azioni.push(
        comando('export', {
          busy: this.exporting(),
          ariaLabel: "Esporta l'elenco clienti",
          items: [voceEsporta('csv', () => this.exportCustomers())],
        }),
      );
    }

    if (this.showShopifyCustomersSync()) {
      azioni.push({
        id: 'shopify-sync',
        label: 'Sincronizza da Shopify',
        icon: 'pi-sync',
        requires: 'none',
        busy: this.shopifyCustomersLoading(),
        run: () => this.syncCustomersFromShopify(),
      });
    }

    return azioni;
  });

  protected openCustomer(customer: Customer): void {
    void this.router.navigate(['/app/customers', customer.id]);
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
