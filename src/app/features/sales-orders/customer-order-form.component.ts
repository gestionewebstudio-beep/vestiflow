import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
  take,
} from 'rxjs';

import { NavigationHistoryService } from '@core/services/navigation-history.service';
import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import type { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import { mapHttpErrorToAppError } from '@core/interceptors/http-error.mapper';
import {
  canManageDocuments,
  canViewPurchaseCosts,
} from '@core/permissions/tenant-permissions.util';
import { AppErrorKind, isAppError, type AppError } from '@core/models/app-error.model';
import { documentNumberConflictOf } from '@core/models/document-number-conflict.util';
import type { Money } from '@core/models/common.model';
import { customerDisplayName, type Customer } from '@core/models/customer.model';
import { ProductStatus } from '@core/models/product.model';
import {
  ManualOrderState,
  manualOrderState,
  SalesOrderSource,
  type SalesOrder,
} from '@core/models/sales-order.model';
import {
  formatVatRate,
  isSalesVatCode,
  vatCodeOptionLabel,
  type VatCode,
} from '@core/models/vat-code.model';
import { BarcodeLookupService } from '@domain/products/services/barcode-lookup.service';
import { BreadcrumbLabelService } from '@core/services/breadcrumb-label.service';
import { DocumentActionsService } from '@core/services/document-actions.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { prefillDefaultLocation } from '@domain/inventory/utils/default-location-prefill.util';
import { ToastService } from '@core/services/toast.service';
import { VatCodeService } from '@core/services/vat-code.service';
import {
  applyCascadeDiscountMinor,
  cascadeDiscountMultiplier,
  formatDiscountPercent,
  formatDiscountPercentValue,
  parseEffectiveDiscountPercent,
} from '@core/utils/discount-percent.util';
import { toLocationSelectOptions } from '@core/utils/location-select-options.util';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  moneyToDecimalString,
  parseMoneyInput,
  toStorableMinor,
} from '@core/utils/money.util';
import type { PaymentOption } from '@core/models/payment-option.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { CustomerFormFieldsComponent } from '@domain/customers/components/customer-form-fields/customer-form-fields.component';
import { CustomerService } from '@domain/customers/services/customer.service';
import {
  createCustomerFormGroup,
  mapCustomerFormToInput,
} from '@domain/customers/utils/customer-form.util';
import { DocumentIncludePanelComponent } from '@domain/documents/components/document-include-panel/document-include-panel.component';
import { DocumentMobilePanelComponent } from '@domain/documents/components/document-mobile-panel/document-mobile-panel.component';
import { DocumentLineCodeCellComponent } from '@domain/documents/components/document-line-code-cell/document-line-code-cell.component';
import { DocumentLineProductCellComponent } from '@domain/documents/components/document-line-product-cell/document-line-product-cell.component';
import { DocumentLineSelectCellComponent } from '@domain/documents/components/document-line-select-cell/document-line-select-cell.component';
import { DocumentLineUnitCellComponent } from '@domain/documents/components/document-line-unit-cell/document-line-unit-cell.component';
import { UnitOfMeasureManagerDialogComponent } from '@domain/products/components/unit-of-measure-manager-dialog/unit-of-measure-manager-dialog.component';
import type { UnitOfMeasureOption } from '@domain/products/models/unit-of-measure-option.model';
import { UnitOfMeasureOptionService } from '@domain/products/services/unit-of-measure-option.service';
import { unitOfMeasureSelectOptions } from '@domain/products/utils/unit-of-measure-options.util';
import { DocumentProductSearchPanelComponent } from '@domain/documents/components/document-product-search-panel/document-product-search-panel.component';
import {
  CUSTOMER_ORDER_INCLUDE_SOURCES,
  IncludeSourceKind,
  includeSourceKindsForDocumentType,
  includedPayloadFromSalesOrder,
  type IncludedDocumentPayload,
} from '@domain/documents/models/document-include.util';
import { priceModeRowLabel } from '@domain/documents/models/document-price-mode.util';
import {
  grossFromNetMinor,
  lineVatFromNetExact,
  netFromGrossExact,
  netFromGrossMinor,
} from '@domain/documents/utils/document-vat.util';
import { DocumentNumberConflictStore } from '@domain/documents/state/document-number-conflict.store';
import { DocumentChronologyGuard } from '@domain/documents/state/document-chronology-guard';
import { DocumentChronologyWarningDialogComponent } from '@domain/documents/components/document-chronology-warning-dialog/document-chronology-warning-dialog.component';
import { DocumentPrefillErrorStore } from '@domain/documents/state/document-prefill-error.store';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { DocumentProductPanelStore } from '@domain/documents/state/document-product-panel.store';
import { DocumentCodeLookupStore } from '@domain/documents/state/document-code-lookup.store';
import { DocumentProductSuggestStore } from '@domain/documents/state/document-product-suggest.store';
import { DocumentLineSortStore } from '@domain/documents/state/document-line-sort.store';
import {
  sortByLineValue,
  type DocumentLineSortKind,
} from '@domain/documents/utils/document-line-sort.util';
import { DocumentLineFocusStore } from '@domain/documents/state/document-line-focus.store';
import { DocumentCodeLookupService } from '@domain/documents/services/document-code-lookup.service';
import { ViewportService } from '@core/services/viewport.service';
import type { DocumentLineCodeField } from '@domain/documents/utils/document-code-match.util';
import { computeDocumentTotals } from '@domain/documents/utils/document-totals.util';
import {
  vatCodeSelectOption,
  vatOptionsIncludingSelected,
} from '@domain/documents/utils/document-vat-options.util';
import {
  documentReferenceLabel,
  documentTypeLabel,
} from '@domain/documents/models/document-labels.util';
import { transportDataIncomplete } from '@domain/documents/models/document-transport.util';
import { parseSerialNumbersText } from '@domain/documents/utils/serial-numbers-input.util';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentNumberingStore } from '@domain/documents/state/document-numbering.store';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { DocumentEditLockService } from '@domain/documents/services/document-edit-lock.service';
import type {
  CreateDocumentBody,
  DocumentLineInputBody,
  UpdateDocumentBody,
} from '@domain/documents/services/document-api.mapper';
import {
  DocumentStatus,
  DocumentType,
  TransportPort,
  isConfirmedEditableDocumentStatus,
} from '@core/models/document.model';
import type { DocumentAddress, DocumentRecord } from '@core/models/document.model';
import type { ProductEmbeddedCreatePrefill } from '@domain/products/models/product-form.mapper';
import {
  ARTICLE_LISTINO_VALUE,
  listinoSelectOptions,
  listinoUnitPrice,
  parseListinoChoice,
  type DocumentListinoChoice,
} from '@domain/documents/utils/document-listino.util';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import { ProductFormComponent } from '@domain/products/product-form.component';
import { ProductService } from '@domain/products/services/product.service';
import {
  findVariantSummaryById,
  mergeVariantSummaries,
} from '@domain/products/utils/variant-summary-search.util';
import { ProductPickerDialogComponent } from '@domain/products/components/product-picker-dialog/product-picker-dialog.component';
import type { CreateProductDto } from '@domain/products/models/product.dto';
import { CustomerOrderLineCardComponent } from './components/customer-order-line-card/customer-order-line-card.component';
import { OrderScanOverlayComponent } from './components/order-scan-overlay/order-scan-overlay.component';
import { TenantFeatureSettingsService } from '@domain/tenant/services/tenant-feature-settings.service';
import type { TenantFeatureSettings } from '@domain/tenant/models/tenant-feature-settings.model';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { AttachmentsPanelComponent } from '@shared/components/attachments-panel/attachments-panel.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { DocumentNumberFieldComponent } from '@shared/components/document-number-field/document-number-field.component';
import { DocumentSeriesManagerDialogComponent } from '@domain/documents/components/document-series-manager-dialog/document-series-manager-dialog.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { HoverTooltipComponent } from '@shared/components/hover-tooltip/hover-tooltip.component';
import { TableColumnResizeDirective } from '@shared/directives/table-column-resize.directive';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { CdkDrag, CdkDragHandle, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { formatItalianInputDate, toIsoDateLocal } from '@shared/utils/calendar.util';

import {
  CUSTOMER_ORDER_LINE_COLUMNS,
  CUSTOMER_ORDER_LINE_PRESETS,
  CUSTOMER_ORDER_LINES_VIEW,
  MANUAL_UNLOAD_LINE_COLUMNS,
  MANUAL_UNLOAD_LINE_PRESETS,
  MANUAL_UNLOAD_LINES_VIEW,
  QUOTE_LINE_COLUMNS,
  QUOTE_LINE_PRESETS,
  QUOTE_LINES_VIEW,
  SALES_DDT_LINE_COLUMNS,
  SALES_DDT_LINE_PRESETS,
  SALES_DDT_LINES_VIEW,
} from './models/customer-order-line-columns.config';
import { redistributeColumnWidths } from './models/column-width-distribution.util';
import type {
  CustomerOrderLineCardVm,
  LineCodeChoice,
} from './models/customer-order-line-card.model';
import {
  SalesOrderService,
  type SaveManualOrderInput,
  type SaveManualOrderLineInput,
} from '@domain/sales-orders/services/sales-order.service';
import { FirstClickSelectsDirective } from '@shared/directives/first-click-selects.directive';
import { documentSearchLaunchTerm } from '@domain/documents/utils/document-search-launch-term.util';
import { trailingEmptyLineIndices } from '@domain/documents/utils/trailing-empty-lines.util';

const VARIANT_SEARCH_DEBOUNCE_MS = 300;
const VARIANT_SEARCH_MIN_CHARS = 2;

/** Campi riga nel giro Tab/Invio deterministico (stesso pattern Arrivo merce). */
/** Colonne dell'Ordine cliente su cui si può ordinare le righe (§7.1). */
export type CustomerOrderLineSortColumn =
  | 'articleCode'
  | 'sku'
  | 'barcode'
  | 'product'
  | 'unitOfMeasure'
  | 'quantity'
  | 'unitPrice'
  | 'discount';

const CUSTOMER_ORDER_SORTABLE_LINE_COLUMNS: readonly CustomerOrderLineSortColumn[] = [
  'articleCode',
  'sku',
  'barcode',
  'product',
  'unitOfMeasure',
  'quantity',
  'unitPrice',
  'discount',
];

type CustomerOrderLineFocusField =
  | 'articleCode'
  | 'sku'
  | 'barcode'
  | 'product'
  | 'quantity'
  | 'unitOfMeasure'
  | 'unitPrice'
  | 'discount'
  | 'vat'
  | 'serials';
/**
 * I campi codice di QUESTA maschera: tre, non quattro. Il codice fornitore non
 * ha senso su un documento di vendita, e restringere l'unione qui lascia al
 * compilatore il compito di dirlo — invece di scoprirlo a runtime cercando un
 * controllo che non esiste.
 */
type CustomerOrderCodeField = Extract<DocumentLineCodeField, 'articleCode' | 'sku' | 'barcode'>;

/**
 * Quanto si aspetta, allo sfocamento di un campo, prima di chiudere un pannello
 * aperto sotto di esso: il tempo perché il tocco arrivi alla voce.
 *
 * Non è una preferenza estetica ed è una **misura mai presa**: 200 ms era il
 * valore già in uso per i suggerimenti sul nome prodotto, e la scelta dei codici
 * lo adotta invece di sceglierne un secondo. Se un giorno sembrerà un numero
 * motivato, non lo è.
 */
const MOBILE_PICK_GRACE_MS = 200;
type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

/** Riga oltre disponibilità per il dialogo di riepilogo (§CONTROLLI). */
interface AvailabilityIssue {
  readonly lineNumber: number;
  readonly label: string;
  readonly requested: number;
  readonly available: number;
}

/**
 * Maschera Ordine cliente manuale (§/app/sales): stessa impostazione visiva e
 * di persistenza dell'Arrivo merce (testata compatta, righe con colonne
 * ridimensionabili, scan `quantità*codice`, totale sticky, celle calcolate
 * distinte). Cambia il senso del documento — uscita anziché ingresso: gli
 * impegni di magazzino al posto dei carichi. Genera SOLO ordini con origine
 * "Manuale"; gli ordini Shopify restano dei rispettivi connettori.
 */
@Component({
  selector: 'app-customer-order-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FirstClickSelectsDirective,
    InlineBannerComponent,
    ReactiveFormsModule,
    CustomerOrderLineCardComponent,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    BackButtonComponent,
    BadgeComponent,
    AttachmentsPanelComponent,
    OrderScanOverlayComponent,
    ProductPickerDialogComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    DateInputComponent,
    DocumentNumberFieldComponent,
    DocumentSeriesManagerDialogComponent,
    DocumentChronologyWarningDialogComponent,
    DocumentIncludePanelComponent,
    DocumentMobilePanelComponent,
    ProductFormComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SelectMenuComponent,
    SlidePanelComponent,
    TableColumnPickerComponent,
    TableColumnResizeDirective,
    TableSkeletonComponent,
    HoverTooltipComponent,
    CustomerFormFieldsComponent,
    DocumentLineCodeCellComponent,
    DocumentLineProductCellComponent,
    DocumentLineSelectCellComponent,
    DocumentLineUnitCellComponent,
    UnitOfMeasureManagerDialogComponent,
    DocumentProductSearchPanelComponent,
  ],
  // Una maschera = un'istanza del blocco: è lei a tracciare gli id che ha
  // sbloccato e a rilasciarli all'uscita.
  providers: [DocumentEditLockService],
  templateUrl: './customer-order-form.component.html',
  // Stile riusato dall'Arrivo merce (stesse classi doc-form__*), più la banda
  // footer condivisa e le aggiunte specifiche di questa maschera. La vista
  // mobile sta in un foglio a parte: insieme sforerebbero il budget CSS
  // per-componente. L'ordine conta — questi due vengono dopo i condivisi e
  // ne sovrascrivono le regole a parità di specificità.
  styleUrls: [
    './customer-order-form.component.scss',
    './customer-order-form.rows.scss',
    './customer-order-form.mobile-cards.scss',
    './customer-order-form.mobile.scss',
    './customer-order-form.mobile-polish.scss',
    './customer-order-form.reference-mobile.scss',
  ],
})
export class CustomerOrderFormComponent implements CanComponentDeactivate {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly salesOrderService = inject(SalesOrderService);
  private readonly documentService = inject(DocumentService);
  private readonly countersService = inject(DocumentCountersService);
  private readonly customerService = inject(CustomerService);
  private readonly productService = inject(ProductService);
  private readonly barcodeLookup = inject(BarcodeLookupService);
  private readonly codeLookupService = inject(DocumentCodeLookupService);
  private readonly viewport = inject(ViewportService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly paymentOptionsService = inject(PaymentOptionsService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly tenantFeatureSettingsService = inject(TenantFeatureSettingsService);
  private readonly columnPreferences = inject(TableColumnPreferenceService);
  // Serve solo a leggere la larghezza resa della tabella durante il resize
  // colonne: la ridistribuzione ragiona in pixel veri, non in quote.
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly breadcrumbLabels = inject(BreadcrumbLabelService);
  private readonly documentActionsService = inject(DocumentActionsService);
  private readonly appConfig = inject(APP_CONFIG);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly navHistory = inject(NavigationHistoryService);
  private readonly toast = inject(ToastService);

  /** Scanner fotocamera disponibile (feature flag tenant). */
  protected readonly barcodeScannerEnabled = this.appConfig.features.barcodeScanner;
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly editLock = inject(DocumentEditLockService);

  /**
   * Modalità della maschera (route data `customerDocumentKind`): 'order' =
   * Ordine cliente manuale (default), 'quote' = Preventivo, 'sales-ddt' =
   * DDT vendita, 'manual-unload' = Scarico manuale. Le modalità documento
   * usano la STESSA schermata e lo stesso funzionamento delle righe,
   * persistendo nel registro documenti coi rispettivi numeratori
   * (PRE / DDT / SCA). Differenze chiave:
   * - Preventivo: nessuno stato, mai effetti magazzino.
   * - DDT vendita: nessuno stato documento, la colonna «Imp.» diventa
   *   «Scarica mag.» e le giacenze vengono SCARICATE al salvataggio; in più
   *   testata con Pagamento (modalità normativa fatt. elettronica), «Seguirà
   *   doc. di vendita», sezione Trasporto e sezione Indirizzi (prompt DDT).
   * - Scarico manuale (prompt Scarico manuale): come il DDT per righe, prezzi
   *   e totali, ma cliente FACOLTATIVO (anagrafica o testo libero solo per la
   *   stampa), niente trasporto/indirizzi; la giacenza viene sottratta
   *   direttamente al salvataggio SENZA movimenti di magazzino (deroga
   *   documentata) e l'eliminazione del documento non la ripristina.
   */
  private readonly formKind =
    (this.route.snapshot.data['customerDocumentKind'] as
      'order' | 'quote' | 'sales-ddt' | 'manual-unload' | undefined) ?? 'order';
  protected readonly isQuote = this.formKind === 'quote';
  protected readonly isSalesDdt = this.formKind === 'sales-ddt';
  protected readonly isManualUnload = this.formKind === 'manual-unload';
  /** Ordine cliente manuale (persistenza in SalesOrder, stati e impegni). */
  protected readonly isOrder = this.formKind === 'order';
  /** Modalità che persistono nel registro documenti (quote / sales_ddt / manual_unload). */
  private readonly isRegistryDocument = !this.isOrder;
  /** Tipo documento del registro per la modalità corrente. */
  protected readonly registryDocumentType = this.isSalesDdt
    ? DocumentType.SalesDdt
    : this.isManualUnload
      ? DocumentType.ManualUnload
      : DocumentType.Quote;
  /**
   * Tipo che governa la NUMERAZIONE, che non è sempre quello del registro.
   * L'Ordine cliente non vive in `documents` ma in `SalesOrder`, e ha un
   * contatore proprio (`customer_order`, quello che il server usa davvero in
   * `manual-sales-orders.service.ts`). Prendendo qui il ripiego `Quote` la
   * testata mostrava le serie del Preventivo e l'avviso cronologico (§4)
   * guardava la serie di un altro tipo documento.
   */
  protected readonly numberingDocumentType = this.isOrder
    ? DocumentType.CustomerOrder
    : this.registryDocumentType;

  protected readonly listPath = '/app/sales';
  /** Elenco dedicato del tipo (mai il registro generico filtrato). */
  private readonly registryListPath = this.isSalesDdt
    ? '/app/documents/sales-ddt'
    : this.isManualUnload
      ? '/app/documents/manual-unload'
      : '/app/documents/quote';
  protected readonly currency = DEFAULT_CURRENCY;
  protected readonly formatMoney = formatMoney;
  protected readonly formatVatRate = formatVatRate;
  protected readonly TransportPort = TransportPort;
  protected readonly lineColumnsView = this.isQuote
    ? QUOTE_LINES_VIEW
    : this.isSalesDdt
      ? SALES_DDT_LINES_VIEW
      : this.isManualUnload
        ? MANUAL_UNLOAD_LINES_VIEW
        : CUSTOMER_ORDER_LINES_VIEW;
  private readonly lineColumnDefs = this.isQuote
    ? QUOTE_LINE_COLUMNS
    : this.isSalesDdt
      ? SALES_DDT_LINE_COLUMNS
      : this.isManualUnload
        ? MANUAL_UNLOAD_LINE_COLUMNS
        : CUSTOMER_ORDER_LINE_COLUMNS;
  /** Colonna spunta magazzino: «Imp.» (ordine) o «Scarica mag.» (DDT/Scarico). */
  protected readonly commitsColumnLabel =
    this.isSalesDdt || this.isManualUnload ? 'Scarica mag.' : 'Imp.';
  protected readonly commitsStockTooltip =
    this.isSalesDdt || this.isManualUnload
      ? 'Se attiva, la quantità della riga SCARICA la giacenza di magazzino al salvataggio del documento. ' +
        'Default dal Tipo prodotto: Articolo ON, Servizio OFF. Sempre modificabile per eccezioni.'
      : 'Se attiva, la quantità della riga impegna la disponibilità di magazzino (Disponibile = Giacenza − Impegnata). ' +
        'Default dal Tipo prodotto: Articolo ON, Servizio OFF. Sempre modificabile per eccezioni.';

  // ── Routing / stato pagina ──────────────────────────────────────────────
  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly editOrderId = computed(() => this.paramMap().get('id'));
  protected readonly isEditMode = computed(() => Boolean(this.editOrderId()));

  protected readonly loadedOrder = signal<SalesOrder | null>(null);
  /** Documento caricato in modifica (modalità quote/sales-ddt: registro documenti). */
  protected readonly loadedQuoteDoc = signal<DocumentRecord | null>(null);
  protected readonly saveWarnings = signal<readonly string[]>([]);
  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
  protected readonly saving = computed(() => this._submitState().status === 'saving');
  protected readonly submitError = computed(() => {
    const state = this._submitState();
    return state.status === 'error' ? state.error : null;
  });

  protected readonly orderState = computed(() => {
    const order = this.loadedOrder();
    return order ? manualOrderState(order) : ManualOrderState.Confirmed;
  });
  protected readonly isConcluded = computed(() => this.orderState() === ManualOrderState.Concluded);
  protected readonly isPartiallyConcluded = computed(
    () => this.orderState() === ManualOrderState.PartiallyConcluded,
  );
  /**
   * Ordine evaso (anche parzialmente) da un documento di scarico: la modifica
   * resta consentita (prompt DDT), ma alla chiusura con modifiche compare
   * l'avviso «collegato a un DDT».
   */
  protected readonly isSettledOrder = computed(
    () => this.isConcluded() || this.isPartiallyConcluded(),
  );

  protected readonly pageTitle = computed(() => {
    if (this.isQuote) {
      return this.isEditMode() ? 'Modifica preventivo' : 'Nuovo preventivo';
    }
    if (this.isSalesDdt) {
      return this.isEditMode() ? 'Modifica DDT vendita' : 'Nuovo DDT vendita';
    }
    if (this.isManualUnload) {
      return this.isEditMode() ? 'Modifica scarico manuale' : 'Nuovo scarico manuale';
    }
    return this.isEditMode() ? 'Modifica ordine cliente' : 'Nuovo ordine cliente';
  });

  protected readonly stateOptions: readonly SelectMenuOption[] = [
    { value: ManualOrderState.Confirmed, label: 'Confermato' },
    { value: ManualOrderState.Cancelled, label: 'Annullato' },
  ];

  protected stateBadgeLabel(): string {
    switch (this.orderState()) {
      case ManualOrderState.Cancelled:
        return 'Annullato';
      case ManualOrderState.Concluded:
        return 'Concluso';
      case ManualOrderState.PartiallyConcluded:
        return 'Parzialmente concluso';
      default:
        return 'Confermato';
    }
  }

  protected stateBadgeTone(): 'success' | 'error' | 'info' | 'warning' {
    switch (this.orderState()) {
      case ManualOrderState.Cancelled:
        return 'error';
      case ManualOrderState.Concluded:
        return 'info';
      case ManualOrderState.PartiallyConcluded:
        return 'warning';
      default:
        return 'success';
    }
  }

  // ── Form ────────────────────────────────────────────────────────────────
  readonly form = this.fb.group({
    // Scarico manuale: cliente FACOLTATIVO (prompt Scarico manuale) — dalla
    // anagrafica oppure digitato liberamente (customerFreeText, solo stampa).
    customerId: this.fb.control('', {
      validators: this.isManualUnload ? [] : [Validators.required],
    }),
    /** Cliente a testo libero (solo scarico manuale): mai salvato in anagrafica. */
    customerFreeText: this.fb.control(''),
    // Obbligatoria: la testata (cliente + location) è il minimo salvabile.
    locationId: this.fb.control('', { validators: [Validators.required] }),
    documentDate: this.fb.control(toIsoDateLocal(new Date()), {
      validators: [Validators.required],
    }),
    // Numero e serie del registro (Preventivo/DDT vendita/Scarico manuale):
    // proposti dal numeratore, sovrascrivibili in testata.
    documentNumber: this.fb.control<number | null>(null),
    series: this.fb.control(''),
    externalRef: this.fb.control(''),
    // cliente ha emesso. Trio, non tre campi sparsi: lo rende il componente
    // condiviso, qui restano solo i controlli che lo alimentano.
    expectedDeliveryDate: this.fb.control(''),
    status: this.fb.control<'confirmed' | 'cancelled'>('confirmed'),
    paymentTerms: this.fb.control(''),
    // DDT vendita: modalità di pagamento normativa (dropdown, prompt DDT).
    paymentMethod: this.fb.control(''),
    // DDT vendita: «Seguirà doc. di vendita» (prompt DDT §TESTATA).
    followedBySalesDoc: this.fb.control(false),
    notes: this.fb.control(''),
    // Sconto extra % sull'intero documento (stesso pattern Arrivo merce).
    documentDiscountPercent: this.fb.control(''),
    // DDT vendita: sezione Trasporto (prompt DDT §TRASPORTO).
    transport: this.fb.group({
      causal: this.fb.control(''),
      startDate: this.fb.control(''),
      startTime: this.fb.control(''),
      port: this.fb.control<'' | TransportPort>(''),
      carrier: this.fb.control(''),
      packagesCount: this.fb.control(''),
      weight: this.fb.control(''),
      goodsAspect: this.fb.control(''),
      shippingCode: this.fb.control(''),
      trackingCode: this.fb.control(''),
    }),
    // DDT vendita: sezione Indirizzi (prompt DDT §INDIRIZZI).
    recipientAddress: this.createAddressGroup(),
    destinationAddress: this.createAddressGroup(),
    lines: this.fb.array([this.createLine()]),
  });

  private createAddressGroup() {
    return this.fb.group({
      name: this.fb.control(''),
      address: this.fb.control(''),
      zip: this.fb.control(''),
      city: this.fb.control(''),
      province: this.fb.control(''),
      country: this.fb.control(''),
      fiscalCode: this.fb.control(''),
      vatNumber: this.fb.control(''),
    });
  }

  get lines(): FormArray<ReturnType<CustomerOrderFormComponent['createLine']>> {
    return this.form.controls.lines;
  }

  /** Trigger reattivo su ogni modifica del form (stesso pattern Arrivo merce). */
  private readonly formValue = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  // ── Numero proposto vs numero scelto ────────────────────────────────────
  /**
   * «L'operatore ha toccato il numero?» in forma reattiva. Lo stato vero resta
   * `documentNumber.dirty` — qui non se ne tiene una copia, si ascolta: gli
   * eventi del controllo includono `PristineChangeEvent`, quindi il signal si
   * aggiorna anche su `markAsDirty()`, che `valueChanges` non emette.
   *
   * Questo signal esisteva già qui, nella forma filtrata, e **non era collegato
   * a niente**: la maschera decideva «è una proposta?» dal ricalcolo su
   * `valueChanges`, come le altre. Il meccanismo giusto era costruito e
   * inutilizzato — il modo più silenzioso in cui una copia diverge.
   */
  private readonly documentNumberPristine = toSignal(
    this.form.controls.documentNumber.events.pipe(
      map(() => this.form.controls.documentNumber.pristine),
    ),
    { initialValue: true },
  );

  protected readonly dirtySinceLastSave = signal(false);
  private suppressDirtyMarking = false;

  // ── Dati di contorno ────────────────────────────────────────────────────
  // Elenco completo clienti attivi via endpoint dedicato /customers/all
  // (stesso pattern del Fornitore in Arrivo merce: la lista paginata ha
  // pageSize massimo 100 e non va usata per la combo). Il reload scatta
  // dopo la creazione inline di un nuovo cliente.
  private readonly customersReload = signal(0);
  private readonly customers = toSignal(
    toObservable(this.customersReload).pipe(
      switchMap(() =>
        this.customerService
          .getAllCustomers()
          .pipe(catchError(() => of([] as readonly Customer[]))),
      ),
    ),
    { initialValue: [] as readonly Customer[] },
  );

  protected readonly customerOptions = computed<readonly SelectMenuOption[]>(() =>
    this.customers().map((customer) => ({
      value: customer.id,
      label: customerDisplayName(customer),
    })),
  );

  protected readonly selectedCustomer = computed<Customer | null>(() => {
    this.formValue();
    const id = this.form.controls.customerId.value;
    return id ? (this.customers().find((customer) => customer.id === id) ?? null) : null;
  });

  /** Cliente presente (anagrafica o testo libero): stato pieno del banner mobile. */
  // ── Nuovo cliente inline (stesso pattern del Nuovo fornitore in GR) ─────
  protected readonly showCustomerForm = signal(false);
  readonly customerForm = createCustomerFormGroup(this.fb);
  protected readonly savingCustomer = signal(false);
  protected readonly customerFormError = signal<string | null>(null);

  /** Voci pagamento del tenant per il form nuovo cliente inline. */
  protected readonly paymentOptions = toSignal(
    this.paymentOptionsService.list().pipe(catchError(() => of([] as readonly PaymentOption[]))),
    { initialValue: [] as readonly PaymentOption[] },
  );

  /**
   * Modalità di pagamento per la testata DDT (prompt DDT §TESTATA): voci
   * normative fatturazione elettronica gestibili in Impostazioni → Pagamenti.
   * La voce salvata sul documento resta selezionabile anche se disattivata.
   */
  protected readonly paymentMethodOptions = computed<readonly SelectMenuOption[]>(() => {
    this.formValue();
    const options = this.paymentOptions()
      .filter((option) => option.kind === 'method' && option.isActive)
      .map((option) => ({ value: option.name, label: option.name }));
    const current = this.form.controls.paymentMethod.value.trim();
    if (current && !options.some((option) => option.value === current)) {
      return [...options, { value: current, label: current }];
    }
    return options;
  });

  protected onPaymentMethodSelect(value: string | null): void {
    this.form.controls.paymentMethod.setValue(value ?? '');
    this.markFormDirty();
  }

  // ── DDT vendita: trasporto, indirizzi, ordini inclusi (prompt DDT) ──────

  /** Sezione Trasporto collassabile: aperta se contiene già dei dati. */
  protected readonly transportOpen = signal(false);

  protected toggleTransportSection(): void {
    this.transportOpen.update((open) => !open);
  }

  /** "Cambia destinazione": abilita un indirizzo diverso dall'intestatario. */
  protected readonly destinationDiffers = signal(false);

  /** Intestatario auto-compilato dall'anagrafica: true finché non editato a mano. */
  private recipientAutoFilled = true;

  /**
   * Ordini cliente inclusi nel DDT («Includi documento»): id agganciati al
   * salvataggio + righe per il controllo di copertura (stato Parzialmente
   * concluso, prompt DDT §LOGICA MAGAZZINO).
   */
  protected readonly includedOrders = signal<
    readonly {
      readonly id: string;
      readonly orderNumber: string;
      readonly lines: readonly { readonly variantId?: string; readonly quantity: number }[];
    }[]
  >([]);

  protected removeIncludedOrder(orderId: string): void {
    this.includedOrders.update((orders) => orders.filter((order) => order.id !== orderId));
    this.markFormDirty();
  }

  protected toggleCustomerForm(): void {
    this.showCustomerForm.update((open) => !open);
    this.customerFormError.set(null);
  }

  /** Crea il cliente manuale riusando la logica di /app/customers. */
  protected saveCustomer(): void {
    if (this.savingCustomer()) {
      return;
    }
    this.customerForm.markAllAsTouched();
    if (this.customerForm.hasError('identityRequired')) {
      this.customerFormError.set('Indica la ragione sociale oppure nome e cognome del cliente.');
      return;
    }
    if (this.customerForm.invalid) {
      return;
    }
    this.savingCustomer.set(true);
    this.customerFormError.set(null);
    this.customerService
      .createCustomer(mapCustomerFormToInput(this.customerForm.getRawValue()))
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (customer) => {
          this.savingCustomer.set(false);
          this.showCustomerForm.set(false);
          this.customerForm.reset();
          this.customersReload.update((tick) => tick + 1);
          this.form.controls.customerId.setValue(customer.id);
          this.markFormDirty();
        },
        error: (err: unknown) => {
          this.savingCustomer.set(false);
          this.customerFormError.set(this.toAppError(err).message);
        },
      });
  }

  protected readonly locationOptions = computed<readonly SelectMenuOption[]>(() =>
    toLocationSelectOptions(
      this.operationalLocations.writeLocations(),
      this.operationalLocations.defaultLocation()?.id ?? null,
    ),
  );

  private readonly tenantSettings = toSignal(
    this.tenantFeatureSettingsService.getSettings().pipe(catchError(() => of(null))),
    { initialValue: null as TenantFeatureSettings | null },
  );

  protected readonly vatCodes = toSignal(
    this.vatCodeService.list().pipe(catchError(() => of([] as readonly VatCode[]))),
    { initialValue: [] as readonly VatCode[] },
  );
  private readonly vatCodeById = computed(
    () => new Map(this.vatCodes().map((vatCode) => [vatCode.id, vatCode])),
  );
  /** Codici attivi utilizzabili in VENDITA, ordinati come in Impostazioni. */
  private readonly salesVatCodes = computed(() =>
    this.vatCodes().filter((vatCode) => vatCode.isActive && isSalesVatCode(vatCode)),
  );
  protected readonly salesVatOptions = computed<readonly SelectMenuOption[]>(() =>
    this.salesVatCodes().map((vatCode) => vatCodeSelectOption(vatCode)),
  );
  /** Codice IVA predefinito aziendale (default = predefinito globale, §coerenza). */
  private readonly defaultVatCodeId = computed(() => {
    const codes = this.salesVatCodes();
    const settingsId = this.tenantSettings()?.defaultVatCodeId;
    const fromSettings = settingsId
      ? codes.find((vatCode) => vatCode.id === settingsId)
      : undefined;
    const fallback = codes.find((vatCode) => vatCode.isDefault);
    return (fromSettings ?? fallback)?.id ?? '';
  });

  private readonly meta = toSignal(
    this.isOrder
      ? this.salesOrderService.getManualOrderMeta().pipe(catchError(() => of(null)))
      : of(null),
    { initialValue: null },
  );
  /** Anteprima prossimo numero documento (numeratore quote/sales_ddt). */
  private readonly registryPreviewReference = toSignal(
    this.isRegistryDocument
      ? this.documentService
          .previewDocumentNumber(this.registryDocumentType, {
            // La sede decide quale contatore predefinito si applica (§1-bis),
            // la data quale numero è il primo libero (§2). Lette all'apertura:
            // è l'anteprima della testata, non il numero che il salvataggio
            // assegnerà — quello lo dice `numbering`.
            locationId: this.form.controls.locationId.value || null,
            documentDate: this.form.controls.documentDate.value || null,
          })
          .pipe(
            map((preview) => preview.reference),
            catchError(() => of(null)),
          )
      : of(null),
    { initialValue: null as string | null },
  );
  protected readonly previewReference = computed(() =>
    this.isRegistryDocument
      ? this.registryPreviewReference()
      : (this.meta()?.nextReferencePreview ?? null),
  );
  // ── Numero documento (registro: Preventivo / DDT vendita / Scarico manuale) ──
  /** Conflitto numero restituito dal server: dialogo «Usa N» / «Annulla». */
  // Stato del dialog «numero già assegnato»: la macchina vive in domain, il
  // form decide solo quale controllo riceve il numero e cosa risalvare.
  // ── Numerazione ───────────────────────────────────────────────────────────
  //
  // Il meccanismo vive in `domain/` (`DocumentNumberingStore`): proposta,
  // scelta della serie, numero imposto. Era copiato in sei maschere.

  protected readonly numbering = new DocumentNumberingStore({
    isEdit: () => this.isEditMode(),
    number: () => this.form.controls.documentNumber.value,
    setNumber: (value) => this.form.controls.documentNumber.setValue(value),
    series: () => this.form.controls.series.value,
    setSeries: (value) => this.form.controls.series.setValue(value),
    numberIsDirty: () => !this.documentNumberPristine(),
    markNumberDirty: () => this.form.controls.documentNumber.markAsDirty(),
    markNumberPristine: () => this.form.controls.documentNumber.markAsPristine(),
    asProgrammatic: (write) => {
      // La proposta iniziale non è una modifica dell'operatore: scriverla non
      // deve accendere il guard di uscita.
      this.suppressDirtyMarking = true;
      try {
        write();
      } finally {
        this.suppressDirtyMarking = false;
      }
    },
  });

  /**
   * Reattivo per costruzione: `isProposal()` legge il signal degli eventi.
   */
  protected readonly numberIsProposal = computed(() => this.numbering.isProposal());

  /**
   * Chiusura del pannello numerazioni: ricarica l'elenco serie SENZA riproporre
   * serie e numero — la selezione resta quella che era.
   */
  protected onSeriesManagerClosed(): void {
    this.seriesDialogOpen.set(false);
    this.countersService
      .available(
        this.numberingDocumentType,
        this.form.controls.locationId.value || null,
        this.form.controls.documentDate.value,
      )
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ counters }) => this.numbering.setCounters(counters),
        error: () => undefined,
      });
  }

  private refreshNumberProposal(): void {
    this.countersService
      .available(
        this.numberingDocumentType,
        this.form.controls.locationId.value || null,
        this.form.controls.documentDate.value,
      )
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ counters, proposedCounterId }) =>
          this.numbering.applyProposal(counters, proposedCounterId),
        error: () => undefined,
      });
  }

  /**
   * Avviso cronologico (§4): la serie contiene documenti fuori posto. Avviso
   * e non blocco — da lì si salva comunque — e il meccanismo vive in
   * `domain/`, come quello del conflitto sul numero.
   */
  protected readonly chronology = new DocumentChronologyGuard({
    documentType: () => this.numberingDocumentType,
    series: () => this.form.controls.series.value,
    number: () => this.form.controls.documentNumber.value,
    documentDate: () => this.form.controls.documentDate.value,
    // In modifica il documento non deve risultare fuori ordine con la
    // propria riga vecchia: cambiare numero E data basterebbe.
    excludeId: () => this.editOrderId(),
  });
  private readonly numberConflictDialog = new DocumentNumberConflictStore();
  /** Precompilato non arrivato: la maschera e' vuota e va detto perche'. */
  protected readonly prefillError = new DocumentPrefillErrorStore();
  protected readonly conflictDialogOpen = this.numberConflictDialog.isOpen;
  protected readonly conflictMessage = this.numberConflictDialog.message;

  /** Pannello «gestisci numerazioni» aperto dall'ingranaggio del campo Serie. */
  protected readonly seriesDialogOpen = signal(false);

  protected readonly internalReferenceLabel = computed(() => {
    const saved = this.isRegistryDocument
      ? this.loadedQuoteDoc()?.reference
      : this.loadedOrder()?.orderNumber;
    return saved ?? this.previewReference();
  });

  /**
   * Etichetta della tappa id nel breadcrumb: il numero del documento aperto
   * (es. «OC-2026-0001»), così il percorso mostra quello invece del generico
   * «Dettaglio». Solo in modifica (l'id è nell'URL) e con documento caricato.
   */
  private readonly breadcrumbEntity = computed(() => {
    const id = this.editOrderId();
    if (!id) {
      return null;
    }
    if (this.isRegistryDocument) {
      const doc = this.loadedQuoteDoc();
      // Documento non ancora numerato: resta comunque un'etichetta leggibile
      // («Bozza · serie A») invece del generico «Dettaglio».
      return doc
        ? { id, label: documentReferenceLabel(doc.type, doc.reference, doc.series) }
        : null;
    }
    const label = this.loadedOrder()?.orderNumber;
    return label ? { id, label } : null;
  });
  /** Id attualmente registrato nel breadcrumb (per pulizia mirata). */
  private breadcrumbLabelId: string | null = null;
  /**
   * Documenti con cui si può concludere l'ordine. Lo Scarico manuale è escluso:
   * serve ai casi extra (campionario, omaggi, merce deteriorata), non all'
   * evasione naturale di un ordine cliente.
   */
  protected readonly unloadTypeOptions = computed<readonly SelectMenuOption[]>(() =>
    (this.meta()?.unloadDocumentTypes ?? [])
      .filter((type) => (type as DocumentType) !== DocumentType.ManualUnload)
      .map((type) => ({
        value: type,
        label: documentTypeLabel(type as DocumentType) ?? type,
      })),
  );

  /** Impegni attivi di QUESTO ordine per variante (Q.tà disponibile onesta in modifica). */
  private readonly ownReservedByVariant = signal<ReadonlyMap<string, number>>(new Map());

  // ── Varianti: summary fissate (righe caricate) + ricerca live ───────────
  private readonly pinnedVariants = signal<readonly VariantSummary[]>([]);
  protected readonly variantSearchDraft = signal('');
  private readonly searchedVariants = toSignal(
    toObservable(this.variantSearchDraft).pipe(
      debounceTime(VARIANT_SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
      switchMap((search) => {
        const term = search.trim();
        if (term.length < VARIANT_SEARCH_MIN_CHARS) {
          return of([] as readonly VariantSummary[]);
        }
        const locationId = this.form.controls.locationId.value || undefined;
        return this.productService
          .searchVariantSummaries({ search: term, pageSize: 30, locationId })
          .pipe(catchError(() => of([] as readonly VariantSummary[])));
      }),
    ),
    { initialValue: [] as readonly VariantSummary[] },
  );

  // ── Gate: righe disabilitate finché mancano cliente E location (P5) ─────
  // Scarico manuale: il cliente è facoltativo, basta la location di scarico.
  protected readonly headerGateActive = computed(() => {
    if (this.formReadOnly()) {
      return false;
    }
    this.formValue();
    if (this.isManualUnload) {
      return !this.form.controls.locationId.value;
    }
    return !this.form.controls.customerId.value || !this.form.controls.locationId.value;
  });

  /**
   * Titolo dello stato vuoto delle righe: dice **cosa manca**, non che manca
   * qualcosa.
   *
   * Prima era il testo di un banner d'avviso sopra una tabella spenta a metà
   * tinta. Ora è il titolo di ciò che sta al posto della tabella: le righe non
   * si mostrano affatto finché la testata non è completa, quindi non c'è niente
   * da sbiadire e niente da spiegare due volte.
   */
  protected readonly linesEmptyTitle = computed(() => {
    this.formValue();
    if (!this.headerGateActive()) {
      return 'Nessuna riga inserita';
    }
    const noCustomer = !this.isManualUnload && !this.form.controls.customerId.value;
    const noLocation = !this.form.controls.locationId.value;
    if (noCustomer && noLocation) {
      return 'Scegli il cliente e la location';
    }
    if (noCustomer) {
      return 'Scegli il cliente';
    }
    return this.isManualUnload ? 'Scegli la location di scarico' : 'Scegli la location';
  });

  protected readonly linesEmptyDescription = computed(() =>
    this.headerGateActive()
      ? 'Le righe si aggiungono dopo: da qui potrai cercare un articolo, scansionare un codice o includere un altro documento.'
      : 'Cerca un articolo, scansiona un codice o includi un altro documento.',
  );

  // ── Apertura in sola lettura ─────────────────────────────────────────────
  //
  // Un documento già salvato si riapre BLOCCATO e va sbloccato con «Sblocca
  // modifica». Vale per tutti e quattro i tipi che questa maschera ospita: DDT
  // vendita e Scarico manuale prendevano `editUnlocked = true` perché il blocco
  // fu scritto per il solo Ordine cliente — un ripiego, non una scelta.
  //
  // La regola non vive più qui: sta in DocumentEditLockService, scritta una
  // volta sola per ogni maschera del gestionale.
  protected readonly unlockDialogOpen = signal(false);

  /** Ordine caricato da un canale esterno: sito online oppure cassa Shopify. */
  protected readonly isExternalOrder = computed(() => {
    const order = this.loadedOrder();
    return order != null && order.source !== SalesOrderSource.Manual;
  });

  /** Vendita battuta in cassa: si corregge con un reso, non modificandola. */
  private readonly isPosOrder = computed(() => this.loadedOrder()?.source === SalesOrderSource.Pos);

  /**
   * Evaso DEL TUTTO, e quindi con un corrispettivo registrato. L'evasione
   * PARZIALE non crea né vendita online né corrispettivo — marca solo l'ordine
   * come da verificare — quindi qui non basta `isSettledOrder()`: con quello il
   * banner direbbe che esiste un corrispettivo che non c'è.
   */
  private readonly externalOrderFulfilled = computed(() =>
    Boolean(this.loadedOrder()?.fulfilledAt),
  );

  /**
   * Perché un ordine da canale esterno non si modifica qui.
   *
   * Non è una formula di cortesia: il divieto c'è per tre motivi verificati, e
   * finché resta un errore tecnico al salvataggio l'operatore non ne conosce
   * nessuno. Il salvataggio riscriverebbe l'origine dell'ordine, il prossimo
   * aggiornamento dal canale cancellerebbe comunque la modifica, e su un ordine
   * evaso i totali finirebbero per non tornare con quelli riepilogati per il
   * commercialista — che si ricalcolano dall'ordine, mentre la consegna già
   * fatta resta congelata.
   *
   * La cassa è un caso a parte e va detta a parte: uno scontrino non si
   * modifica, si fa un reso. E VestiFlow la rettifica del corrispettivo la
   * PREPARA soltanto — non la emette.
   */
  protected readonly externalOrderNotice = computed<readonly string[]>(() => {
    if (!this.isExternalOrder()) {
      return [];
    }
    if (this.isPosOrder()) {
      return [
        'Questa è una vendita registrata dalla cassa Shopify: VestiFlow ne conserva la registrazione e non la riscrive.',
        'Per correggerla si fa un reso o un rimborso in cassa. Quando arriva qui, VestiFlow prepara la rettifica del corrispettivo: non la emette da solo.',
      ];
    }
    const notice = [
      'Questo ordine arriva da Shopify: VestiFlow ne conserva la registrazione e non lo riscrive.',
    ];
    if (this.externalOrderFulfilled()) {
      notice.push(
        'È già stato evaso e il corrispettivo è stato registrato: cambiarlo qui sposterebbe anche i totali riepilogati per il commercialista, lasciandoli diversi da quelli già consegnati.',
      );
    }
    notice.push(
      'Per cambiarlo, modificalo su Shopify: al prossimo aggiornamento la modifica arriva qui da sola.',
    );
    if (!this.externalOrderFulfilled()) {
      notice.push(
        "Anche l'evasione la registra Shopify: quando l'ordine risulta evaso lì, VestiFlow crea la vendita online e scarica il magazzino.",
      );
    }
    return notice;
  });

  protected readonly canManageOrders = computed(() =>
    canManageDocuments(this.authService.currentUser()),
  );

  /**
   * Sbloccabile se l'utente gestisce i documenti. Gli ordini da canale esterno
   * non lo sono: non è un ripiego in attesa di una fase 2, è la conseguenza del
   * fatto che quell'ordine registra qualcosa avvenuto altrove. Il perché lo dice
   * `externalOrderNotice`.
   */
  protected readonly canUnlockDocument = computed(
    () => this.canManageOrders() && !this.isExternalOrder(),
  );

  /**
   * Documento già salvato, quindi da riaprire protetto. Per l'Ordine cliente
   * basta che sia caricato — un ordine esiste solo dopo il salvataggio. Per i
   * tipi che vivono nel registro conta lo stato: una bozza (un duplicato appena
   * creato) resta subito modificabile.
   */
  protected readonly isConfirmedEdit = computed(() => {
    if (this.isOrder) {
      return this.loadedOrder() != null;
    }
    const doc = this.loadedQuoteDoc();
    return doc != null && isConfirmedEditableDocumentStatus(doc.status);
  });

  /**
   * L'ordine da canale esterno è in sola lettura **sempre**, non «finché non lo
   * si sblocca»: è una proprietà del documento, e va detta qui invece di
   * affidarla al set di sessione del lock. Per tutto il resto vale la regola
   * condivisa — confermato e non ancora sbloccato.
   */
  protected readonly formReadOnly = computed(
    () => this.isExternalOrder() || (this.isConfirmedEdit() && !this.editLock.unlocked()),
  );

  /** Nome del documento nei testi di blocco e sblocco, per tipo. */
  private readonly documentNoun = this.isQuote
    ? 'preventivo'
    : this.isSalesDdt
      ? 'DDT'
      : this.isManualUnload
        ? 'scarico manuale'
        : 'ordine';

  /** Testo del banner di sola lettura, per tipo documento. */
  protected readonly lockedBannerText = computed(() =>
    this.isQuote
      ? 'Preventivo protetto da modifica. Sblocca per continuare a lavorare.'
      : this.isSalesDdt
        ? 'DDT protetto da modifica. Sblocca per continuare a lavorare.'
        : this.isManualUnload
          ? 'Scarico manuale protetto da modifica. Sblocca per continuare a lavorare.'
          : 'Ordine protetto da modifica. Sblocca per continuare a lavorare.',
  );

  /** Titolo/messaggio del dialogo di sblocco, per tipo documento. */
  protected readonly unlockDialogTitle = computed(() => `Sblocca modifica ${this.documentNoun}`);
  protected readonly unlockDialogMessage = computed(() => {
    if (this.isQuote) {
      return 'Sblocca il preventivo per modificarne righe e testata e salvarlo di nuovo.';
    }
    // DDT e Scarico manuale muovono la giacenza al salvataggio: risalvandoli si
    // riconcilia a delta, non si scarica una seconda volta.
    if (this.isSalesDdt || this.isManualUnload) {
      return `Modificando il ${this.documentNoun}, VestiFlow ricalcolerà lo scarico di magazzino al salvataggio.`;
    }
    return "Modificando l'ordine, VestiFlow aggiornerà gli impegni di magazzino collegati al salvataggio.";
  });

  protected requestUnlockEdit(): void {
    if (!this.canUnlockDocument()) {
      return;
    }
    this.unlockDialogOpen.set(true);
  }

  protected confirmUnlockEdit(): void {
    this.unlockDialogOpen.set(false);
    this.editLock.unlock(this.loadedOrder()?.id ?? this.loadedQuoteDoc()?.id);
  }

  // ── Caricamento ordine in modifica ──────────────────────────────────────
  private readonly loadTick = signal(0);
  private readonly loadState = toSignal(
    toObservable(computed(() => ({ id: this.editOrderId(), tick: this.loadTick() }))).pipe(
      switchMap(({ id }) => {
        if (!id) {
          return of<'ready' | 'loading' | 'not-editable' | 'error'>('ready');
        }
        if (this.isRegistryDocument) {
          return this.documentService.getDocumentById(id).pipe(
            map((doc) => {
              const editable =
                doc.type === this.registryDocumentType &&
                (doc.status === DocumentStatus.Draft ||
                  isConfirmedEditableDocumentStatus(doc.status));
              if (!editable) {
                this.loadedQuoteDoc.set(null);
                return 'not-editable' as const;
              }
              // Un documento che si riapre nasce protetto — preventivo, DDT o
              // scarico manuale, senza distinzioni. La regola vive in
              // DocumentEditLockService: qui non si decide più niente, si
              // sincronizza soltanto. Le bozze restano modificabili perché
              // `isConfirmedEdit()` non le considera, non per un ramo di qui.
              this.editLock.syncOnLoad(doc.id);
              this.loadedQuoteDoc.set(doc);
              this.patchFormFromRegistryDocument(doc);
              return 'ready' as const;
            }),
            startWith<'ready' | 'loading' | 'not-editable' | 'error'>('loading'),
            catchError(() => of('error' as const)),
          );
        }
        return this.salesOrderService.getSalesOrderById(id).pipe(
          map((order) => {
            // Anche gli ordini NON manuali (Shopify/canali esterni) si aprono
            // nel form, ma in SOLA LETTURA: aprirli qui sostituisce la vecchia
            // schermata Dettaglio. La modifica locale resta ai soli manuali
            // (gli impegni si ricaricano solo per questi). Che restino in sola
            // lettura lo dice `formReadOnly`, non questa sincronizzazione.
            this.editLock.syncOnLoad(order.id);
            this.loadedOrder.set(order);
            this.patchFormFromOrder(order);
            // Un altro documento è un'altra storia: l'avviso del riordino torna
            // dovuto. Qui e non alla creazione del componente, che passando da
            // un documento all'altro non riavviene — cambia solo il parametro.
            this.lineSort.reset();
            if (order.source === SalesOrderSource.Manual) {
              this.reloadOwnReservations(order.id);
            }
            return 'ready' as const;
          }),
          startWith<'ready' | 'loading' | 'not-editable' | 'error'>('loading'),
          catchError(() => of('error' as const)),
        );
      }),
    ),
    { initialValue: this.editOrderId() ? 'loading' : 'ready' },
  );
  protected readonly loading = computed(() => this.loadState() === 'loading');
  protected readonly loadError = computed(() => this.loadState() === 'error');
  protected readonly notEditable = computed(() => this.loadState() === 'not-editable');

  /**
   * Quale delle due viste di riga è viva. Le due sono **esclusive**: sotto la
   * soglia esiste la card, sopra la tabella, mai entrambe.
   *
   * ⚠️ Attraversando la soglia i controlli vengono smontati e rimontati, e **il
   * fuoco si perde**. Misurato e accettato: si attraversa ruotando un tablet o
   * ridimensionando una finestra, non lavorando. Lo stato del form invece
   * sopravvive — valore, «toccato», «sporco», «disabilitato» vivono nel
   * componente, non nel template.
   */
  protected readonly compactView = this.viewport.compact;

  // ── Autocomplete prodotto per riga ──────────────────────────────────────
  /** Il pannello suggerimenti del nome prodotto: stato e regole in domain/. */
  protected readonly productSuggest = new DocumentProductSuggestStore();

  /**
   * Riordino righe e avviso: stato e regole in `domain/`. Qui resta cosa
   * differisce — quali colonne, come si legge il loro valore, e il limite qui
   * sotto, che è di questa maschera sola.
   */
  protected readonly lineSort = new DocumentLineSortStore<CustomerOrderLineSortColumn>();

  private readonly lineSortKinds: Readonly<
    Record<CustomerOrderLineSortColumn, DocumentLineSortKind>
  > = {
    articleCode: 'text',
    sku: 'text',
    barcode: 'text',
    product: 'text',
    unitOfMeasure: 'text',
    quantity: 'number',
    unitPrice: 'money',
    discount: 'percent',
  };

  /**
   * ⛔ **Con righe «documento collegato» non si riordina**, ed è un limite del
   * dominio, non una mancanza.
   *
   * Quella riga non è una riga: è la TESTATA del gruppo di righe arrivate da un
   * altro documento, e sta subito prima delle sue. Riordinando per nome
   * prodotto le righe si spargono e la testata resta dov'è — a quel punto
   * annuncia righe che non sono più le sue, e mente all'operatore.
   *
   * Ancorarla sarebbe peggio del male: sembrerebbe ancora la testata di quello
   * che ha sotto. Quindi finché il documento contiene un'inclusione le
   * intestazioni non ordinano, e lo dicono.
   */
  protected readonly lineSortAvailable = computed(() => {
    this.formValue();
    return !this.lines.controls.some((line) => line.controls.isReference.value === true);
  });

  protected isLineColumnSortable(columnId: string): boolean {
    return (CUSTOMER_ORDER_SORTABLE_LINE_COLUMNS as readonly string[]).includes(columnId);
  }

  protected lineSortDisabledReason(): string | null {
    return this.lineSortAvailable()
      ? null
      : 'Il documento contiene righe incluse da un altro documento: riordinarle staccherebbe le righe dal loro riferimento.';
  }

  protected toggleLineSort(columnId: CustomerOrderLineSortColumn): void {
    if (this.formReadOnly() || !this.lineSortAvailable() || !this.isLineColumnVisible(columnId)) {
      return;
    }
    if (this.lineSort.request(columnId)) {
      this.applyLineSort();
    }
  }

  protected confirmLineSort(): void {
    if (this.lineSort.confirm() !== null) {
      this.applyLineSort();
    }
  }

  protected lineSortAriaLabel(columnId: CustomerOrderLineSortColumn, label: string): string {
    if (this.lineSort.column() !== columnId) {
      return `Ordina per ${label}`;
    }
    return this.lineSort.direction() === 'asc'
      ? `${label}: ordinamento crescente`
      : `${label}: ordinamento decrescente`;
  }

  private lineSortValue(
    raw: ReturnType<ReturnType<CustomerOrderFormComponent['createLine']>['getRawValue']>,
    column: CustomerOrderLineSortColumn,
  ): string | number {
    switch (column) {
      case 'articleCode':
        return raw.articleCode;
      case 'sku':
        return raw.sku;
      case 'barcode':
        return raw.barcode;
      case 'product':
        return raw.productName;
      case 'unitOfMeasure':
        return raw.unitOfMeasure;
      case 'quantity':
        return Number(raw.quantity) || 0;
      case 'unitPrice':
        return raw.unitPrice;
      case 'discount':
        return raw.discount;
    }
  }

  private applyLineSort(): void {
    const column = this.lineSort.column();
    if (!column || this.lines.length <= 1) {
      return;
    }
    const controls = sortByLineValue(
      this.lines.controls,
      (control) => this.lineSortValue(control.getRawValue(), column),
      this.lineSortKinds[column],
      this.lineSort.direction(),
      this.currency,
    );
    this.lines.clear();
    for (const control of controls) {
      this.lines.push(control);
    }
    this.markFormDirty();
  }
  /**
   * Scelta fra più corrispondenze esatte di un codice. Lo stato vive in
   * `domain/`, identico nelle tre maschere; qui resta solo cosa farne.
   *
   * Il suo indice evidenziato è PROPRIO, distinto da `activeSuggestionIndex`:
   * quella è la lista dei suggerimenti sul nome prodotto, questa è la scelta
   * fra codici. Sono due collezioni con lunghezze diverse — un indice solo si
   * sfaserebbe passando dall'una all'altra.
   */
  protected readonly codeLookup = new DocumentCodeLookupStore();
  /**
   * Una sola attesa in volo per la card mobile: due sfocamenti ravvicinati non
   * devono lasciare due decisioni pendenti sulla stessa riga.
   */
  private mobileCodeBlurTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Card mobile: apre l'anteprima sopra il campo invece che sotto, quando sotto
   * non c'è spazio a sufficienza (campo vicino al dock fisso in fondo). Uno solo
   * per volta è aperto, quindi basta un flag condiviso.
   */
  protected readonly mobileSuggestAbove = signal(false);
  protected readonly productSearchPanelOpen = signal(false);
  protected readonly productSearchLineIndex = signal<number | null>(null);
  protected readonly productSearchLaunchTerm = signal('');
  protected readonly productSearchLaunchSeq = signal(0);

  // ── Scan / riga di inserimento rapido ───────────────────────────────────
  protected readonly quickScanDraft = signal('');
  protected readonly quickScanBusy = signal(false);
  protected readonly quickScanError = signal<string | null>(null);
  private readonly quickScanInputRef = viewChild<ElementRef<HTMLInputElement>>('quickScanInput');
  /**
   * Card mobile scanner-first: il campo testo resta bloccato (readonly, niente
   * tastiera automatica) finché non lo si tocca esplicitamente. La CTA primaria
   * è «Scansiona»; questo flag apre la tastiera solo su richiesta dell'utente.
   */
  protected readonly mobileScanEditing = signal(false);

  // ── Modale «Seleziona prodotti» (mobile) ────────────────────────────────
  // Rimpiazza la ricerca inline sopra le righe: due livelli (prodotto → sue
  // varianti) con selezione multipla. Ogni variante scelta diventa una riga.
  protected readonly productPickerOpen = signal(false);

  protected openProductPicker(): void {
    if (this.formReadOnly() || this.headerGateActive()) {
      return;
    }
    this.productPickerOpen.set(true);
  }

  protected closeProductPicker(): void {
    this.productPickerOpen.set(false);
  }

  protected onProductPickerPicked(variantIds: readonly string[]): void {
    for (const variantId of variantIds) {
      // Stessa strada dello scan: riga nuova, oppure quantità +1 se già presente.
      this.applyScannedVariant(variantId, 1);
    }
    this.productPickerOpen.set(false);
  }

  // ── F6: overlay scanner metà/metà ────────────────────────────────────────
  protected readonly scanOverlayOpen = signal(false);
  /** EAN del flusso «Crea prodotto» dallo scanner: prefill pannello + add riga. */
  private readonly scanCreateBarcode = signal('');

  protected openScanOverlay(): void {
    if (this.formReadOnly() || this.headerGateActive()) {
      return;
    }
    this.scanOverlayOpen.set(true);
  }

  protected closeScanOverlay(): void {
    this.scanOverlayOpen.set(false);
  }

  protected onScanLineAdded(event: {
    readonly variantId: string;
    readonly quantity: number;
  }): void {
    this.applyScannedVariant(event.variantId, event.quantity);
  }

  /** Quick-add non catalogato: crea il prodotto bozza (NON sincronizzato con
   *  Shopify, F0) e aggiunge la riga. Payload minimo, riuso della create. */
  protected onScanQuickAdd(event: {
    readonly name: string;
    readonly priceText: string;
    readonly ean: string;
    readonly quantity: number;
  }): void {
    const price = parseMoneyInput(event.priceText, this.currency);
    const sellingPrice = price ?? { amountMinor: 0, currencyCode: this.currency };
    // Prodotto semplice: il prezzo è dato dell'articolo; la variante di default
    // lo specchia (Modello X).
    const payload: CreateProductDto = {
      name: event.name,
      status: ProductStatus.Draft,
      shopifySyncEnabled: false,
      sellingPrice,
      options: [],
      variants: [
        {
          optionValues: [],
          sellingPrice,
          barcode: event.ean || undefined,
        },
      ],
    };
    const locationId = this.form.controls.locationId.value || undefined;
    this.productService
      .createProduct(payload)
      .pipe(
        switchMap(() => this.barcodeLookup.resolveVariantIdByCode(event.ean, { locationId })),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (variantId) => {
          if (variantId) {
            this.applyScannedVariant(variantId, event.quantity);
          }
        },
        error: (err: unknown) => this.quickScanError.set(this.toAppError(err).message),
      });
  }

  protected onScanCreateFull(ean: string): void {
    this.scanOverlayOpen.set(false);
    this.scanCreateBarcode.set(ean);
    this.productPanel.openForNewProduct();
  }

  // ── Pannello anagrafica prodotto (creazione/modifica al volo, come GR) ──
  // Stato del pannello prodotto: la macchina vive in domain, qui restano solo
  // i riferimenti con i nomi che i template già usano.
  private readonly productPanel = new DocumentProductPanelStore();
  protected readonly productPanelOpen = this.productPanel.isOpen;
  protected readonly productPanelLineIndex = this.productPanel.lineIndex;
  protected readonly productPanelMode = this.productPanel.mode;
  protected readonly productPanelEditProductId = this.productPanel.editProductId;
  protected readonly attachTargetLineIndex = this.productPanel.attachTargetLineIndex;
  protected readonly attachWithoutAddDialogOpen = this.productPanel.attachDialogOpen;
  protected readonly pendingAttachVariantId = this.productPanel.pendingAttachVariantId;

  // ── Includi documento (logica trasversale, mappa in document-include.util:
  //     l'Ordine cliente include da Preventivo; il DDT vendita da Preventivo
  //     e Ordine cliente; il Preventivo non include da nessun documento) ────
  protected readonly includeSourceKinds: readonly IncludeSourceKind[] =
    this.isQuote || this.isManualUnload
      ? []
      : this.isSalesDdt
        ? includeSourceKindsForDocumentType(DocumentType.SalesDdt)
        : CUSTOMER_ORDER_INCLUDE_SOURCES;
  protected readonly includePanelOpen = signal(false);
  protected readonly includeLaunchSeq = signal(0);

  // ── Dialoghi ────────────────────────────────────────────────────────────
  protected readonly exitDialogOpen = signal(false);
  private pendingDeactivate: ((allow: boolean) => void) | null = null;
  protected readonly availabilityDialogOpen = signal(false);
  protected readonly availabilityIssues = signal<readonly AvailabilityIssue[]>([]);
  private pendingSaveAfterAvailability = false;
  protected readonly concludeMenuOpen = signal(false);
  protected readonly concluding = signal(false);

  // ── DDT vendita: dialoghi avvisi e generazione documenti (prompt DDT) ───
  /** «Dati trasporto/indirizzi incompleti. Procedere lo stesso?» */
  protected readonly incompleteDataDialogOpen = signal(false);
  /** «Non sono stati evasi tutti i prodotti previsti. Forzare a Concluso?» */
  protected readonly partialOrdersDialogOpen = signal(false);
  protected readonly partialOrderNumbers = signal<readonly string[]>([]);
  private pendingPartialOrderIds: readonly string[] = [];
  /** Menu «Genera documento» (Bozza fattura / Proforma, §GENERAZIONE). */
  protected readonly generateMenuOpen = signal(false);
  protected readonly generating = signal(false);
  /**
   * Conversione proforma→DDT: id del documento di origine da collegare
   * (sourceDocumentId) quando il DDT viene salvato. Valorizzato dal prefill
   * `?fromDocument`, resta null per un DDT creato da zero.
   */
  private readonly _sourceDocumentId = signal<string | null>(null);

  /**
   * Modalità prezzo del documento (netto/ivato), solo per i documenti del
   * registro (DDT, preventivo, scarico manuale): true = prezzi riga IVA inclusa.
   * Sorgente iniziale: preferenza (nuovo), documento (modifica), origine
   * (generato/duplicato). Cambiandola i prezzi si convertono, totali fermi.
   */
  protected readonly pricesIncludeVat = signal<boolean>(false);

  // ── Listino del documento (§B4) ────────────────────────────────────────────
  //
  // Non e' un dato del documento ma un modo di riempirlo: sceglierlo riscrive i
  // prezzi delle righe, che restano modificabili una per una. Per questo non si
  // memorizza e alla riapertura torna su «Prezzo articolo»: quello che conta
  // sono i prezzi che l'operatore ha lasciato nel documento.
  protected readonly listinoChoice = signal<DocumentListinoChoice>('article');
  protected readonly listinoOptions = computed(() => listinoSelectOptions(this.tenantSettings()));
  protected readonly listinoValue = computed(() => {
    const choice = this.listinoChoice();
    return choice === 'article' ? ARTICLE_LISTINO_VALUE : String(choice);
  });
  /** Righe rimaste a zero perche' l'articolo non ha un prezzo per quel listino. */
  protected readonly listinoWarnings = signal<readonly string[]>([]);
  /** La tendina non compare sullo Scarico manuale: non e' un documento di vendita. */
  protected readonly showListinoSelect = computed(
    () => !this.isManualUnload && this.listinoOptions().length > 1,
  );
  protected readonly priceRowLabel = computed(() => priceModeRowLabel(this.pricesIncludeVat()));
  protected readonly priceModeOptions: readonly SelectMenuOption[] = [
    { value: 'net', label: 'Netto' },
    { value: 'gross', label: 'Ivato' },
  ];
  /** Tendina modalità prezzo nell'intestazione di colonna (desktop). */
  protected readonly priceModeMenuOpen = signal(false);

  // ── F2: menu azioni ⋯ (mobile) + sconto documento a scomparsa ────────────
  protected readonly headerMenuOpen = signal(false);
  /** Il menu ⋯ compare solo se c'è almeno un'azione contestuale da offrire. */
  protected readonly hasContextualActions = computed(
    () =>
      this.canConclude() ||
      this.canGenerateDocuments() ||
      (this.isOrder && this.loadedOrder() != null),
  );
  protected toggleHeaderMenu(): void {
    this.headerMenuOpen.update((open) => !open);
  }

  protected closeHeaderMenu(): void {
    this.headerMenuOpen.set(false);
  }

  /** Porta in vista la sezione Allegati (in fondo alla pagina su mobile). */
  protected scrollToAttachments(): void {
    this.host.nativeElement
      .querySelector('.doc-form__attachments')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  constructor() {
    // L'attesa della card mobile non deve sopravvivere alla maschera: al
    // ritorno gireebbe su righe che non ci sono più.
    this.destroyRef.onDestroy(() => {
      if (this.mobileCodeBlurTimer !== null) {
        clearTimeout(this.mobileCodeBlurTimer);
      }
    });
    // Colonna "Costo" (dato sensibile §permessi): senza il permesso
    // "Visualizza costi d'acquisto" la definizione non viene registrata,
    // quindi non compare nemmeno tra le opzioni del selettore colonne.
    const canSeeCosts = canViewPurchaseCosts(this.authService.currentUser());
    this.columnPreferences.registerView(
      this.lineColumnsView,
      canSeeCosts
        ? this.lineColumnDefs
        : this.lineColumnDefs.filter((column) => column.id !== 'purchaseCost'),
      this.isQuote
        ? QUOTE_LINE_PRESETS
        : this.isSalesDdt
          ? SALES_DDT_LINE_PRESETS
          : this.isManualUnload
            ? MANUAL_UNLOAD_LINE_PRESETS
            : CUSTOMER_ORDER_LINE_PRESETS,
    );

    // Il rilascio degli sblocchi all'uscita non vive più qui: lo fa
    // DocumentEditLockService, uguale per ogni maschera.
    this.destroyRef.onDestroy(() => {
      if (this.breadcrumbLabelId) {
        this.breadcrumbLabels.clear(this.breadcrumbLabelId);
      }
    });

    // Annulla · Salva in topbar (mobile): la maschera registra le sue azioni,
    // la shell le mostra. Rilasciate all'uscita, così la topbar torna normale.
    effect(() => {
      if (this.formReadOnly() || this.loading() || this.loadError() || this.notEditable()) {
        this.documentActionsService.clear();
        return;
      }
      this.documentActionsService.set({
        saveLabel: this.isOrder ? 'Salva ordine' : 'Salva',
        saving: this.saving(),
        canSave: !this.saving(),
        save: () => this.requestSaveDocument(),
        cancel: () => this.cancel(),
      });
    });
    this.destroyRef.onDestroy(() => this.documentActionsService.clear());

    // Etichetta della tappa id nel breadcrumb: registro il numero del documento
    // caricato (e ripulisco la precedente se cambia entità nella stessa istanza).
    effect(() => {
      const entity = this.breadcrumbEntity();
      if (this.breadcrumbLabelId && this.breadcrumbLabelId !== entity?.id) {
        this.breadcrumbLabels.clear(this.breadcrumbLabelId);
        this.breadcrumbLabelId = null;
      }
      if (entity) {
        this.breadcrumbLabels.set(entity.id, entity.label);
        this.breadcrumbLabelId = entity.id;
      }
    });

    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.suppressDirtyMarking && !this.formReadOnly()) {
        this.dirtySinceLastSave.set(true);
      }
    });

    // Cambio sede: due cose la seguono.
    //
    // 1. Le disponibilità per sede sulle righe.
    // 2. La tendina Serie — un contatore legato a una sede è disponibile SOLO
    //    lì, e quelli senza sede ovunque (§1-bis). Senza ricarica l'elenco
    //    resterebbe quello chiesto all'apertura, e mostrerebbe serie che in
    //    questa sede non si possono usare. `refreshNumberProposal` ripropone
    //    serie e numero solo su documento nuovo col numero mai toccato.
    this.form.controls.locationId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.refreshAllLineSummaries();
        this.refreshNumberProposal();
      });

    // Cambio data: il numero proposto dipende dalla data (§2), quindi la
    // testata deve rifare l'anteprima — o mostrerebbe il primo libero di OGGI
    // mentre il salvataggio assegna quello della data scelta.
    this.form.controls.documentDate.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshNumberProposal());

    // Sede predefinita in testata (§1-bis): la regola vive in `domain/`, ed è
    // la stessa per tutte le maschere. Qui restano i due ganci che cambiano.
    prefillDefaultLocation({
      control: this.form.controls.locationId,
      isEdit: () => this.isEditMode(),
      write: (apply) => {
        this.suppressDirtyMarking = true;
        apply();
        this.suppressDirtyMarking = false;
      },
    });

    // Cliente scelto: propone sconto anagrafica sulle righe già compilate
    // senza sconto e condizioni di pagamento in testata (proposte, non vincoli).
    this.form.controls.customerId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyCustomerDefaults());

    // Intestatario editato a mano: stop all'auto-compilazione dall'anagrafica.
    this.form.controls.recipientAddress.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.suppressRecipientAutofillTracking) {
          this.recipientAutoFilled = false;
        }
      });

    // Documento nuovo: la testata parte col primo numero libero della serie.
    afterNextRender(() => {
      if (!this.editOrderId()) {
        this.refreshNumberProposal();
        this.prefillFromIncludedOrder();
        this.prefillFromConversionDocument();
        this.prefillFromDuplicateDocument();
        this.initPriceModeForNewDocument();
      }
    });
  }

  /**
   * Documento del registro nuovo «da zero» (o da «Concludi ordine», che non
   * porta modalità): la modalità prezzo parte dalla preferenza dell'operatore.
   * Il DDT generato da proforma e il duplicato ereditano invece l'origine.
   */
  private initPriceModeForNewDocument(): void {
    if (!this.isRegistryDocument) {
      return;
    }
    const params = this.route.snapshot.queryParamMap;
    if (params.get('fromDocument') || params.get('duplicateFrom')) {
      return;
    }
    this.documentService
      .getPriceModePreference(this.registryDocumentType)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (pricesIncludeVat) => this.pricesIncludeVat.set(pricesIncludeVat),
        error: () => undefined,
      });
  }

  /**
   * «Duplica documento» (Fase 3, no bozze): il param `duplicateFrom` porta il
   * documento originale (DDT vendita / scarico manuale), di cui si copia il
   * contenuto in un documento NUOVO. Nessuna copia nasce a monte: si crea
   * (confermato) solo al salvataggio.
   */
  private prefillFromDuplicateDocument(): void {
    const duplicateFrom = this.route.snapshot.queryParamMap.get('duplicateFrom');
    if (!duplicateFrom || !this.isRegistryDocument) {
      return;
    }
    this.documentService
      .getDocumentById(duplicateFrom)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (doc) => this.applyDuplicateFromDocument(doc),
        error: () => this.prefillError.fail('duplicate'),
      });
  }

  private applyDuplicateFromDocument(doc: DocumentRecord): void {
    this.patchFormFromRegistryDocument(doc);
    // Documento nuovo indipendente: si azzerano identità e riferimenti
    // dell'originale (numero, serie, rif. esterno); la data è quella odierna.
    this.suppressDirtyMarking = true;
    try {
      this.form.patchValue({
        documentNumber: null,
        series: '',
        externalRef: '',
        documentDate: new Date().toISOString().slice(0, 10),
      });
    } finally {
      this.suppressDirtyMarking = false;
    }
    this._sourceDocumentId.set(null);
    this.includedOrders.set([]);
    this.refreshNumberProposal();
  }

  /**
   * Apertura del DDT «precompilato» dalla generazione lato ordine («Concludi
   * ordine» → DDT): il param `includeOrder` aggancia subito l'ordine sorgente
   * riusando la stessa logica del pannello «Includi». Nessun documento nasce a
   * monte: il DDT si crea solo al salvataggio, che conclude l'ordine.
   */
  private prefillFromIncludedOrder(): void {
    const includeOrderId = this.route.snapshot.queryParamMap.get('includeOrder');
    if (!includeOrderId || !this.isSalesDdt) {
      return;
    }
    this.salesOrderService
      .getSalesOrderById(includeOrderId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (order) => this.onDocumentIncluded(includedPayloadFromSalesOrder(order)),
        error: () => this.prefillError.fail('include'),
      });
  }

  /**
   * Apertura del DDT «precompilato» dalla conversione proforma→DDT: il param
   * `fromDocument` porta la proforma di origine, di cui si copiano testata e
   * righe (variante, prezzo, sconto, codice IVA per riga). Nessun documento
   * nasce a monte: il DDT si crea solo al salvataggio, che scarica le giacenze
   * e collega l'origine (sourceDocumentId).
   */
  private prefillFromConversionDocument(): void {
    const fromDocument = this.route.snapshot.queryParamMap.get('fromDocument');
    if (!fromDocument || !this.isSalesDdt) {
      return;
    }
    this.documentService
      .getDocumentById(fromDocument)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (doc) => this.applyConversionPrefill(doc),
        error: () => this.prefillError.fail('convert'),
      });
  }

  private applyConversionPrefill(doc: DocumentRecord): void {
    this._sourceDocumentId.set(doc.id);
    // Il DDT generato eredita la modalità prezzo della proforma d'origine.
    this.pricesIncludeVat.set(doc.pricesIncludeVat);

    // Testata riportata dalla proforma (cliente, location, pagamento); la data
    // resta quella odierna del DDT nuovo, non quella della proforma.
    if (doc.customerId) {
      this.form.controls.customerId.setValue(doc.customerId);
    }
    if (doc.locationId) {
      this.form.controls.locationId.setValue(doc.locationId);
    }
    if (doc.paymentTerms?.trim()) {
      this.form.controls.paymentTerms.setValue(doc.paymentTerms.trim());
    }

    const groups: ReturnType<CustomerOrderFormComponent['createLine']>[] = [];

    const referenceLine = this.createLine();
    referenceLine.patchValue(
      {
        productName: this.conversionReferenceText(doc),
        quantity: 1,
        commitsStock: false,
        isReference: true,
      },
      { emitEvent: false },
    );
    groups.push(referenceLine);

    for (const line of doc.lines ?? []) {
      const group = this.createLine();
      group.patchValue(
        {
          variantId: line.variantId ?? '',
          sku: line.sku ?? '',
          productName: line.description,
          quantity: line.quantity,
          unitPrice:
            line.unitPrice.amountMinor > 0
              ? moneyToDecimalString({
                  amountMinor: line.unitPrice.amountMinor,
                  currencyCode: this.currency,
                }).replace('.', ',')
              : '',
          discount:
            Number(line.discountPercent) > 0
              ? formatDiscountPercent(Number(line.discountPercent))
              : '',
          vatCodeId: line.vatCodeId ?? '',
          commitsStock: Boolean(line.variantId),
        },
        { emitEvent: false },
      );
      groups.push(group);
    }

    // Le righe convertite entrano prima delle eventuali righe vuote in coda.
    let insertAt = this.lines.length;
    while (insertAt > 0 && this.lineIsEmpty(this.lines.at(insertAt - 1))) {
      insertAt -= 1;
    }
    groups.forEach((group, offset) => {
      this.lines.insert(insertAt + offset, group, { emitEvent: false });
    });
    this.refreshAllLineSummaries();
    this.markFormDirty();
  }

  /** «Rif. Proforma PRO-2026-0007 del 30/07/2026» per la riga di riferimento. */
  private conversionReferenceText(doc: DocumentRecord): string {
    const date = new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(doc.documentDate));
    const ref = doc.reference?.trim();
    return ref ? `Rif. Proforma ${ref} del ${date}` : `Rif. Proforma del ${date}`;
  }

  /** Alza il flag durante le patch programmatiche dell'intestatario. */
  private suppressRecipientAutofillTracking = false;

  private readonly lineTableColumnState = computed(() =>
    this.columnPreferences.state(this.lineColumnsView)(),
  );

  // ── Colonne ─────────────────────────────────────────────────────────────
  protected isLineColumnVisible(columnId: string): boolean {
    this.lineTableColumnState();
    // Colonna Seriali (solo DDT): nascosta se il tracciamento seriali non è
    // attivo nelle impostazioni tenant (stesso gate dell'Arrivo merce).
    if (columnId === 'serials') {
      const settings = this.tenantSettings();
      if (settings && !settings.serialsEnabled) {
        return false;
      }
    }
    return this.columnPreferences.isColumnVisible(this.lineColumnsView, columnId);
  }

  // Larghezza nominale della colonna numero riga (--space-12): entra nel
  // totale perché con quote percentuali TUTTE le colonne devono sommare 100%
  // — una colonna px residua farebbe traboccare la tabella di quei px.
  private static readonly LINE_INDEX_COLUMN_PX = 48;

  /**
   * Larghezze in corso di trascinamento: vivono qui e non nelle preferenze
   * finché il mouse non si alza, altrimenti ogni pixel di movimento
   * scriverebbe su localStorage e sul server.
   */
  private readonly lineColumnDraft = signal<ReadonlyMap<string, number> | null>(null);

  /** Px salvati (o default) di una colonna: restano l'unità persistita. */
  private lineColumnPx(columnId: string): number {
    const draft = this.lineColumnDraft();
    const drafted = draft?.get(columnId);
    if (drafted !== undefined) {
      return drafted;
    }
    const def = this.lineColumnDefs.find((col) => col.id === columnId);
    const fallback = def?.defaultWidthPx ?? 96;
    // Il minimo vale anche sulle larghezze già salvate: senza, una colonna
    // stretta da un vecchio ridimensionamento resterebbe tale anche dopo aver
    // alzato il minimo (e il contenuto continuerebbe a stare stretto).
    return Math.max(
      this.columnPreferences.columnWidth(this.lineColumnsView, columnId, fallback),
      this.lineColumnMinWidth(columnId),
    );
  }

  /** Somma dei px delle colonne visibili + colonna indice. */
  private lineColumnsTotalPx(): number {
    return this.lineColumnDefs.reduce(
      (total, def) =>
        this.isLineColumnVisible(def.id) ? total + this.lineColumnPx(def.id) : total,
      CustomerOrderFormComponent.LINE_INDEX_COLUMN_PX,
    );
  }

  /**
   * Larghezza colonna come QUOTA percentuale del totale: la tabella occupa
   * sempre esattamente il 100% del contenitore — coi px assoluti e
   * table-layout fixed, quando la somma superava il wrapper la tabella
   * restava larga quanto la somma e scorreva invece di adattarsi. I px
   * salvati dal resize fanno da pesi relativi.
   */
  protected lineColumnWidth(columnId: string): string {
    this.lineTableColumnState();
    return `${((this.lineColumnPx(columnId) / this.lineColumnsTotalPx()) * 100).toFixed(4)}%`;
  }

  /** Quota percentuale della colonna numero riga (vedi lineColumnWidth). */
  protected lineIndexColumnWidth(): string {
    this.lineTableColumnState();
    return `${((CustomerOrderFormComponent.LINE_INDEX_COLUMN_PX / this.lineColumnsTotalPx()) * 100).toFixed(4)}%`;
  }

  protected lineColumnMinWidth(columnId: string): number {
    const def = this.lineColumnDefs.find((col) => col.id === columnId);
    return def?.minWidthPx ?? 48;
  }

  /**
   * Trascinamento in corso: la colonna presa segue il cursore e le ALTRE
   * cedono (o riprendono) spazio in proporzione, da entrambi i lati. La somma
   * resta quella di partenza, così la tabella continua a stare esattamente
   * nel contenitore e non compare la barra di scorrimento orizzontale.
   */
  protected onLineColumnResizing(columnId: string, renderedWidthPx: number): void {
    const next = this.redistributeLineColumns(columnId, renderedWidthPx);
    if (next) {
      this.lineColumnDraft.set(next);
    }
  }

  protected onLineColumnResize(columnId: string, renderedWidthPx: number): void {
    const draft = this.lineColumnDraft();
    if (!draft) {
      // Solo un clic sull'impugnatura: niente da salvare.
      return;
    }
    const next = this.redistributeLineColumns(columnId, renderedWidthPx) ?? draft;
    this.lineColumnDraft.set(null);
    const widths: Record<string, number> = {};
    for (const [id, px] of next) {
      widths[id] = Math.round(px);
    }
    this.columnPreferences.setColumnWidths(this.lineColumnsView, widths);
  }

  /**
   * Nuove larghezze di TUTTE le colonne visibili con `columnId` portata a
   * `renderedWidthPx`. Il conto si fa in PIXEL RESI, non nei pesi salvati: è
   * l'unica scala in cui i minimi per colonna significano qualcosa. Erano
   * proprio i minimi ignorati a far comparire la barra orizzontale — allargando
   * molto una colonna, le altre finivano sotto la larghezza del loro contenuto,
   * che traboccava dalla cella. Le larghezze così ottenute sommano alla
   * larghezza della tabella e diventano i nuovi pesi (contano solo i rapporti).
   */
  private redistributeLineColumns(
    columnId: string,
    renderedWidthPx: number,
  ): ReadonlyMap<string, number> | null {
    const tableWidth =
      this.host.nativeElement.querySelector('.doc-form__table-wrap')?.clientWidth ?? 0;
    const visible = this.lineColumnDefs.filter((def) => this.isLineColumnVisible(def.id));
    if (tableWidth <= 0 || visible.length < 2) {
      return null;
    }

    // A trascinamento avviato le larghezze in bozza sono già pixel resi: la
    // conversione va fatta una volta sola, all'inizio, o si accumula deriva.
    const scale = this.lineColumnDraft() ? 1 : tableWidth / this.lineColumnsTotalPx();
    const base = visible.map((def) => ({
      id: def.id,
      px: this.lineColumnPx(def.id) * scale,
      minPx: this.lineColumnMinWidth(def.id),
    }));
    return redistributeColumnWidths(base, columnId, renderedWidthPx);
  }

  // ── Righe: creazione, selezione variante, difaults ──────────────────────
  private createLine() {
    return this.fb.group({
      id: this.fb.control(''),
      variantId: this.fb.control(''),
      // Codice articolo: terzo criterio di ricerca accanto a SKU/EAN (§6).
      articleCode: this.fb.control(''),
      sku: this.fb.control(''),
      barcode: this.fb.control(''),
      productName: this.fb.control(''),
      quantity: this.fb.control(1, {
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      unitPrice: this.fb.control(''),
      discount: this.fb.control(''),
      vatCodeId: this.fb.control(''),
      commitsStock: this.fb.control(true),
      unitOfMeasure: this.fb.control(''),
      // Seriali consumati dallo scarico (solo DDT, testo "SN001, SN002").
      serialNumbersText: this.fb.control(''),
      /**
       * Riga «documento collegato»: separatore visivo del gruppo di righe
       * arrivate da un altro documento. Non ha quantità, prezzi né impegno —
       * porta solo il testo del riferimento, che l'operatore può riscrivere.
       */
      isReference: this.fb.control(false),
    });
  }

  /**
   * Riordino per trascinamento: la maniglia è il numero di riga. Ogni riga si
   * muove da sola — spostare un riferimento non trascina il gruppo sotto: è
   * l'operatore a comporre l'ordine riga per riga.
   */
  protected onLineDrop(event: CdkDragDrop<unknown>): void {
    // Guardia, non ridondanza: il template disabilita già il drop su documento
    // protetto, ma quella è una riga di binding che si perde in un refactor
    // senza che niente diventi rosso. Il riordino di un documento bloccato non
    // sporcherebbe nemmeno il form (markFormDirty gatea su formReadOnly), e
    // resterebbe quindi una modifica invisibile in attesa del primo salvataggio.
    if (this.formReadOnly()) {
      return;
    }
    const { previousIndex, currentIndex } = event;
    if (previousIndex === currentIndex) {
      return;
    }
    const line = this.lines.at(previousIndex);
    this.lines.removeAt(previousIndex, { emitEvent: false });
    this.lines.insert(currentIndex, line, { emitEvent: false });
    // Una card aperta resterebbe agganciata all'indice sbagliato.
    this.openLineCard.set(null);
    this.markFormDirty();
    // removeAt/insert silenziosi: un giro esplicito riallinea vista e totali.
    this.lines.updateValueAndValidity();
  }

  protected addLine(): void {
    this.lines.push(this.createLine());
    this.markFormDirty();
  }

  protected removeLine(index: number): void {
    this.lines.removeAt(index);
    if (this.lines.length === 0) {
      this.lines.push(this.createLine());
    }
    this.markFormDirty();
  }

  // ── Conferma eliminazione riga (card mobile Ordine cliente) ────────────────
  // L'elimina è a sinistra, prima cosa che si incontra scorrendo: chiede conferma.
  private readonly _pendingRemoveIndex = signal<number | null>(null);
  protected readonly removeLineDialogOpen = computed(() => this._pendingRemoveIndex() !== null);

  protected requestRemoveLine(index: number): void {
    this._pendingRemoveIndex.set(index);
  }

  protected confirmRemoveLine(): void {
    const index = this._pendingRemoveIndex();
    this._pendingRemoveIndex.set(null);
    if (index != null) {
      this.removeLine(index);
    }
  }

  protected cancelRemoveLine(): void {
    this._pendingRemoveIndex.set(null);
  }

  /** Conteggio righe reali del documento (escluse riferimento e placeholder). */
  protected readonly documentLineCount = computed(() => {
    this.formValue();
    return this.lines.controls.filter(
      (line, index) => !this.lineIsReference(index) && !this.lineIsEmpty(line),
    ).length;
  });

  /**
   * Mobile: la riga vuota creata all'apertura non si mostra. Una card «Riga
   * senza prodotto» con Qtà 1 e totale 0 fa credere che ci sia già qualcosa,
   * per giunta non compilabile finché mancano cliente e location. Le righe
   * compaiono quando ne arriva una vera (scan, modale prodotti) o quando
   * l'utente la chiede con «Aggiungi riga». Su desktop nulla cambia: lì la
   * riga vuota è la cella in cui si digita.
   */
  private readonly mobileRowsRevealed = signal(false);

  protected readonly mobileRowsVisible = computed(() => {
    this.formValue();
    if (this.mobileRowsRevealed()) {
      return true;
    }
    const rows = this.lines.controls;
    return rows.length > 1 || (rows.length === 1 && !this.lineIsEmpty(rows[0]!));
  });

  /** «Aggiungi riga» su mobile: la prima volta svela la riga vuota già presente. */
  protected addLineMobile(): void {
    if (!this.mobileRowsVisible()) {
      this.mobileRowsRevealed.set(true);
      return;
    }
    this.addLine();
  }

  /** Stepper quantità della riga compatta mobile (min 1). */
  /**
   * Tutto cio' che la card di riga mostra ma non calcola, in un oggetto solo.
   *
   * Prima la card leggeva ventitre' valori chiamando altrettanti metodi da
   * template. Portarla in un componente passandoglieli uno per uno avrebbe
   * prodotto trenta `input()`; raccolti qui, gliene bastano tre. E' anche il
   * punto in cui la formattazione (valuta, etichette) resta di competenza del
   * form: la card riceve stringhe pronte e non sa cosa sia una `Money`.
   */
  protected lineCardVm(index: number): CustomerOrderLineCardVm {
    return {
      index,
      variantLabel: this.lineVariantLabel(index),
      articleCode: this.lineArticleCode(index),
      unitOfMeasure: this.lineUnitOfMeasure(index),
      stockAvailable: this.lineStockAvailable(index),
      availabilityHint: this.lineAvailabilityHint(index),
      availabilityCritical: this.lineAvailabilityCritical(index),
      complete: this.lineRowComplete(index),
      totalLabel: this.formatMoney(this.lineTotalMoney(index)),
      discountedUnitLabel: this.formatMoney(this.lineDiscountedUnitMoney(index)),
      purchaseCostLabel: this.linePurchaseCost(index),
      priceLabel: this.priceRowLabel(),
      vatOptions: this.lineVatOptions(index),
      vatValue: this.lineVatValue(index),
      suggestions: this.lineSuggestions(index).map((variant) => ({
        variantId: variant.variantId,
        title: variant.title,
        detail: this.mobileSuggestionDetail(variant),
      })),
      suggestionsOpen: this.lineSuggestionsOpen(index),
      codeChoice: this.mobileCodeChoice(index),
      suggestAbove: this.mobileSuggestAbove(),
      activeSuggestionIndex: this.productSuggest.activeIndex(),
      readOnly: this.formReadOnly(),
      commitsLabel: this.isQuote ? null : this.commitsColumnLabel,
      showSerials: this.isLineColumnVisible('serials'),
      showPurchaseCost: this.isLineColumnVisible('purchaseCost'),
    };
  }

  /** +1 / -1 dallo stepper della card: il minimo e la marcatura restano qui. */
  protected onLineQuantityStep(index: number, step: 1 | -1): void {
    if (step === 1) {
      this.incrementLineQty(index);
      return;
    }
    this.decrementLineQty(index);
  }

  protected incrementLineQty(index: number): void {
    if (this.formReadOnly()) {
      return;
    }
    const control = this.lines.at(index).controls.quantity;
    control.setValue((Number(control.value) || 0) + 1);
    this.markFormDirty();
  }

  protected decrementLineQty(index: number): void {
    if (this.formReadOnly()) {
      return;
    }
    const control = this.lines.at(index).controls.quantity;
    control.setValue(Math.max(1, (Number(control.value) || 0) - 1));
    this.markFormDirty();
  }

  protected duplicateLine(index: number): void {
    const source = this.lines.at(index);
    const copy = this.createLine();
    // I seriali identificano il singolo pezzo: mai copiati sulla riga duplicata.
    copy.setValue({ ...source.getRawValue(), id: '', serialNumbersText: '' });
    this.lines.insert(index + 1, copy);
    this.markFormDirty();
  }

  protected lineIsEmpty(line: ReturnType<CustomerOrderFormComponent['createLine']>): boolean {
    const value = line.getRawValue();
    return (
      !value.variantId && !value.productName.trim() && !value.sku.trim() && !value.barcode.trim()
    );
  }

  /**
   * Quante colonne di identità sono visibili (Cod. articolo, SKU, EAN, Nome):
   * è l'ampiezza del colspan della riga riferimento. Le colonne di valore
   * restano celle proprie, così tinte di gruppo e divisori non si interrompono.
   */
  protected identityColumnCount(): number {
    this.lineTableColumnState();
    return ['articleCode', 'sku', 'barcode', 'product'].filter((id) => this.isLineColumnVisible(id))
      .length;
  }

  /** Riga «documento collegato»: separatore, non merce da contare o valorizzare. */
  protected lineIsReference(index: number): boolean {
    this.formValue();
    return this.lines.at(index)?.controls.isReference.value === true;
  }

  /** Come sopra, sul controllo: serve dentro i cicli su `lines.controls`. */
  private isReferenceLine(line: ReturnType<CustomerOrderFormComponent['createLine']>): boolean {
    return line.controls.isReference.value === true;
  }

  protected lineHasLinkedProduct(index: number): boolean {
    this.formValue();
    return Boolean(this.lines.at(index)?.controls.variantId.value);
  }

  protected linkedProductLabel(index: number): string {
    const summary = this.lineVariantSummary(index);
    return summary?.title || this.lines.at(index)?.controls.productName.value || '';
  }

  /** Codice articolo del prodotto collegato alla riga (colonna §Codice articolo). */
  protected lineArticleCode(index: number): string {
    return (
      this.lineVariantSummary(index)?.articleCode ||
      this.lines.at(index)?.controls.articleCode.value ||
      ''
    );
  }

  /**
   * Costo d'acquisto dell'articolo (colonna "Costo", §8): ultimo costo
   * registrato in anagrafica (stesso dato scritto dall'Arrivo merce, netto).
   * Visibile solo con permesso "Visualizza costi d'acquisto".
   */
  protected linePurchaseCost(index: number): string {
    this.formValue();
    const purchase = this.lineVariantSummary(index)?.purchasePrice;
    return purchase && purchase.amountMinor > 0 ? formatMoney(purchase) : '—';
  }

  protected lineVariantSummary(index: number): VariantSummary | null {
    return findVariantSummaryById(
      this.lines.at(index)?.controls.variantId.value,
      this.pinnedVariants(),
      this.searchedVariants(),
    );
  }

  /** Selezione variante su una riga: snapshot codici + default operativi. */
  protected onVariantSelect(index: number, variantId: string | null): void {
    const line = this.lines.at(index);
    line.controls.variantId.setValue(variantId ?? '');
    if (variantId) {
      const summary = mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants()).find(
        (entry) => entry.variantId === variantId,
      );
      if (summary) {
        // FISSA la summary trovata nei risultati di ricerca: quando la query
        // si svuota (debounce) i searched tornano [], e senza pin la riga
        // perdeva disponibilità/codici dopo ~1s (Q.tà disp. che "sparisce").
        this.pinnedVariants.update((current) => mergeVariantSummaries([summary], current));
        this.applySummaryToLine(line, summary);
      } else {
        this.pinVariantSummary(index, variantId);
      }
    }
    this.clearProductAutocomplete();
    this.markFormDirty();
  }

  private applySummaryToLine(
    line: ReturnType<CustomerOrderFormComponent['createLine']>,
    summary: VariantSummary,
  ): void {
    line.controls.articleCode.setValue(summary.articleCode, { emitEvent: false });
    line.controls.sku.setValue(summary.sku, { emitEvent: false });
    line.controls.barcode.setValue(summary.barcode ?? '', { emitEvent: false });
    line.controls.productName.setValue(summary.productName || summary.title, { emitEvent: false });
    line.controls.unitOfMeasure.setValue(summary.unitOfMeasure ?? 'pz', { emitEvent: false });
    // Spunta "Impegna magazzino": default dal Tipo prodotto (Articolo ON,
    // Servizio OFF); prodotti non gestiti a magazzino mai impegnati di default.
    const isService = summary.kind === 'service' || summary.managesStock === false;
    line.controls.commitsStock.setValue(!isService, { emitEvent: false });
    // Codice IVA: predefinito articolo (se attivo/vendita) → predefinito globale.
    // Prima del prezzo: in modalità ivata serve l'aliquota per mostrarlo.
    if (!line.controls.vatCodeId.value) {
      const productVat = summary.defaultVatCodeId
        ? this.vatCodeById().get(summary.defaultVatCodeId)
        : undefined;
      if (productVat?.isActive && isSalesVatCode(productVat)) {
        line.controls.vatCodeId.setValue(productVat.id, { emitEvent: false });
      } else if (this.defaultVatCodeId()) {
        line.controls.vatCodeId.setValue(this.defaultVatCodeId(), { emitEvent: false });
      }
    }
    // Il prezzo d'anagrafica è netto: in modalità ivata si mostra con l'IVA.
    // Segue il listino scelto in testata (§B4): una riga aggiunta dopo aver
    // scelto un listino deve nascere con quel prezzo, non col prezzo articolo.
    const listinoPrice = listinoUnitPrice(summary, this.listinoChoice());
    if (!line.controls.unitPrice.value.trim() && (listinoPrice?.amountMinor ?? 0) > 0) {
      line.controls.unitPrice.setValue(
        this.priceFieldValue(listinoPrice?.amountMinor ?? 0, this.lineRateOf(line)),
        { emitEvent: false },
      );
    }
    // Sconto anagrafica cliente proposto come default (mai sovrascrive).
    if (!line.controls.discount.value.trim()) {
      const customerDiscount = this.selectedCustomer()?.customerDiscount?.trim();
      if (customerDiscount) {
        line.controls.discount.setValue(customerDiscount, { emitEvent: false });
      }
    }
  }

  /** Carica e fissa la summary di una variante (righe da ordine esistente/scan). */
  private pinVariantSummary(index: number, variantId: string, quantityToAdd = 0): void {
    const locationId = this.form.controls.locationId.value || undefined;
    this.productService
      .searchVariantSummaries({ variantId, locationId })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => {
        const summary = rows[0];
        if (!summary) {
          return;
        }
        this.pinnedVariants.update((current) => mergeVariantSummaries([summary], current));
        const line = this.lines.at(index);
        if (line && line.controls.variantId.value === summary.variantId) {
          this.applySummaryToLine(line, summary);
          if (quantityToAdd > 0) {
            const current = Number(line.controls.quantity.value) || 0;
            line.controls.quantity.setValue(current + quantityToAdd);
          }
        }
      });
  }

  /** Ricarica le summary per la location corrente (disponibilità per sede). */
  private refreshAllLineSummaries(): void {
    const locationId = this.form.controls.locationId.value || undefined;
    const variantIds = [
      ...new Set(
        this.lines.controls
          .map((line) => line.controls.variantId.value)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    this.pinnedVariants.set([]);
    for (const variantId of variantIds) {
      this.productService
        .searchVariantSummaries({ variantId, locationId })
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe((rows) => {
          const summary = rows[0];
          if (summary) {
            this.pinnedVariants.update((current) => mergeVariantSummaries([summary], current));
            // Codice articolo sulle righe collegate (righe caricate da ordine
            // esistente: il documento non lo persiste, arriva dall'anagrafica).
            for (const line of this.lines.controls) {
              if (line.controls.variantId.value === summary.variantId) {
                line.controls.articleCode.setValue(summary.articleCode, { emitEvent: false });
              }
            }
          }
        });
    }
  }

  private reloadOwnReservations(orderId: string): void {
    this.salesOrderService
      .getManualOrderReservations(orderId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          const byVariant = new Map<string, number>();
          for (const row of rows) {
            byVariant.set(
              row.variantId,
              (byVariant.get(row.variantId) ?? 0) + row.remainingQuantity,
            );
          }
          this.ownReservedByVariant.set(byVariant);
        },
        error: () => this.ownReservedByVariant.set(new Map()),
      });
  }

  // ── Disponibilità (§DISPONIBILITÀ / §CONTROLLI) ─────────────────────────

  /**
   * Disponibile effettiva vista da QUESTA riga: la Disponibile server include
   * già gli impegni di quest'ordine, che qui vanno riaggiunti (altrimenti un
   * ordine appena salvato vedrebbe la propria merce come mancante).
   */
  protected lineEffectiveAvailable(index: number): number | null {
    const summary = this.lineVariantSummary(index);
    if (!summary || summary.kind === 'service' || summary.managesStock === false) {
      return null;
    }
    if (summary.stockAvailable == null) {
      return 0;
    }
    const ownReserved = this.ownReservedByVariant().get(summary.variantId) ?? 0;
    return summary.stockAvailable + ownReserved;
  }

  /** Testo colonna "Q.tà disp.": — per i Servizi (nessun controllo). */
  protected lineStockAvailable(index: number): string {
    this.formValue();
    const available = this.lineEffectiveAvailable(index);
    return available == null ? '—' : String(available);
  }

  /** Avviso ambra sulla cella quantità: la Q.tà digitata supera la disponibile. */
  protected lineExceedsAvailability(index: number): boolean {
    // Il Preventivo non impegna e non blocca disponibilità: nessun avviso.
    if (this.isQuote) {
      return false;
    }
    this.formValue();
    const line = this.lines.at(index);
    if (!line || !line.controls.commitsStock.value) {
      return false;
    }
    const available = this.lineEffectiveAvailable(index);
    if (available == null) {
      return false;
    }
    const qty = Number(line.controls.quantity.value) || 0;
    return qty > available;
  }

  protected lineAvailabilityHint(index: number): string | null {
    if (!this.lineExceedsAvailability(index)) {
      return null;
    }
    const available = this.lineEffectiveAvailable(index) ?? 0;
    return `disponibili solo ${Math.max(0, available)}`;
  }

  /**
   * Card mobile Ordine cliente: disponibilità «critica» (arancione) quando la
   * giacenza disponibile è zero o insufficiente rispetto alla quantità. Senza
   * variante collegata (nessun dato) non colora.
   */
  protected lineAvailabilityCritical(index: number): boolean {
    const available = this.lineEffectiveAvailable(index);
    if (available == null) {
      return false;
    }
    return available <= 0 || this.lineExceedsAvailability(index);
  }

  /**
   * Descrizione della variante (solo la parte variante, es. «M / Rosso»), per la
   * riga dedicata della card mobile. Il `title` della variante è «Prodotto —
   * variante»: si toglie il nome prodotto. Vuoto se il prodotto non ha varianti.
   */
  protected lineVariantLabel(index: number): string {
    const summary = this.lineVariantSummary(index);
    if (!summary) {
      return '';
    }
    const title = summary.title?.trim() ?? '';
    const product = summary.productName?.trim() ?? '';
    if (!title || title === product || !title.startsWith(product)) {
      return '';
    }
    return title
      .slice(product.length)
      .replace(/^\s*[—–-]\s*/, '')
      .trim();
  }

  // ── Calcoli riga e totali ────────────────────────────────────────────────
  private lineUnitPriceMinor(line: ReturnType<CustomerOrderFormComponent['createLine']>): number {
    const parsed = parseMoneyInput(line.controls.unitPrice.value, this.currency);
    return parsed?.amountMinor ?? 0;
  }

  /**
   * Prezzo unitario scontato con cascata: "4+10%" è 4%, poi 10% sul residuo.
   * Vale per ogni tipo documento — il Preventivo faceva eccezione solo perché
   * la colonna sconto era intera e l'anteprima doveva imitarne la perdita.
   */
  protected lineDiscountedUnitMoney(index: number): Money {
    this.formValue();
    const line = this.lines.at(index);
    const unit = this.lineUnitPriceMinor(line);
    return {
      amountMinor: applyCascadeDiscountMinor(unit, line.controls.discount.value),
      currencyCode: this.currency,
    };
  }

  protected lineHasDiscount(index: number): boolean {
    this.formValue();
    const line = this.lines.at(index);
    return cascadeDiscountMultiplier(line.controls.discount.value) < 1;
  }

  /**
   * Totale riga mostrato in colonna: quantità × prezzo scontato, nella stessa
   * modalità in cui si vedono i prezzi (netto o ivato). È una vista.
   */
  protected lineTotalMoney(index: number): Money {
    this.formValue();
    const line = this.lines.at(index);
    const qty = Number(line.controls.quantity.value) || 0;
    const unitDiscounted = this.lineDiscountedUnitMoney(index).amountMinor;
    return { amountMinor: qty * unitDiscounted, currencyCode: this.currency };
  }

  /**
   * Imponibile della riga PRIMA dell'arrotondamento: quantità × prezzo NETTO
   * scontato. È il numero che finisce nei totali e nel documento, indipendente
   * da come si guardano i prezzi; chi lo usa lo arrotonda una volta sola, alla
   * fine, e ne ricava l'imposta col valore esatto (§sei decimali).
   *
   * L'unica eccezione è l'Ordine cliente: lì il server
   * (`manual-sales-order.util`) sconta il prezzo unitario e lo arrotonda
   * subito, perché la sua colonna prezzo è intera. Tenere esatto qui quello che
   * il server arrotonda farebbe divergere di un centesimo l'anteprima dal
   * documento salvato.
   */
  private lineNetExactMinor(index: number): number {
    const line = this.lines.at(index);
    const qty = Number(line.controls.quantity.value) || 0;
    const unitNet = this.lineUnitNetMinor(index);
    if (this.isOrder) {
      return qty * applyCascadeDiscountMinor(unitNet, line.controls.discount.value);
    }
    return qty * unitNet * cascadeDiscountMultiplier(line.controls.discount.value);
  }

  /** Valore riga pre-sconto (barrato in colonna Totale, come Arrivo merce). */
  protected lineGrossMoney(index: number): Money {
    this.formValue();
    const line = this.lines.at(index);
    const qty = Number(line.controls.quantity.value) || 0;
    return { amountMinor: qty * this.lineUnitPriceMinor(line), currencyCode: this.currency };
  }

  /**
   * Totali documento con Sconto extra (P3): applicato DOPO gli sconti riga
   * sull'imponibile complessivo; l'IVA viene ricalcolata sulla ripartizione
   * proporzionale (stessa logica dell'Arrivo merce, client e server).
   */
  protected readonly documentTotals = computed(() => {
    this.formValue();

    // L'algoritmo dei totali è condiviso da tutti i tipi documento: qui si
    // riducono le righe a imponibile/imposta partendo dal prezzo NETTO (che è
    // ciò che viene salvato, anche quando a schermo si vede l'ivato), il resto
    // vive in domain/documents/utils/document-totals.util.
    const lines = this.lines.controls.flatMap((line, index) => {
      if (this.lineIsEmpty(line) || this.isReferenceLine(line)) {
        return [];
      }
      const vatRate = this.lineVatRate(index);
      // L'imponibile arriva esatto: si arrotonda qui, una volta, e l'imposta
      // nasce dal valore esatto — è così che il totale torna al prezzo ivato
      // digitato (§sei decimali).
      const netExactMinor = this.lineNetExactMinor(index);
      return [
        {
          netMinor: Math.round(netExactMinor),
          vatMinor: lineVatFromNetExact(netExactMinor, vatRate),
          vatRate,
          countsVatInTotal: vatRate > 0,
        },
      ];
    });

    return computeDocumentTotals(
      lines,
      parseEffectiveDiscountPercent(this.form.controls.documentDiscountPercent.value),
      this.currency,
    );
  });

  /**
   * Cambio modalità prezzo dalla testata: converte i prezzi già inseriti
   * (netto↔ivato per aliquota di riga) così l'importo effettivo delle righe — e
   * i totali — non cambiano; muta solo come i valori sono interpretati.
   */
  protected togglePriceModeMenu(): void {
    this.priceModeMenuOpen.update((open) => !open);
  }

  protected setPriceMode(pricesIncludeVat: boolean): void {
    this.priceModeMenuOpen.set(false);
    if (pricesIncludeVat === this.pricesIncludeVat() || this.formReadOnly()) {
      return;
    }
    this.lines.controls.forEach((line, index) => {
      if (this.isReferenceLine(line)) {
        return;
      }
      const price = parseMoneyInput(line.controls.unitPrice.value, this.currency);
      const rate = this.lineVatRate(index);
      if (!price || price.amountMinor <= 0 || rate <= 0) {
        return;
      }
      const converted = pricesIncludeVat
        ? grossFromNetMinor(price.amountMinor, rate)
        : netFromGrossMinor(price.amountMinor, rate);
      line.controls.unitPrice.setValue(
        moneyToDecimalString({ amountMinor: converted, currencyCode: this.currency }).replace(
          '.',
          ',',
        ),
        { emitEvent: false },
      );
    });
    this.pricesIncludeVat.set(pricesIncludeVat);
    this.markFormDirty();
  }

  /**
   * Cambio listino: riscrive il prezzo di ogni riga col valore che quel listino
   * dà all'ARTICOLO — uguale per ogni taglia, come da modello.
   *
   * Un articolo senza valore per il listino scelto NON ripiega sul prezzo
   * articolo: la riga va a zero e l'avviso dice quale. Un ripiego silenzioso
   * farebbe uscire un documento a un prezzo che nessuno ha deciso, e nessuno se
   * ne accorgerebbe.
   */
  protected onListinoChange(value: string | null): void {
    const choice = parseListinoChoice(value);
    this.listinoChoice.set(choice);
    if (this.formReadOnly()) {
      return;
    }

    const missing: string[] = [];
    this.lines.controls.forEach((line, index) => {
      if (this.isReferenceLine(line) || !line.controls.variantId.value) {
        return;
      }
      const summary = this.lineVariantSummary(index);
      if (!summary) {
        return;
      }
      const price = listinoUnitPrice(summary, choice);
      if (!price) {
        missing.push(line.controls.productName.value.trim() || summary.title);
      }
      line.controls.unitPrice.setValue(
        this.priceFieldValue(price?.amountMinor ?? 0, this.lineVatRate(index)),
        { emitEvent: false },
      );
    });

    this.listinoWarnings.set(
      missing.length === 0
        ? []
        : [
            `${this.listinoLabel()}: nessun prezzo per ${missing.length === 1 ? 'l’articolo' : 'gli articoli'} ${missing.join(', ')}. ${missing.length === 1 ? 'La riga è rimasta' : 'Le righe sono rimaste'} a zero.`,
          ],
    );
    this.markFormDirty();
  }

  /** Nome del listino scelto, per gli avvisi. */
  private listinoLabel(): string {
    const value = this.listinoValue();
    return this.listinoOptions().find((option) => option.value === value)?.label ?? 'Listino';
  }

  // ── Netto memorizzato, netto o ivato a schermo ────────────────────────────
  //
  // La riga porta sempre il prezzo NETTO: è quello che si salva e da cui si
  // calcolano imposta e totali. La modalità dice solo come lo si vede e digita.

  /** Aliquota di una riga per riferimento (le versioni per indice sotto). */
  private lineRateOf(line: ReturnType<CustomerOrderFormComponent['createLine']>): number {
    return this.rateOfVatCodeId(line.controls.vatCodeId.value);
  }

  /** Aliquota di un Codice IVA: solo modalità standard espone imposta. */
  private rateOfVatCodeId(vatCodeId: string | null | undefined): number {
    const vatCode = vatCodeId ? this.vatCodeById().get(vatCodeId) : undefined;
    return vatCode && vatCode.calculationMode === 'standard' ? vatCode.ratePercent : 0;
  }

  /**
   * Valore digitato nella modalità corrente → netto da MEMORIZZARE, quindi
   * scorporato ESATTAMENTE: 123,97 ivati al 22% non hanno un netto intero, e
   * arrotondarlo qui li farebbe tornare 123,96 alla riapertura (§sei decimali).
   */
  private netFromDisplayed(minor: number, ratePercent: number): number {
    return this.pricesIncludeVat() && ratePercent > 0
      ? toStorableMinor(netFromGrossExact(minor, ratePercent))
      : minor;
  }

  /** Netto memorizzato → valore da mostrare nella modalità corrente. */
  private displayedFromNet(minor: number, ratePercent: number): number {
    return this.pricesIncludeVat() && ratePercent > 0
      ? grossFromNetMinor(minor, ratePercent)
      : minor;
  }

  /** Netto → stringa per il campo prezzo, nella modalità corrente. */
  private priceFieldValue(netMinor: number, ratePercent: number): string {
    const displayed = this.displayedFromNet(netMinor, ratePercent);
    return moneyToDecimalString({ amountMinor: displayed, currencyCode: this.currency }).replace(
      '.',
      ',',
    );
  }

  /** Prezzo unitario netto della riga, qualunque cosa mostri il campo. */
  private lineUnitNetMinor(index: number): number {
    const line = this.lines.at(index);
    const entered = parseMoneyInput(line.controls.unitPrice.value, this.currency);
    return this.netFromDisplayed(entered?.amountMinor ?? 0, this.lineVatRate(index));
  }

  /** Aliquota effettiva della riga (solo modalità standard, 0 altrimenti). */
  private lineVatRate(index: number): number {
    const vatCode = this.vatCodeById().get(this.lines.at(index).controls.vatCodeId.value);
    if (!vatCode || vatCode.calculationMode !== 'standard') {
      return 0;
    }
    const rate = Number(vatCode.ratePercent);
    return Number.isFinite(rate) && rate > 0 ? rate : 0;
  }

  /**
   * L'unità di misura della riga — **prima quella della riga**, poi quella
   * dell'articolo, poi `pz`.
   *
   * La precedenza era invertita, e la conseguenza non si vedeva: siccome
   * `Product.unitOfMeasure` non è mai vuoto, l'anagrafica vinceva sempre e
   * quello che il documento aveva salvato **non si vedeva mai**. Il valore
   * c'era, veniva scritto e riletto, e restava invisibile.
   *
   * Rovesciarla è la riga in cui la regola del «documento fotografia» entra in
   * vigore per l'unità di misura, esattamente come vale già per il prezzo: la
   * riga cattura il valore all'inserimento e se lo tiene, indipendente da come
   * l'anagrafica cambia dopo.
   */
  protected lineUnitOfMeasure(index: number): string {
    this.formValue();
    const summary = this.lineVariantSummary(index);
    return (
      this.lines.at(index)?.controls.unitOfMeasure.value.trim() ||
      summary?.unitOfMeasure?.trim() ||
      'pz'
    );
  }

  // ── Unità di misura di riga ────────────────────────────────────────────────
  //
  // L'elenco si carica UNA volta per maschera, non per cella: la cella sta su
  // ogni riga, e trenta righe non devono fare trenta chiamate uguali.
  private readonly unitOfMeasureOptionsService = inject(UnitOfMeasureOptionService);
  private readonly unitOfMeasureCatalog = this.unitOfMeasureOptionsService.options();
  protected readonly unitOfMeasureOptions = computed(() =>
    unitOfMeasureSelectOptions(this.unitOfMeasureCatalog()),
  );
  protected readonly unitManagerOpen = signal(false);
  /** La riga da cui è stato chiesto il pannello: ci torna l'unità creata. */
  private unitManagerLineIndex = -1;

  protected openUnitManager(index: number): void {
    this.unitManagerLineIndex = index;
    this.unitManagerOpen.set(true);
  }

  protected onUnitOptionsChanged(): void {
    this.unitOfMeasureOptionsService.reload();
  }

  /** Un'unità creata dal pannello si scrive da sé: è perché lo si è aperto. */
  protected onUnitOptionCreated(option: UnitOfMeasureOption): void {
    if (this.unitManagerLineIndex >= 0) {
      this.onLineUnitOfMeasureChange(this.unitManagerLineIndex, option.name);
    }
  }

  protected onLineUnitOfMeasureChange(index: number, value: string): void {
    if (this.formReadOnly()) {
      return;
    }
    this.lines.at(index).controls.unitOfMeasure.setValue(value.trim());
    this.markFormDirty();
  }

  // ── Vista mobile (mockup responsive v3) ───────────────────────────────────
  // Sotto lg la tabella lascia il posto a una lista di card: la testata si
  // divide in due pannelli apribili e ogni riga documento diventa una card che
  // si espande sui campi. Lo stato di apertura vive qui perché è vista, non
  // dato: nessun controllo del form ne dipende.

  // ── Testata mobile a due pannelli (reference Ordine cliente mobile) ───────
  // I pannelli sono il componente condiviso app-document-mobile-panel: lo
  // stato di apertura vive lì (initiallyOpen: aperto «Cliente e magazzino»,
  // chiuso «Dettagli documento»); qui restano solo i testi computati.

  /** Card riga aperta: una sola alla volta, come nel mockup. */
  protected readonly openLineCard = signal<number | null>(null);

  protected isLineCardOpen(index: number): boolean {
    return this.openLineCard() === index;
  }

  protected toggleLineCard(index: number): void {
    this.openLineCard.update((current) => (current === index ? null : index));
  }

  protected readonly mobileHeaderTitle = computed(() => {
    this.formValue();
    const customerId = this.form.controls.customerId.value;
    const selected = this.customerOptions().find((option) => option.value === customerId);
    return (
      selected?.label ||
      this.form.controls.customerFreeText.value.trim() ||
      (this.isManualUnload ? 'Nessun cliente' : 'Seleziona cliente')
    );
  });

  /** Dati che sbloccano le righe: stesso criterio del gate, letto al positivo. */
  protected readonly headerDataReady = computed(() => !this.headerGateActive());

  /**
   * Riepilogo del pannello «Cliente e magazzino». Finché i dati mancano fa da
   * intestazione, quando ci sono diventa il riepilogo di ciò che si è scelto.
   */
  protected readonly customerPanelTitle = computed(() =>
    this.headerDataReady() ? this.mobileHeaderTitle() : 'Cliente e magazzino',
  );

  protected readonly customerPanelSubtitle = computed(() => {
    if (!this.headerDataReady()) {
      return 'Seleziona i dati necessari per iniziare';
    }
    this.formValue();
    const locationId = this.form.controls.locationId.value;
    const location = this.locationOptions().find((option) => option.value === locationId)?.label;
    const documentDate = this.form.controls.documentDate.value;
    return [location, documentDate ? formatItalianInputDate(documentDate) : null]
      .filter((part): part is string => Boolean(part))
      .join(' · ');
  });

  /**
   * Riga di stato dentro il pannello: dice cosa manca, non come sbloccare le
   * righe — quello lo dice il banner sotto la testata, ed è un'altra frase.
   */
  protected readonly customerPanelStatus = computed(() => {
    if (this.headerDataReady()) {
      return 'Dati principali completi. Puoi aggiungere le righe.';
    }
    return this.isManualUnload
      ? 'La location è obbligatoria.'
      : 'Cliente e location sono obbligatori.';
  });

  /**
   * Riepilogo del pannello «Dettagli documento»: data · stato · pagamento.
   * Torna le parti separate invece della frase gia' montata: ognuna deve
   * andare a capo intera, e «Pagamento non indicato» spezzato a meta' non si
   * legge. Il puntino di separazione lo mette il CSS.
   */
  protected readonly detailsPanelSummaryParts = computed<readonly string[]>(() => {
    this.formValue();
    const documentDate = this.form.controls.documentDate.value;
    const parts: string[] = [
      documentDate ? formatItalianInputDate(documentDate) : 'Data non indicata',
    ];
    if (this.isOrder) {
      parts.push(this.stateBadgeLabel());
    }
    if (this.isSalesDdt) {
      const methodId = this.form.controls.paymentMethod.value;
      const method = this.paymentMethodOptions().find((option) => option.value === methodId)?.label;
      parts.push(method || 'Pagamento non indicato');
    } else if (!this.isManualUnload) {
      parts.push(this.form.controls.paymentTerms.value.trim() || 'Pagamento non indicato');
    }
    return parts;
  });

  /** «Impegna magazzino» come Sì/No: sulla card è una scelta, non una spunta. */
  protected onLineCommitsSelect(index: number, value: string): void {
    this.lines.at(index).controls.commitsStock.setValue(value === 'yes');
    this.markFormDirty();
  }

  protected validLinesCount(): number {
    this.formValue();
    return this.lines.controls.reduce((count, line, index) => {
      if (this.lineIsEmpty(line) || this.isReferenceLine(line)) {
        return count;
      }
      return count + (this.lineRowComplete(index) ? 1 : 0);
    }, 0);
  }

  protected totalPiecesCount(): number {
    this.formValue();
    return this.lines.controls.reduce((sum, line) => {
      if (this.lineIsEmpty(line) || this.isReferenceLine(line)) {
        return sum;
      }
      const qty = Number(line.controls.quantity.value);
      return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
    }, 0);
  }

  /** Riga completa: prodotto identificato e quantità > 0 (regola Arrivo merce). */
  protected lineRowComplete(index: number): boolean {
    const line = this.lines.at(index);
    if (this.lineIsEmpty(line)) {
      return true;
    }
    const hasProduct =
      Boolean(line.controls.variantId.value.trim()) ||
      Boolean(line.controls.productName.value.trim());
    const qty = Number(line.controls.quantity.value);
    return hasProduct && Number.isFinite(qty) && qty > 0;
  }

  protected lineFieldInvalid(index: number, field: 'productName' | 'quantity'): boolean {
    this.formValue();
    const line = this.lines.at(index);
    if (this.lineIsEmpty(line)) {
      return false;
    }
    if (field === 'quantity') {
      const qty = Number(line.controls.quantity.value);
      return !Number.isFinite(qty) || qty <= 0;
    }
    return !line.controls.variantId.value.trim() && !line.controls.productName.value.trim();
  }

  // ── Colonna IVA ─────────────────────────────────────────────────────────
  protected lineVatOptions(index: number): readonly SelectMenuOption[] {
    return vatOptionsIncludingSelected(
      this.salesVatOptions(),
      this.lines.at(index)?.controls.vatCodeId.value,
      this.vatCodeById(),
    );
  }

  protected lineVatValue(index: number): string {
    this.formValue();
    return this.lines.at(index)?.controls.vatCodeId.value ?? '';
  }

  protected lineVatTooltip(index: number): string {
    const vatCode = this.vatCodeById().get(this.lines.at(index).controls.vatCodeId.value);
    return vatCode ? vatCodeOptionLabel(vatCode) : 'Nessun Codice IVA';
  }

  protected onLineVatSelect(index: number, value: string | null): void {
    if (this.formReadOnly()) {
      return;
    }
    this.lines.at(index).controls.vatCodeId.setValue(value ?? '');
    this.markFormDirty();
  }

  // ── Autocomplete nome prodotto ──────────────────────────────────────────
  protected lineSuggestions(index: number): readonly VariantSummary[] {
    return this.productSuggest.suggestionsFor(index, this.suggestInputs(index));
  }

  protected lineSuggestionsOpen(index: number): boolean {
    return this.productSuggest.isOpenOn(index, this.suggestInputs(index));
  }

  private suggestInputs(index: number) {
    return { hasLinked: this.lineHasLinkedProduct(index), searched: this.searchedVariants() };
  }

  protected onLineProductNameChange(index: number, value: string): void {
    const line = this.lines.at(index);
    line.controls.productName.setValue(value);
    this.productSuggest.focusLine(index);
    this.variantSearchDraft.set(value);
    this.markFormDirty();
  }

  protected onLineProductFocus(index: number): void {
    this.productSuggest.focusLine(index);
    this.variantSearchDraft.set(this.lines.at(index).controls.productName.value);
  }

  protected onLineProductBlur(_index: number): void {
    // Ritardo per lasciar arrivare il click sulla voce del dropdown.
    setTimeout(() => this.clearProductAutocomplete(), MOBILE_PICK_GRACE_MS);
  }

  protected onProductSuggestionPick(lineIndex: number, variantId: string): void {
    this.onVariantSelect(lineIndex, variantId);
  }

  protected onProductSuggestionNavigate(direction: 'next' | 'prev'): void {
    const lineIndex = this.productSuggest.lineIndex();
    if (lineIndex === null) {
      return;
    }
    this.productSuggest.navigate(direction, this.lineSuggestions(lineIndex).length);
  }

  /** Esc chiude l'anteprima del nome e la scelta aperta da un codice. */
  protected onLineSearchEscape(_index: number): void {
    this.clearProductAutocomplete();
    this.codeLookup.clear();
  }

  private clearProductAutocomplete(): void {
    this.productSuggest.clear();
    this.variantSearchDraft.set('');
  }

  // ── Anteprima ricerca nella card mobile ─────────────────────────────────
  // Riusa gli stessi handler del desktop; il campo resta un formControl, gli
  // handler sono no-op in sola lettura (niente anteprima su ordini bloccati).
  protected onMobileProductFocus(index: number, input: HTMLElement): void {
    if (this.formReadOnly()) {
      return;
    }
    this.updateMobileSuggestPlacement(input);
    this.onLineProductFocus(index);
  }

  protected onMobileProductNameInput(index: number, input: HTMLInputElement): void {
    if (this.formReadOnly()) {
      return;
    }
    this.updateMobileSuggestPlacement(input);
    this.onLineProductNameChange(index, input.value);
  }

  /** Dettaglio compatto della voce suggerita (SKU · EAN · prezzo). */
  protected mobileSuggestionDetail(variant: VariantSummary): string {
    const parts: string[] = [];
    if (variant.sku) {
      parts.push(variant.sku);
    }
    if (variant.barcode) {
      parts.push(`EAN ${variant.barcode}`);
    }
    if (variant.sellingPrice.amountMinor > 0) {
      parts.push(formatMoney(variant.sellingPrice));
    }
    return parts.join(' · ');
  }

  /**
   * Sceglie il verso del dropdown: sotto il campo se lo spazio fino al fondo
   * del viewport basta, sopra altrimenti (col dock fisso e la tastiera aperta
   * lo spazio inferiore è spesso insufficiente).
   */
  private updateMobileSuggestPlacement(input: HTMLElement): void {
    if (typeof window === 'undefined') {
      return;
    }
    const rect = input.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    // Sotto servono il dropdown (max 16rem del pannello condiviso) più un
    // margine dal dock fisso.
    this.mobileSuggestAbove.set(viewportBottom - rect.bottom < 272);
  }

  // ── Celle codice (Cod. articolo / SKU / EAN): lookup esatto alla conferma ──
  //
  // Il campo codice NON cerca mentre si digita: si confronta col catalogo alla
  // conferma (Tab/Invio), per corrispondenza esatta. Ogni carattere digitato
  // invalida una scelta rimasta aperta, che si riferiva al valore di prima.

  protected onLineSkuChange(index: number, value: string): void {
    this.lines.at(index).controls.sku.setValue(value);
    this.codeLookup.clear();
    this.markFormDirty();
  }

  protected onLineBarcodeChange(index: number, value: string): void {
    this.lines.at(index).controls.barcode.setValue(value);
    this.codeLookup.clear();
    this.markFormDirty();
  }

  protected onLineArticleCodeChange(index: number, value: string): void {
    this.lines.at(index).controls.articleCode.setValue(value);
    this.codeLookup.clear();
    this.markFormDirty();
  }

  protected onLineCodeFocus(index: number, field: CustomerOrderCodeField): void {
    this.clearProductAutocomplete();
    if (this.codeLookup.isOpenOn(index, field)) {
      return;
    }
    this.codeLookup.clear();
  }

  protected onLineCodeBlur(index: number): void {
    if (this.codeLookup.isOpenOnLine(index)) {
      this.codeLookup.clear();
    }
  }

  /**
   * Conferma di un codice: si confronta col catalogo per corrispondenza esatta,
   * e gli esiti sono TRE — una aggancia, più d'una apre la scelta, nessuna
   * lascia il valore scritto e prosegue.
   *
   * Fino a 08/2026 qui si passava da `resolveVariantIdByCode`, che restituisce
   * `string | null` e **non può esprimere «eccone tre»**: un codice articolo
   * condiviso da più taglie tornava `null` e finiva in silenzio, indistinguibile
   * da un codice inesistente. Cioè la peggiore delle tre risposte — hai digitato
   * il codice giusto e il sistema si comporta come se non esistesse.
   *
   * Quella funzione resta alla **scansione** (`applyScannedVariant`), che ha
   * esigenze opposte: il lettore spara e va, e una scelta interromperebbe un
   * gesto che deve essere immediato.
   */
  protected commitCodeLookup(index: number, field: CustomerOrderCodeField, advance = true): void {
    const line = this.lines.at(index);
    if (line.controls.variantId.value) {
      if (advance) {
        this.focusNextLineField(index, field);
      }
      return;
    }
    const code = line.controls[field].value.trim();
    if (!code) {
      this.codeLookup.clear();
      if (advance) {
        this.focusNextLineField(index, field);
      }
      return;
    }
    // `locationId` non filtra i risultati: restringe soltanto le giacenze
    // mostrate alla sede del documento.
    const locationId = this.form.controls.locationId.value || undefined;
    this.codeLookupService
      .resolve(code, field, { locationId })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((outcome) => {
        if (outcome.kind === 'one') {
          // Il riepilogo arriva già dalla ricerca di conferma: fissarlo prima
          // evita che `onVariantSelect` lo richieda di nuovo al server.
          const summary = outcome.summary;
          if (summary) {
            this.pinnedVariants.update((current) => mergeVariantSummaries([summary], current));
          }
          this.onVariantSelect(index, outcome.variantId);
          this.codeLookup.clear();
          this.focusLineField(index, 'quantity');
          return;
        }
        if (outcome.kind === 'many') {
          this.codeLookup.open(index, field, outcome.matches);
          return;
        }
        // Nessuna corrispondenza: il valore resta scritto e la riga prosegue.
        // Non è un errore — può essere un articolo che non esiste ancora, e lo
        // stato si vede già (riga collegata mostra il nome, riga non collegata
        // no): un avviso che spiega uno stato visibile sarebbe di troppo.
        //
        // Col Tab si prosegue; con Invio si resta, ed è qui che la regola
        // «Invio non naviga» morde davvero: la cella è ancora un campo.
        this.codeLookup.clear();
        if (advance) {
          this.focusNextLineField(index, field);
        }
      });
  }

  /**
   * La stessa scelta, per la card mobile: quale campo la mostra e con quali
   * voci. Il testo lo compone qui — la card non formatta valute.
   *
   * `activeIndex` non viaggia: su mobile non ci sono frecce, quindi non c'è una
   * voce «evidenziata» da scorrere. Si sceglie toccando, e il pannello riceve
   * `null` invece di zero, che avrebbe acceso la prima voce come se fosse
   * preselezionata — un invito a premere Invio che qui non ha bersaglio.
   */
  protected mobileCodeChoice(index: number): LineCodeChoice | null {
    const field = this.codeLookup.field();
    if (!field || field === 'supplierCode' || !this.codeLookup.isOpenOnLine(index)) {
      return null;
    }
    return {
      field,
      items: this.codeLookup.matches().map((variant) => ({
        variantId: variant.variantId,
        title: variant.title,
        detail: this.mobileSuggestionDetail(variant),
      })),
    };
  }

  /**
   * Uscita da un campo codice della card. **Lo sfocamento conferma**, come Tab
   * sul desktop: perdere il fuoco su un telefono non è un caso — lo scorrimento
   * non lo toglie, e quando si perde è perché l'operatore ha toccato un altro
   * campo, gesto deliberato quanto un Tab.
   *
   * ⚠️ **Perché è un solo punto, e ritardato.** Qui si incrociano due
   * meccanismi che, presi separatamente, si pestano: la conferma allo
   * sfocamento e la grazia che lascia arrivare il tocco su una voce della
   * scelta. Toccando una voce, se lo sfocamento partisse per primo e
   * confermasse, partirebbe una **seconda ricerca** il cui esito «più d'una»
   * riaprirebbe la scelta **dopo** che il tocco l'aveva già risolta — un
   * pannello che ricompare da solo su una riga già agganciata.
   *
   * Quindi non si decide allo sfocamento: si decide **dopo la grazia**, in base
   * a cosa è successo davvero. I tre casi sono in ordine, e l'ordine conta.
   */
  protected onMobileCodeBlur(index: number, field: CustomerOrderCodeField): void {
    if (this.mobileCodeBlurTimer !== null) {
      clearTimeout(this.mobileCodeBlurTimer);
    }
    this.mobileCodeBlurTimer = setTimeout(() => {
      this.mobileCodeBlurTimer = null;
      // 1. Il tocco su una voce ha già agganciato la riga: non c'è altro da
      //    fare. `commitCodeLookup` rifiuterebbe da sé su riga agganciata —
      //    quindi nessuna prova distingue questo ramo — ma sposterebbe comunque
      //    il fuoco al campo successivo, cosa che oggi non si vede solo perché
      //    su mobile gli identificativi puntano alla tabella nascosta. Quando
      //    quel difetto sarà chiuso (§2.3 della mappa), il salto diventerebbe
      //    reale: un tocco su una voce non deve muovere il fuoco.
      if (this.lines.at(index)?.controls.variantId.value) {
        return;
      }
      // 2. Scelta aperta e non presa: si abbandona. Il valore digitato resta
      //    scritto — è la stessa risposta di «nessuna corrispondenza» — e NON
      //    si cerca di nuovo, che è ciò che la farebbe ricomparire.
      if (this.codeLookup.isOpenOn(index, field)) {
        this.codeLookup.clear();
        return;
      }
      // 3. Codice digitato e mai confermato: qui lo sfocamento fa la conferma.
      this.commitCodeLookup(index, field);
    }, MOBILE_PICK_GRACE_MS);
  }

  /** La scelta aperta da un codice: la voce presa aggancia la riga. */
  protected onCodeSuggestionPick(index: number, variantId: string): void {
    this.onVariantSelect(index, variantId);
    this.codeLookup.clear();
    this.focusLineField(index, 'quantity');
  }

  // ── Il giro del fuoco fra i campi riga ────────────────────────────────────
  //
  // Il meccanismo vive in `domain/`, identico alle altre maschere; qui restano
  // solo le nove cose che DIFFERISCONO. Prima erano sette metodi scritti a mano,
  // ~126 righe, che divergevano dalle gemelle senza che nulla lo dicesse.

  /**
   * ⚠️ Gli identificativi presuppongono che le due viste siano **esclusive**:
   * la card mobile ne ha di propri (`co-m-…`), e finché la tabella restava viva
   * sotto il breakpoint questa mappa puntava a un elemento nascosto — `.focus()`
   * su `display:none` è un no-op silenzioso. Vedi `ViewportService`.
   */
  protected readonly lineFocus = new DocumentLineFocusStore<CustomerOrderLineFocusField>({
    fields: [
      'articleCode',
      'sku',
      'barcode',
      'product',
      'quantity',
      // Rientrata nel giro: la cella era di sola lettura, quindi non c'era
      // niente su cui atterrare. Ora l'unità si scrive sulla riga.
      'unitOfMeasure',
      'unitPrice',
      'discount',
      // Rientrata nel giro: era fuori perché la cella IVA era un
      // `app-select-menu`, che non ha un campo con quell'identificativo. Ora è
      // la cella a ricerca-e-selezione, con un input vero.
      'vat',
      'serials',
    ],
    elementId: (index, field) =>
      ({
        articleCode: `co-code-${index}`,
        sku: `co-sku-${index}`,
        barcode: `co-barcode-${index}`,
        product: `co-product-${index}`,
        quantity: `co-qty-${index}`,
        unitOfMeasure: `co-uom-${index}`,
        unitPrice: `co-price-${index}`,
        discount: `co-discount-${index}`,
        vat: `co-vat-${index}`,
        serials: `co-serials-${index}`,
      })[field],
    isFieldEnabled: (index, field) => {
      // Su riga collegata i codici/nome sono bloccati: restano i campi dati.
      const bloccatoDaCollegamento =
        field === 'articleCode' || field === 'sku' || field === 'barcode' || field === 'product';
      if (this.lineHasLinkedProduct(index) && bloccatoDaCollegamento) {
        return false;
      }
      return this.isLineColumnVisible(field);
    },
    // Voce 4, e chiude il difetto 6: la riga «documento collegato» non rende
    // nessun controllo del giro, quindi finora il fuoco ci finiva sopra e
    // MORIVA — ogni ricerca per identificativo andava a vuoto.
    isRowSkipped: (index) => this.lineIsReference(index),
    isReadOnly: () => this.formReadOnly(),
    lineCount: () => this.lines.length,
    createLine: () => {
      this.lines.push(this.createLine());
      this.markFormDirty();
    },
    // Il tempismo del fuoco vive qui, come prima: la riga appena creata dev'essere
    // resa prima che qualcuno provi a metterci il fuoco dentro.
    onRowChange: (_index, then) => {
      setTimeout(then);
    },
    isLineEmpty: (index) => {
      const line = this.lines.at(index);
      return line ? this.lineIsEmpty(line) : true;
    },
    removeLine: (index) => this.removeLine(index),
  });

  protected focusLineField(index: number, field: CustomerOrderLineFocusField): void {
    this.lineFocus.focusField(index, field);
  }

  protected focusNextLineField(index: number, current: CustomerOrderLineFocusField): void {
    this.lineFocus.next(index, current);
  }

  /**
   * Tab/Shift+Tab deterministici sui campi dati della riga: mai su icone o
   * pulsanti di servizio; dall'ultimo campo si passa alla riga successiva.
   */
  protected openLineProductSearch(index: number): void {
    this.productSearchLineIndex.set(index);
    const line = this.lines.at(index);
    this.productSearchLaunchTerm.set(
      documentSearchLaunchTerm({
        linked: this.lineHasLinkedProduct(index),
        name: line.controls.productName.value,
        sku: line.controls.sku.value,
        articleCode: line.controls.articleCode.value,
        barcode: line.controls.barcode.value,
      }),
    );
    this.productSearchLaunchSeq.update((seq) => seq + 1);
    this.productSearchPanelOpen.set(true);
  }

  protected closeLineProductSearch(): void {
    this.productSearchPanelOpen.set(false);
    this.productSearchLineIndex.set(null);
  }

  /**
   * «Crea articolo» dal pannello di ricerca. La riga che ha aperto il pannello
   * porta già i dati digitati: la scheda nuova nasce precompilata con quelli.
   *
   * ⚠️ Apre il pannello **direttamente**, senza passare da `openProductAnagraphic`
   * — che pretendeva almeno SKU, EAN o nome e altrimenti rispondeva con un
   * errore. Da qui quella pretesa sarebbe sbagliata: da una riga vuota si deve
   * poter creare un articolo da zero, ed è uno dei modi previsti.
   *
   * Il pannello si chiude e l'anagrafica si apre **sopra** il documento, che
   * resta dov'è con quel che si è scritto finora.
   */
  /**
   * «Crea articolo» nel pannello di ricerca ha senso solo se la riga che l'ha
   * aperto è ancora libera. Su una riga già agganciata il pannello è di sola
   * consultazione: non stai cercando cosa aggiungere, stai guardando quello che
   * c'è.
   */
  protected readonly productSearchCanCreate = computed(() => {
    this.formValue();
    const index = this.productSearchLineIndex();
    return index === null ? true : !this.lineHasLinkedProduct(index);
  });

  protected onProductSearchCreate(): void {
    const index = this.productSearchLineIndex();
    this.closeLineProductSearch();
    if (index !== null) {
      this.productPanel.openForLine(index);
    }
  }

  /** Apri la scheda di un articolo trovato, senza aggiungerlo alla riga. */
  protected onProductSearchDetail(productId: string): void {
    const index = this.productSearchLineIndex();
    this.closeLineProductSearch();
    if (index !== null) {
      this.productPanel.openForEdit(index, productId);
    }
  }

  protected onLineProductSearchPick(variantId: string): void {
    const index = this.productSearchLineIndex();
    this.closeLineProductSearch();
    if (index != null) {
      this.onVariantSelect(index, variantId);
      this.pinVariantSummary(index, variantId);
    }
  }

  // ── Anagrafica prodotto dalla riga (stesso pannello dell'Arrivo merce) ──

  /** Prefill del nuovo articolo dai dati già digitati sulla riga. */
  protected readonly productPanelPrefill = computed<ProductEmbeddedCreatePrefill | null>(() => {
    if (this.productPanelMode() !== 'create') {
      return null;
    }
    const index = this.productPanelLineIndex();
    // «Crea prodotto» dallo scanner: nessuna riga di partenza, solo l'EAN.
    if (index == null) {
      const scanEan = this.scanCreateBarcode();
      return scanEan ? { barcode: scanEan } : null;
    }
    const line = this.lines.at(index);
    if (!line) {
      return null;
    }
    // ⛔ Riga già agganciata: NIENTE precompilato.
    //
    // I campi della riga sono quelli dell'articolo che c'è già — nome, SKU, EAN.
    // Copiarli in una scheda NUOVA produce un doppione vestito coi codici di un
    // altro: al salvataggio o sbatte contro l'unicità dello SKU, o nasce un
    // gemello. «Crea» deve partire pulito, sempre.
    if (line.controls.variantId.value) {
      return null;
    }
    // Nell'ordine cliente il prezzo digitato è il prezzo di VENDITA.
    const selling = parseMoneyInput(line.controls.unitPrice.value, this.currency);
    return {
      name: line.controls.productName.value.trim(),
      sku: line.controls.sku.value.trim() || undefined,
      barcode: line.controls.barcode.value.trim() || undefined,
      sellingPriceMajor: selling ? selling.amountMinor / 100 : null,
      defaultVatCodeId: line.controls.vatCodeId.value.trim() || null,
    };
  });

  protected openNewProduct(): void {
    this.productPanel.openForNewProduct();
  }

  /** Riga già collegata: apre la scheda del prodotto in modifica nel pannello. */
  protected closeProductPanel(): void {
    this.productPanel.close();
  }

  protected onProductCreatedFromPanel(event: { readonly variantId: string }): void {
    const lineIndex = this.productPanelLineIndex();
    if (lineIndex != null) {
      this.onVariantSelect(lineIndex, event.variantId);
      this.pinVariantSummary(lineIndex, event.variantId);
    } else if (this.scanCreateBarcode()) {
      // «Crea prodotto» dallo scanner (F6): aggiungi la variante creata come riga.
      this.applyScannedVariant(event.variantId, 1);
      this.scanCreateBarcode.set('');
    }
    this.closeProductPanel();
  }

  protected onProductUpdatedFromPanel(_event: { readonly productId: string }): void {
    const lineIndex = this.productPanelLineIndex();
    const variantId =
      lineIndex != null ? (this.lines.at(lineIndex)?.controls.variantId.value ?? null) : null;
    if (lineIndex != null && variantId) {
      this.pinVariantSummary(lineIndex, variantId);
    }
    this.closeProductPanel();
  }

  /** Articolo creato senza aggiungerlo: si propone l'aggancio alla riga. */
  protected onProductSavedWithoutAttach(event: { readonly variantId: string }): void {
    this.productPanel.savedWithoutAttach(event.variantId);
  }

  protected attachPendingVariantToLine(): void {
    const variantId = this.pendingAttachVariantId();
    let lineIndex = this.attachTargetLineIndex();
    if (variantId != null) {
      if (lineIndex == null) {
        // "Nuovo prodotto" dalla barra strumenti: si aggancia a una riga
        // vuota esistente o a una riga nuova in fondo.
        lineIndex = this.lines.controls.findIndex((line) => this.lineIsEmpty(line));
        if (lineIndex < 0) {
          this.lines.push(this.createLine());
          lineIndex = this.lines.length - 1;
        }
      }
      this.onVariantSelect(lineIndex, variantId);
      this.pinVariantSummary(lineIndex, variantId);
    }
    this.productPanel.dismissAttach();
  }

  protected dismissAttachPendingVariant(): void {
    this.productPanel.dismissAttach();
  }

  // ── Riga di inserimento rapido: scan/cerca con sintassi qta*codice ──────
  protected onQuickScanInput(value: string): void {
    this.quickScanDraft.set(value);
    this.quickScanError.set(null);
  }

  protected commitQuickScan(): void {
    if (this.formReadOnly() || this.quickScanBusy() || this.headerGateActive()) {
      return;
    }
    const raw = this.quickScanDraft().trim();
    if (!raw) {
      return;
    }
    const { quantity, code } = this.barcodeLookup.parseScanInput(raw);
    if (!code) {
      return;
    }
    this.quickScanDraft.set('');
    this.quickScanBusy.set(true);
    const locationId = this.form.controls.locationId.value || undefined;
    this.barcodeLookup
      .resolveVariantIdByCode(code, { locationId })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (variantId) => {
          this.quickScanBusy.set(false);
          if (variantId) {
            this.applyScannedVariant(variantId, quantity);
          } else {
            this.quickScanError.set(`Nessun articolo trovato per «${code}».`);
          }
          this.focusQuickScan();
        },
        error: () => {
          this.quickScanBusy.set(false);
          this.quickScanError.set(`Nessun articolo trovato per «${code}».`);
          this.focusQuickScan();
        },
      });
  }

  private applyScannedVariant(variantId: string, quantity: number): void {
    let targetIndex = this.lines.controls.findIndex(
      (line) => line.controls.variantId.value === variantId,
    );
    if (targetIndex >= 0) {
      const line = this.lines.at(targetIndex);
      const current = Number(line.controls.quantity.value) || 0;
      line.controls.quantity.setValue(current + quantity);
      this.markFormDirty();
      return;
    }
    targetIndex = this.lines.controls.findIndex((line) => this.lineIsEmpty(line));
    if (targetIndex < 0) {
      this.lines.push(this.createLine());
      targetIndex = this.lines.length - 1;
    }
    const line = this.lines.at(targetIndex);
    line.controls.variantId.setValue(variantId);
    line.controls.quantity.setValue(quantity);
    this.pinVariantSummary(targetIndex, variantId);
    this.markFormDirty();
  }

  private focusQuickScan(): void {
    setTimeout(() => this.quickScanInputRef()?.nativeElement.focus(), 0);
  }

  /**
   * Tap esplicito sul campo testo: sblocca la sola tastiera (readonly→editable)
   * nello stesso gesto utente, così su iOS si apre al primo tocco deliberato ma
   * mai automaticamente (la CTA primaria resta «Scansiona»).
   */
  protected enableMobileScanKeyboard(input: HTMLInputElement): void {
    if (this.formReadOnly() || this.quickScanBusy() || this.headerGateActive()) {
      return;
    }
    this.mobileScanEditing.set(true);
    input.readOnly = false;
    input.focus();
  }

  // ── Includi documento: inserimento righe dal documento di origine ───────
  protected openIncludePanel(): void {
    this.includeLaunchSeq.update((seq) => seq + 1);
    this.includePanelOpen.set(true);
  }

  protected closeIncludePanel(): void {
    this.includePanelOpen.set(false);
  }

  /**
   * Documento incluso: inserisce la riga di testo descrittiva col riferimento
   * all'origine (es. «Rif. Preventivo PRE-2026-0001 del 17/07/2026») seguita
   * dalle righe articolo copiate. I dati di testata restano quelli del
   * documento corrente.
   */
  protected onDocumentIncluded(payload: IncludedDocumentPayload): void {
    this.closeIncludePanel();

    // DDT vendita: l'Ordine cliente incluso viene AGGANCIATO al documento
    // (prompt DDT §LOGICA MAGAZZINO) — al salvataggio l'impegno dell'OC viene
    // rilasciato, il DDT scarica al suo posto e lo stato dell'OC si aggiorna.
    if (this.isSalesDdt && payload.kind === IncludeSourceKind.CustomerOrder) {
      const alreadyIncluded = this.includedOrders().some((order) => order.id === payload.sourceId);
      if (alreadyIncluded) {
        this._submitState.set({
          status: 'error',
          error: {
            kind: AppErrorKind.Validation,
            message:
              `L'ordine ${payload.sourceReference ?? ''} è già incluso in questo DDT.`.trim(),
          },
        });
        return;
      }
      this.includedOrders.update((orders) => [
        ...orders,
        {
          id: payload.sourceId,
          orderNumber: payload.sourceReference ?? 'Ordine cliente',
          lines: payload.lines.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
          })),
        },
      ]);
    }

    // DDT vendita: i dati di testata del documento incluso vengono riportati
    // se presenti; altrimenti restano quelli del DDT corrente (prompt DDT
    // §INCLUDI DOCUMENTO). Il cliente propaga anche pagamento e intestatario.
    if (this.isSalesDdt) {
      if (payload.sourceCustomerId) {
        this.form.controls.customerId.setValue(payload.sourceCustomerId);
      }
      if (payload.sourcePaymentTerms?.trim()) {
        this.form.controls.paymentTerms.setValue(payload.sourcePaymentTerms.trim());
      }
    }

    const groups: ReturnType<CustomerOrderFormComponent['createLine']>[] = [];

    const referenceLine = this.createLine();
    referenceLine.patchValue(
      { productName: payload.referenceText, quantity: 1, commitsStock: false, isReference: true },
      { emitEvent: false },
    );
    groups.push(referenceLine);

    for (const line of payload.lines) {
      const group = this.createLine();
      group.patchValue(
        {
          variantId: line.variantId ?? '',
          sku: line.sku ?? '',
          barcode: line.barcode ?? '',
          productName: line.description,
          quantity: line.quantity,
          // Prezzo memorizzato netto: mostrato nella modalità di questo documento.
          unitPrice:
            line.unitPriceMinor > 0
              ? this.priceFieldValue(line.unitPriceMinor, this.rateOfVatCodeId(line.vatCodeId))
              : '',
          discount: line.discount,
          vatCodeId: line.vatCodeId ?? '',
          commitsStock: Boolean(line.variantId),
        },
        { emitEvent: false },
      );
      groups.push(group);
    }

    // Le righe incluse entrano prima delle eventuali righe vuote in coda.
    let insertAt = this.lines.length;
    while (insertAt > 0 && this.lineIsEmpty(this.lines.at(insertAt - 1))) {
      insertAt -= 1;
    }
    groups.forEach((group, offset) => {
      this.lines.insert(insertAt + offset, group, { emitEvent: false });
    });
    // Summary anagrafiche per le righe collegate: codici, U.m., disponibilità.
    this.refreshAllLineSummaries();
    this.markFormDirty();
  }

  // ── Testata: select handlers ────────────────────────────────────────────
  /**
   * C'è un cliente scelto? Da qui dipende «Scheda cliente», che senza cliente
   * non ha niente da aprire.
   *
   * ⚠️ Tocca `formValue()` come ogni altra lettura del form in questa maschera,
   * e non è una formalità: il componente è OnPush, e un `FormControl` letto
   * direttamente nel template non lo sveglia. La condizione rimaneva vera o
   * falsa da quando la maschera si era disegnata, e il comando compariva —
   * quando compariva — solo perché qualcos'altro aveva fatto girare il
   * rilevamento.
   */
  protected hasCustomer(): boolean {
    this.formValue();
    return !!this.form.controls.customerId.value;
  }

  protected onCustomerSelect(value: string | null): void {
    this.form.controls.customerId.setValue(value ?? '');
    this.form.controls.customerId.markAsTouched();
  }

  protected onLocationSelect(value: string | null): void {
    this.form.controls.locationId.setValue(value ?? '');
  }

  protected onStateSelect(value: string | null): void {
    if (value === 'confirmed' || value === 'cancelled') {
      this.form.controls.status.setValue(value);
      this.markFormDirty();
    }
  }

  protected fieldInvalid(field: 'customerId' | 'locationId'): boolean {
    this.formValue();
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }

  /**
   * Il campo tiene ferme le righe: è obbligatorio, è ancora vuoto, e finché
   * resta così il documento non ha righe da compilare.
   *
   * Non è `fieldInvalid`, e la differenza conta: quello dice «hai provato a
   * salvare e questo campo è sbagliato», questo dice «il lavoro comincia da
   * qui». Il primo è un errore dell'operatore, il secondo è l'inizio.
   */
  protected fieldWaiting(field: 'customerId' | 'locationId'): boolean {
    this.formValue();
    if (!this.headerGateActive()) {
      return false;
    }
    if (field === 'customerId' && this.isManualUnload) {
      return false;
    }
    return !this.form.controls[field].value;
  }

  protected openCustomerDetail(): void {
    const id = this.form.controls.customerId.value;
    if (id) {
      void this.router.navigate(['/app/customers', id]);
    }
  }

  /** "Mostra avviso" dell'anagrafica cliente (proposta alla creazione documenti). */
  protected readonly customerAlert = computed(
    () => this.selectedCustomer()?.documentCreationAlert?.trim() || null,
  );

  private applyCustomerDefaults(): void {
    const customer = this.selectedCustomer();
    if (!customer || this.formReadOnly()) {
      return;
    }
    // Condizioni pagamento in testata: proposta, non vincolo.
    if (!this.form.controls.paymentTerms.value.trim() && customer.paymentTerms?.trim()) {
      this.form.controls.paymentTerms.setValue(customer.paymentTerms.trim());
    }
    if (this.isSalesDdt) {
      // Pagamento DDT: auto-compilato dal tipo di pagamento dell'anagrafica;
      // senza pagamento in anagrafica resta il dropdown a scelta libera.
      if (!this.form.controls.paymentMethod.value.trim() && customer.paymentMethod?.trim()) {
        this.form.controls.paymentMethod.setValue(customer.paymentMethod.trim());
      }
      // Incaricato trasporto proposto dall'anagrafica (campo dedicato cliente).
      const transportControls = this.form.controls.transport.controls;
      if (!transportControls.carrier.value.trim() && customer.transportResponsible?.trim()) {
        transportControls.carrier.setValue(customer.transportResponsible.trim());
      }
      this.applyRecipientFromCustomer(customer);
    }
    // Sconto anagrafica sulle righe già compilate senza sconto.
    const discount = customer.customerDiscount?.trim();
    if (discount) {
      for (const line of this.lines.controls) {
        if (!this.lineIsEmpty(line) && !line.controls.discount.value.trim()) {
          line.controls.discount.setValue(discount, { emitEvent: false });
        }
      }
    }
  }

  /**
   * Intestatario auto-compilato dall'anagrafica del cliente selezionato in
   * testata (prompt DDT §INDIRIZZI). Non sovrascrive un indirizzo editato a
   * mano; finché la destinazione coincide, segue l'intestatario.
   */
  private applyRecipientFromCustomer(customer: Customer): void {
    if (!this.recipientAutoFilled) {
      return;
    }
    const address = customer.address;
    const snapshot = {
      name: customerDisplayName(customer),
      address: [address?.line1, address?.line2].filter(Boolean).join(', '),
      zip: address?.postalCode ?? '',
      city: address?.city ?? '',
      province: address?.province ?? '',
      country: address?.country ?? '',
      fiscalCode: customer.taxCode ?? '',
      vatNumber: customer.vatNumber ?? '',
    };
    this.suppressRecipientAutofillTracking = true;
    try {
      this.form.controls.recipientAddress.patchValue(snapshot);
      if (!this.destinationDiffers()) {
        this.form.controls.destinationAddress.patchValue(snapshot, { emitEvent: false });
      }
    } finally {
      this.suppressRecipientAutofillTracking = false;
    }
  }

  /** «Cambia destinazione»: parte dall'intestatario e diventa editabile. */
  protected enableDifferentDestination(): void {
    if (!this.destinationDiffers()) {
      this.form.controls.destinationAddress.patchValue(
        this.form.controls.recipientAddress.getRawValue(),
        { emitEvent: false },
      );
      this.destinationDiffers.set(true);
      this.markFormDirty();
    }
  }

  /** Torna alla destinazione coincidente con l'intestatario. */
  protected resetDestinationToRecipient(): void {
    this.destinationDiffers.set(false);
    this.form.controls.destinationAddress.patchValue(
      this.form.controls.recipientAddress.getRawValue(),
      { emitEvent: false },
    );
    this.markFormDirty();
  }

  // ── Caricamento ordine esistente nel form ───────────────────────────────
  private patchFormFromOrder(order: SalesOrder): void {
    this.suppressDirtyMarking = true;
    try {
      this.form.patchValue({
        customerId: order.customerId ?? '',
        locationId: order.locationId ?? '',
        documentDate: order.placedAt ? toIsoDateLocal(new Date(order.placedAt)) : '',
        // Numerazione propria: da 12/08/2026 si vede e si modifica anche qui.
        documentNumber: order.number ?? null,
        series: order.series ?? '',
        externalRef: order.externalRef ?? '',
        // Data di giornata memorizzata a mezzanotte UTC: si prendono le prime
        // dieci cifre, come fa la maschera coi documenti del registro. La
        // conversione a data locale la sposterebbe di un giorno a ovest di
        // Greenwich, e sarebbe la data di un altro documento.
        expectedDeliveryDate: order.expectedDeliveryDate
          ? toIsoDateLocal(new Date(order.expectedDeliveryDate))
          : '',
        status: order.cancelledAt ? 'cancelled' : 'confirmed',
        paymentTerms: order.paymentTerms ?? '',
        notes: order.notes ?? '',
        documentDiscountPercent: order.documentDiscountPercent
          ? formatDiscountPercentValue(Number(order.documentDiscountPercent))
          : '',
      });
      this.lines.clear({ emitEvent: false });
      for (const line of order.lines) {
        const group = this.createLine();
        group.setValue(
          {
            id: line.id,
            variantId: line.variantId ?? '',
            // Popolato dalle summary appena caricate (refreshAllLineSummaries).
            articleCode: '',
            sku: line.sku,
            barcode: line.barcode ?? '',
            productName: line.title,
            quantity: line.quantity,
            unitPrice: moneyToDecimalString(line.unitPrice).replace('.', ','),
            discount: line.discount ?? '',
            vatCodeId: line.vatCodeId ?? '',
            commitsStock: line.commitsStock ?? true,
            unitOfMeasure: line.unitOfMeasure ?? '',
            serialNumbersText: '',
            isReference: line.isReference === true,
          },
          { emitEvent: false },
        );
        this.lines.push(group, { emitEvent: false });
      }
      if (this.lines.length === 0) {
        this.lines.push(this.createLine(), { emitEvent: false });
      }
      this.refreshAllLineSummaries();
      this.dirtySinceLastSave.set(false);
    } finally {
      this.suppressDirtyMarking = false;
    }
  }

  // ── Salvataggio (§CONTROLLI: avvisi, mai blocchi) ───────────────────────
  protected requestSaveDocument(): void {
    if (this.saving() || this.formReadOnly()) {
      return;
    }
    this.dropTrailingEmptyLines();
    // Testata minima salvabile: cliente + location (righe opzionali, P6).
    // Scarico manuale: basta la location — il cliente è facoltativo.
    this.form.controls.customerId.markAsTouched();
    this.form.controls.locationId.markAsTouched();
    const missingCustomer = !this.isManualUnload && !this.form.controls.customerId.value;
    if (missingCustomer || !this.form.controls.locationId.value) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: this.isQuote
            ? 'Seleziona cliente e location per salvare il preventivo.'
            : this.isSalesDdt
              ? 'Seleziona cliente e location per salvare il DDT vendita.'
              : this.isManualUnload
                ? 'Seleziona la location di scarico per salvare lo scarico manuale.'
                : "Seleziona cliente e location di origine per salvare l'ordine.",
        },
      });
      return;
    }
    if (this.isRegistryDocument) {
      // Il documento riceve il numero (PRE/DDT/SCA) al salvataggio: serve
      // almeno una riga valida (un documento di sola testata non è numerabile).
      if (this.validLinesCount() === 0) {
        this._submitState.set({
          status: 'error',
          error: {
            kind: AppErrorKind.Validation,
            message: this.isSalesDdt
              ? 'Aggiungi almeno una riga valida per salvare il DDT vendita.'
              : this.isManualUnload
                ? 'Aggiungi almeno una riga valida per salvare lo scarico manuale.'
                : 'Aggiungi almeno una riga valida per salvare il preventivo.',
          },
        });
        return;
      }
      if (this.isQuote) {
        // Nessun controllo disponibilità: il preventivo non impegna magazzino.
        this.saveDocument();
        return;
      }
      // DDT vendita e Scarico manuale: avviso disponibilità non bloccante
      // («Stai scaricando più di quanto disponibile. Continuare?»). Per il
      // DDT la catena prosegue con dati trasporto/indirizzi e copertura
      // ordini (prompt DDT §AVVISI); lo scarico salva direttamente.
      const unloadIssues = this.collectAvailabilityIssues();
      if (unloadIssues.length > 0) {
        this.availabilityIssues.set(unloadIssues);
        this.pendingSaveAfterAvailability = true;
        this.availabilityDialogOpen.set(true);
        return;
      }
      if (this.isManualUnload) {
        this.saveDocument();
        return;
      }
      this.checkIncompleteDataThenSave();
      return;
    }
    // Controllo disponibilità pre-salvataggio: riepilogo righe critiche,
    // l'operatore decide (correggi subito / salva comunque) — mai blocco.
    if (this.form.controls.status.value === 'confirmed') {
      const issues = this.collectAvailabilityIssues();
      if (issues.length > 0) {
        this.availabilityIssues.set(issues);
        this.pendingSaveAfterAvailability = true;
        this.availabilityDialogOpen.set(true);
        return;
      }
    }
    this.saveDocument();
  }

  private collectAvailabilityIssues(): readonly AvailabilityIssue[] {
    const issues: AvailabilityIssue[] = [];
    this.lines.controls.forEach((line, index) => {
      if (this.lineIsEmpty(line)) {
        return;
      }
      if (this.lineExceedsAvailability(index)) {
        issues.push({
          lineNumber: index + 1,
          label:
            line.controls.sku.value.trim() ||
            line.controls.productName.value.trim() ||
            `Riga ${index + 1}`,
          requested: Number(line.controls.quantity.value) || 0,
          available: Math.max(0, this.lineEffectiveAvailable(index) ?? 0),
        });
      }
    });
    return issues;
  }

  protected confirmAvailabilityDialog(): void {
    this.availabilityDialogOpen.set(false);
    if (this.pendingSaveAfterAvailability) {
      this.pendingSaveAfterAvailability = false;
      if (this.isSalesDdt) {
        // La catena avvisi DDT prosegue: dati incompleti → copertura ordini.
        this.checkIncompleteDataThenSave();
        return;
      }
      this.saveDocument();
    }
  }

  protected dismissAvailabilityDialog(): void {
    this.availabilityDialogOpen.set(false);
    this.pendingSaveAfterAvailability = false;
  }

  // ── DDT vendita: avvisi pre-salvataggio (prompt DDT §AVVISI) ────────────

  /**
   * Dati trasporto/indirizzi «non compilati» (per l'avviso pre-salvataggio).
   * La regola è condivisa con la stampa e con la Fattura accompagnatoria
   * (document-transport.util): qui si passano solo i valori correnti del form.
   */
  private ddtDataIncomplete(): boolean {
    const transport = this.form.controls.transport.getRawValue();
    const recipient = this.form.controls.recipientAddress.getRawValue();
    const destination = this.destinationDiffers()
      ? this.form.controls.destinationAddress.getRawValue()
      : recipient;
    return transportDataIncomplete(DocumentType.SalesDdt, {
      transportCausal: transport.causal,
      transportPort: transport.port,
      transportCarrier: transport.carrier,
      transportPackagesCount: transport.packagesCount,
      transportGoodsAspect: transport.goodsAspect,
      recipientAddress: recipient,
      destinationAddress: destination,
    });
  }

  private checkIncompleteDataThenSave(): void {
    if (this.ddtDataIncomplete()) {
      this.incompleteDataDialogOpen.set(true);
      return;
    }
    this.checkPartialCoverageThenSave();
  }

  /** «Sì»: procedere lo stesso con dati incompleti. */
  protected confirmIncompleteDataDialog(): void {
    this.incompleteDataDialogOpen.set(false);
    this.checkPartialCoverageThenSave();
  }

  /** «No» / «Annulla»: si resta in maschera per completare i dati. */
  protected dismissIncompleteDataDialog(): void {
    this.incompleteDataDialogOpen.set(false);
  }

  /**
   * Copertura degli ordini inclusi: quantità per variante delle righe DDT,
   * allocate in sequenza sugli ordini (stessa regola del backend). Gli ordini
   * non coperti del tutto diventeranno «Parzialmente concluso».
   */
  private computePartialOrders(): readonly { id: string; orderNumber: string }[] {
    const included = this.includedOrders();
    if (included.length === 0) {
      return [];
    }
    const remainingByVariant = new Map<string, number>();
    for (const line of this.lines.controls) {
      const variantId = line.controls.variantId.value;
      const quantity = Number(line.controls.quantity.value) || 0;
      if (variantId && quantity > 0 && !this.lineIsEmpty(line)) {
        remainingByVariant.set(variantId, (remainingByVariant.get(variantId) ?? 0) + quantity);
      }
    }
    const partials: { id: string; orderNumber: string }[] = [];
    for (const order of included) {
      let fullyCovered = true;
      for (const line of order.lines) {
        if (!line.variantId || line.quantity <= 0) {
          continue;
        }
        const remaining = remainingByVariant.get(line.variantId) ?? 0;
        const allocated = Math.min(remaining, line.quantity);
        remainingByVariant.set(line.variantId, remaining - allocated);
        if (allocated < line.quantity) {
          fullyCovered = false;
        }
      }
      if (!fullyCovered) {
        partials.push({ id: order.id, orderNumber: order.orderNumber });
      }
    }
    return partials;
  }

  private checkPartialCoverageThenSave(): void {
    const partials = this.computePartialOrders();
    if (partials.length > 0) {
      this.partialOrderNumbers.set(partials.map((order) => order.orderNumber));
      this.pendingPartialOrderIds = partials.map((order) => order.id);
      this.partialOrdersDialogOpen.set(true);
      return;
    }
    this.saveDocument();
  }

  /** «Sì»: salva e forza a Concluso gli ordini parzialmente evasi. */
  protected confirmPartialOrdersDialog(): void {
    this.partialOrdersDialogOpen.set(false);
    const orderIds = this.pendingPartialOrderIds;
    this.pendingPartialOrderIds = [];
    this.saveDocument(() => this.forceConcludeOrders(orderIds));
  }

  /** «No»: salva lasciando gli ordini in «Parzialmente concluso». */
  protected declinePartialOrdersDialog(): void {
    this.partialOrdersDialogOpen.set(false);
    this.pendingPartialOrderIds = [];
    this.saveDocument();
  }

  /** «Annulla»: nessun salvataggio, si resta in maschera. */
  protected dismissPartialOrdersDialog(): void {
    this.partialOrdersDialogOpen.set(false);
    this.pendingPartialOrderIds = [];
  }

  private forceConcludeOrders(orderIds: readonly string[]): void {
    for (const orderId of orderIds) {
      this.salesOrderService
        .forceConcludeManualOrder(orderId)
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          error: () => {
            this._submitState.set({
              status: 'error',
              error: {
                kind: AppErrorKind.Unknown,
                message:
                  'DDT salvato, ma non è stato possibile forzare a Concluso un ordine incluso.',
              },
            });
          },
        });
    }
  }

  private buildSavePayload(): SaveManualOrderInput {
    const value = this.form.getRawValue();
    const lines: SaveManualOrderLineInput[] = [];
    for (const line of this.lines.controls) {
      const raw = line.getRawValue();
      if (this.lineIsEmpty(line)) {
        continue;
      }
      const unitPrice = parseMoneyInput(raw.unitPrice, this.currency);
      lines.push({
        id: raw.id || undefined,
        variantId: raw.variantId || undefined,
        sku: raw.sku.trim() || undefined,
        barcode: raw.barcode.trim() || undefined,
        title: raw.productName.trim() || raw.sku.trim() || 'Articolo',
        quantity: Number(raw.quantity) || 0,
        unitPriceMinor: unitPrice?.amountMinor ?? 0,
        discount: raw.discount.trim() || undefined,
        vatCodeId: raw.vatCodeId || undefined,
        commitsStock: raw.commitsStock,
        unitOfMeasure: this.lineUnitOfMeasureRaw(raw.unitOfMeasure),
        isReference: raw.isReference,
      });
    }
    return {
      id: this.editOrderId() ?? undefined,
      customerId: value.customerId,
      locationId: value.locationId || undefined,
      documentDate: value.documentDate,
      series: this.numbering.chosenSeries(),
      // La proposta NON torna indietro come imposizione: viaggia solo il numero
      // che l'operatore ha digitato, o due che salvano insieme si
      // contenderebbero lo stesso. È la stessa regola del ramo documenti, qui
      // sopra: cambia il servizio, non la decisione.
      number: this.numbering.imposedNumber(),
      externalRef: value.externalRef.trim() || undefined,
      // Vuoto vuol dire svuotato — la testata viene riscritta per intero, e il
      // campo assente azzera quello che il documento portava.
      expectedDeliveryDate: value.expectedDeliveryDate || undefined,
      status: value.status,
      notes: value.notes.trim() || undefined,
      paymentTerms: value.paymentTerms.trim() || undefined,
      documentDiscountPercent: parseEffectiveDiscountPercent(value.documentDiscountPercent),
      lines,
    };
  }

  private lineUnitOfMeasureRaw(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  /**
   * Ogni percorso di salvataggio passa di qui — sono sei punti, fra la testata,
   * il dialogo disponibilità e la copertura ordini — ed è quindi il posto giusto
   * per il controllo cronologico (§4): messo più a monte andrebbe replicato sei
   * volte, e una delle sei prima o poi si dimenticherebbe.
   */
  private saveDocument(onSaved?: () => void): void {
    this.chronology.run(() => this.saveDocumentNow(onSaved));
  }

  private saveDocumentNow(onSaved?: () => void): void {
    if (this.isRegistryDocument) {
      this.saveRegistryDocument(onSaved);
      return;
    }
    // Righe opzionali (P6): l'ordine si salva anche con la sola testata;
    // gli impegni scatteranno al salvataggio successivo con righe.
    const payload = this.buildSavePayload();
    this._submitState.set({ status: 'saving' });
    this.salesOrderService
      .saveManualOrder(payload)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this._submitState.set({ status: 'idle' });
          this.saveWarnings.set(result.warnings);
          this.loadedOrder.set(result.order);
          const byVariant = new Map<string, number>();
          for (const row of result.reservations) {
            byVariant.set(
              row.variantId,
              (byVariant.get(row.variantId) ?? 0) + row.remainingQuantity,
            );
          }
          this.ownReservedByVariant.set(byVariant);
          this.dirtySinceLastSave.set(false);
          // Salvato l'ordine, i campi tornano protetti — decisione del 08/2026:
          // si salva, il documento si blocca, si resta dentro. Chi vuole
          // continuare sblocca, con lo stesso gesto di sempre.
          this.editLock.relock(result.order.id);
          if (!this.editOrderId()) {
            void this.router.navigate([this.listPath, result.order.id, 'edit'], {
              replaceUrl: true,
            });
          } else {
            this.patchFormFromOrder(result.order);
            this.refreshAllLineSummaries();
          }
          onSaved?.();
        },
        error: (err: unknown) => {
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  // ── Preventivo / DDT vendita: persistenza nel registro documenti ────────

  /** Righe documento dal form (stessa griglia dell'Ordine cliente). */
  private buildRegistryLines(): DocumentLineInputBody[] {
    const lines: DocumentLineInputBody[] = [];
    for (const line of this.lines.controls) {
      const raw = line.getRawValue();
      if (this.lineIsEmpty(line)) {
        continue;
      }
      const unitPrice = parseMoneyInput(raw.unitPrice, this.currency);
      const index = this.lines.controls.indexOf(line);
      lines.push({
        variantId: raw.variantId || undefined,
        sku: raw.sku.trim() || undefined,
        description: raw.productName.trim() || raw.sku.trim() || 'Riga documento',
        quantity: Number(raw.quantity) || 0,
        // Al server va il netto: se il campo mostrava l'ivato, si scorpora qui.
        unitPriceMinor: this.netFromDisplayed(unitPrice?.amountMinor ?? 0, this.lineVatRate(index)),
        // Le righe documento persistono la percentuale effettiva intera
        // (cascata "4+10%" → 14): stessa resa dei totali in anteprima.
        discountPercent: parseEffectiveDiscountPercent(raw.discount),
        vatCodeId: raw.vatCodeId || undefined,
        // Preventivo: mai effetti magazzino. DDT vendita e Scarico manuale:
        // la spunta «Scarica mag.» decide se la riga scarica la giacenza.
        loadsStock:
          this.isSalesDdt || this.isManualUnload
            ? raw.commitsStock && Boolean(raw.variantId)
            : false,
        // Seriali consumati dallo scarico (solo DDT, prodotti tracciati):
        // lo scarico manuale diretto non gestisce i numeri di serie.
        serialNumbers: this.isSalesDdt ? parseSerialNumbersText(raw.serialNumbersText) : undefined,
        isReference: raw.isReference,
      });
    }
    return lines;
  }

  /** Data+ora inizio trasporto in ISO (solo se la data è compilata). */
  private transportStartAtIso(): string | null {
    const transport = this.form.controls.transport.getRawValue();
    if (!transport.startDate) {
      return null;
    }
    const time = transport.startTime.trim() || '00:00';
    return `${transport.startDate}T${time}`;
  }

  /** Snapshot indirizzo dal gruppo form (null se completamente vuoto). */
  private addressFromGroup(
    group: ReturnType<CustomerOrderFormComponent['createAddressGroup']>,
  ): DocumentAddress | null {
    const raw = group.getRawValue();
    const entries = Object.entries(raw)
      .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
      .map(([key, value]) => [key, value.trim()]);
    return entries.length > 0 ? (Object.fromEntries(entries) as DocumentAddress) : null;
  }

  /** Campi testata specifici del DDT vendita (prompt DDT). */
  private buildSalesDdtHeaderFields() {
    const value = this.form.getRawValue();
    const transport = value.transport;
    const recipient = this.addressFromGroup(this.form.controls.recipientAddress);
    const destination = this.destinationDiffers()
      ? this.addressFromGroup(this.form.controls.destinationAddress)
      : recipient;
    const packagesCount = Number.parseInt(transport.packagesCount, 10);
    return {
      paymentMethod: value.paymentMethod.trim() || null,
      followedBySalesDoc: value.followedBySalesDoc,
      transportCausal: transport.causal.trim() || null,
      transportStartAt: this.transportStartAtIso(),
      transportPort: transport.port || null,
      transportCarrier: transport.carrier.trim() || null,
      transportPackagesCount: Number.isFinite(packagesCount) ? packagesCount : null,
      transportWeight: transport.weight.trim() || null,
      transportGoodsAspect: transport.goodsAspect.trim() || null,
      transportShippingCode: transport.shippingCode.trim() || null,
      transportTrackingCode: transport.trackingCode.trim() || null,
      recipientAddress: recipient,
      destinationAddress: destination,
      includedSalesOrderIds: this.includedOrders().map((order) => order.id),
    };
  }

  /**
   * Salvataggio Preventivo/DDT vendita: crea (o aggiorna) il documento e lo
   * conferma subito — il numero (PRE/DDT) arriva dal numeratore dedicato alla
   * prima conferma e il documento resta senza stato visibile in maschera.
   * Per il DDT la conferma esegue anche lo scarico giacenze e l'evasione
   * degli ordini agganciati (prompt DDT §LOGICA MAGAZZINO).
   */
  private saveRegistryDocument(onSaved?: () => void): void {
    const value = this.form.getRawValue();
    const editId = this.editOrderId();
    const lines = this.buildRegistryLines();
    this._submitState.set({ status: 'saving' });

    const ddtCreateFields = this.isSalesDdt ? this.buildSalesDdtHeaderFields() : null;

    // Scarico manuale: cliente facoltativo — anagrafica (customerId) oppure
    // testo libero solo-stampa (customerName, mai salvato in anagrafica).
    const freeTextCustomer =
      this.isManualUnload && !value.customerId ? value.customerFreeText.trim() : '';

    // Al server va SOLO il numero scelto dall'operatore. Finché in testata c'è
    // la proposta del numeratore il campo si omette: il numero lo assegna il
    // server, dentro la transazione che scrive il documento, e due maschere
    // aperte sullo stesso tipo non litigano più su un numero che nessuno dei
    // due ha digitato. Il numero letto qui è quello MOSTRATO prima dell'invio:
    // serve anche a dire, dopo, se il server ne ha assegnato un altro.
    const numberWasProposal = this.numberIsProposal();
    const shownNumber = value.documentNumber;
    const requestedNumber = this.numbering.imposedNumber();

    const save$ = editId
      ? this.documentService.updateDocument(editId, {
          documentDate: value.documentDate,
          // Presente solo se imposto in testata: un numero scelto a mano non
          // sposta il progressivo della serie. Assente = lo assegna il server.
          ...(requestedNumber !== undefined ? { number: requestedNumber } : {}),
          series: this.numbering.chosenSeries(),
          customerId: this.isManualUnload ? value.customerId || null : value.customerId,
          ...(this.isManualUnload ? { customerName: freeTextCustomer || null } : {}),
          locationId: value.locationId || undefined,
          // Campo esposto solo dallo Scarico manuale: sugli altri tipi non si
          // invia affatto, così il valore storico non viene azzerato.
          ...(this.isManualUnload ? { externalRef: value.externalRef.trim() || null } : {}),
          paymentTerms: value.paymentTerms.trim() || null,
          expectedDeliveryDate: value.expectedDeliveryDate || null,
          notes: value.notes.trim(),
          documentDiscountPercent: parseEffectiveDiscountPercent(value.documentDiscountPercent),
          pricesIncludeVat: this.pricesIncludeVat(),
          ...(ddtCreateFields ?? {}),
          lines,
        } satisfies UpdateDocumentBody)
      : this.documentService.createDocument({
          type: this.registryDocumentType,
          // Conversione proforma→DDT: collega l'origine (null sugli altri tipi).
          sourceDocumentId: this._sourceDocumentId() ?? undefined,
          documentDate: value.documentDate,
          // Presente solo se imposto in testata: un numero scelto a mano non
          // sposta il progressivo della serie. Assente = lo assegna il server.
          ...(requestedNumber !== undefined ? { number: requestedNumber } : {}),
          series: this.numbering.chosenSeries(),
          customerId: this.isManualUnload ? value.customerId || undefined : value.customerId,
          ...(freeTextCustomer ? { customerName: freeTextCustomer } : {}),
          locationId: value.locationId || undefined,
          ...(this.isManualUnload ? { externalRef: value.externalRef.trim() || undefined } : {}),
          paymentTerms: value.paymentTerms.trim() || undefined,
          expectedDeliveryDate: value.expectedDeliveryDate || undefined,
          notes: value.notes.trim() || undefined,
          currency: this.currency,
          documentDiscountPercent: parseEffectiveDiscountPercent(value.documentDiscountPercent),
          pricesIncludeVat: this.pricesIncludeVat(),
          ...(ddtCreateFields ? this.stripNullFields(ddtCreateFields) : {}),
          lines,
        } satisfies CreateDocumentBody);

    // Nascita-confermato (Fase 3): create e update producono già un documento
    // confermato in transazione — nessun passaggio di conferma successivo.
    save$.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (doc) => {
        this._submitState.set({ status: 'idle' });
        this.notifyAssignedNumberChanged(numberWasProposal, shownNumber, doc.number ?? null);
        this.loadedQuoteDoc.set(doc);
        this.dirtySinceLastSave.set(false);
        // Come per l'ordine: salvato il documento, i campi tornano protetti.
        this.editLock.relock(doc.id);
        if (!this.editOrderId()) {
          const editPath = this.isSalesDdt
            ? 'sales-ddt'
            : this.isManualUnload
              ? 'manual-unload'
              : 'quote';
          void this.router.navigate(['/app/documents', editPath, doc.id, 'edit'], {
            replaceUrl: true,
          });
        } else {
          this.reload();
        }
        onSaved?.();
      },
      error: (err: unknown) => {
        const conflict = documentNumberConflictOf(err);
        if (conflict) {
          // Numero già preso: si propone il primo libero invece dell'errore.
          this.numberConflictDialog.open(conflict);
          this._submitState.set({ status: 'idle' });
          return;
        }
        this._submitState.set({ status: 'error', error: this.toAppError(err) });
      },
    });
  }

  /**
   * Il numero assegnato non è quello che la maschera mostrava: lo si dice.
   * Succede quando la proposta («primo libero») viene presa da un altro
   * operatore mentre questo documento è in compilazione: il server ne assegna
   * uno buono e il salvataggio riesce, ma chi aveva già trascritto il numero
   * proposto altrove deve sapere che ora è un altro.
   *
   * Solo sulla proposta: un numero imposto dall'operatore e già occupato ha il
   * suo dialogo di conflitto, e questo avviso lo doppierebbe.
   */
  private notifyAssignedNumberChanged(
    wasProposal: boolean,
    shownNumber: number | null,
    assignedNumber: number | null,
  ): void {
    if (!wasProposal || shownNumber === null || assignedNumber === null) {
      return;
    }
    if (assignedNumber === shownNumber) {
      return;
    }
    this.toast.showInfo(
      `Salvato con il n. ${assignedNumber}: il ${shownNumber} è stato preso da un altro operatore.`,
    );
  }

  protected acknowledgeConflictNumber(): void {
    // Il numero nuovo si scrive in testata (specifica numerazione §3): il
    // digitato è perso comunque, e ridigitarlo a mano è l'occasione per un
    // errore di battitura e un secondo conflitto. Passa dallo store perché da
    // qui in poi quel numero è una SCELTA e deve viaggiare al salvataggio
    // invece di essere scambiato per una proposta e omesso: marcarlo è parte
    // dello scriverlo, e non è una cosa che ogni maschera debba ricordarsi.
    const nuovo = this.numberConflictDialog.acknowledge();
    if (nuovo != null) {
      this.numbering.onNumberChange(nuovo);
    }
  }

  /** POST creazione: i campi vuoti si omettono invece di inviare null. */
  private stripNullFields<T extends Record<string, unknown>>(
    fields: T,
  ): { [K in keyof T]?: Exclude<T[K], null> } {
    return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null)) as {
      [K in keyof T]?: Exclude<T[K], null>;
    };
  }

  /** Carica il documento del registro (quote/sales_ddt) nel form condiviso. */
  private patchFormFromRegistryDocument(doc: DocumentRecord): void {
    // Documento esistente (o base della duplica): si mostra la sua modalità.
    this.pricesIncludeVat.set(doc.pricesIncludeVat);
    this.suppressDirtyMarking = true;
    this.suppressRecipientAutofillTracking = true;
    try {
      this.form.patchValue({
        customerId: doc.customerId ?? '',
        // Scarico manuale: senza anagrafica il nome salvato è il testo libero.
        customerFreeText: doc.customerId ? '' : (doc.customerName ?? ''),
        locationId: doc.locationId ?? '',
        documentDate: doc.documentDate.slice(0, 10),
        documentNumber: doc.number ?? null,
        series: doc.series ?? '',
        externalRef: doc.externalRef ?? '',
        expectedDeliveryDate: doc.expectedDeliveryDate?.slice(0, 10) ?? '',
        status: 'confirmed',
        paymentTerms: doc.paymentTerms ?? '',
        notes: doc.notes ?? '',
        documentDiscountPercent:
          doc.documentDiscountPercent && doc.documentDiscountPercent > 0
            ? formatDiscountPercentValue(Number(doc.documentDiscountPercent))
            : '',
      });
      if (this.isSalesDdt) {
        this.patchSalesDdtHeader(doc);
      }
      this.lines.clear({ emitEvent: false });
      for (const line of doc.lines ?? []) {
        const group = this.createLine();
        group.setValue(
          {
            // Le righe documento vengono sostituite integralmente al PATCH:
            // nessun id riga da preservare (a differenza dell'ordine cliente).
            id: '',
            variantId: line.variantId ?? '',
            articleCode: '',
            sku: line.sku ?? '',
            barcode: '',
            productName: line.description,
            quantity: line.quantity,
            // Il documento ha memorizzato il netto: si rimostra nella modalità
            // con cui era stato compilato. L'aliquota è quella congelata sulla
            // riga, non quella che il Codice IVA ha oggi.
            unitPrice:
              line.unitPrice.amountMinor > 0
                ? this.priceFieldValue(
                    line.unitPrice.amountMinor,
                    line.vatSnapshot?.ratePercent ?? this.rateOfVatCodeId(line.vatCodeId),
                  )
                : '',
            discount:
              Number(line.discountPercent) > 0
                ? formatDiscountPercent(Number(line.discountPercent))
                : '',
            vatCodeId: line.vatCodeId ?? '',
            commitsStock: this.isSalesDdt || this.isManualUnload ? line.loadsStock : false,
            unitOfMeasure: '',
            serialNumbersText: (line.serialNumbers ?? []).join(', '),
            isReference: line.isReference === true,
          },
          { emitEvent: false },
        );
        this.lines.push(group, { emitEvent: false });
      }
      if (this.lines.length === 0) {
        this.lines.push(this.createLine(), { emitEvent: false });
      }
      this.refreshAllLineSummaries();
      this.dirtySinceLastSave.set(false);
    } finally {
      this.suppressDirtyMarking = false;
      this.suppressRecipientAutofillTracking = false;
    }
  }

  /** Testata DDT dal documento caricato: pagamento, trasporto, indirizzi, OC. */
  private patchSalesDdtHeader(doc: DocumentRecord): void {
    const startAt = doc.transportStartAt ?? '';
    this.form.patchValue({
      paymentMethod: doc.paymentMethod ?? '',
      followedBySalesDoc: doc.followedBySalesDoc ?? false,
      transport: {
        causal: doc.transportCausal ?? '',
        startDate: startAt ? startAt.slice(0, 10) : '',
        startTime: startAt.length >= 16 ? startAt.slice(11, 16) : '',
        port: doc.transportPort ?? '',
        carrier: doc.transportCarrier ?? '',
        packagesCount: doc.transportPackagesCount != null ? String(doc.transportPackagesCount) : '',
        weight: doc.transportWeight ?? '',
        goodsAspect: doc.transportGoodsAspect ?? '',
        shippingCode: doc.transportShippingCode ?? '',
        trackingCode: doc.transportTrackingCode ?? '',
      },
      recipientAddress: { ...this.emptyAddressValue(), ...(doc.recipientAddress ?? {}) },
      destinationAddress: { ...this.emptyAddressValue(), ...(doc.destinationAddress ?? {}) },
    });
    // L'intestatario salvato è uno snapshot: il cambio cliente non lo riscrive.
    this.recipientAutoFilled = !doc.recipientAddress;
    this.destinationDiffers.set(
      JSON.stringify(doc.destinationAddress ?? null) !==
        JSON.stringify(doc.recipientAddress ?? null) && doc.destinationAddress != null,
    );
    const hasTransportData = Boolean(
      doc.transportCausal ||
      doc.transportStartAt ||
      doc.transportPort ||
      doc.transportCarrier ||
      doc.transportPackagesCount != null ||
      doc.transportWeight ||
      doc.transportGoodsAspect ||
      doc.transportShippingCode ||
      doc.transportTrackingCode,
    );
    this.transportOpen.set(hasTransportData);
    // Ordini agganciati: righe ricaricate per il controllo di copertura.
    const linked = (doc.linkedSalesOrders ?? []).filter((order) => !order.cancelledAt);
    this.includedOrders.set(
      linked.map((order) => ({ id: order.id, orderNumber: order.orderNumber, lines: [] })),
    );
    for (const order of linked) {
      this.salesOrderService
        .getSalesOrderById(order.id)
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe((loaded) => {
          this.includedOrders.update((orders) =>
            orders.map((entry) =>
              entry.id === order.id
                ? {
                    ...entry,
                    lines: loaded.lines.map((line) => ({
                      variantId: line.variantId,
                      quantity: line.quantity,
                    })),
                  }
                : entry,
            ),
          );
        });
    }
  }

  private emptyAddressValue() {
    return {
      name: '',
      address: '',
      zip: '',
      city: '',
      province: '',
      country: '',
      fiscalCode: '',
      vatNumber: '',
    };
  }

  // ── Concludi ordine (§CONCLUDI ORDINE) ──────────────────────────────────
  //
  // Gli ordini da canale esterno sono esclusi, e non è una restrizione nuova:
  // il server li rifiuta già in fondo alla strada. Prima ci si arrivava però
  // dopo aver lavorato — col DDT si compilava tutto e l'errore usciva al
  // salvataggio, con la Fattura accompagnatoria il rifiuto veniva ingoiato dal
  // frontend e restava una fattura vuota senza spiegazione. Meglio non poter
  // iniziare che scoprire a metà di aver lavorato per niente; il perché lo dice
  // il banner in testa al documento.
  protected readonly canConclude = computed(
    () =>
      this.isOrder &&
      this.isEditMode() &&
      !this.isExternalOrder() &&
      this.orderState() === ManualOrderState.Confirmed &&
      !this.dirtySinceLastSave() &&
      this.unloadTypeOptions().length > 0,
  );

  protected toggleConcludeMenu(): void {
    this.concludeMenuOpen.update((open) => !open);
  }

  protected concludeWith(documentType: string): void {
    const orderId = this.editOrderId();
    if (!orderId) {
      return;
    }
    this.concludeMenuOpen.set(false);
    // Generazione = «apre il form di destinazione precompilato»: nessun
    // documento nasce a monte. Si apre il form (DDT o Fattura accompagnatoria)
    // con l'ordine agganciato (param `includeOrder`); il salvataggio del form
    // crea+conferma il documento, scarica e conclude l'ordine, nella sua
    // transazione.
    const targetRoute = this.concludeTargetRoute(documentType as DocumentType);
    if (targetRoute) {
      void this.router.navigate([targetRoute], { queryParams: { includeOrder: orderId } });
    }
  }

  /** Rotta del form di destinazione per «Concludi ordine», o null (legacy). */
  private concludeTargetRoute(documentType: DocumentType): string | null {
    switch (documentType) {
      case DocumentType.SalesDdt:
        return '/app/documents/sales-ddt/new';
      case DocumentType.InvoiceAccompanying:
        return '/app/documents/fattura-accompagnatoria/new';
      default:
        return null;
    }
  }

  // ── DDT vendita: Genera documento (Bozza fattura / Proforma, §GENERAZIONE) ──
  protected readonly canGenerateDocuments = computed(
    () => this.isSalesDdt && this.isEditMode() && !this.dirtySinceLastSave(),
  );

  protected readonly generateTargetOptions: readonly SelectMenuOption[] = [
    { value: DocumentType.InvoiceDraft, label: 'Bozza fattura' },
    { value: DocumentType.Proforma, label: 'Proforma' },
  ];

  protected toggleGenerateMenu(): void {
    this.generateMenuOpen.update((open) => !open);
  }

  protected generateFromDdt(targetType: string): void {
    const documentId = this.editOrderId();
    if (!documentId || this.generating()) {
      return;
    }
    this.generateMenuOpen.set(false);
    // Generazione = «apre il form di destinazione precompilato»: si naviga al
    // form nuovo (fattura/proforma) con il DDT come origine, senza creare nulla.
    const targetRoute = this.generateTargetRoute(targetType as DocumentType);
    if (!targetRoute) {
      return;
    }
    void this.router.navigate([targetRoute], { queryParams: { fromDocument: documentId } });
  }

  private generateTargetRoute(targetType: DocumentType): string | null {
    switch (targetType) {
      case DocumentType.InvoiceDraft:
        return '/app/documents/fattura/new';
      case DocumentType.Proforma:
        return '/app/documents/proforma/new';
      default:
        return null;
    }
  }

  // ── Uscita con modifiche non salvate ────────────────────────────────────

  /**
   * Messaggio del dialogo di uscita: un ordine Concluso/Parzialmente concluso
   * è collegato a un documento di scarico — l'avviso lo segnala e chiede cosa
   * fare (prompt DDT §LOGICA MAGAZZINO).
   */
  protected readonly exitDialogMessage = computed(() => {
    if (this.isOrder && this.isSettledOrder()) {
      const linked = this.loadedOrder()?.linkedDocument;
      const ref = linked?.reference ? ` ${linked.reference}` : '';
      return (
        `Questo ordine è collegato al documento di trasporto${ref}: le modifiche NON aggiornano ` +
        'il documento già emesso. Vuoi salvare comunque le modifiche prima di chiudere?'
      );
    }
    return 'Ci sono modifiche non salvate. Vuoi salvarle prima di chiudere?';
  });

  canDeactivate(): boolean | Promise<boolean> {
    if (!this.dirtySinceLastSave() || this.formReadOnly()) {
      return true;
    }
    this.exitDialogOpen.set(true);
    return new Promise<boolean>((resolve) => {
      this.pendingDeactivate = resolve;
    });
  }

  protected cancelExitDialog(): void {
    this.exitDialogOpen.set(false);
    this.pendingDeactivate?.(false);
    this.pendingDeactivate = null;
  }

  protected confirmExitWithoutSaving(): void {
    this.exitDialogOpen.set(false);
    this.dirtySinceLastSave.set(false);
    this.pendingDeactivate?.(true);
    this.pendingDeactivate = null;
  }

  protected confirmExitSaveDocument(): void {
    this.saveDocument(() => {
      this.exitDialogOpen.set(false);
      this.pendingDeactivate?.(true);
      this.pendingDeactivate = null;
    });
  }

  /**
   * "Chiudi" (P7): con modifiche non salvate la conferma appare SEMPRE,
   * direttamente dal pulsante — senza affidarsi solo al guard di route
   * (che resta attivo per back del browser e navigazioni esterne).
   */
  protected cancel(): void {
    if (this.dirtySinceLastSave() && !this.formReadOnly()) {
      this.exitDialogOpen.set(true);
      this.pendingDeactivate = (allow) => {
        if (allow) {
          this.navigateToList();
        }
      };
      return;
    }
    this.navigateToList();
  }

  /** Uscita del form: indietro nella cronologia, o la lista di provenienza. */
  private navigateToList(): void {
    this.navHistory.backOr(this.isRegistryDocument ? this.registryListPath : this.listPath);
  }

  protected reload(): void {
    this.loadTick.update((tick) => tick + 1);
  }

  private markFormDirty(): void {
    if (!this.suppressDirtyMarking && !this.formReadOnly()) {
      this.dirtySinceLastSave.set(true);
    }
  }

  private toAppError(err: unknown): AppError {
    return isAppError(err) ? err : mapHttpErrorToAppError(err);
  }

  /**
   * Le righe vuote in coda si SCARTANO al salvataggio, non si segnalano.
   *
   * Le crea la navigazione stessa — Tab o ↓ dall'ultimo campo dell'ultima riga
   * — e basta arrivarci per sbaglio perché in fondo al documento resti una riga
   * che nessuno ha compilato. Prima il salvataggio la trattava come una riga da
   * completare («manca l'articolo») e non partiva finché non la si cancellava a
   * mano: si chiedeva all'operatore di rimediare a qualcosa che aveva fatto la
   * maschera. (Difetto segnalato dal proprietario, 11/08/2026.)
   *
   * Solo in coda e solo vuote: una riga vuota in mezzo l'ha lasciata lì
   * qualcuno, e quella va segnalata. La regola vive in `domain/` — è la stessa
   * per tutte le maschere, e scritta tre volte divergerebbe.
   */
  private dropTrailingEmptyLines(): void {
    if (this.formReadOnly()) {
      return;
    }
    const indices = trailingEmptyLineIndices(this.lines.length, (index) => {
      const line = this.lines.at(index);
      return line ? this.lineIsEmpty(line) : true;
    });
    if (indices.length === 0) {
      return;
    }
    for (const index of indices) {
      this.lines.removeAt(index, { emitEvent: false });
    }
    this.lines.updateValueAndValidity();
  }
}
