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
  concatMap,
  debounceTime,
  distinctUntilChanged,
  from,
  map,
  of,
  startWith,
  switchMap,
  take,
  toArray,
} from 'rxjs';
import type { Subscription } from 'rxjs';

import { AuthService } from '@core/auth';
import type { PageMeta } from '@core/models/api.model';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { DocumentStatus, DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import type { Money } from '@core/models/money.model';
import { canManageDocuments } from '@core/permissions/tenant-permissions.util';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { DEFAULT_CURRENCY, formatMoney } from '@core/utils/money.util';
import { CustomerService } from '@features/customers/services/customer.service';
import { SupplierService } from '@features/suppliers/services/supplier.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { RouterLink } from '@angular/router';

import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableViewId } from '@shared/table-columns/table-column.model';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import { DocumentTableComponent } from './components/document-table/document-table.component';
import type {
  DocumentTableActionEvent,
  DocumentTableSelectionEvent,
} from './components/document-table/document-table.component';
import {
  GOODS_RECEIPT_DOCUMENT_TYPES,
  isGoodsReceiptDocumentType,
} from './models/document-goods-receipt.util';
import { documentStatusLabel, documentTypeLabel } from './models/document-labels.util';
import { documentEditPath } from './models/document-routing.util';
import {
  DOCUMENT_LIST_COLUMN_DEFS,
  DOCUMENT_LIST_COLUMN_PRESETS,
  GOODS_RECEIPT_LIST_COLUMN_DEFS,
  GOODS_RECEIPT_LIST_COLUMN_PRESETS,
  INVOICE_LIST_COLUMN_DEFS,
  INVOICE_LIST_COLUMN_PRESETS,
  PURCHASE_INVOICE_LIST_COLUMN_DEFS,
  PURCHASE_INVOICE_LIST_COLUMN_PRESETS,
  QUOTE_LIST_COLUMN_DEFS,
  QUOTE_LIST_COLUMN_PRESETS,
  SALES_DOCUMENT_LIST_COLUMN_DEFS,
  SALES_DOCUMENT_LIST_COLUMN_PRESETS,
  STORE_SALE_LIST_COLUMN_DEFS,
  STORE_SALE_LIST_COLUMN_PRESETS,
} from './models/document-table-columns.config';
import { salesDocumentRegisterConfig } from './models/document-sales-register.config';
import type { SalesDocumentRegisterProfile } from './models/document-sales-register.config';
import {
  DEFAULT_DOCUMENT_PAGE_SIZE,
  DOCUMENT_PAGE_SIZE_OPTIONS,
  parseDocumentListQuery,
  type DocumentListProfile,
  type DocumentListQuery,
} from './models/document-list-query.model';
import { DocumentService } from './services/document.service';
import { ExternalDocumentTypeService } from './services/external-document-type.service';
import { isPrintableDocumentType } from './models/document-print.util';
import {
  buildGoodsReceiptListCsv,
  buildGoodsReceiptListPrintHtml,
} from './utils/goods-receipt-list-export.util';

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

/** Esito di una singola eliminazione nella sequenza (singola o massiva). */
type DeleteResult =
  | { readonly ok: true; readonly doc: DocumentRecord }
  | { readonly ok: false; readonly doc: DocumentRecord; readonly error: AppError };

/**
 * Registro documenti (smart). URL come fonte di verità (page, search, type,
 * status, intervallo date). Consultazione: la creazione avviene dai flussi
 * operativi (arrivo merce, trasferimenti, ...) introdotti negli step successivi.
 */
@Component({
  selector: 'app-document-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonComponent,
    ConfirmDialogComponent,
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
  private readonly supplierService = inject(SupplierService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly externalDocumentTypeService = inject(ExternalDocumentTypeService);

  private readonly routeData = toSignal(this.route.data, {
    initialValue: this.route.snapshot.data,
  });

  protected readonly listProfile = computed(
    () => (this.routeData()['documentListProfile'] as DocumentListProfile | undefined) ?? 'generic',
  );

  protected readonly isGoodsReceiptList = computed(() => this.listProfile() === 'goods-receipt');

  /** Pagina dedicata a un documento di vendita (Preventivi, Proforma, DDT, Bozze). */
  protected readonly salesRegister = computed(() =>
    salesDocumentRegisterConfig(this.listProfile()),
  );

  protected readonly isSalesRegisterList = computed(() => this.salesRegister() !== null);

  protected readonly pageTitle = computed(() => {
    const sales = this.salesRegister();
    if (sales) {
      return sales.pageTitle;
    }
    return this.isGoodsReceiptList() ? 'Arrivi merce' : 'Registro documenti';
  });

  protected readonly pageSubtitle = computed(() => {
    const sales = this.salesRegister();
    if (sales) {
      return sales.pageSubtitle;
    }
    return this.isGoodsReceiptList()
      ? 'Registro carichi fornitore, DDT e movimenti di magazzino collegati.'
      : 'Registro DDT, arrivi merce, trasferimenti, proforma e documenti fiscali.';
  });

  protected readonly searchPlaceholder = computed(() => {
    const sales = this.salesRegister();
    if (sales) {
      return sales.searchPlaceholder;
    }
    return this.isGoodsReceiptList()
      ? 'Cerca per numero, fornitore, causale, commento o totale…'
      : 'Cerca per numero, controparte o documento esterno…';
  });

  protected readonly emptyStateTitle = computed(() => {
    const sales = this.salesRegister();
    if (sales) {
      return sales.emptyTitle;
    }
    return this.isGoodsReceiptList() ? 'Nessun arrivo merce' : 'Nessun documento';
  });

  protected readonly emptyStateDescription = computed(() => {
    const sales = this.salesRegister();
    if (sales) {
      return sales.emptyDescription;
    }
    return this.isGoodsReceiptList()
      ? 'Non ci sono arrivi merce salvati. Crea un nuovo documento per registrare carichi fornitore e aggiornare le giacenze.'
      : 'Non ci sono documenti che corrispondono ai filtri. Crea un arrivo merce per registrare carichi fornitore e aggiornare le giacenze.';
  });

  protected readonly emptyStateIcon = computed(() => this.salesRegister()?.emptyIcon ?? 'pi-file');

  // ── Elenchi condivisi da più tipi (Fatture, Vendita/Reso negozio) ─────────
  /** Opzioni del filtro «Tipo»; vuoto = elenco a tipo singolo, filtro assente. */
  protected readonly sharedTypeOptions = computed<readonly SelectMenuOption[]>(
    () => this.salesRegister()?.typeFilterOptions ?? [],
  );

  protected readonly showSharedTypeFilter = computed(() => this.sharedTypeOptions().length > 0);

  /**
   * Tipo attivo nel filtro: il query param se valido per il profilo, altrimenti
   * «Tutti» (stringa vuota). La voce hub di provenienza lo preimposta passando
   * `?type=`, ma da qui in poi comanda la scelta dell'operatore.
   */
  protected readonly sharedTypeFilter = computed(() => {
    const types = this.salesRegister()?.types;
    const current = this.query().type;
    return types && current && types.includes(current) ? current : '';
  });

  /**
   * Variante di creazione attiva: segue il filtro «Tipo» così che «Nuovo …»
   * crei il documento che l'operatore sta guardando. Su «Tutti» resta la
   * variante predefinita del profilo (la Fattura semplice).
   */
  private readonly activeCreateVariant = computed(() => {
    const sales = this.salesRegister();
    const variants = sales?.createVariants;
    if (!sales || !variants) {
      return null;
    }
    const selected = this.sharedTypeFilter();
    return variants.find((v) => v.type === selected) ?? variants.find((v) => v.type === sales.type);
  });

  protected readonly salesCreateLabel = computed(
    () => this.activeCreateVariant()?.label ?? this.salesRegister()?.createLabel,
  );

  /** Pagine di sola consultazione (Vendita/Reso negozio): nessun «Nuovo …». */
  protected readonly showCreateAction = computed(
    () => this.salesRegister()?.hideCreateAction !== true,
  );

  protected readonly emptyStateCtaLabel = computed(() => {
    if (!this.canManageDocuments() || !this.showCreateAction()) {
      return undefined;
    }
    return this.salesCreateLabel() ?? 'Nuovo arrivo merce';
  });

  protected readonly locationOptions = computed((): readonly SelectMenuOption[] =>
    this.operationalLocations.locations().map((loc) => ({
      value: loc.id,
      label: loc.name,
    })),
  );

  protected readonly customerOptions = toSignal(
    this.customerService.getCustomers({ page: 1, pageSize: 100 }).pipe(
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

  protected readonly supplierOptions = toSignal(
    this.supplierService.getSuppliers().pipe(
      map((suppliers) =>
        suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
      ),
      catchError(() => of([] as readonly SelectMenuOption[])),
    ),
    { initialValue: [] as readonly SelectMenuOption[] },
  );

  /**
   * Operatori del filtro omonimo, caricati solo per i profili che lo espongono
   * e ristretti ai tipi documento della pagina.
   */
  protected readonly operatorOptions = toSignal(
    toObservable(this.salesRegister).pipe(
      switchMap((sales) => {
        if (!sales?.showOperatorFilter) {
          return of([] as readonly SelectMenuOption[]);
        }
        return this.service.getOperators(sales.types ?? [sales.type]).pipe(
          map((operators) =>
            operators.map(
              (operator): SelectMenuOption => ({
                value: operator.id,
                label: operator.name,
              }),
            ),
          ),
          catchError(() => of([] as readonly SelectMenuOption[])),
        );
      }),
    ),
    { initialValue: [] as readonly SelectMenuOption[] },
  );

  /** Stato collegamento fattura degli Arrivi merce (prompt §4). */
  protected readonly linkStatusOptions: readonly SelectMenuOption[] = [
    { value: 'suspended', label: 'Senza fattura' },
    { value: 'linked', label: 'Collegati a fattura' },
    { value: 'cancelled', label: 'Annullati' },
  ];

  /** Stato saldo delle Registrazioni fattura (spec: Tutti, Da saldare, Saldati). */
  protected readonly settlementOptions: readonly SelectMenuOption[] = [
    { value: 'pending', label: 'Da saldare' },
    { value: 'settled', label: 'Saldati' },
  ];

  /**
   * Filtro "Documento fornitore": tipo documento fornitore realmente
   * configurato dal tenant (DDT/Fattura/Reso/…), non più una whitelist fissa
   * di parole chiave sulla causale libera (audit cliente §3).
   */
  protected readonly externalDocTypeOptions = toSignal(
    this.externalDocumentTypeService.list().pipe(
      map((types) =>
        types
          .filter((type) => type.isActive)
          .map((type): SelectMenuOption => ({ value: type.id, label: type.name })),
      ),
      catchError(() => of([] as readonly SelectMenuOption[])),
    ),
    { initialValue: [] as readonly SelectMenuOption[] },
  );

  protected readonly tableViewId = computed(() => {
    const sales = this.salesRegister();
    if (sales) {
      return sales.viewId;
    }
    return this.isGoodsReceiptList()
      ? TableViewId.GoodsReceiptDocumentsList
      : TableViewId.DocumentsList;
  });

  private readonly genericTableColumns: ReturnType<TableColumnPreferenceService['visibleColumns']>;
  private readonly goodsReceiptTableColumns: ReturnType<
    TableColumnPreferenceService['visibleColumns']
  >;
  private readonly salesTableColumns: Record<
    SalesDocumentRegisterProfile,
    ReturnType<TableColumnPreferenceService['visibleColumns']>
  >;

  protected readonly tableColumns = computed(() => {
    const sales = this.salesRegister();
    if (sales) {
      return this.salesTableColumns[sales.profile]();
    }
    return this.isGoodsReceiptList() ? this.goodsReceiptTableColumns() : this.genericTableColumns();
  });

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
    { value: 'purchase-invoice', label: 'Registrazione fattura' },
    { value: 'transfer', label: 'Trasferimento' },
    { value: 'manual-unload', label: 'Scarico manuale' },
    { value: 'adjustment', label: 'Rettifica di magazzino' },
    { value: 'sales-ddt', label: 'DDT vendita' },
    { value: 'quote', label: 'Preventivo' },
    { value: 'proforma', label: 'Proforma' },
    { value: 'invoice', label: 'Fattura' },
    { value: 'invoice-accompanying', label: 'Fattura accompagnatoria' },
  ];

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly query = computed(() => parseDocumentListQuery(this.queryParams()));

  protected readonly apiQuery = computed((): DocumentListQuery => {
    const q = this.query();
    const sales = this.salesRegister();
    if (sales) {
      // Pagina dedicata: il tipo è fisso dal profilo, mai dai query param.
      // Eccezione: gli elenchi condivisi da più tipi (Fatture) espongono un
      // filtro «Tipo» — se l'operatore ne sceglie uno vince quello, se sceglie
      // «Tutti» si interrogano tutti i tipi del profilo.
      const shared = sales.types;
      const pickedType = shared?.includes(q.type as DocumentType) ? q.type : undefined;
      return {
        ...q,
        type: shared ? pickedType : sales.type,
        types: shared && !pickedType ? [...shared] : undefined,
        customerId: sales.hideCustomerFilter ? undefined : q.customerId,
        supplierId: sales.showSupplierFilter ? q.supplierId : undefined,
        settlement: sales.showSettlementFilter ? q.settlement : undefined,
        paymentMethod: sales.paymentMethodOptions ? q.paymentMethod : undefined,
        createdById: sales.showOperatorFilter ? q.createdById : undefined,
        linkStatus: undefined,
        externalDocumentTypeId: undefined,
        locationId: undefined,
        accountant: undefined,
        pendingInvoice: sales.showPendingInvoiceFilter ? q.pendingInvoice : undefined,
      };
    }
    if (this.isGoodsReceiptList()) {
      return {
        ...q,
        types: [...GOODS_RECEIPT_DOCUMENT_TYPES],
        type: undefined,
        accountant: undefined,
        pendingInvoice: undefined,
        customerId: undefined,
      };
    }
    return q;
  });

  private readonly refreshTick = signal(0);

  /** Azioni dal menu "···" della riga (§1): errore generico, download PDF in corso. */
  protected readonly actionError = signal<AppError | null>(null);
  protected readonly downloadingPdfId = signal<string | null>(null);

  // ── Eliminazione a due conferme (avviso + conferma finale) ─────────────────
  // Coda condivisa da eliminazione singola (menu riga) e massiva (barra
  // selezione): entrambe passano per i due modali consecutivi.
  protected readonly pendingDeleteDocs = signal<readonly DocumentRecord[]>([]);
  protected readonly deleteWarnOpen = signal(false);
  protected readonly deleteConfirmOpen = signal(false);
  protected readonly deleteBusy = signal(false);

  // ── Selezione multipla per operazioni massive (lista Arrivi merce) ─────────
  protected readonly selectedIds = signal<ReadonlySet<string>>(new Set<string>());
  protected readonly bulkPdfBusy = signal(false);
  protected readonly formatMoney = formatMoney;

  protected readonly selectedDocs = computed(() =>
    this.documents().filter((doc) => this.selectedIds().has(doc.id)),
  );

  /** Somma dei totali documento selezionati, mostrata nella barra massiva. */
  protected readonly selectionTotal = computed<Money>(() => {
    const docs = this.selectedDocs();
    const currencyCode = docs[0]?.currency ?? DEFAULT_CURRENCY;
    const amountMinor = docs.reduce((sum, doc) => sum + doc.total.amountMinor, 0);
    return { amountMinor, currencyCode };
  });

  protected readonly searchDraft = signal(this.route.snapshot.queryParamMap.get('search') ?? '');

  private readonly request = computed(() => ({ query: this.apiQuery(), tick: this.refreshTick() }));

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
    const sales = this.salesRegister();
    if (sales) {
      return (
        Boolean(
          q.search ??
          q.status ??
          q.dateFrom ??
          q.dateTo ??
          // Elenchi condivisi: anche il filtro «Tipo» è azzerabile.
          (sales.types ? this.sharedTypeFilter() || undefined : undefined) ??
          (sales.hideCustomerFilter ? undefined : q.customerId) ??
          (sales.showSupplierFilter ? q.supplierId : undefined) ??
          (sales.showSettlementFilter ? q.settlement : undefined) ??
          (sales.paymentMethodOptions ? q.paymentMethod : undefined) ??
          (sales.showOperatorFilter ? q.createdById : undefined),
        ) ||
        (sales.showPendingInvoiceFilter && q.pendingInvoice === true)
      );
    }
    if (this.isGoodsReceiptList()) {
      return Boolean(
        q.search ??
        q.dateFrom ??
        q.dateTo ??
        q.locationId ??
        q.supplierId ??
        q.linkStatus ??
        q.externalDocumentTypeId,
      );
    }
    // accountant/pendingInvoice sono boolean (mai nullish): vanno in OR esplicito.
    return (
      Boolean(q.search ?? q.type ?? q.status ?? q.dateFrom ?? q.dateTo ?? q.customerId) ||
      q.accountant === true ||
      q.pendingInvoice === true
    );
  });

  protected readonly isAccountantView = computed(() => Boolean(this.query().accountant));
  protected readonly isPendingInvoiceView = computed(() => Boolean(this.query().pendingInvoice));

  // takeUntilDestroyed() gestisce l'unsubscribe; i campi evitano subscription "ignorate".
  private readonly searchSubscription: Subscription;
  private readonly selectionPruneSubscription: Subscription;
  private bulkPdfSubscription: Subscription | null = null;

  constructor() {
    this.columnPreferences.registerView(
      TableViewId.DocumentsList,
      DOCUMENT_LIST_COLUMN_DEFS,
      DOCUMENT_LIST_COLUMN_PRESETS,
    );
    this.columnPreferences.registerView(
      TableViewId.GoodsReceiptDocumentsList,
      GOODS_RECEIPT_LIST_COLUMN_DEFS,
      GOODS_RECEIPT_LIST_COLUMN_PRESETS,
    );
    this.columnPreferences.registerView(
      TableViewId.QuoteDocumentsList,
      QUOTE_LIST_COLUMN_DEFS,
      QUOTE_LIST_COLUMN_PRESETS,
    );
    this.columnPreferences.registerView(
      TableViewId.ProformaDocumentsList,
      SALES_DOCUMENT_LIST_COLUMN_DEFS,
      SALES_DOCUMENT_LIST_COLUMN_PRESETS,
    );
    this.columnPreferences.registerView(
      TableViewId.SalesDdtDocumentsList,
      SALES_DOCUMENT_LIST_COLUMN_DEFS,
      SALES_DOCUMENT_LIST_COLUMN_PRESETS,
    );
    this.columnPreferences.registerView(
      TableViewId.ManualUnloadDocumentsList,
      SALES_DOCUMENT_LIST_COLUMN_DEFS,
      SALES_DOCUMENT_LIST_COLUMN_PRESETS,
    );
    // Fatture: set con la colonna «Tipo» (elenco condiviso fra i due tipi).
    this.columnPreferences.registerView(
      TableViewId.InvoiceDraftDocumentsList,
      INVOICE_LIST_COLUMN_DEFS,
      INVOICE_LIST_COLUMN_PRESETS,
    );
    this.columnPreferences.registerView(
      TableViewId.PurchaseInvoiceDocumentsList,
      PURCHASE_INVOICE_LIST_COLUMN_DEFS,
      PURCHASE_INVOICE_LIST_COLUMN_PRESETS,
    );
    // Vendita/Reso negozio: set con «Tipo» e «Metodo pagamento», senza «Stato».
    this.columnPreferences.registerView(
      TableViewId.StoreSaleDocumentsList,
      STORE_SALE_LIST_COLUMN_DEFS,
      STORE_SALE_LIST_COLUMN_PRESETS,
    );
    this.genericTableColumns = this.columnPreferences.visibleColumns(TableViewId.DocumentsList);
    this.goodsReceiptTableColumns = this.columnPreferences.visibleColumns(
      TableViewId.GoodsReceiptDocumentsList,
    );
    this.salesTableColumns = {
      quote: this.columnPreferences.visibleColumns(TableViewId.QuoteDocumentsList),
      proforma: this.columnPreferences.visibleColumns(TableViewId.ProformaDocumentsList),
      'sales-ddt': this.columnPreferences.visibleColumns(TableViewId.SalesDdtDocumentsList),
      'manual-unload': this.columnPreferences.visibleColumns(TableViewId.ManualUnloadDocumentsList),
      invoice: this.columnPreferences.visibleColumns(TableViewId.InvoiceDraftDocumentsList),
      'purchase-invoice': this.columnPreferences.visibleColumns(
        TableViewId.PurchaseInvoiceDocumentsList,
      ),
      'store-sale': this.columnPreferences.visibleColumns(TableViewId.StoreSaleDocumentsList),
    };

    this.searchSubscription = toObservable(this.searchDraft)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => this.applySearch(value));

    // Al cambio pagina/filtri la selezione si restringe alle righe visibili:
    // le azioni massive operano solo su documenti che l'utente vede.
    this.selectionPruneSubscription = toObservable(this.documents)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((docs) => {
        const visible = new Set(docs.map((doc) => doc.id));
        this.selectedIds.update((current) => {
          const next = new Set([...current].filter((id) => visible.has(id)));
          return next.size === current.size ? current : next;
        });
      });

    effect(() => {
      const fromUrl = this.query().search ?? '';
      if (fromUrl !== this.searchDraft()) {
        this.searchDraft.set(fromUrl);
      }
    });
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

  protected onLocationFilterChange(value: string | null): void {
    this.updateParams({ locationId: value, page: null }, true);
  }

  protected onSupplierFilterChange(value: string | null): void {
    this.updateParams({ supplierId: value, page: null }, true);
  }

  protected onLinkStatusFilterChange(value: string | null): void {
    this.updateParams({ linkStatus: value, page: null }, true);
  }

  /** Stato saldo (Registrazioni fattura): Tutti / Da saldare / Saldati. */
  protected onSettlementFilterChange(value: string | null): void {
    this.updateParams({ settlement: value, page: null }, true);
  }

  protected onExternalDocTypeFilterChange(value: string | null): void {
    this.updateParams({ externalDocumentTypeId: value, page: null }, true);
  }

  protected onPaymentMethodFilterChange(value: string | null): void {
    this.updateParams({ paymentMethod: value, page: null }, true);
  }

  protected onOperatorFilterChange(value: string | null): void {
    this.updateParams({ createdById: value, page: null }, true);
  }

  protected onCreateDocumentType(value: string | null): void {
    if (!value) {
      return;
    }
    switch (value) {
      case 'purchase-invoice':
        this.openNewPurchaseInvoice();
        break;
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
      case 'quote':
        this.openNewQuote();
        break;
      case 'proforma':
        this.openNewProforma();
        break;
      case 'invoice':
        this.openNewInvoice(DocumentType.InvoiceDraft);
        break;
      case 'invoice-accompanying':
        this.openNewInvoice(DocumentType.InvoiceAccompanying);
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
        locationId: null,
        supplierId: null,
        linkStatus: null,
        externalDocumentTypeId: null,
        settlement: null,
        paymentMethod: null,
        createdById: null,
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
    const sales = this.salesRegister();
    // Registrazioni fattura: la riga apre il form del modulo (il documento è
    // sempre modificabile), il dettaglio generico resta per le annullate.
    if (sales?.profile === 'purchase-invoice') {
      if (doc.status !== DocumentStatus.Cancelled) {
        void this.router.navigate(['/app/documents/registrazione-fattura', doc.id, 'edit']);
      } else {
        void this.router.navigate(['/app/documents', doc.id]);
      }
      return;
    }
    // Pagina dedicata: la riga apre l'anteprima dettaglio della sezione
    // (layout Ordine cliente), non il dettaglio del registro generico.
    if (sales) {
      void this.router.navigate([sales.listPath, doc.id]);
      return;
    }
    // Percorso unico Arrivo merce: anche dal registro generico la famiglia
    // carico si apre nel form dedicato (mai nel dettaglio generico, che non
    // può confermarla né modificarla).
    if (this.isGoodsReceiptList() || isGoodsReceiptDocumentType(doc.type)) {
      void this.router.navigate(['/app/documents', doc.id, 'edit']);
      return;
    }
    if (doc.type === DocumentType.SupplierInvoice && doc.status !== DocumentStatus.Cancelled) {
      void this.router.navigate(['/app/documents/registrazione-fattura', doc.id, 'edit']);
      return;
    }
    void this.router.navigate(['/app/documents', doc.id]);
  }

  /** Dispatch delle azioni del menu "···" di riga (§1 audit cliente). */
  protected onTableAction(event: DocumentTableActionEvent): void {
    this.actionError.set(null);
    switch (event.action) {
      case 'open':
        this.openDocument(event.doc);
        break;
      case 'duplicate':
        this.duplicateDocument(event.doc);
        break;
      case 'delete':
        this.requestDeleteDocument(event.doc);
        break;
      case 'print':
        this.downloadDocumentPdf(event.doc);
        break;
      case 'labels':
        this.openDocumentDetail(event.doc);
        break;
      case 'attachments':
        this.openDocumentDetail(event.doc, 'doc-detail-attachments');
        break;
    }
  }

  /** Duplica documento (§2a): naviga alla copia appena creata, subito modificabile. */
  protected duplicateDocument(doc: DocumentRecord): void {
    this.service
      .duplicateDocument(doc.id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          void this.router.navigateByUrl(documentEditPath(created));
        },
        error: (err: unknown) => {
          this.actionError.set(this.toAppError(err));
        },
      });
  }

  /** Tutti i documenti in coda di eliminazione sono arrivi merce. */
  private readonly pendingAllGoodsReceipt = computed(() => {
    const docs = this.pendingDeleteDocs();
    return docs.length > 0 && docs.every((doc) => isGoodsReceiptDocumentType(doc.type));
  });

  /** Titolo del 1° modale (avviso): singolare/plurale e tipo documento. */
  protected readonly deleteWarnTitle = computed(() => {
    const docs = this.pendingDeleteDocs();
    const count = docs.length;
    if (this.pendingAllGoodsReceipt()) {
      return count === 1 ? 'Elimina arrivo merce' : `Elimina ${count} arrivi merce`;
    }
    if (count === 1 && docs[0]?.type === DocumentType.ManualUnload) {
      return 'Elimina scarico manuale';
    }
    return count === 1 ? 'Elimina documento' : `Elimina ${count} documenti`;
  });

  /** Corpo del 1° modale (avviso): impatto su righe articolo e giacenze. */
  protected readonly deleteWarnMessage = computed(() => {
    const docs = this.pendingDeleteDocs();
    const count = docs.length;
    if (this.pendingAllGoodsReceipt()) {
      return count === 1
        ? "L'arrivo merce contiene righe articolo. Eliminandolo, le giacenze caricate verranno ripristinate al valore precedente."
        : `I ${count} arrivi merce contengono righe articolo. Eliminandoli, le giacenze caricate verranno ripristinate al valore precedente.`;
    }
    if (count === 1 && docs[0]?.type === DocumentType.ManualUnload) {
      return 'Lo scarico manuale verrà eliminato. Le giacenze già scalate NON verranno ripristinate.';
    }
    return count === 1
      ? 'Il documento verrà eliminato.'
      : `I ${count} documenti selezionati verranno eliminati.`;
  });

  protected requestDeleteDocument(doc: DocumentRecord): void {
    this.actionError.set(null);
    this.pendingDeleteDocs.set([doc]);
    this.deleteWarnOpen.set(true);
  }

  /** Elimina i documenti selezionati (barra operazioni massive). */
  protected requestDeleteSelection(): void {
    const docs = this.selectedDocs();
    if (docs.length === 0) {
      return;
    }
    this.actionError.set(null);
    this.pendingDeleteDocs.set([...docs]);
    this.deleteWarnOpen.set(true);
  }

  /** 1° modale (avviso) confermato → apre il 2° modale (conferma finale). */
  protected onDeleteWarnConfirm(): void {
    this.deleteWarnOpen.set(false);
    this.deleteConfirmOpen.set(true);
  }

  /** Annulla/ESC su uno dei due modali: azzera la coda di eliminazione. */
  protected onDeleteCancel(): void {
    if (this.deleteBusy()) {
      return;
    }
    this.pendingDeleteDocs.set([]);
  }

  /**
   * Conferma finale: elimina i documenti in coda uno alla volta (nessun
   * endpoint massivo), raccoglie gli esiti e ricarica. Un errore su un
   * documento (es. collegato a fattura) non interrompe gli altri.
   */
  protected onDeleteConfirm(): void {
    const docs = this.pendingDeleteDocs();
    if (docs.length === 0 || this.deleteBusy()) {
      this.deleteConfirmOpen.set(false);
      return;
    }
    this.deleteBusy.set(true);
    from(docs)
      .pipe(
        concatMap((doc) =>
          this.service.deleteDocument(doc.id).pipe(
            map((): DeleteResult => ({ ok: true, doc })),
            catchError((err: unknown) =>
              of<DeleteResult>({ ok: false, doc, error: this.toAppError(err) }),
            ),
          ),
        ),
        toArray(),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        this.deleteBusy.set(false);
        this.deleteConfirmOpen.set(false);
        this.pendingDeleteDocs.set([]);
        const deletedIds = new Set(results.filter((r) => r.ok).map((r) => r.doc.id));
        if (deletedIds.size > 0) {
          this.selectedIds.update((cur) => new Set([...cur].filter((id) => !deletedIds.has(id))));
        }
        const failure = results.find((r) => !r.ok);
        const failedCount = results.length - deletedIds.size;
        if (failure && !failure.ok) {
          this.actionError.set(
            failedCount === 1
              ? failure.error
              : {
                  kind: failure.error.kind,
                  message: `${failedCount} documenti non sono stati eliminati. ${failure.error.message}`,
                },
          );
        } else {
          this.actionError.set(null);
        }
        this.reload();
      });
  }

  // ── Operazioni massive sui documenti selezionati ────────────────────────────

  protected onToggleDocSelection(event: DocumentTableSelectionEvent): void {
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (event.selected) {
        next.add(event.doc.id);
      } else {
        next.delete(event.doc.id);
      }
      return next;
    });
  }

  protected onToggleSelectAll(checked: boolean): void {
    this.selectedIds.set(checked ? new Set(this.documents().map((doc) => doc.id)) : new Set());
  }

  protected clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  /** CSV apribile in Excel dei documenti selezionati, con riga totali. */
  protected exportSelectionCsv(): void {
    const docs = this.selectedDocs();
    if (docs.length === 0) {
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    this.downloadBlob(
      new Blob([buildGoodsReceiptListCsv(docs)], { type: 'text/csv;charset=utf-8' }),
      `arrivi-merce-${stamp}.csv`,
    );
  }

  /** Elenco stampabile dei selezionati con totali ("Salva come PDF" incluso). */
  protected printSelectionList(): void {
    const docs = this.selectedDocs();
    if (docs.length === 0) {
      return;
    }
    const printWindow = globalThis.open('', '_blank');
    if (!printWindow) {
      this.actionError.set({
        kind: AppErrorKind.Unknown,
        message: 'Il browser ha bloccato la finestra di stampa. Consenti i popup e riprova.',
      });
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildGoodsReceiptListPrintHtml(docs));
    printWindow.document.close();
    const runPrint = (): void => {
      printWindow.focus();
      printWindow.print();
    };
    if (printWindow.document.readyState === 'complete') {
      runPrint();
    } else {
      printWindow.addEventListener('load', runPrint, { once: true });
    }
  }

  /** Scarica in sequenza il PDF di ogni documento selezionato. */
  protected downloadSelectionPdfs(): void {
    const docs = this.selectedDocs().filter((doc) => isPrintableDocumentType(doc.type));
    if (docs.length === 0 || this.bulkPdfBusy()) {
      return;
    }
    this.bulkPdfBusy.set(true);
    this.bulkPdfSubscription = from(docs)
      .pipe(
        concatMap((doc) => this.service.exportPdf(doc.id).pipe(map((blob) => ({ doc, blob })))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ doc, blob }) => {
          const stamp = doc.documentDate.slice(0, 10);
          this.downloadBlob(blob, `documento-${doc.reference ?? doc.id}-${stamp}.pdf`);
        },
        complete: () => this.bulkPdfBusy.set(false),
        error: (err: unknown) => {
          this.bulkPdfBusy.set(false);
          this.actionError.set(this.toAppError(err));
        },
      });
  }

  /** Stampa (§1): scarica il PDF direttamente dalla lista, senza aprire il documento. */
  protected downloadDocumentPdf(doc: DocumentRecord): void {
    if (this.downloadingPdfId()) {
      return;
    }
    this.downloadingPdfId.set(doc.id);
    this.service
      .exportPdf(doc.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloadingPdfId.set(null);
          const stamp = doc.documentDate.slice(0, 10);
          this.downloadBlob(blob, `documento-${doc.reference ?? doc.id}-${stamp}.pdf`);
        },
        error: (err: unknown) => {
          this.downloadingPdfId.set(null);
          this.actionError.set(this.toAppError(err));
        },
      });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename.replace(/[^\w\s.-]/g, '-');
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Etichette/Allegati (§1): naviga al dettaglio documento invece di
   * duplicare pannello di stampa/allegati nella lista — il dettaglio li
   * espone già entrambi (Stampa etichette condizionata al tipo, pannello
   * allegati sempre). Il fragment posiziona la vista sulla sezione allegati.
   */
  private openDocumentDetail(doc: DocumentRecord, fragment?: string): void {
    const sales = this.salesRegister();
    // Registrazioni fattura: nessuna anteprima dedicata — allegati/etichette
    // vivono nel dettaglio del registro generico.
    const commands =
      sales && sales.profile !== 'purchase-invoice'
        ? [sales.listPath, doc.id]
        : ['/app/documents', doc.id];
    void this.router.navigate(commands, fragment ? { fragment } : {});
  }

  protected openHub(): void {
    void this.router.navigateByUrl('/app/documents');
  }

  protected openSettings(): void {
    void this.router.navigate(['/app/documents/settings']);
  }

  protected openNewGoodsReceipt(): void {
    void this.router.navigate(['/app/documents/goods-receipt/new']);
  }

  protected openNewPurchaseInvoice(): void {
    void this.router.navigate(['/app/documents/registrazione-fattura/new']);
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

  protected openNewQuote(): void {
    void this.router.navigate(['/app/documents/quote/new']);
  }

  /** Nuova fattura del tipo scelto: le due varianti condividono il form. */
  protected openNewInvoice(type: DocumentType): void {
    const path =
      type === DocumentType.InvoiceAccompanying
        ? '/app/documents/fattura-accompagnatoria/new'
        : '/app/documents/fattura/new';
    void this.router.navigate([path]);
  }

  /** «Nuovo …» della pagina dedicata (Preventivi, Proforma, DDT, Fatture). */
  protected openNewSalesDocument(): void {
    const sales = this.salesRegister();
    if (sales) {
      void this.router.navigateByUrl(this.activeCreateVariant()?.path ?? sales.createPath);
    }
  }

  /** Cambio filtro «Tipo» sugli elenchi condivisi (Fatture). */
  protected onSharedTypeFilterChange(value: string | null): void {
    this.updateParams({ type: value || null, page: null });
  }

  /** CTA dello stato vuoto: creazione contestuale alla pagina. */
  protected onEmptyStateCta(): void {
    if (this.salesRegister()) {
      this.openNewSalesDocument();
      return;
    }
    this.openNewGoodsReceipt();
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
