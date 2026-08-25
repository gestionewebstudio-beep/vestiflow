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
import type { DocumentPermissionFamily } from '@core/models/tenant-permission.model';
import {
  canManageDocumentType,
  documentTypesOfFamily,
  manageableDocumentFamilies,
} from '@core/permissions/document-permission.util';
import {
  canManageDocFamily,
  canManageDocuments,
  canOpenRetailRegister,
} from '@core/permissions/tenant-permissions.util';
import type { PaymentOption } from '@core/models/payment-option.model';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { DEFAULT_CURRENCY, formatMoney } from '@core/utils/money.util';
import { CustomerService } from '@domain/customers/services/customer.service';
import {
  DEFAULT_MOVEMENT_PERIOD,
  MovementPeriodPreset,
  resolveMovementPeriodRange,
} from '@domain/inventory/models/movement-period.util';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { ListActionsBarComponent } from '@shared/components/list-actions-bar/list-actions-bar.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import {
  FILTERED_SCOPE_NOT_AVAILABLE,
  type ListAction,
  type ListActionTarget,
} from '@shared/models/list-selection.model';
import {
  serializeDataTableSort,
  type DataTableSort,
} from '@shared/components/data-table/data-table.model';
import { createListSelection } from '@shared/utils/list-selection';
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
import {
  documentStatusLabel,
  documentTypeLabel,
} from '@domain/documents/models/document-labels.util';
import { canBulkDeleteDocuments } from './models/document-bulk-actions.util';
import {
  documentDetailPath,
  documentDuplicateFormRoute,
  documentRowPath,
  salesFormRouteSegment,
} from './models/document-routing.util';
import {
  DOCUMENT_LIST_SORTABLE_COLUMNS,
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
  parseDocumentListQuery,
  type DocumentListProfile,
  type DocumentListQuery,
} from '@domain/documents/models/document-list-query.model';
import { DocumentService } from '@domain/documents/services/document.service';
import { ExternalDocumentTypeService } from '@domain/documents/services/external-document-type.service';
import { isPrintableDocumentType } from './models/document-print.util';
import {
  GOODS_RECEIPT_LIST_EXPORT,
  buildDocumentListCsv,
  buildDocumentListPrintHtml,
  documentListExportFileName,
  type DocumentListExportConfig,
} from './utils/document-list-export.util';

const SEARCH_DEBOUNCE_MS = 300;

const EMPTY_META: PageMeta = {
  page: 1,
  pageSize: DEFAULT_DOCUMENT_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

/**
 * Voci del menu «Altro documento», ciascuna col tipo che crea. Il tipo non è
 * decorativo: è quello che permette di chiedere il permesso della famiglia
 * corrispondente senza riscrivere qui la mappa tipo → famiglia.
 */
export const SECONDARY_CREATE_ENTRIES: readonly (SelectMenuOption & {
  readonly type: DocumentType;
})[] = [
  {
    value: 'purchase-invoice',
    label: 'Registrazione fattura fornitore',
    type: DocumentType.SupplierInvoice,
  },
  { value: 'transfer', label: 'Trasferimento', type: DocumentType.Transfer },
  { value: 'manual-unload', label: 'Scarico manuale', type: DocumentType.ManualUnload },
  { value: 'adjustment', label: 'Rettifica di magazzino', type: DocumentType.Adjustment },
  { value: 'sales-ddt', label: 'DDT vendita', type: DocumentType.SalesDdt },
  { value: 'quote', label: 'Preventivo', type: DocumentType.Quote },
  { value: 'proforma', label: 'Proforma', type: DocumentType.Proforma },
  { value: 'invoice', label: 'Fattura', type: DocumentType.Invoice },
  {
    value: 'invoice-accompanying',
    label: 'Fattura accompagnatoria',
    type: DocumentType.InvoiceAccompanying,
  },
  // Il terzo tipo della famiglia sta qui come gli altri due: un menu che ne
  // elenca due su tre suggerisce che il terzo si crei da un'altra parte.
  { value: 'credit-note', label: 'Nota di credito', type: DocumentType.CreditNote },
];

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
    BackButtonComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    DateInputComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    InlineBannerComponent,
    ListActionsBarComponent,
    SelectMenuComponent,
    SlidePanelComponent,
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
  private readonly paymentOptionsService = inject(PaymentOptionsService);

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

  // ── Elenchi condivisi da più tipi (Fatture, Vendita/Reso al banco) ─────────
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
   * Le voci del menu «Nuovo»: **una per tipo, sempre tutte**, qualunque sia il
   * filtro attivo.
   *
   * Qui c'era `activeCreateVariant`, che sceglieva la variante **seguendo il
   * filtro «Tipo»**: con il filtro su Nota di credito il pulsante diventava
   * «Nuova nota di credito» e ci mandava. Sembrava una comodità ed era un
   * difetto — il filtro è un modo di **guardare** l'elenco, non di **dichiarare
   * cosa si sta per creare**, e usarlo per entrambi toglieva all'operatore la
   * possibilità di creare una Fattura mentre guarda le note di credito. Il
   * meccanismo veniva dal modulo a due tipi (`17de1f68`) e con il terzo è
   * diventato visibile.
   */
  protected readonly createVariantOptions = computed<readonly SelectMenuOption[]>(() =>
    (this.salesRegister()?.createVariants ?? []).map((variant) => ({
      value: variant.type,
      label: variant.label,
    })),
  );

  /**
   * Le varianti da rendere come PULSANTI affiancati invece che a menu.
   *
   * Vuoto quando la pagina usa il menu: il template sceglie il ramo da qui,
   * senza sapere niente del profilo.
   */
  protected readonly createVariantButtons = computed(() => {
    const sales = this.salesRegister();
    return sales?.createVariantsLayout === 'buttons' ? (sales.createVariants ?? []) : [];
  });

  /** Elenchi a tipo singolo: l'etichetta del bottone, che non ha varianti. */
  protected readonly salesCreateLabel = computed(() => this.salesRegister()?.createLabel);

  /** Pagine di sola consultazione (Vendita/Reso al banco): nessun «Nuovo …». */
  protected readonly showCreateAction = computed(
    () => this.salesRegister()?.hideCreateAction !== true,
  );

  protected readonly emptyStateCtaLabel = computed(() => {
    if (!this.showCreateAction()) {
      return undefined;
    }
    // Elenchi condivisi: nessuna CTA a bottone singolo, perché sceglierebbe un
    // tipo al posto dell'operatore. Lo stato vuoto riceve il menu a tre voci
    // per proiezione (vedi template) — è lo stesso comando della testata.
    if (this.createVariantOptions().length > 0) {
      return undefined;
    }
    const salesLabel = this.salesCreateLabel();
    if (salesLabel) {
      return this.canManageDocuments() ? salesLabel : undefined;
    }
    // Registro generico e Arrivi merce: la CTA crea un arrivo merce, quindi
    // senza quella famiglia lo stato vuoto resta senza pulsante.
    return this.canManageGoodsReceipts() ? 'Nuovo arrivo merce' : undefined;
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
            operators.map((operator): SelectMenuOption => ({
              value: operator.id,
              label: operator.name,
            })),
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

  /** Modalità di pagamento del tenant per il filtro «Pagamento». */
  protected readonly paymentMethodFilterOptions = toSignal(
    this.paymentOptionsService.list('method').pipe(
      map((options): readonly SelectMenuOption[] =>
        options
          .filter((option: PaymentOption) => option.isActive)
          .map((option) => ({ value: option.name, label: option.name })),
      ),
      catchError(() => of([] as readonly SelectMenuOption[])),
    ),
    { initialValue: [] as readonly SelectMenuOption[] },
  );

  /** Preset rapidi del periodo Dal/Al (allineati al registro movimenti). */
  protected readonly periodOptions: readonly SelectMenuOption[] = [
    // ⭐ «Tutti» resta scegliibile ma NON è più il predefinito (`14` §H14-bis):
    // un riepilogo che si apre su tutta la storia del tenant chiede al database
    // di leggerla prima ancora che l'operatore abbia guardato qualcosa.
    { value: MovementPeriodPreset.All, label: 'Tutti' },
    { value: MovementPeriodPreset.Last7Days, label: 'Ultimi 7 giorni' },
    { value: MovementPeriodPreset.Last30Days, label: 'Ultimi 30 giorni' },
    { value: MovementPeriodPreset.ThisMonth, label: 'Mese corrente' },
    { value: MovementPeriodPreset.LastMonth, label: 'Mese scorso' },
    { value: MovementPeriodPreset.ThisYear, label: 'Anno corrente' },
    { value: MovementPeriodPreset.LastYear, label: 'Anno scorso' },
    { value: MovementPeriodPreset.Custom, label: 'Personalizzato' },
  ];

  /**
   * Preset periodo selezionato (stato UI locale): le date effettive restano
   * nell'URL (dateFrom/dateTo). Con date presenti si parte da «Personalizzato»,
   * così i campi Dal/Al restano visibili.
   */
  protected readonly periodPreset = signal<MovementPeriodPreset>(
    this.route.snapshot.queryParamMap.get('dateFrom') ||
      this.route.snapshot.queryParamMap.get('dateTo')
      ? MovementPeriodPreset.Custom
      : DEFAULT_MOVEMENT_PERIOD,
  );

  protected readonly isCustomPeriod = computed(
    () => this.periodPreset() === MovementPeriodPreset.Custom,
  );

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

  /**
   * Famiglia della matrice permessi corrispondente all'elenco aperto. Il
   * registro generico non ne ha una: lì vale «gestisce almeno una famiglia»
   * (le righe sono di tipi diversi e ognuna si difende da sola).
   */
  private readonly listFamily = computed((): DocumentPermissionFamily | null => {
    switch (this.listProfile()) {
      case 'goods-receipt':
        return 'goods_receipt';
      case 'purchase-invoice':
        return 'purchase_invoice';
      case 'quote':
        return 'quote';
      case 'proforma':
        return 'proforma';
      case 'sales-ddt':
        return 'sales_ddt';
      case 'invoice':
        return 'invoice';
      case 'store-sale':
        return 'store_sale';
      case 'manual-unload':
        return 'manual_unload';
      default:
        return null;
    }
  });

  /**
   * Gate del pulsante «Nuovo …» e delle azioni di riga: la famiglia
   * dell'elenco, non «almeno una famiglia» — altrimenti il bottone comparirebbe
   * a chi l'API poi rifiuta.
   */
  protected readonly canManageDocuments = computed(() => {
    const family = this.listFamily();
    const user = this.authService.currentUser();
    return family ? canManageDocFamily(user, family) : canManageDocuments(user);
  });

  /**
   * Gate di «Nuovo arrivo merce». Sul registro generico `canManageDocuments()`
   * vale «gestisce almeno una famiglia»: chi gestisce solo i preventivi vedeva
   * comunque il pulsante del carico, che l'API poi rifiuta.
   */
  protected readonly canManageGoodsReceipts = computed(() =>
    canManageDocFamily(this.authService.currentUser(), 'goods_receipt'),
  );

  /**
   * Voci del menu «Altro documento» che l'utente può davvero creare: senza il
   * permesso della famiglia il tipo non compare tra le scelte.
   */
  protected readonly secondaryCreateOptions = computed<readonly SelectMenuOption[]>(() => {
    const user = this.authService.currentUser();
    return SECONDARY_CREATE_ENTRIES.filter((entry) => canManageDocumentType(user, entry.type)).map(
      ({ value, label }) => ({ value, label }),
    );
  });

  /**
   * Almeno un comando di creazione da mostrare in testata: sugli elenchi
   * dedicati la famiglia dell'elenco, sul registro generico l'arrivo merce o
   * una voce del menu. Senza nulla da offrire la barra azioni non compare.
   */
  protected readonly showCreateActions = computed(() => {
    const sales = this.salesRegister();
    if (sales) {
      // ⛔ Le Vendite al banco chiedono `retail.register`, non «gestisci
      // documenti»: le loro rotte sono protette da `retailSalesRegisterGuard`,
      // e senza questo controllo chi ha solo la gestione documenti vedrebbe i
      // pulsanti e verrebbe rimbalzato in dashboard. Un comando che porta a un
      // rimbalzo e' peggio di un comando assente.
      if (
        sales.createRequiresRetailRegister &&
        !canOpenRetailRegister(this.authService.currentUser())
      ) {
        return false;
      }
      return this.canManageDocuments() && this.showCreateAction();
    }
    if (this.isGoodsReceiptList()) {
      return this.canManageDocuments();
    }
    return this.canManageGoodsReceipts() || this.secondaryCreateOptions().length > 0;
  });

  /** Tipi gestibili dall'utente: guida le azioni di riga della tabella. */
  protected readonly manageableTypes = computed(() => {
    const user = this.authService.currentUser();
    return manageableDocumentFamilies(user).flatMap((family) => [...documentTypesOfFamily(family)]);
  });

  protected readonly skeletonColumns = 7;

  protected readonly typeOptions: readonly SelectMenuOption[] = Object.values(DocumentType).map(
    (type) => ({ value: type, label: documentTypeLabel(type) }),
  );

  protected readonly statusOptions: readonly SelectMenuOption[] = Object.values(DocumentStatus).map(
    (status) => ({ value: status, label: documentStatusLabel(status) }),
  );

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly query = computed(() => parseDocumentListQuery(this.queryParams()));

  /**
   * L'ordinamento che si può davvero chiedere al server.
   *
   * ⚠️ **Il filtro non è ridondante**: la stringa arriva dall'URL, dove chiunque
   * può scrivere `sort=type:asc`. Il server risponderebbe `400` — giusto per
   * un programma, inutile per un operatore che si è portato dietro un link
   * vecchio. Qui si ripulisce e l'elenco si apre nel suo ordine.
   */
  private readonly sortRichiesto = computed<readonly DataTableSort[]>(() =>
    (this.query().sort ?? []).filter((chiave) =>
      DOCUMENT_LIST_SORTABLE_COLUMNS.has(chiave.columnId),
    ),
  );

  /**
   * Il periodo con cui la lista interroga l'API.
   *
   * ⭐ **Il predefinito non passa dall'URL**: all'apertura non c'è nessun
   * `dateFrom`, e il riepilogo deve comunque partire dagli ultimi 30 giorni
   * (`14` §H14-bis). Scriverlo nell'URL a ogni apertura sporcherebbe la
   * cronologia del browser con un parametro che nessuno ha scelto.
   *
   * Quando l'operatore sceglie un periodo, quello **sì** finisce nell'URL: è
   * una sua decisione, e la pagina si condivide con quella dentro.
   */
  private readonly periodoEffettivo = computed(() => {
    const q = this.query();
    if (q.dateFrom || q.dateTo) {
      return { from: q.dateFrom, to: q.dateTo };
    }
    return resolveMovementPeriodRange(this.periodPreset(), '', '');
  });

  protected readonly apiQuery = computed((): DocumentListQuery => {
    const periodo = this.periodoEffettivo();
    const q = {
      ...this.query(),
      sort: this.sortRichiesto(),
      dateFrom: periodo.from,
      dateTo: periodo.to,
      // ⛔ I riepiloghi non impaginano: si chiede tutto il risultato del
      // filtro, ed è ciò che rende onesto ordinarlo nel client.
      all: true,
    };
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
        pendingInvoice: sales.showPendingInvoiceFilter ? q.pendingInvoice : undefined,
      };
    }
    if (this.isGoodsReceiptList()) {
      return {
        ...q,
        types: [...GOODS_RECEIPT_DOCUMENT_TYPES],
        type: undefined,
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

  // ── Selezione e azioni contestuali (`14` §5, parte D) ──────────────────────
  //
  // Lo STATO sta nella primitiva comune, non più qui: era duplicato identico in
  // questo componente e in `sales-order-list`, e sarebbe stato copiato in altri
  // cinque elenchi.
  private readonly selection = createListSelection('multiple');
  protected readonly selectedIds = this.selection.ids;
  protected readonly selectionCount = this.selection.count;
  protected readonly bulkPdfBusy = signal(false);
  protected readonly formatMoney = formatMoney;

  /**
   * ⛔ **Ogni elenco documentale seleziona** (`14` §4 e §C).
   *
   * Qui c'era `isGoodsReceiptList() || salesRegister()?.supportsBulkSelection`,
   * cioè: Arrivi merce e **un solo** profilo su sette (i Preventivi). Su tutti
   * gli altri registri non si poteva esportare un sottoinsieme, e l'operatore
   * esportava tutto per poi tagliarlo fuori dal gestionale.
   */
  protected readonly supportsSelection = computed(() => true);

  /**
   * Se la selezione corrente si può eliminare in blocco (`14` §5.2).
   *
   * ⛔ Non basta il permesso: Vendita e Reso al banco **non si eliminano**, e
   * senza questa guardia allargare la selezione a tutti gli elenchi avrebbe
   * messo un pulsante «Elimina» davanti a un'API che risponde 409 — il difetto
   * che `11` C 0 nomina per esteso.
   */
  protected readonly canDeleteSelection = computed(
    () => this.canManageDocuments() && canBulkDeleteDocuments(this.selectedDocs()),
  );

  /** Configurazione export massivo attiva (nome file e colonne per tipo). */
  protected readonly activeListExport = computed<DocumentListExportConfig>(
    () => this.salesRegister()?.listExport ?? GOODS_RECEIPT_LIST_EXPORT,
  );

  protected readonly selectedDocs = computed(() =>
    this.documents().filter((doc) => this.selectedIds().has(doc.id)),
  );

  /**
   * Le azioni della barra contestuale, **dichiarate da questa pagina** (`14`
   * parte D). La primitiva non sa che cosa siano: le rende e le esegue.
   *
   * ⚠️ **Esporta è un menu, non tre pulsanti** (§5.2): i formati sono varianti
   * della stessa azione, e a barra piena una fila di pulsanti per formato non
   * ci sta — su mobile non ci stava già.
   *
   * ⚠️ **`.xlsx` non compare, e non è una dimenticanza**: oggi «Esporta Excel»
   * produce un CSV, e i formati disponibili li dichiara la pagina, non la
   * primitiva. Una voce che promette un foglio Excel vero va aggiunta quando ci
   * sarà chi lo genera, non prima.
   */
  protected readonly selectionActions = computed<readonly ListAction[]>(() => {
    const azioni: ListAction[] = [
      {
        // ⭐ **Il Dettaglio è la porta che mancava** (`14` §E4/§E5). Da quando
        // il clic di riga apre la Modifica, la vista di consultazione non
        // aveva più nessun ingresso nell'interfaccia: ci si arrivava solo per
        // URL, o quando `documentRowPath` ci mandava un documento annullato.
        //
        // Sta PRIMA degli altri comandi perché è l'unico che si limita a
        // guardare: si legge prima di produrre, e chi arriva con la mano su
        // Elimina la trova comunque dove l'ha lasciata (§5, i comandi non si
        // spostano).
        id: 'detail',
        label: 'Dettaglio',
        icon: 'pi-eye',
        requires: 'one',
        ariaLabel: 'Apri il dettaglio del documento selezionato',
        run: (target) => this.openSelectionDetail(target),
      },
      {
        id: 'print',
        label: 'Stampa',
        icon: 'pi-print',
        requires: 'none',
        disabled: this.selectionCount() === 0,
        disabledReason: FILTERED_SCOPE_NOT_AVAILABLE,
        ariaLabel: "Stampa l'elenco dei documenti selezionati",
        run: () => this.printSelectionList(),
      },
      {
        id: 'export',
        label: 'Esporta',
        icon: 'pi-download',
        requires: 'none',
        busy: this.bulkPdfBusy(),
        disabled: this.selectionCount() === 0,
        disabledReason: FILTERED_SCOPE_NOT_AVAILABLE,
        items: [
          {
            id: 'csv',
            label: 'CSV (.csv)',
            icon: 'pi-file-excel',
            run: () => this.exportSelectionCsv(),
          },
          {
            id: 'pdf',
            label: 'PDF (.pdf)',
            icon: 'pi-file-pdf',
            run: () => this.downloadSelectionPdfs(),
          },
        ],
      },
    ];
    // ⛔ Il PERMESSO decide la presenza, il TIPO decide l'abilitazione.
    //
    // Sono i due stati distinti della tassonomia (`14` §5.1): chi non gestisce
    // i documenti non vedrà mai il comando — mostrarglielo spento sarebbe
    // rumore; chi lo gestisce lo vede sempre, e se la selezione contiene tipi
    // che non si eliminano legge perché.
    if (this.canManageDocuments()) {
      const nonEliminabili = !canBulkDeleteDocuments(this.selectedDocs());
      azioni.push({
        id: 'delete',
        label: 'Elimina',
        icon: 'pi-trash',
        variant: 'danger',
        requires: 'oneOrMore',
        disabled: this.selectionCount() > 0 && nonEliminabili,
        disabledReason:
          'La selezione contiene documenti che non si eliminano: Vendite e Resi al banco.',
        run: () => this.requestDeleteSelection(),
      });
    }
    return azioni;
  });

  /** Somma dei totali documento selezionati, mostrata nella barra massiva. */
  protected readonly selectionTotal = computed<Money>(() => {
    const docs = this.selectedDocs();
    const currencyCode = docs[0]?.currency ?? DEFAULT_CURRENCY;
    const amountMinor = docs.reduce((sum, doc) => sum + doc.total.amountMinor, 0);
    return { amountMinor, currencyCode };
  });

  protected readonly searchDraft = signal(this.route.snapshot.queryParamMap.get('search') ?? '');

  /**
   * ⛔ **Confronto per CONTENUTO**: un `computed` che costruisce un oggetto ne
   * produce uno nuovo a ogni ricalcolo, e `toObservable` lo confronta con
   * `Object.is` — due richieste identiche risultano diverse e l'elenco
   * ricarica dati che ha già. Qui l'ordinamento è server-side, quindi una
   * richiesta nuova ci vuole davvero: questo evita solo quelle **identiche**
   * (misurato il 21/08/2026 sul Registro, dove era il grosso della lentezza).
   */
  private readonly request = computed(
    () => ({ query: this.apiQuery(), tick: this.refreshTick() }),
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ query }) =>
        this.service.getDocuments(query).pipe(
          map((response): DocumentListState => ({
            status: 'success',
            documents: response.data,
            meta: response.meta,
          })),
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
        q.externalDocumentTypeId ??
        q.paymentMethod,
      );
    }
    // pendingInvoice è boolean (mai nullish): va in OR esplicito.
    return (
      Boolean(q.search ?? q.type ?? q.status ?? q.dateFrom ?? q.dateTo ?? q.customerId) ||
      q.pendingInvoice === true
    );
  });

  /** Pannello filtri mobile (layout comune pagine-registro): apertura UI pura. */
  protected readonly mobileFiltersOpen = signal(false);

  /**
   * Quanti filtri sono attivi, per il badge del pulsante «Filtri». La ricerca
   * non conta (ha il campo sempre visibile); Dal/Al contano una volta sola.
   * Stessi campi già valutati da hasActiveFilters, per profilo: zero logica nuova.
   */
  protected readonly activeFilterCount = computed(() => {
    const q = this.query();
    const sales = this.salesRegister();
    let count = 0;
    if (q.dateFrom ?? q.dateTo) count++;
    if (sales) {
      if (q.status) count++;
      if (sales.types && this.sharedTypeFilter()) count++;
      if (!sales.hideCustomerFilter && q.customerId) count++;
      if (sales.showSupplierFilter && q.supplierId) count++;
      if (sales.showSettlementFilter && q.settlement) count++;
      if (sales.paymentMethodOptions && q.paymentMethod) count++;
      if (sales.showOperatorFilter && q.createdById) count++;
      if (sales.showPendingInvoiceFilter && q.pendingInvoice === true) count++;
      return count;
    }
    if (this.isGoodsReceiptList()) {
      if (q.locationId) count++;
      if (q.supplierId) count++;
      if (q.linkStatus) count++;
      if (q.externalDocumentTypeId) count++;
      if (q.paymentMethod) count++;
      return count;
    }
    if (q.type) count++;
    if (q.status) count++;
    if (q.customerId) count++;
    if (q.pendingInvoice === true) count++;
    return count;
  });

  protected readonly isPendingInvoiceView = computed(() => Boolean(this.query().pendingInvoice));

  // takeUntilDestroyed() gestisce l'unsubscribe; i campi evitano subscription "ignorate".
  private readonly searchSubscription: Subscription;
  private readonly selectionPruneSubscription: Subscription;
  private bulkPdfSubscription: Subscription | null = null;

  constructor() {
    // ⭐ **URL completo quando un periodo è applicato** (`14` §H14-bis, deciso
    // il 20/08/2026). Il predefinito di 30 giorni È un filtro applicato —
    // l'elenco mostra solo quelle righe — quindi finisce nell'indirizzo: un
    // riepilogo filtrato si capisce, si condivide e si riproduce.
    //
    // ⛔ Una volta sola, alla creazione: riscriverlo a ogni giro cancellerebbe
    // la scelta «Tutti», che è l'unico caso in cui nessun periodo è applicato.
    if (this.periodPreset() !== MovementPeriodPreset.All) {
      const iniziale = resolveMovementPeriodRange(this.periodPreset(), '', '');
      this.updateParams({ dateFrom: iniziale.from ?? null, dateTo: iniziale.to ?? null }, true);
    }

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
    // Vendita/Reso al banco: set con «Tipo» e «Metodo pagamento», senza «Stato».
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
      .subscribe((docs) => this.selection.prune(docs.map((doc) => doc.id)));

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

  /** Cambio preset periodo: calcola Dal/Al o mantiene i campi custom. */
  protected onPeriodPresetChange(value: string | null): void {
    const preset = (value ?? MovementPeriodPreset.All) as MovementPeriodPreset;
    this.periodPreset.set(preset);
    if (preset === MovementPeriodPreset.Custom) {
      // «Personalizzato»: mostra Dal/Al e conserva le date correnti.
      return;
    }
    const range = resolveMovementPeriodRange(preset, '', '');
    this.updateParams({ dateFrom: range.from ?? null, dateTo: range.to ?? null, page: null }, true);
  }

  protected onPaymentFilterChange(value: string | null): void {
    this.updateParams({ paymentMethod: value, page: null }, true);
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
        this.openNewInvoice(DocumentType.Invoice);
        break;
      case 'invoice-accompanying':
        this.openNewInvoice(DocumentType.InvoiceAccompanying);
        break;
      case 'credit-note':
        this.openNewInvoice(DocumentType.CreditNote);
        break;
      default:
        break;
    }
  }

  protected resetFilters(): void {
    this.searchDraft.set('');
    // Dove il preset esiste il periodo torna al default dell'elenco («Mese
    // corrente»), altrove resta senza vincolo di date.
    const preset = this.isGoodsReceiptList()
      ? MovementPeriodPreset.ThisMonth
      : MovementPeriodPreset.All;
    this.periodPreset.set(preset);
    const range = resolveMovementPeriodRange(preset, '', '');
    this.updateParams(
      {
        search: null,
        type: null,
        status: null,
        dateFrom: range.from ?? null,
        dateTo: range.to ?? null,
        customerId: null,
        locationId: null,
        supplierId: null,
        linkStatus: null,
        externalDocumentTypeId: null,
        settlement: null,
        paymentMethod: null,
        createdById: null,
        pendingInvoice: null,
        page: null,
      },
      true,
    );
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  /**
   * ⛔ **Il clic di riga apre la MODIFICA** (`14` §2), e la decisione non sta
   * più qui: la dà `documentRowPath` per tipo.
   *
   * Qui c'erano SEI rami, e due finivano sull'anteprima — quello dei profili
   * senza `rowOpensForm` e il ramo finale del registro generico. Il risultato
   * era che lo stesso gesto apriva un preventivo in modifica e una fattura in
   * sola lettura, e la differenza dipendeva dall'elenco da cui si era passati,
   * non dal documento.
   *
   * ⚠️ Nulla è andato perso nella fusione: il ramo delle registrazioni fattura,
   * quello della famiglia carico e le eccezioni sugli annullati vivono tutti in
   * `DOCUMENT_ROW_OPENS` e in `documentRowPath`, dove valgono anche per la
   * ricerca globale.
   */
  protected openDocument(doc: DocumentRecord): void {
    void this.router.navigateByUrl(documentRowPath(doc, this.authService.currentUser()));
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

  /**
   * Duplica documento (§2a). Arrivi merce: prima si sceglie il fornitore del
   * nuovo documento; i documenti di vendita che lo prevedono (Preventivi) la
   * controparte è il cliente; gli altri tipi duplicano direttamente.
   */
  protected duplicateDocument(doc: DocumentRecord): void {
    // Fase 3 (no bozze): apre il form nuovo precompilato (`?duplicateFrom`) — la
    // controparte si sceglie nel form, niente copia-bozza a monte né modale.
    const duplicateRoute = documentDuplicateFormRoute(doc.type);
    if (duplicateRoute) {
      void this.router.navigate([duplicateRoute], { queryParams: { duplicateFrom: doc.id } });
    }
  }

  /** Tutti i documenti in coda di eliminazione sono arrivi merce. */
  private readonly pendingAllGoodsReceipt = computed(() => {
    const docs = this.pendingDeleteDocs();
    return docs.length > 0 && docs.every((doc) => isGoodsReceiptDocumentType(doc.type));
  });

  /** Tutti i documenti in coda di eliminazione sono preventivi. */
  private readonly pendingAllQuote = computed(() => {
    const docs = this.pendingDeleteDocs();
    return docs.length > 0 && docs.every((doc) => doc.type === DocumentType.Quote);
  });

  /** Titolo del 1° modale (avviso): singolare/plurale e tipo documento. */
  protected readonly deleteWarnTitle = computed(() => {
    const docs = this.pendingDeleteDocs();
    const count = docs.length;
    if (this.pendingAllGoodsReceipt()) {
      return count === 1 ? 'Elimina arrivo merce' : `Elimina ${count} arrivi merce`;
    }
    if (this.pendingAllQuote()) {
      return count === 1 ? 'Elimina preventivo' : `Elimina ${count} preventivi`;
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
    // Preventivo: nessun effetto su magazzino, nessuna menzione di giacenze.
    if (this.pendingAllQuote()) {
      return count === 1
        ? 'Il preventivo verrà eliminato definitivamente.'
        : `I ${count} preventivi selezionati verranno eliminati definitivamente.`;
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
          this.selection.prune([...this.selectedIds()].filter((id) => !deletedIds.has(id)));
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
    this.selection.toggle(event.doc.id, event.selected);
  }

  /**
   * La checkbox di testata agisce sulle righe **caricate**, non su tutto il
   * database (`14` §4.1): far credere di aver selezionato record che non sono
   * mai arrivati al client è la «selezione ingannevole» che §15 vieta.
   */
  protected onToggleSelectAll(checked: boolean): void {
    this.selection.setAll(
      this.documents().map((doc) => doc.id),
      checked,
    );
  }

  protected clearSelection(): void {
    this.selection.clear();
  }

  /** CSV apribile in Excel dei documenti selezionati, con riga totali. */
  protected exportSelectionCsv(): void {
    const docs = this.selectedDocs();
    if (docs.length === 0) {
      return;
    }
    const config = this.activeListExport();
    this.downloadBlob(
      new Blob([buildDocumentListCsv(docs, config)], { type: 'text/csv;charset=utf-8' }),
      documentListExportFileName(config, 'csv'),
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
    printWindow.document.write(buildDocumentListPrintHtml(docs, this.activeListExport()));
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
   * Apre il **Dettaglio** del documento scelto (`14` §6): la consultazione in
   * sola lettura, che non è né la Modifica né il foglio di stampa.
   *
   * ⚠️ **L'indirizzo lo dà `documentDetailPath`, per TIPO** — la stessa fonte
   * che usa il clic di riga per i documenti annullati. Ricavarlo qui dal
   * profilo di elenco farebbe divergere le due risposte, ed è il difetto che
   * `14` §13.3 vieta: lo stesso documento con due aperture diverse a seconda
   * di dove lo si è trovato.
   *
   * ⛔ Il ramo `filtered` non è raggiungibile con `requires: 'one'` — il
   * contratto spegne l'azione a zero e a due o più selezionati. Va comunque
   * scritto: l'unione discriminata esiste proprio perché «tutto il filtrato»
   * non possa essere confuso con «non c'è niente da fare» (§5.3).
   */
  private openSelectionDetail(target: ListActionTarget): void {
    if (target.scope !== 'selection') {
      return;
    }
    const id = target.ids[0];
    const doc = id ? this.documents().find((riga) => riga.id === id) : undefined;
    if (!doc) {
      return;
    }
    void this.router.navigateByUrl(documentDetailPath(doc));
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

  protected openNewGoodsReceipt(): void {
    void this.router.navigate(['/app/documents/goods-receipt/new']);
  }

  protected openNewPurchaseInvoice(): void {
    void this.router.navigate(['/app/documents/registrazioni-fatture-fornitori/new']);
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

  /**
   * Nuovo documento della famiglia Fattura, del tipo scelto: i tre tipi
   * condividono il form e si distinguono per l'indirizzo.
   *
   * Il percorso viene dalla mappa dei segmenti, non da un confronto: qui c'era
   * un ternario a due rami, e con l'arrivo della Nota di credito avrebbe
   * mandato il terzo tipo sulla rotta della Fattura semplice — senza errori,
   * creando un documento del tipo sbagliato.
   */
  protected openNewInvoice(type: DocumentType): void {
    const segment = salesFormRouteSegment(type);
    void this.router.navigate([`/app/documents/${segment ?? 'fattura'}/new`]);
  }

  /** «Nuovo …» della pagina dedicata (Preventivi, Proforma, DDT, Fatture). */
  protected openNewSalesDocument(): void {
    const sales = this.salesRegister();
    if (sales) {
      void this.router.navigateByUrl(sales.createPath);
    }
  }

  /**
   * Voce scelta nel menu «Nuovo» degli elenchi condivisi: porta alla rotta
   * dichiarata dalla variante, **senza toccare il filtro**. Scegliere cosa
   * creare e scegliere cosa guardare restano due gesti distinti.
   */
  protected onCreateVariant(type: string | null): void {
    const variant = this.salesRegister()?.createVariants?.find((v) => v.type === type);
    if (variant) {
      void this.router.navigateByUrl(variant.path);
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

  /**
   * L'operatore ha premuto un'intestazione: il motore ha già calcolato il
   * prossimo ordine (ciclo e priorità delle chiavi sono suoi), qui si applica.
   *
   * ⛔ **La pagina torna alla prima**, e non è una gentilezza: restare alla
   * quinta pagina di un ordine appena cambiato mostra righe che con la
   * posizione precedente non c'entrano nulla.
   */
  protected onSortChange(chiavi: readonly DataTableSort[]): void {
    this.updateParams({ sort: serializeDataTableSort(chiavi) || null, page: null }, true);
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
