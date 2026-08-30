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
  documentTypesOfFamily,
  manageableDocumentFamilies,
  canCreateDocumentType,
} from '@core/permissions/document-permission.util';
import {
  canManageDocFamily,
  canManageDocuments,
  canOpenRetailRegister,
  isManualUnloadEnabled,
} from '@core/permissions/tenant-permissions.util';
import type { PaymentOption } from '@core/models/payment-option.model';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { DEFAULT_CURRENCY, formatMoney } from '@core/utils/money.util';
import { CustomerService } from '@domain/customers/services/customer.service';
import {
  DEFAULT_MOVEMENT_PERIOD,
  MOVEMENT_PERIOD_OPTIONS,
  MovementPeriodPreset,
  resolveMovementPeriodRange,
} from '@domain/inventory/models/movement-period.util';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import { DeleteConfirmComponent } from '@shared/components/delete-confirm/delete-confirm.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { ListActionsBarComponent } from '@shared/components/list-actions-bar/list-actions-bar.component';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import { comando, voceEsporta } from '@shared/models/list-action-catalog';
import {
  FILTERED_SCOPE_NOT_AVAILABLE,
  type ListAction,
  type ListActionItem,
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
} from '@domain/documents/utils/document-goods-receipt.util';
import {
  documentStatusLabel,
  documentTypeLabel,
} from '@domain/documents/models/document-labels.util';
import { bulkDeleteBlockReason, canBulkDeleteDocuments } from './models/document-bulk-actions.util';
import { signedDocumentMoney } from '@domain/documents/models/document-economic-sign.util';
import {
  documentDetailPath,
  documentDuplicateFormRoute,
  documentRowPath,
  salesFormRouteSegment,
} from '@domain/documents/utils/document-routing.util';
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
import type {
  ListFilterDef,
  ListFilterValues,
} from '@shared/components/list-filters/list-filter.model';
import { ExternalDocumentTypeService } from '@domain/documents/services/external-document-type.service';
import { isStoreFlowDocumentType } from '@domain/documents/models/document-operational.util';
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
  { value: 'vendita-manuale', label: 'Vendita manuale', type: DocumentType.ManualUnload },
  { value: 'adjustment', label: 'Rettifica di magazzino', type: DocumentType.Adjustment },
  { value: 'ddt-vendita', label: 'DDT vendita', type: DocumentType.SalesDdt },
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
    ListPageComponent,
    DeleteConfirmComponent,
    DateInputComponent,
    ErrorStateComponent,
    ListActionsBarComponent,
    SelectMenuComponent,
    DocumentTableComponent,
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
  protected readonly showCreateAction = computed(() => {
    const sales = this.salesRegister();
    if (sales?.hideCreateAction === true) {
      return false;
    }
    // ⛔ Vendita manuale spenta: l’ELENCO resta — e’ la porta allo storico, che
    //   deve restare consultabile — ma il comando che crea non c’e’. Vale sia
    //   per il pulsante di testata sia per la CTA dello stato vuoto, che legge
    //   di qui.
    if (
      sales?.type === DocumentType.ManualUnload &&
      !isManualUnloadEnabled(this.authService.currentUser())
    ) {
      return false;
    }
    return true;
  });

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

  /**
   * ⭐ **Il Periodo, comune a tutti i profili** — regola normativa `14` §12-bis,
   * decisa dal proprietario il 29/08/2026.
   *
   * Ogni riepilogo con righe datate ha un filtro Periodo **visibile**, con default
   * «Ultimi 30 giorni». Lo scopo è anche prestazionale: la prima chiamata chiede
   * solo le righe del periodo, invece di tutto lo storico.
   *
   * ⛔ **Non deve più esistere** un limite temporale applicato alla query senza un
   * controllo che lo mostri: fino a oggi il costruttore scriveva `dateFrom`/`dateTo`
   * a 30 giorni per ogni profilo, ma il selettore esisteva **solo** sull'Arrivo
   * merce. I Preventivi si aprivano filtrati senza dirlo, con «Azzera filtri» già
   * visibile e il badge a 1.
   *
   * ⚠️ La data di riferimento è `documentDate`, per tutti: è quella su cui l'API
   * filtra. `registrationDate` è solo di visualizzazione e non è filtrabile —
   * nessuna ambiguità da risolvere.
   */
  private filtroPeriodo(): ListFilterDef {
    return {
      key: 'periodPreset',
      label: 'Periodo',
      kind: 'period',
      options: MOVEMENT_PERIOD_OPTIONS,
      placeholder: 'Tutto',
      // ⚠️ **La peculiarità dell'Arrivo merce si conserva**: lì Dal/Al compaiono
      //    solo col preset «Personalizzato», altrove sono sempre visibili. È la
      //    condizione `!isGoodsReceiptList() || isCustomPeriod()` di oggi, e la
      //    decisione sul Periodo comune non autorizza a uniformarla.
      showDateRange: this.isGoodsReceiptList() ? this.isCustomPeriod() : true,
      fromKey: 'dateFrom',
      toKey: 'dateTo',
      // ⛔ Il Periodo non è una restrizione opzionale (`14` §19).
      countsAsActive: false,
      onPresetChange: (value) => this.onPeriodPresetChange(value),
      onFromChange: (value) => this.onDateFromChange(value),
      onToChange: (value) => this.onDateToChange(value),
    };
  }

  /**
   * ⭐ **«DDT da fatturare»: una spunta, non una tendina.**
   *
   * ⚠️ Era stata omessa dalla prima dichiarazione, e sostituire il markup
   * l'avrebbe cancellata da `ddt-vendita` e `generic` — una rimozione funzionale
   * dentro un refactor, che `14` §42-bis.0 vieta. Non l’hanno trovata i test:
   * misuravano `filtriElenco()`, che per definizione non la conteneva. L’ha
   * trovata il confronto col markup prima di toglierlo.
   *
   * ⛔ Il valore è un **booleano** e resta tale: `pendingInvoice` nel query
   * param, `onPendingInvoiceFilterChange(checked: boolean)` come handler.
   */
  private filtroDaFatturare(): ListFilterDef {
    return {
      key: 'pendingInvoice',
      label: 'DDT da fatturare',
      kind: 'checkbox',
      onCheckedChange: (checked) => this.onPendingInvoiceFilterChange(checked),
    };
  }

  /** Cliente: stesse opzioni e stesso handler ovunque compaia. */
  private filtroCliente(): ListFilterDef {
    return {
      key: 'customerId',
      label: 'Cliente',
      kind: 'select',
      options: this.customerOptions(),
      // ⭐ Ricercabile ANCHE sul Registro documenti (deciso il 29/08/2026): era
      //    l'unico profilo senza ricerca, ed è l'elenco più largo dell'app — una
      //    tendina da cento clienti senza campo di ricerca.
      searchable: true,
      searchPlaceholder: 'Cerca cliente…',
      onChange: (value) => this.onCustomerFilterChange(value),
    };
  }

  /**
   * ⭐ **I filtri dell'elenco, dichiarati una volta e resi due** (`14` §11, §17.3).
   *
   * Le condizioni di dominio restano QUI: il contenitore comune riceve l'array dei
   * filtri effettivamente visibili e lo rende, senza sapere che cosa siano un
   * Arrivo merce, un fornitore o un metodo di pagamento.
   *
   * ⛔ **Sono i filtri che l'elenco ha già** (`14` §42-bis.0): la matrice sintetica
   * elenca il minimo, non un elenco esclusivo. Nessun filtro esistente si toglie in
   * un refactor, e nessuno si aggiunge per analogia.
   */
  protected readonly filtriElenco = computed<readonly ListFilterDef[]>(() => {
    const filtri: ListFilterDef[] = [this.filtroPeriodo()];
    const sales = this.salesRegister();

    // ── Ramo REGISTRI DI VENDITA ───────────────────────────────────────
    //    quote · proforma · ddt-vendita · invoice · vendita-manuale
    //    purchase-invoice · store-sale
    if (sales) {
      if (this.showSharedTypeFilter()) {
        filtri.push({
          key: 'type',
          label: 'Tipo',
          kind: 'select',
          options: this.sharedTypeOptions(),
          onChange: (value) => this.onSharedTypeFilterChange(value),
        });
      }
      if (sales.statusOptions) {
        filtri.push({
          key: 'status',
          label: 'Stato',
          kind: 'select',
          options: sales.statusOptions,
          onChange: (value) => this.onStatusFilterChange(value),
        });
      }
      if (sales.showSettlementFilter) {
        filtri.push({
          // ⭐ «Saldo», non «Stato» (`14` §7.1): è la situazione ECONOMICA — Da
          //    saldare / Saldati — distinta dalla Fase commerciale e dal
          //    Collegamento documentale. ⚠️ La chiave tecnica resta `settlement`.
          key: 'settlement',
          label: 'Saldo',
          kind: 'select',
          options: this.settlementOptions,
          onChange: (value) => this.onSettlementFilterChange(value),
        });
      }
      if (sales.showSupplierFilter) {
        filtri.push({
          key: 'supplierId',
          label: 'Fornitore',
          kind: 'select',
          options: this.supplierOptions(),
          searchable: true,
          searchPlaceholder: 'Cerca fornitore…',
          onChange: (value) => this.onSupplierFilterChange(value),
        });
      }
      if (!sales.hideCustomerFilter) {
        filtri.push(this.filtroCliente());
      }
      if (sales.paymentMethodOptions) {
        filtri.push({
          key: 'paymentMethod',
          // ⭐ «Pagamento» e ricercabile ovunque (deciso il 29/08/2026): lo stesso
          //    filtro aveva due etichette e due `searchable` — «Metodo pagamento»
          //    non ricercabile qui, «Pagamento» ricercabile sull'Arrivo merce.
          //    ⚠️ Le OPZIONI restano diverse per profilo, ed è deliberato: codici
          //    cassa contro voci MP01–MP23.
          label: 'Pagamento',
          kind: 'select',
          options: sales.paymentMethodOptions,
          searchable: true,
          searchPlaceholder: 'Cerca pagamento…',
          onChange: (value) => this.onPaymentMethodFilterChange(value),
        });
      }
      if (sales.showOperatorFilter) {
        filtri.push({
          key: 'createdById',
          label: 'Operatore',
          kind: 'select',
          options: this.operatorOptions(),
          searchable: true,
          searchPlaceholder: 'Cerca operatore…',
          onChange: (value) => this.onOperatorFilterChange(value),
        });
      }
      if (sales.showPendingInvoiceFilter) {
        filtri.push(this.filtroDaFatturare());
      }
      return filtri;
    }

    // ── Ramo ARRIVO MERCE ──────────────────────────────────────────────
    if (this.isGoodsReceiptList()) {
      filtri.push(
        {
          key: 'supplierId',
          label: 'Fornitore',
          kind: 'select',
          options: this.supplierOptions(),
          searchable: true,
          searchPlaceholder: 'Cerca fornitore…',
          onChange: (value) => this.onSupplierFilterChange(value),
        },
        {
          // ⭐ «Collegamento», non «Stato» (`14` §7.1): è la situazione del
          //    documento rispetto ad altri documenti, non la Fase commerciale.
          //    ⚠️ La chiave tecnica resta `linkStatus`: rinominarla romperebbe
          //    gli URL condivisi e non serve alla funzione.
          key: 'linkStatus',
          label: 'Collegamento',
          kind: 'select',
          options: this.linkStatusOptions,
          onChange: (value) => this.onLinkStatusFilterChange(value),
        },
        {
          key: 'locationId',
          label: 'Sede',
          kind: 'select',
          options: this.locationOptions(),
          // ⚠️ Femminile: sono le sedi. Uniformarlo a «Tutti» sarebbe una
          //    generalizzazione distratta.
          placeholder: 'Tutte',
          onChange: (value) => this.onLocationFilterChange(value),
        },
        {
          key: 'externalDocumentTypeId',
          label: 'Tipo di documento',
          kind: 'select',
          options: this.externalDocTypeOptions(),
          onChange: (value) => this.onExternalDocTypeFilterChange(value),
        },
        {
          key: 'paymentMethod',
          label: 'Pagamento',
          kind: 'select',
          options: this.paymentMethodFilterOptions(),
          searchable: true,
          searchPlaceholder: 'Cerca pagamento…',
          onChange: (value) => this.onPaymentFilterChange(value),
        },
      );
      return filtri;
    }

    // ── Ramo GENERICO: il Registro documenti ───────────────────────────
    //    ⚠️ I suoi filtri sono CABLATI nel template, non configurati: non passa
    //       da `salesDocumentRegisterConfig`, che per `generic` ritorna `null`.
    filtri.push(
      {
        key: 'type',
        label: 'Tipo',
        kind: 'select',
        options: this.typeOptions,
        onChange: (value) => this.onTypeFilterChange(value),
      },
      {
        key: 'status',
        label: 'Stato',
        kind: 'select',
        options: this.statusOptions,
        onChange: (value) => this.onStatusFilterChange(value),
      },
      this.filtroCliente(),
      // ⚠️ Il Registro documenti la mostra SEMPRE: qui i filtri sono cablati,
      //    non passano da una configurazione con `showPendingInvoiceFilter`.
      this.filtroDaFatturare(),
    );
    return filtri;
  });

  /**
   * I valori correnti dei filtri.
   *
   * ⚠️ Il contenitore comune non sa — e non deve sapere — che il preset è stato
   * LOCALE e le date stanno nell'URL: riceve un record piatto e lo rende.
   */
  protected readonly valoriFiltri = computed<ListFilterValues>(() => {
    const q = this.query();
    return {
      // ⚠️ Il preset è stato LOCALE, le date stanno nell’URL: il contenitore
      //    comune riceve un record piatto e non sa — né deve sapere — da dove
      //    viene ciascun valore.
      periodPreset: this.periodPreset(),
      dateFrom: q.dateFrom ?? '',
      dateTo: q.dateTo ?? '',
      // ⭐ Il Tipo dei registri condivisi passa dal proprio computed, che
      //    scarta un `?type=` non valido per il profilo.
      type: this.salesRegister() ? this.sharedTypeFilter() : (q.type ?? ''),
      status: q.status ?? '',
      settlement: q.settlement ?? '',
      supplierId: q.supplierId ?? '',
      customerId: q.customerId ?? '',
      createdById: q.createdById ?? '',
      linkStatus: q.linkStatus ?? '',
      locationId: q.locationId ?? '',
      externalDocumentTypeId: q.externalDocumentTypeId ?? '',
      paymentMethod: q.paymentMethod ?? '',
      // ⚠️ Booleano, non stringa: è il valore che la spunta legge.
      pendingInvoice: this.isPendingInvoiceView(),
    };
  });

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
      case 'ddt-vendita':
        return 'sales_ddt';
      case 'invoice':
        return 'invoice';
      case 'store-sale':
        return 'store_sale';
      case 'vendita-manuale':
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
    // ⚠️ `canCreateDocumentType` e non `canManageDocumentType`: gestire non e’
    //   creare. Chi ha il permesso continua a consultare e stampare le Vendite
    //   manuali storiche anche a funzione spenta.
    return SECONDARY_CREATE_ENTRIES.filter((entry) => canCreateDocumentType(user, entry.type)).map(
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
        // ⛔ **`status` si spegne come tutti gli altri.** Passava dallo spread
        //    `...q` senza guardia: sui quattro profili con `statusOptions: null`
        //    — Preventivi, Vendita manuale, Registrazione fatture, Vendita al
        //    banco — un `?status=` scritto a mano filtrava davvero l’elenco, e i
        //    contatori lo contavano: badge «Filtri (1)» e pannello che si apre
        //    senza mostrare niente di attivo. Un filtro che il profilo non
        //    espone non deve poter restringere il risultato.
        //
        // ⚠️ Il parametro NON si ripulisce dall'URL: si ignora, e basta.
        status: sales.statusOptions ? q.status : undefined,
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
  /**
   * ⭐ **I comandi di CREAZIONE, come azioni della barra in basso** — decisione
   * del proprietario, 30/08/2026: tutti i comandi in una riga, totali sopra.
   *
   * ⛔ Stavano in testata con tre rami di template e due `app-select-menu` usati
   * come menu «Nuovo». Non sono stati duplicati: si sono spostati, e i due menu
   * sono diventati **azioni con voci** — la barra comune sa già renderle
   * (`ListAction.items`), è lo stesso meccanismo di «Esporta» sui Corrispettivi.
   *
   * ⚠️ Le condizioni sono le stesse di prima, una per una: chi non gestisce i
   * carichi non vede l'invito a registrarne uno, e se nessuno dei nove tipi è
   * gestibile sparisce anche la tendina.
   */
  private readonly azioniDiCreazione = computed<readonly ListAction[]>(() => {
    if (!this.showCreateActions()) {
      return [];
    }

    const daOpzioni = (
      opzioni: readonly { readonly value: string; readonly label: string }[],
    ): readonly ListActionItem[] =>
      opzioni.map((opzione) => ({
        id: opzione.value,
        label: opzione.label,
        run: () => this.onCreateDocumentType(opzione.value),
      }));

    const registro = this.salesRegister();
    if (registro) {
      const varianti = this.createVariantButtons();
      if (varianti.length > 0) {
        // Due tipi, due comandi diretti: con due sole voci un menu costerebbe
        // un clic per scoprire cosa si può creare (`11` A2).
        return varianti.map((variante, indice): ListAction => ({
          id: 'new-' + variante.type,
          label: variante.label,
          icon: 'pi-plus',
          variant: indice === 0 ? 'primary' : 'secondary',
          requires: 'none',
          run: () => this.onCreateVariant(variante.type),
        }));
      }
      const opzioni = this.createVariantOptions();
      if (opzioni.length > 0) {
        return [
          comando('new', {
            ariaLabel: 'Nuovo documento',
            items: opzioni.map((opzione) => ({
              id: opzione.value,
              label: opzione.label,
              run: () => this.onCreateVariant(opzione.value),
            })),
          }),
        ];
      }
      return [
        comando('new', {
          label: this.salesCreateLabel() ?? 'Nuovo',
          run: () => this.openNewSalesDocument(),
        }),
      ];
    }

    if (this.isGoodsReceiptList()) {
      return [
        comando('new', {
          label: 'Nuovo arrivo merce',
          run: () => this.openNewGoodsReceipt(),
        }),
      ];
    }

    const azioni: ListAction[] = [];
    if (this.canManageGoodsReceipts()) {
      azioni.push({
        id: 'new-goods-receipt',
        label: 'Nuovo arrivo merce',
        icon: 'pi-plus',
        variant: 'primary',
        requires: 'none',
        run: () => this.openNewGoodsReceipt(),
      });
    }
    const altri = this.secondaryCreateOptions();
    if (altri.length > 0) {
      azioni.push({
        id: 'new-other',
        label: 'Altro documento',
        icon: 'pi-file',
        requires: 'none',
        ariaLabel: 'Crea altro tipo di documento',
        items: daOpzioni(altri),
      });
    }
    return azioni;
  });

  protected readonly selectionActions = computed<readonly ListAction[]>(() => {
    const azioni: ListAction[] = [
      ...this.azioniDiCreazione(),
      // ⭐ **Il Dettaglio è la porta che mancava** (`14` §E4/§E5). Da quando
      // il clic di riga apre la Modifica, la vista di consultazione non
      // aveva più nessun ingresso nell'interfaccia: ci si arrivava solo per
      // URL, o quando `documentRowPath` ci mandava un documento annullato.
      //
      // Sta PRIMA degli altri comandi perché è l'unico che si limita a
      // guardare: si legge prima di produrre, e chi arriva con la mano su
      // Elimina la trova comunque dove l'ha lasciata (§5, i comandi non si
      // spostano).
      comando('detail', {
        ariaLabel: 'Apri il dettaglio del documento selezionato',
        run: (target) => this.openSelectionDetail(target),
      }),
      // ⭐ **Le tre azioni che stavano nel menu tre-puntini della riga**, sceso
      //    nella barra insieme alle altre — decisione del proprietario,
      //    30/08/2026: il menu di riga sparisce, tutto passa dalla selezione.
      //
      // ⚠️ **La condizione cambia natura, non contenuto.** Nel menu decideva se
      //    la voce COMPARIVA su quella riga; qui decide se l'azione e' ABILITATA
      //    sulla riga scelta, e con quale motivo (`14` §5.1). Le regole sono le
      //    stesse, una per una.
      comando('duplicate', {
        disabled: this.selezioneNonDuplicabile() !== null,
        disabledReason: this.selezioneNonDuplicabile() ?? '',
        ariaLabel: 'Duplica il documento selezionato',
        run: (target) => this.duplicaSelezione(target),
      }),
      comando('labels', {
        disabled: this.selezioneSenzaEtichette() !== null,
        disabledReason: this.selezioneSenzaEtichette() ?? '',
        ariaLabel: 'Stampa le etichette del documento selezionato',
        run: (target) => this.apriSelezioneSuDettaglio(target),
      }),
      comando('attachments', {
        ariaLabel: 'Allegati del documento selezionato',
        run: (target) => this.apriSelezioneSuDettaglio(target, 'doc-detail-attachments'),
      }),
      comando('print', {
        disabled: this.selectionCount() === 0,
        disabledReason: FILTERED_SCOPE_NOT_AVAILABLE,
        ariaLabel: "Stampa l'elenco dei documenti selezionati",
        run: () => this.printSelectionList(),
      }),
      comando('export', {
        busy: this.bulkPdfBusy(),
        disabled: this.selectionCount() === 0,
        disabledReason: FILTERED_SCOPE_NOT_AVAILABLE,
        items: [
          voceEsporta('csv', () => this.exportSelectionCsv()),
          voceEsporta('pdf', () => this.downloadSelectionPdfs()),
        ],
      }),
    ];
    // ⛔ Il PERMESSO decide la presenza, il TIPO decide l'abilitazione.
    //
    // Sono i due stati distinti della tassonomia (`14` §5.1): chi non gestisce
    // i documenti non vedrà mai il comando — mostrarglielo spento sarebbe
    // rumore; chi lo gestisce lo vede sempre, e se la selezione contiene tipi
    // che non si eliminano legge perché.
    if (this.canManageDocuments()) {
      // ⭐ Il motivo lo scrive la REGOLA, non questa pagina: è la stessa
      //    funzione che decide se il comando si accende, quindi non possono
      //    divergere (`document-bulk-actions.util`).
      const motivo = this.selectionCount() > 0 ? bulkDeleteBlockReason(this.selectedDocs()) : null;
      azioni.push(
        comando('delete', {
          disabled: motivo !== null,
          disabledReason: motivo ?? '',
          run: () => this.requestDeleteSelection(),
        }),
      );
    }
    return azioni;
  });

  /**
   * Somma dei totali documento selezionati, mostrata nella barra massiva.
   *
   * ⛔ Qui c'era `sum + doc.total.amountMinor`, senza verso. Questo registro
   * mescola tipi di direzione opposta — Fattura, Fattura accompagnatoria e
   * **Nota di credito** stanno nello stesso elenco, e così Vendita e **Reso** al
   * banco — quindi una Fattura da 100 e una Nota di credito da 30 davano 130.
   *
   * ⭐ Il verso lo dà `documentEconomicSign` (`15c` §5), unica autorità: qui non
   * si decide niente per tipo, si moltiplica. E si moltiplica il valore
   * PERSISTITO, che resta positivo e già arrotondato — nessun ricalcolo.
   */
  protected readonly selectionTotal = computed<Money>(() => {
    const docs = this.selectedDocs();
    const currencyCode = docs[0]?.currency ?? DEFAULT_CURRENCY;
    // ⚠️ Passa da `signedDocumentMoney`, non da `documentEconomicSign`: quella
    //    accetta solo i tipi con direzione DICHIARATA, e questo elenco ne
    //    contiene anche altri. Per quelli lo snapshot resta invariato, senza
    //    che nessuno gli attribuisca una direzione economica.
    const amountMinor = docs.reduce(
      (sum, doc) => sum + signedDocumentMoney(doc.type, doc.total).amountMinor,
      0,
    );
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
          // Come in `apiQuery`: dove il profilo non offre lo Stato, un
          // `?status=` non è un filtro attivo.
          (sales.statusOptions ? q.status : undefined) ??
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
      if (sales.statusOptions && q.status) count++;
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
      'ddt-vendita': this.columnPreferences.visibleColumns(TableViewId.SalesDdtDocumentsList),
      'vendita-manuale': this.columnPreferences.visibleColumns(
        TableViewId.ManualUnloadDocumentsList,
      ),
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
      case 'vendita-manuale':
        this.openNewManualUnload();
        break;
      case 'adjustment':
        this.openNewAdjustment();
        break;
      case 'ddt-vendita':
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
      return 'Elimina vendita manuale';
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
      return 'La vendita manuale verrà eliminata. Le giacenze già scalate NON verranno ripristinate.';
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
      this.deleteWarnOpen.set(false);
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
        this.deleteWarnOpen.set(false);
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
  /** Il solo documento selezionato, o `null` se non e' esattamente uno. */
  private readonly documentoSelezionato = computed(() => {
    const scelti = this.selectedDocs();
    return scelti.length === 1 ? scelti[0]! : null;
  });

  /**
   * Perche' il duplicato non si puo', **con parole sue**.
   *
   * ⚠️ Due condizioni, e vengono da dove venivano prima: la famiglia dev'essere
   * gestibile da chi guarda, e il banco non si duplica — Vendita e Reso nascono
   * dalla cassa (`11` A2).
   */
  private readonly selezioneNonDuplicabile = computed<string | null>(() => {
    const doc = this.documentoSelezionato();
    if (!doc) {
      return null;
    }
    if (!this.canManageDocuments() || !this.manageableTypes().includes(doc.type)) {
      return 'Non hai i permessi per creare documenti di questo tipo.';
    }
    if (isStoreFlowDocumentType(doc.type)) {
      return 'Vendite e Resi al banco si registrano dalla cassa, non si duplicano.';
    }
    if (documentDuplicateFormRoute(doc.type) === null) {
      return 'Questo tipo di documento non ha una maschera da cui ripartire.';
    }
    return null;
  });

  /** Le etichette esistono solo dove c'e' merce arrivata: arrivi merce con righe. */
  private readonly selezioneSenzaEtichette = computed<string | null>(() => {
    const doc = this.documentoSelezionato();
    if (!doc) {
      return null;
    }
    if (!isGoodsReceiptDocumentType(doc.type)) {
      return 'Le etichette si stampano dagli arrivi merce.';
    }
    if (doc.status === DocumentStatus.Draft || doc.status === DocumentStatus.Cancelled) {
      return 'Un arrivo merce in bozza o annullato non ha etichette da stampare.';
    }
    if ((doc.lineCount ?? 0) === 0) {
      return "Questo arrivo merce non ha righe: non c'e' niente da etichettare.";
    }
    return null;
  });

  private rigaSelezionata(target: ListActionTarget): DocumentRecord | null {
    if (target.scope !== 'selection') {
      return null;
    }
    const id = target.ids[0];
    return (id ? this.documents().find((riga) => riga.id === id) : undefined) ?? null;
  }

  private duplicaSelezione(target: ListActionTarget): void {
    const doc = this.rigaSelezionata(target);
    if (doc) {
      this.duplicateDocument(doc);
    }
  }

  private apriSelezioneSuDettaglio(target: ListActionTarget, ancora?: string): void {
    const doc = this.rigaSelezionata(target);
    if (doc) {
      this.openDocumentDetail(doc, ancora);
    }
  }

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
    void this.router.navigate(['/app/documents/vendita-manuale/new']);
  }

  protected openNewSalesDdt(): void {
    void this.router.navigate(['/app/documents/ddt-vendita/new']);
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
