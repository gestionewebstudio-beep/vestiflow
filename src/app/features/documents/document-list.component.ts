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

import { AuthService } from '@core/auth';
import type { PageMeta } from '@core/models/api.model';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { DocumentStatus, DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { canManageDocuments } from '@core/permissions/tenant-permissions.util';
import { CustomerService } from '@features/customers/services/customer.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableViewId } from '@shared/table-columns/table-column.model';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import { DocumentTableComponent } from './components/document-table/document-table.component';
import { documentStatusLabel, documentTypeLabel } from './models/document-labels.util';
import {
  DOCUMENT_LIST_COLUMN_DEFS,
  DOCUMENT_LIST_COLUMN_PRESETS,
} from './models/document-table-columns.config';
import {
  DEFAULT_DOCUMENT_PAGE_SIZE,
  DOCUMENT_PAGE_SIZE_OPTIONS,
  parseDocumentListQuery,
} from './models/document-list-query.model';
import { DocumentService } from './services/document.service';

const SEARCH_DEBOUNCE_MS = 300;

const EMPTY_META: PageMeta = {
  page: 1,
  pageSize: DEFAULT_DOCUMENT_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

type DocumentListState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly documents: readonly DocumentRecord[];
      readonly meta: PageMeta;
    }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Registro documenti (smart). URL come fonte di verità (page, search, type,
 * status, intervallo date). Consultazione: la creazione avviene dai flussi
 * operativi (arrivo merce, trasferimenti, ...) introdotti negli step successivi.
 */
@Component({
  selector: 'app-document-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    DateInputComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PaginationComponent,
    SelectMenuComponent,
    TableSkeletonComponent,
    DocumentTableComponent,
    TableColumnPickerComponent,
  ],
  templateUrl: './document-list.component.html',
  styleUrl: './document-list.component.scss',
})
export class DocumentListComponent {
  private readonly service = inject(DocumentService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly columnPreferences = inject(TableColumnPreferenceService);
  private readonly customerService = inject(CustomerService);

  protected readonly customerOptions = toSignal(
    this.customerService.getCustomers({ page: 1, pageSize: 200 }).pipe(
      map((response) =>
        response.data.map((customer) => ({
          value: customer.id,
          label: `${customer.firstName} ${customer.lastName}`.trim(),
        })),
      ),
      catchError(() => of([] as readonly SelectMenuOption[])),
    ),
    { initialValue: [] as readonly SelectMenuOption[] },
  );

  protected readonly tableViewId = TableViewId.DocumentsList;
  protected readonly tableColumns: ReturnType<TableColumnPreferenceService['visibleColumns']>;

  protected readonly canManageDocuments = computed(() =>
    canManageDocuments(this.authService.currentUser()),
  );

  protected readonly skeletonColumns = 7;
  protected readonly pageSizeOptions = DOCUMENT_PAGE_SIZE_OPTIONS;

  protected readonly typeOptions: readonly SelectMenuOption[] = Object.values(DocumentType).map(
    (type) => ({ value: type, label: documentTypeLabel(type) }),
  );

  protected readonly statusOptions: readonly SelectMenuOption[] = Object.values(DocumentStatus).map(
    (status) => ({ value: status, label: documentStatusLabel(status) }),
  );

  protected readonly secondaryCreateOptions: readonly SelectMenuOption[] = [
    { value: 'transfer', label: 'Trasferimento' },
    { value: 'manual-unload', label: 'Scarico manuale' },
    { value: 'adjustment', label: 'Rettifica inventario' },
    { value: 'sales-ddt', label: 'DDT vendita' },
    { value: 'proforma', label: 'Proforma' },
    { value: 'invoice-draft', label: 'Bozza fattura' },
  ];

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly query = computed(() => parseDocumentListQuery(this.queryParams()));

  private readonly refreshTick = signal(0);

  protected readonly searchDraft = signal(this.route.snapshot.queryParamMap.get('search') ?? '');

  private readonly request = computed(() => ({ query: this.query(), tick: this.refreshTick() }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query }) =>
        this.service.getDocuments(query).pipe(
          map(
            (response): DocumentListState => ({
              status: 'success',
              documents: response.data,
              meta: response.meta,
            }),
          ),
          startWith<DocumentListState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<DocumentListState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies DocumentListState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly documents = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.documents : [];
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
    return Boolean(
      q.search ??
      q.type ??
      q.status ??
      q.dateFrom ??
      q.dateTo ??
      q.customerId ??
      q.accountant ??
      q.pendingInvoice,
    );
  });

  protected readonly isAccountantView = computed(() => Boolean(this.query().accountant));
  protected readonly isPendingInvoiceView = computed(() => Boolean(this.query().pendingInvoice));

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private readonly searchSubscription: Subscription;

  constructor() {
    this.columnPreferences.registerView(
      TableViewId.DocumentsList,
      DOCUMENT_LIST_COLUMN_DEFS,
      DOCUMENT_LIST_COLUMN_PRESETS,
    );
    this.tableColumns = this.columnPreferences.visibleColumns(TableViewId.DocumentsList);

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

  protected onTypeFilterChange(value: string | null): void {
    this.updateParams({ type: value, page: null }, true);
  }

  protected onStatusFilterChange(value: string | null): void {
    this.updateParams({ status: value, page: null }, true);
  }

  protected onCustomerFilterChange(value: string | null): void {
    this.updateParams({ customerId: value, page: null }, true);
  }

  protected onPendingInvoiceFilterChange(checked: boolean): void {
    this.updateParams({ pendingInvoice: checked ? '1' : null, page: null }, true);
  }

  protected onDateFromChange(value: string): void {
    this.updateParams({ dateFrom: value || null, page: null }, true);
  }

  protected onDateToChange(value: string): void {
    this.updateParams({ dateTo: value || null, page: null }, true);
  }

  protected onCreateDocumentType(value: string | null): void {
    if (!value) {
      return;
    }
    switch (value) {
      case 'transfer':
        this.openNewTransfer();
        break;
      case 'manual-unload':
        this.openNewManualUnload();
        break;
      case 'adjustment':
        this.openNewAdjustment();
        break;
      case 'sales-ddt':
        this.openNewSalesDdt();
        break;
      case 'proforma':
        this.openNewProforma();
        break;
      case 'invoice-draft':
        this.openNewInvoiceDraft();
        break;
      default:
        break;
    }
  }

  protected resetFilters(): void {
    this.searchDraft.set('');
    this.updateParams(
      {
        search: null,
        type: null,
        status: null,
        dateFrom: null,
        dateTo: null,
        customerId: null,
        accountant: null,
        pendingInvoice: null,
        page: null,
      },
      true,
    );
  }

  protected goToPage(page: number): void {
    this.updateParams({ page: page <= 1 ? null : page });
  }

  protected onPageSizeChange(size: number): void {
    this.updateParams({
      pageSize: size === DEFAULT_DOCUMENT_PAGE_SIZE ? null : size,
      page: null,
    });
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected openDocument(doc: DocumentRecord): void {
    void this.router.navigate(['/app/documents', doc.id]);
  }

  protected openSettings(): void {
    void this.router.navigate(['/app/documents/settings']);
  }

  protected openNewGoodsReceipt(): void {
    void this.router.navigate(['/app/documents/goods-receipt/new']);
  }

  protected openNewTransfer(): void {
    void this.router.navigate(['/app/documents/transfer/new']);
  }

  protected openNewManualUnload(): void {
    void this.router.navigate(['/app/documents/manual-unload/new']);
  }

  protected openNewSalesDdt(): void {
    void this.router.navigate(['/app/documents/sales-ddt/new']);
  }

  protected openNewAdjustment(): void {
    void this.router.navigate(['/app/documents/adjustment/new']);
  }

  protected openNewProforma(): void {
    void this.router.navigate(['/app/documents/proforma/new']);
  }

  protected openNewInvoiceDraft(): void {
    void this.router.navigate(['/app/documents/invoice-draft/new']);
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
