import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  concatMap,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  from,
  last,
  map,
  of,
  startWith,
  switchMap,
  defaultIfEmpty,
  toArray,
  type Observable,
} from 'rxjs';
import type { Subscription } from 'rxjs';
import { take } from 'rxjs';

import { NavigationHistoryService } from '@core/services/navigation-history.service';
import type { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import type { AppError } from '@core/models/app-error.model';
import type { Money } from '@core/models/common.model';
import type { LinkedSupplierOrderLineContext } from '@core/models/document.model';
import { CausalGenerationMode, DocumentStatus, DocumentType } from '@core/models/document.model';
import type { DocumentRecord, DocumentTypeSetting } from '@core/models/document.model';
import { isConfirmedEditableDocumentStatus } from '@core/models/document.model';
import { COMMON_UNIT_OF_MEASURE } from '@core/models/product-catalog.model';
import {
  formatVatRate,
  isPurchaseVatCode,
  vatCodeOptionLabel,
  type PurchaseCostEntryMode,
  type VatCode,
} from '@core/models/vat-code.model';
import { BarcodeLookupService } from '@domain/products/services/barcode-lookup.service';
import { BreadcrumbLabelService } from '@core/services/breadcrumb-label.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import type { PaymentOption } from '@core/models/payment-option.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { toLocationSelectOptions } from '@core/utils/location-select-options.util';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  moneyToDecimalString,
  parseMoneyInput,
} from '@core/utils/money.util';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import { documentNumberConflictOf } from '@core/models/document-number-conflict.util';
import { mapHttpErrorToAppError } from '@core/interceptors/http-error.mapper';
import {
  formatDiscountPercentValue,
  parseEffectiveDiscountPercent,
} from '@core/utils/discount-percent.util';
import type { Supplier } from '@core/models/supplier.model';
import { normalizeSku } from '@domain/products/models/product-form.validators';
import { ProductService } from '@domain/products/services/product.service';
import {
  findVariantSummaryById,
  mergeVariantSummaries,
} from '@domain/products/utils/variant-summary-search.util';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import { SupplierFormFieldsComponent } from '@domain/suppliers/components/supplier-form-fields/supplier-form-fields.component';
import {
  createSupplierFormGroup,
  mapSupplierFormToInput,
  resetSupplierFormGroup,
} from '@domain/suppliers/utils/supplier-form.util';
import { SupplierOrderService } from '@domain/supplier-orders/services/supplier-order.service';
import { SupplierOrderStatus, type SupplierOrder } from '@core/models/supplier-order.model';
import { ProductLabelPrintService } from '@domain/products/services/product-label-print.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { DocumentNumberFieldComponent } from '@shared/components/document-number-field/document-number-field.component';
import { DocumentSeriesManagerDialogComponent } from '@domain/documents/components/document-series-manager-dialog/document-series-manager-dialog.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { HoverTooltipComponent } from '@shared/components/hover-tooltip/hover-tooltip.component';
import { LocationSuggestionHintComponent } from '@shared/components/location-suggestion-hint/location-suggestion-hint.component';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { TableViewId } from '@shared/table-columns/table-column.model';
import { TableColumnResizeDirective } from '@shared/directives/table-column-resize.directive';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { formatItalianInputDate, toIsoDateLocal } from '@shared/utils/calendar.util';

import { TenantFeatureSettingsService } from '@domain/tenant/services/tenant-feature-settings.service';
import type { TenantFeatureSettings } from '@domain/tenant/models/tenant-feature-settings.model';
import { ProductFormComponent } from '@domain/products/product-form.component';

import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import type { VariantByCodeDto } from '@domain/products/models/product.dto';
import { GoodsReceiptLineCardComponent } from './components/goods-receipt-line-card/goods-receipt-line-card.component';
import { DocumentLineCodeCellComponent } from '@domain/documents/components/document-line-code-cell/document-line-code-cell.component';
import { DocumentMobilePanelComponent } from '@domain/documents/components/document-mobile-panel/document-mobile-panel.component';
import { DocumentLineProductCellComponent } from '@domain/documents/components/document-line-product-cell/document-line-product-cell.component';
import { DocumentProductSearchPanelComponent } from '@domain/documents/components/document-product-search-panel/document-product-search-panel.component';
import {
  GOODS_RECEIPT_LINE_COLUMNS,
  GOODS_RECEIPT_LINE_PRESETS,
  GOODS_RECEIPT_LINES_VIEW,
  normalizeGoodsReceiptColumnId,
} from './models/goods-receipt-line-columns.config';
import { DocumentAttachmentsPanelComponent } from './components/document-attachments-panel/document-attachments-panel.component';
import {
  documentReferenceLabel,
  documentStatusDisplayLabel,
  documentStatusDisplayTone,
} from '@domain/documents/models/document-labels.util';
import { isGoodsReceiptDocumentType } from './models/document-goods-receipt.util';
import { renderCausalTemplate } from './models/causal-template.util';
import type { ExternalDocumentType } from './models/external-document-type.model';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import type { DocumentCounterView } from '@domain/documents/models/document-counter.model';
import { DocumentSettingsService } from './services/document-settings.service';
import { ExternalDocumentTypeService } from './services/external-document-type.service';
import type {
  GoodsReceiptCreatedProductApiRow,
  SaveGoodsReceiptBody,
  SaveGoodsReceiptNewProductBody,
} from '@domain/documents/services/document-api.mapper';
import { parseSerialNumbersText } from '@domain/documents/utils/serial-numbers-input.util';
import {
  GoodsReceiptCsvParseError,
  parseGoodsReceiptLinesCsv,
  type GoodsReceiptCsvLine,
} from './utils/goods-receipt-lines-csv.util';
import {
  GOODS_RECEIPT_SORTABLE_LINE_COLUMNS,
  compareGoodsReceiptLines,
  type GoodsReceiptLineSortColumn,
} from './utils/goods-receipt-line-sort.util';
import {
  buildVatSummary,
  computeVatLineAmounts,
  entryIncludesVat,
  grossFromNetMinor,
  netFromGrossMinor,
  vatInputFromLegacyRate,
  vatInputFromVatCode,
  type VatComputationInput,
  type VatLineAmounts,
} from '@domain/documents/utils/document-vat.util';
import { DocumentNumberConflictStore } from '@domain/documents/state/document-number-conflict.store';
import { DocumentPrefillErrorStore } from '@domain/documents/state/document-prefill-error.store';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { DocumentProductPanelStore } from '@domain/documents/state/document-product-panel.store';
import { DocumentEditLockService } from '@domain/documents/services/document-edit-lock.service';
import { computeDocumentTotals } from '@domain/documents/utils/document-totals.util';
import { DocumentCodeLookupStore } from '@domain/documents/state/document-code-lookup.store';
import { DocumentCodeLookupService } from '@domain/documents/services/document-code-lookup.service';
import {
  supplierCodeForDocumentLine,
  type DocumentLineCodeField,
} from '@domain/documents/utils/document-code-match.util';
import {
  vatCodeSelectOption,
  vatOptionsIncludingSelected,
} from '@domain/documents/utils/document-vat-options.util';
import {
  lineDraftHasSignificantData,
  lineDraftIsEmpty,
  lineDraftPersistableForExplicitSave,
  type GoodsReceiptLineDraft,
} from './utils/goods-receipt-line-state.util';

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

const VARIANT_SEARCH_DEBOUNCE_MS = 300;
// Allineato all'apertura del dropdown (2 caratteri): la ricerca parte subito.
const VARIANT_SEARCH_MIN_CHARS = 2;

type GoodsReceiptLineFocusField =
  | 'articleCode'
  | 'sku'
  | 'barcode'
  | 'supplierCode'
  | 'product'
  | 'quantity'
  | 'unitCost'
  | 'discount'
  | 'sellingPrice'
  | 'compareAtPrice'
  | 'vat'
  | 'lot'
  | 'expiry'
  | 'serials';

/**
 * Form operativo arrivo merce / carico fornitore (§3). Righe editabili, creazione
 * rapida articolo dalla riga, conferma con carico magazzino server-side.
 */
@Component({
  selector: 'app-goods-receipt-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    InlineBannerComponent,
    ReactiveFormsModule,
    RouterLink,
    BackButtonComponent,
    BadgeComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    DateInputComponent,
    DocumentNumberFieldComponent,
    DocumentSeriesManagerDialogComponent,
    SelectMenuComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    TableColumnPickerComponent,
    HoverTooltipComponent,
    TableColumnResizeDirective,
    DocumentAttachmentsPanelComponent,
    GoodsReceiptLineCardComponent,
    DocumentLineCodeCellComponent,
    DocumentLineProductCellComponent,
    DocumentMobilePanelComponent,
    DocumentProductSearchPanelComponent,
    SlidePanelComponent,
    ProductFormComponent,
    SupplierFormFieldsComponent,
    LocationSuggestionHintComponent,
  ],
  // Una maschera = un'istanza del blocco: è lei a tracciare gli id che ha
  // sbloccato e a rilasciarli all'uscita.
  providers: [DocumentEditLockService],
  templateUrl: './goods-receipt-form.component.html',
  // Banda footer sticky (totali orizzontali + azioni) condivisa con
  // l'Ordine cliente: secondo stylesheet, fuori dal budget del principale.
})
export class GoodsReceiptFormComponent implements CanComponentDeactivate {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly documentService = inject(DocumentService);
  private readonly countersService = inject(DocumentCountersService);
  private readonly documentSettingsService = inject(DocumentSettingsService);
  private readonly externalTypeService = inject(ExternalDocumentTypeService);
  private readonly supplierService = inject(SupplierService);
  private readonly supplierOrderService = inject(SupplierOrderService);
  private readonly labelPrintService = inject(ProductLabelPrintService);
  private readonly productService = inject(ProductService);
  private readonly barcodeLookup = inject(BarcodeLookupService);
  private readonly codeLookupService = inject(DocumentCodeLookupService);
  private readonly breadcrumbLabels = inject(BreadcrumbLabelService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly paymentOptionsService = inject(PaymentOptionsService);
  private readonly router = inject(Router);
  private readonly navHistory = inject(NavigationHistoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly editLock = inject(DocumentEditLockService);

  protected readonly listPath = '/app/documents/arrivi-merce';
  protected readonly currency = DEFAULT_CURRENCY;
  protected readonly formatMoney = formatMoney;
  protected readonly formatVatRate = formatVatRate;

  private readonly columnPreferences = inject(TableColumnPreferenceService);
  private readonly tenantFeatureSettingsService = inject(TenantFeatureSettingsService);

  protected readonly lineColumnsView = TableViewId.GoodsReceiptLines;
  protected readonly lineColumnDefs = GOODS_RECEIPT_LINE_COLUMNS;
  protected readonly loadsStockTooltip =
    'Se attivo, la quantità della riga aggiorna la disponibilità di magazzino. Se disattivato, la riga resta nel documento ma non movimenta il magazzino.';

  /** Re-render colonne/larghezze quando cambiano preferenze utente o resize. */
  private readonly lineTableColumnState = computed(() =>
    this.columnPreferences.state(GOODS_RECEIPT_LINES_VIEW)(),
  );

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly editDocumentId = computed(() => this.paramMap().get('id'));
  protected readonly isEditMode = computed(() => Boolean(this.editDocumentId()));

  private readonly loadedDocument = signal<DocumentRecord | null>(null);
  protected readonly isConfirmedEdit = computed(() => {
    const doc = this.loadedDocument();
    return doc != null && isConfirmedEditableDocumentStatus(doc.status);
  });

  protected readonly pageTitle = computed(() => {
    if (!this.isEditMode()) {
      return 'Nuovo arrivo merce';
    }
    return this.isConfirmedEdit() ? 'Modifica documento confermato' : 'Modifica arrivo merce';
  });

  protected statusDisplayLabel(): string | null {
    const doc = this.loadedDocument();
    if (!doc) {
      return null;
    }
    return documentStatusDisplayLabel(doc.type, doc.status, doc);
  }

  protected statusDisplayTone() {
    const doc = this.loadedDocument();
    if (!doc) {
      return null;
    }
    return documentStatusDisplayTone(doc.type, doc.status);
  }

  private readonly supplierOrderLineMap = signal<Map<string, LinkedSupplierOrderLineContext>>(
    new Map(),
  );
  protected readonly hasLinkedSupplierOrder = computed(
    () => this.supplierOrderLineMap().size > 0 || this.linkedSupplierOrder() != null,
  );

  protected readonly previewReference = signal<string | null>(null);

  /** Conflitto protocollo restituito dal server: dialogo «Usa N» / «Annulla». */
  // Stato del dialog «protocollo già assegnato»: la macchina vive in domain,
  // il form decide solo quale controllo riceve il numero e cosa risalvare.
  private readonly numberConflictDialog = new DocumentNumberConflictStore();
  /** Precompilato non arrivato: la maschera e' vuota e va detto perche'. */
  protected readonly prefillError = new DocumentPrefillErrorStore();
  protected readonly conflictDialogOpen = this.numberConflictDialog.isOpen;
  protected readonly conflictMessage = this.numberConflictDialog.message;
  /**
   * Il passaggio di route new → :id/edit non è un'uscita: serve solo a dire al
   * guard delle modifiche non salvate di lasciar passare.
   *
   * Non ha più niente a che vedere con il blocco. Prima faceva due mestieri —
   * anche impedire il rilascio degli sblocchi al destroy — ma da quando il
   * documento si RIBLOCCA al salvataggio non c'è più nessuno sblocco da portarsi
   * attraverso il cambio di rotta.
   */
  private readonly preserveEditSession = signal(false);
  protected readonly unlockDialogOpen = signal(false);
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
  protected readonly downloadingPdf = signal(false);
  private readonly supplierSkuByVariantId = signal<Map<string, string>>(new Map());
  private readonly variantIdBySupplierSku = signal<Map<string, string>>(new Map());
  protected readonly productSearchPanelOpen = signal(false);
  protected readonly productSearchLineIndex = signal<number | null>(null);
  protected readonly productSearchLaunchTerm = signal('');
  protected readonly productSearchLaunchSeq = signal(0);
  protected readonly autocompleteLineIndex = signal<number | null>(null);
  protected readonly activeSuggestionIndex = signal(0);
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
  protected readonly exitDialogOpen = signal(false);
  protected readonly includeOrderPanelOpen = signal(false);
  protected readonly receivableOrders = signal<readonly SupplierOrder[]>([]);
  protected readonly receivableOrdersLoading = signal(false);
  protected readonly receivableOrdersError = signal<AppError | null>(null);
  protected readonly csvImportSummary = signal<string | null>(null);
  protected readonly saveWarnings = signal<readonly string[]>([]);
  protected readonly barcodeScanMode = signal(false);
  protected readonly barcodeScanDraft = signal('');
  protected readonly barcodeScanBusy = signal(false);
  protected readonly lineSortColumn = signal<GoodsReceiptLineSortColumn | null>(null);
  protected readonly lineSortDirection = signal<'asc' | 'desc'>('asc');
  /**
   * Spunta per-documento «Aggiorna anche il costo di riferimento in anagrafica».
   * Il costo EFFETTIVO della variante è comunque SEMPRE aggiornato dal carico
   * (è un fatto della taglia); questa spunta decide solo se propagare anche al
   * costo di RIFERIMENTO dell'articolo in anagrafica. Default ACCESO: di norma
   * l'anagrafica segue l'ultimo costo pagato, chi non lo vuole la spegne su
   * quel documento (§Punto A).
   */
  protected readonly updateArticleReferenceCost = signal(true);
  private readonly pendingSupplierOrderId = signal<string | null>(null);
  private readonly pendingLinkedSupplierOrderRef = signal<string | null>(null);

  private pendingDeactivate: ((allow: boolean) => void) | null = null;

  private readonly barcodeScanInputRef =
    viewChild<ElementRef<HTMLInputElement>>('barcodeScanInput');

  /** Input scanner del dock mobile: stesso flusso, visibile solo sotto md. */
  private readonly barcodeScanDockInputRef =
    viewChild<ElementRef<HTMLInputElement>>('barcodeScanDockInput');

  private readonly tenantSettings = toSignal(
    this.tenantFeatureSettingsService.getSettings().pipe(catchError(() => of(null))),
    { initialValue: null as TenantFeatureSettings | null },
  );

  // ── Codici IVA e modalità costo (§9–§14) ────────────────────────────────────
  protected readonly vatCodes = toSignal(
    this.vatCodeService.list().pipe(catchError(() => of([] as readonly VatCode[]))),
    { initialValue: [] as readonly VatCode[] },
  );

  /** Voci pagamento del tenant per il form nuovo fornitore inline. */
  protected readonly paymentOptions = toSignal(
    this.paymentOptionsService.list().pipe(catchError(() => of([] as readonly PaymentOption[]))),
    { initialValue: [] as readonly PaymentOption[] },
  );

  /**
   * Opzioni «Pagamento» della testata: modalità attive del tenant. Il valore
   * corrente (snapshot del documento o default fornitore) resta selezionabile
   * anche se disattivato in seguito.
   */
  protected readonly paymentMethodOptions = computed<readonly SelectMenuOption[]>(() => {
    this.formValue();
    const current = this.form.controls.paymentMethod.value.trim();
    const names = this.paymentOptions()
      .filter((option) => option.kind === 'method' && option.isActive)
      .map((option) => option.name);
    const options = names.map((name): SelectMenuOption => ({ value: name, label: name }));
    if (current && !names.includes(current)) {
      options.unshift({ value: current, label: current });
    }
    return options;
  });

  private readonly vatCodeById = computed(
    () => new Map(this.vatCodes().map((vatCode) => [vatCode.id, vatCode])),
  );

  /** Codici attivi utilizzabili in acquisto, ordinati come in Impostazioni. */
  private readonly purchaseVatCodes = computed(() =>
    this.vatCodes().filter((vatCode) => vatCode.isActive && isPurchaseVatCode(vatCode)),
  );

  protected readonly purchaseVatOptions = computed<readonly SelectMenuOption[]>(() =>
    this.purchaseVatCodes().map((vatCode) => vatCodeSelectOption(vatCode)),
  );

  /** Codice IVA predefinito aziendale (impostazioni → flag isDefault attivo). */
  private readonly defaultVatCodeId = computed(() => {
    const codes = this.vatCodes();
    const settingsId = this.tenantSettings()?.defaultVatCodeId;
    const fromSettings = settingsId
      ? codes.find((vatCode) => vatCode.id === settingsId && vatCode.isActive)
      : undefined;
    const fallback = codes.find((vatCode) => vatCode.isDefault && vatCode.isActive);
    return (fromSettings ?? fallback)?.id ?? '';
  });

  /** Modalità costi del documento (§11.1): unica per l'intero Arrivo merce. */
  protected readonly costEntryMode = signal<PurchaseCostEntryMode>('vat_excluded');
  /** True dopo scelta utente o caricamento documento: il default non riapplica. */
  private costEntryModeTouched = false;
  protected readonly costModeMenuOpen = signal(false);
  protected readonly vatHeaderMenuOpen = signal(false);
  /** Conferma conversione costi al cambio modalità (§12). */
  protected readonly costModeDialogOpen = signal(false);
  private readonly pendingCostMode = signal<PurchaseCostEntryMode | null>(null);
  // Dialog "Imposta IVA a tutte le righe" (§10).
  protected readonly applyVatDialogOpen = signal(false);
  protected readonly applyVatCodeId = signal('');

  protected readonly costModeLabel = computed(() =>
    this.costEntryMode() === 'vat_included' ? 'Costo ivato' : 'Costo netto',
  );
  /** Opzioni per il selettore modalità costo in testata mobile. */
  protected readonly costModeOptions: readonly SelectMenuOption[] = [
    { value: 'vat_excluded', label: 'Netto' },
    { value: 'vat_included', label: 'Ivato' },
  ];

  /**
   * Nuovo documento: la modalità costo (netto/ivato) parte dalla preferenza
   * ricordata dell'operatore per questo tipo (?? primo utilizzo: netto). Mai sui
   * documenti caricati (mostrano la modalità con cui sono stati creati) né dopo
   * una scelta manuale.
   */
  private initCostModeForNewDocument(): void {
    if (this.editDocumentId() || this.costEntryModeTouched) {
      return;
    }
    this.documentService
      .getPriceModePreference(this.form.controls.type.value)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (pricesIncludeVat) => {
          if (!this.costEntryModeTouched) {
            this.costEntryMode.set(pricesIncludeVat ? 'vat_included' : 'vat_excluded');
          }
        },
        error: () => undefined,
      });
  }

  protected readonly operationalStatusWarning = computed(() => {
    const status = this.documentStatus();
    if (status === DocumentStatus.Printed) {
      return 'Documento segnato come stampato: verifica coerenza con il documento cartaceo prima di modificarlo.';
    }
    if (status === DocumentStatus.Sent) {
      return 'Documento segnato come inviato al fornitore o al commercialista.';
    }
    if (status === DocumentStatus.ExternallyRegistered) {
      return 'Documento registrato esternamente: le modifiche non aggiornano il gestionale contabile esterno.';
    }
    return null;
  });

  protected readonly formReadOnly = computed(
    () => this.isConfirmedEdit() && !this.editLock.unlocked(),
  );

  /**
   * Blocco compilazione: fornitore (se richiesto dal tipo) e magazzino vanno
   * scelti PRIMA di righe e altri campi. Senza, le righe inserite non
   * caricherebbero nulla e l'operazione risulterebbe nulla senza accorgersene.
   */
  protected readonly headerGateActive = computed(() => {
    if (this.formReadOnly()) {
      return false;
    }
    // Trigger reattivo: i valori si leggono dai controls (mai disabilitati).
    this.formValue();
    const type = this.form.controls.type.value;
    const supplierRequired = type !== DocumentType.ManualLoad && type !== DocumentType.InitialLoad;
    const supplierMissing = supplierRequired && !this.form.controls.supplierId.value;
    const locationMissing = !this.form.controls.locationId.value;
    return supplierMissing || locationMissing;
  });

  protected readonly headerGateMessage = computed(() => {
    this.formValue();
    const type = this.form.controls.type.value;
    const supplierRequired = type !== DocumentType.ManualLoad && type !== DocumentType.InitialLoad;
    const supplierMissing = supplierRequired && !this.form.controls.supplierId.value;
    const locationMissing = !this.form.controls.locationId.value;
    if (supplierMissing && locationMissing) {
      return 'Seleziona fornitore e magazzino di destinazione per compilare il documento.';
    }
    if (supplierMissing) {
      return 'Seleziona il fornitore per compilare il documento.';
    }
    return 'Seleziona il magazzino di destinazione per compilare il documento.';
  });

  // ── Testata mobile a due pannelli (riferimento «Ordine cliente») ──────────
  // Solo testi display-only: concatenano valori già presenti nel form. Lo
  // stato di apertura vive nel componente condiviso app-document-mobile-panel.

  /** Dati che sbloccano le righe: stesso criterio del gate, letto al positivo. */
  protected readonly headerDataReady = computed(() => !this.headerGateActive());

  /**
   * Head del pannello «Fornitore e magazzino»: finché i dati mancano fa da
   * intestazione, quando ci sono diventa il riepilogo di ciò che si è scelto.
   */
  protected readonly supplierPanelTitle = computed(() => {
    if (!this.headerDataReady()) {
      return 'Fornitore e magazzino';
    }
    this.formValue();
    const supplierId = this.form.controls.supplierId.value;
    const supplier = this.supplierOptions().find((option) => option.value === supplierId)?.label;
    return supplier || 'Senza fornitore';
  });

  protected readonly supplierPanelSubtitle = computed(() => {
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
   * righe — quello lo dice il banner gate, ed è un'altra frase.
   */
  protected readonly supplierPanelStatus = computed(() => {
    if (this.headerDataReady()) {
      return 'Dati principali completi. Puoi aggiungere le righe.';
    }
    this.formValue();
    const type = this.form.controls.type.value;
    const supplierRequired = type !== DocumentType.ManualLoad && type !== DocumentType.InitialLoad;
    const supplierMissing = supplierRequired && !this.form.controls.supplierId.value;
    const locationMissing = !this.form.controls.locationId.value;
    if (supplierMissing && locationMissing) {
      return 'Fornitore e magazzino sono obbligatori.';
    }
    return supplierMissing ? 'Il fornitore è obbligatorio.' : 'Il magazzino è obbligatorio.';
  });

  /** Pannello «Documento fornitore»: tipo+numero · data · pagamento. */
  protected readonly supplierDocPanelSummaryParts = computed<readonly string[]>(() => {
    this.formValue();
    const typeId = this.form.controls.externalDocumentTypeId.value;
    const type = this.externalDocTypes().find((entry) => entry.id === typeId);
    const typeLabel = type ? type.shortLabel || type.name : null;
    const number = this.form.controls.externalDocNumber.value.trim();
    const parts: string[] = [
      [typeLabel, number].filter(Boolean).join(' ') || 'Documento non indicato',
    ];
    const externalDate = this.form.controls.externalDocDate.value;
    if (externalDate) {
      parts.push(formatItalianInputDate(externalDate));
    }
    const methodId = this.form.controls.paymentMethod.value;
    const method = methodId
      ? this.paymentMethodOptions().find((option) => option.value === methodId)?.label
      : null;
    parts.push(method || 'Pagamento non indicato');
    return parts;
  });

  protected readonly documentStatus = computed(
    () => this.loadedDocument()?.status ?? DocumentStatus.Draft,
  );
  protected readonly internalReferenceLabel = computed(() => {
    const doc = this.loadedDocument();
    if (doc?.reference) {
      return doc.reference;
    }
    return this.previewReference();
  });

  /**
   * Serie configurate per il tipo in testata. Oggi il tipo documento espone
   * una sola serie predefinita: il campo resta una label statica finché non
   * se ne configurano altre.
   */
  /** Impostazioni per tipo documento: da qui arriva la serie predefinita. */
  private readonly documentSettingsList = toSignal(
    this.documentSettingsService.getSettings().pipe(catchError(() => of([]))),
    { initialValue: [] as readonly DocumentTypeSetting[] },
  );

  /** Contatori disponibili per la testata (tipo + sede): alimentano la tendina. */
  private readonly _availableCounters = signal<readonly DocumentCounterView[]>([]);
  protected readonly seriesOptions = computed((): readonly SelectMenuOption[] =>
    this._availableCounters().map((counter) => ({
      value: counter.series ?? '',
      label: counter.series ?? 'Senza serie',
    })),
  );

  /** Pannello «gestisci numerazioni» aperto dall'ingranaggio del campo Serie. */
  protected readonly seriesDialogOpen = signal(false);

  /**
   * Etichetta della tappa id nel breadcrumb: il numero dell'arrivo merce
   * aperto (es. «AM-2026-0001»), mostrato al posto del generico «Dettaglio».
   * Solo in modifica (l'id è nell'URL) e con documento caricato.
   */
  private readonly breadcrumbEntity = computed(() => {
    const id = this.editDocumentId();
    if (!id) {
      return null;
    }
    const doc = this.loadedDocument();
    // Anche i documenti non ancora numerati hanno un'etichetta leggibile
    // («Bozza · serie A»): senza, il percorso ricadeva sul generico «Dettaglio».
    return doc ? { id, label: documentReferenceLabel(doc.type, doc.reference, doc.series) } : null;
  });
  /** Id attualmente registrato nel breadcrumb (per pulizia mirata). */
  private breadcrumbLabelId: string | null = null;

  protected readonly linkedSupplierOrder = computed(
    () => this.loadedDocument()?.linkedSupplierOrder ?? null,
  );

  protected readonly activeSupplierOrderReference = computed(() => {
    const linked = this.linkedSupplierOrder();
    if (linked) {
      return linked.reference;
    }
    return this.pendingLinkedSupplierOrderRef();
  });

  protected readonly canIncludeSupplierOrder = computed(
    () =>
      !this.formReadOnly() &&
      !this.isConfirmedEdit() &&
      !this.resolveSupplierOrderId() &&
      Boolean(this.form.controls.supplierId.value),
  );

  protected readonly canSaveDocument = computed(() => !this.formReadOnly());

  protected readonly canExportPdf = computed(() => Boolean(this.persistedDocumentId()));

  private readonly loadTick = signal(0);
  private readonly loadRequest = computed(() => ({
    id: this.editDocumentId(),
    tick: this.loadTick(),
  }));

  private readonly loadState = toSignal(
    toObservable(this.loadRequest).pipe(
      switchMap(({ id }) => {
        if (!id) {
          this.initDefaultsForCreate();
          return of<'ready' | 'loading' | 'not-found' | 'error'>('ready');
        }
        const doc$ = this.documentService.getDocumentById(id);
        return doc$.pipe(
          map((doc) => {
            const draftEditable =
              doc.status === DocumentStatus.Draft && isGoodsReceiptDocumentType(doc.type);
            const confirmedEditable =
              isConfirmedEditableDocumentStatus(doc.status) && isGoodsReceiptDocumentType(doc.type);
            if (!draftEditable && !confirmedEditable) {
              this.loadedDocument.set(null);
              return 'not-found' as const;
            }
            this.loadedDocument.set(doc);
            this.patchFormFromDocument(doc);
            this.refreshNumberPreview();
            if (confirmedEditable) {
              this.form.controls.type.disable({ emitEvent: false });
            } else {
              this.form.controls.type.enable({ emitEvent: false });
            }
            return 'ready' as const;
          }),
          startWith<'ready' | 'loading' | 'not-found' | 'error'>('loading'),
          catchError(() => of('error' as const)),
        );
      }),
    ),
    { initialValue: this.editDocumentId() ? 'loading' : 'ready' },
  );

  protected readonly loading = computed(() => this.loadState() === 'loading');
  protected readonly loadError = computed(() => this.loadState() === 'error');
  protected readonly notEditable = computed(() => this.loadState() === 'not-found');

  private readonly suppliersReload = signal(0);
  private readonly suppliers = toSignal(
    toObservable(this.suppliersReload).pipe(switchMap(() => this.supplierService.getSuppliers())),
    { initialValue: [] },
  );
  protected readonly supplierOptions = computed<readonly SelectMenuOption[]>(() =>
    this.suppliers().map((s) => ({ value: s.id, label: s.name })),
  );

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
        return this.productService.searchVariantSummaries({
          search: term,
          pageSize: 30,
          locationId,
        });
      }),
    ),
    { initialValue: [] as readonly VariantSummary[] },
  );

  protected readonly locationOptions = computed<readonly SelectMenuOption[]>(() =>
    toLocationSelectOptions(
      this.operationalLocations.writeLocations(),
      this.operationalLocations.defaultLocation()?.id ?? null,
    ),
  );

  /**
   * Sede suggerita (predefinita utente, o unica autorizzata): mostrata come
   * hint cliccabile sotto il campo — MAI autoselezionata (specifica cliente:
   * anche mono-location la conferma resta esplicita).
   */
  protected readonly suggestedLocation = this.operationalLocations.suggestedWriteLocation;

  protected applySuggestedLocation(): void {
    const suggested = this.suggestedLocation();
    if (!suggested || this.formReadOnly()) {
      return;
    }
    this.onLocationSelect(suggested.id);
  }

  // ── Documento fornitore: tipi per tenant (prompt §3-6) ─────────────────────
  /** Valore-azione nella tendina: apre la finestra "Nuovo tipo documento". */
  protected readonly NEW_TYPE_OPTION = '__new-type__';
  /** Valore-azione nella tendina: apre il pannello "Gestisci tipi documento". */
  protected readonly MANAGE_TYPES_OPTION = '__manage-types__';

  private readonly externalTypesReload = signal(0);
  protected readonly externalDocTypes = toSignal(
    toObservable(this.externalTypesReload).pipe(
      switchMap(() =>
        this.externalTypeService
          .list()
          .pipe(catchError(() => of([] as readonly ExternalDocumentType[]))),
      ),
    ),
    { initialValue: [] as readonly ExternalDocumentType[] },
  );

  protected readonly externalDocTypeOptions = computed<readonly SelectMenuOption[]>(() => {
    const selectedId = this.selectedExternalTypeId();
    const options: SelectMenuOption[] = [{ value: '', label: '—' }];
    for (const type of this.externalDocTypes()) {
      // I tipi disattivati non si propongono, ma restano visibili se già
      // selezionati sul documento storico (§6).
      if (type.isActive || type.id === selectedId) {
        options.push({ value: type.id, label: type.shortLabel || type.name });
      }
    }
    options.push({ value: this.NEW_TYPE_OPTION, label: 'Altro / Nuovo tipo…' });
    options.push({ value: this.MANAGE_TYPES_OPTION, label: 'Gestisci tipi documento…' });
    return options;
  });

  /** Id tipo selezionato (specchio del form control, per computed reattivi). */
  private readonly selectedExternalTypeId = signal('');

  // Finestra "Nuovo tipo documento fornitore" (§5).
  protected readonly newTypeDialogOpen = signal(false);
  protected readonly newTypeName = signal('');
  protected readonly newTypeShortLabel = signal('');
  protected readonly newTypeTemplate = signal('');
  protected readonly newTypeBusy = signal(false);
  protected readonly newTypeError = signal<string | null>(null);

  // Pannello "Gestisci tipi documento…" (§6).
  protected readonly typePanelOpen = signal(false);
  protected readonly typePanelBusy = signal(false);
  protected readonly typePanelError = signal<string | null>(null);
  protected readonly addTypeName = signal('');
  protected readonly addTypeShortLabel = signal('');
  protected readonly addTypeTemplate = signal('');
  protected readonly editingTypeId = signal<string | null>(null);
  protected readonly editingTypeName = signal('');
  protected readonly editingTypeShortLabel = signal('');
  protected readonly editingTypeTemplate = signal('');

  // ── Causale di carico (punto E: invisibile, sempre generata in silenzio) ───
  /**
   * Modalità causale: AUTO = generata dal modello del tipo documento. La UI
   * non espone più il campo né la modalità MANUAL (punto E); il valore
   * MANUAL sopravvive solo per i documenti storici caricati, il cui testo
   * personalizzato non viene mai sovrascritto.
   */
  protected readonly causalMode = signal<CausalGenerationMode>(CausalGenerationMode.Auto);
  /** Modello causale attivo (dal tipo documento fornitore selezionato). */
  private readonly causalTemplate = signal<string | null>(null);

  readonly form = this.fb.group({
    type: this.fb.control<DocumentType>(DocumentType.GoodsReceipt, {
      validators: [Validators.required],
    }),
    supplierId: this.fb.control('', { validators: [Validators.required] }),
    // Location richiesta solo quando ci sono righe che caricano magazzino
    // (§9.4): la sola testata si salva anche senza (validazione contestuale).
    locationId: this.fb.control(''),
    // Data registrazione: parte da oggi (data locale), modificabile (§2).
    documentDate: this.fb.control(toIsoDateLocal(new Date()), {
      validators: [Validators.required],
    }),
    externalDocumentTypeId: this.fb.control(''),
    externalDocNumber: this.fb.control(''),
    externalDocDate: this.fb.control(''),
    /** Protocollo interno: proposto dal progressivo di serie, editabile. */
    protocolNumber: this.fb.control<number | null>(null),
    series: this.fb.control(''),
    causalText: this.fb.control(''),
    notes: this.fb.control(''),
    internalComment: this.fb.control(''),
    billingCause: this.fb.control(''),
    paymentMethod: this.fb.control(''),
    invoicePending: this.fb.control(false),
    documentDiscountPercent: this.fb.control(''),
    lines: this.fb.array([this.createLine()]),
  });

  constructor() {
    this.columnPreferences.registerView(
      GOODS_RECEIPT_LINES_VIEW,
      GOODS_RECEIPT_LINE_COLUMNS,
      GOODS_RECEIPT_LINE_PRESETS,
    );

    // Il rilascio degli sblocchi all'uscita non vive più qui: lo fa
    // DocumentEditLockService, uguale per ogni maschera.
    this.syncSupplierRequirement(this.form.controls.type.value);
    this.form.controls.type.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => {
        this.syncSupplierRequirement(type);
        this.refreshNumberPreview();
      });
    this.form.controls.documentDate.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshNumberPreview());
    this.form.controls.externalDocumentTypeId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((typeId) => {
        this.selectedExternalTypeId.set(typeId);
        this.applyTemplateFromType(typeId);
      });
    this.form.controls.externalDocNumber.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.regenerateCausalFromTemplate());
    this.form.controls.externalDocDate.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.regenerateCausalFromTemplate());
    this.refreshNumberPreview();
    this.setupDirtyTracking();
    this.form.controls.supplierId.valueChanges
      .pipe(startWith(this.form.controls.supplierId.value), takeUntilDestroyed(this.destroyRef))
      .subscribe((supplierId) => {
        this.reloadSupplierVariantLinks(supplierId);
        this.applySupplierDocumentNote(supplierId);
      });
    effect(() => {
      this.pinnedVariants();
      this.searchedVariants();
      this.syncLineCodesFromVariants();
      // Punto B: le righe collegate a prodotti non-magazzino vanno bloccate
      // appena le summary sono disponibili (anche in load asincrono).
      this.syncLineFieldAccess();
    });

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
    // Rilascio dell'etichetta a prescindere da preserveEditSession (l'id resta
    // corretto per l'istanza ricreata, che la ri-registra al caricamento).
    this.destroyRef.onDestroy(() => {
      if (this.breadcrumbLabelId) {
        this.breadcrumbLabels.clear(this.breadcrumbLabelId);
      }
    });
  }

  /**
   * Nessun salvataggio automatico: il documento si salva SOLO con "Salva
   * documento". Qui si tracciano le modifiche non salvate, per il dialog di
   * uscita e per l'avviso del browser su ricarica/chiusura scheda.
   */
  /**
   * "Inserisci nota" (anagrafica fornitore): compila le note del documento
   * con la nota configurata sul ruolo, senza mai sovrascrivere testo digitato
   * dall'operatore o note di un documento esistente.
   */
  private applySupplierDocumentNote(supplierId: string): void {
    if (this.formReadOnly() || this.isEditMode()) {
      return;
    }
    const supplier = supplierId
      ? (this.suppliers().find((entry) => entry.id === supplierId) ?? null)
      : null;
    const note = supplier?.documentCreationNote?.trim() ?? '';
    const control = this.form.controls.notes;
    const current = control.value.trim();
    if (note && (!current || current === this.lastAutoInsertedNote)) {
      control.setValue(note);
      this.lastAutoInsertedNote = note;
    } else if (!note && current && current === this.lastAutoInsertedNote) {
      control.setValue('');
      this.lastAutoInsertedNote = '';
    }
  }

  private setupDirtyTracking(): void {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.suppressDirtyMarking && !this.formReadOnly()) {
        this.dirtySinceLastSave.set(true);
      }
    });
  }

  /** Patch programmatiche (load documento, righe di comodo): non sono modifiche utente. */
  private suppressDirtyMarking = false;

  private withDirtySuppressed(fn: () => void): void {
    this.suppressDirtyMarking = true;
    try {
      fn();
    } finally {
      this.suppressDirtyMarking = false;
    }
  }

  private markFormDirty(): void {
    if (this.formReadOnly() || this.saving()) {
      return;
    }
    this.dirtySinceLastSave.set(true);
  }

  /** Righe che caricheranno davvero magazzino: richiedono la location (§9.4). */
  private hasStockLoadingLines(): boolean {
    return this.lines.controls.some((line) => {
      if (!line.controls.loadsStock.value || Number(line.controls.quantity.value) <= 0) {
        return false;
      }
      return Boolean(line.controls.variantId.value) || this.lineNeedsProductCreation(line);
    });
  }

  /** Validazione testata per il salvataggio (§9.2): messaggi contestuali. */
  private validateHeaderForSave(): AppError | null {
    if (
      this.form.controls.supplierId.invalid ||
      this.form.controls.documentDate.invalid ||
      this.form.controls.type.invalid
    ) {
      return {
        kind: AppErrorKind.Validation,
        message: 'Compila fornitore e data documento prima di salvare.',
      };
    }
    if (this.hasStockLoadingLines() && !this.form.controls.locationId.value) {
      return {
        kind: AppErrorKind.Validation,
        message:
          'Seleziona il magazzino di destinazione: serve per caricare la giacenza delle righe.',
      };
    }
    return null;
  }

  protected lineHasLinkedProduct(index: number): boolean {
    return Boolean(this.lines.at(index)?.controls.variantId.value);
  }

  protected lineSuggestions(index: number): readonly VariantSummary[] {
    if (this.autocompleteLineIndex() !== index || this.lineHasLinkedProduct(index)) {
      return [];
    }
    // Nessun suggerimento senza testo digitato: al solo focus della cella
    // vuota gli articoli delle altre righe del documento NON vanno proposti.
    const term = this.lines.at(index)?.controls.productName.value.trim().toLowerCase() ?? '';
    if (term.length < VARIANT_SEARCH_MIN_CHARS) {
      return [];
    }
    // Le varianti già presenti nel documento (pinned) entrano nell'elenco
    // solo se combaciano col testo digitato, come i risultati del server.
    const pinnedMatching = this.pinnedVariants().filter((variant) =>
      [
        variant.productName,
        variant.title,
        variant.sku,
        variant.barcode ?? '',
        variant.articleCode,
      ].some((value) => value.toLowerCase().includes(term)),
    );
    return mergeVariantSummaries(pinnedMatching, this.searchedVariants());
  }

  /**
   * Dropdown suggerimenti aperto (punto D): con risultati mostra l'elenco,
   * senza risultati resta aperto per proporre "Apri scheda completa…"
   * (da 2 caratteri digitati in su). La creazione e' implicita: il nome
   * digitato basta, nessuna azione "Crea" dedicata.
   */
  protected lineSuggestionsOpen(index: number): boolean {
    if (this.autocompleteLineIndex() !== index || this.lineHasLinkedProduct(index)) {
      return false;
    }
    if (this.lineSuggestions(index).length > 0) {
      return true;
    }
    return (this.lines.at(index)?.controls.productName.value.trim().length ?? 0) >= 2;
  }

  protected linkedProductLabel(index: number): string {
    const line = this.lines.at(index);
    if (!line) {
      return '';
    }
    const name = line.controls.productName.value.trim();
    if (name) {
      return name;
    }
    const variantId = line.controls.variantId.value;
    if (!variantId) {
      return '';
    }
    const summary = mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants()).find(
      (v) => v.variantId === variantId,
    );
    return summary?.productName ?? summary?.title ?? line.controls.description.value;
  }

  /**
   * Codice articolo mostrato sulla riga collegata (§6): dal form control
   * (sincronizzato dalle summary) o direttamente dalla summary in cache.
   */
  protected lineArticleCode(index: number): string {
    const line = this.lines.at(index);
    if (!line) {
      return '';
    }
    const fromControl = line.controls.articleCode.value.trim();
    if (fromControl) {
      return fromControl;
    }
    const variantId = line.controls.variantId.value;
    if (!variantId) {
      return '';
    }
    const summary = mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants()).find(
      (v) => v.variantId === variantId,
    );
    return summary?.articleCode ?? '';
  }

  /**
   * Il campo codice NON cerca mentre si digita: nessun elenco, nessuna attesa,
   * nessun suggerimento. Il confronto col catalogo avviene alla conferma
   * (Tab/Invio), per corrispondenza esatta — vedi `commitCodeLookup`.
   *
   * Fino a 08/2026 da due caratteri partiva una ricerca al server e si apriva
   * un elenco che si aggiornava mentre si scriveva. Rimossa: la ricerca vive
   * nel campo Nome prodotto e nel pannello articoli, che sono i posti in cui
   * l'operatore non sa cosa sta cercando. Chi digita un codice lo sa già.
   */
  protected onLineSkuChange(index: number, value: string): void {
    this.lines.at(index).controls.sku.setValue(value);
    this.codesNotFound.clear();
    this.clearProductAutocomplete();
    this.codeLookup.clear();
    this.markFormDirty();
  }

  /**
   * Scollega l'articolo dalla riga (correzione refusi): il nome resta nel
   * campo, di nuovo modificabile insieme ai codici; quantità/costi invariati.
   */
  protected onLineUnlink(index: number): void {
    const line = this.lines.at(index);
    if (!line || this.formReadOnly()) {
      return;
    }
    line.controls.variantId.setValue('');
    // I codici appartengono all'articolo scollegato: lasciarli farebbe
    // ri-collegare la riga al blur (o collidere lo SKU alla creazione).
    line.controls.articleCode.setValue('', { emitEvent: false });
    line.controls.sku.setValue('', { emitEvent: false });
    line.controls.barcode.setValue('', { emitEvent: false });
    this.syncLineFieldAccess();
    this.focusLineField(index, 'product');
  }

  /**
   * Badge "Nuovo articolo" sulla riga: creazione implicita, basta il nome
   * digitato (≥ 2 caratteri) senza articolo collegato. L'articolo nasce al
   * salvataggio, nessun gesto dedicato.
   */
  protected lineCreateMode(index: number): boolean {
    const line = this.lines.at(index);
    if (!line || line.controls.variantId.value) {
      return false;
    }
    return line.controls.productName.value.trim().length >= 2;
  }

  /** Esc chiude ricerca contestuale e lookup codici senza toccare i dati (§7). */
  protected onLineSearchEscape(_index: number): void {
    this.clearProductAutocomplete();
    this.codeLookup.clear();
  }

  protected onLineBarcodeChange(index: number, value: string): void {
    this.lines.at(index).controls.barcode.setValue(value);
    this.codesNotFound.clear();
    this.codeLookup.clear();
    this.markFormDirty();
  }

  /** Come lo SKU: nessuna ricerca mentre si digita, confronto alla conferma. */
  protected onLineArticleCodeChange(index: number, value: string): void {
    this.lines.at(index).controls.articleCode.setValue(value);
    this.codesNotFound.clear();
    this.clearProductAutocomplete();
    this.codeLookup.clear();
    this.markFormDirty();
  }

  protected onLineProductNameChange(index: number, value: string): void {
    const line = this.lines.at(index);
    line.controls.productName.setValue(value);
    this.autocompleteLineIndex.set(index);
    this.activeSuggestionIndex.set(0);
    this.variantSearchDraft.set(value);
    this.codeLookup.clear();
    this.markFormDirty();
  }

  /**
   * Variante per la card mobile: il valore è già scritto dal formControl,
   * qui si aggiornano solo i segnali della ricerca contestuale (§7).
   */
  protected onCardProductNameInput(index: number, value: string): void {
    this.autocompleteLineIndex.set(index);
    this.activeSuggestionIndex.set(0);
    this.variantSearchDraft.set(value);
    this.codeLookup.clear();
  }

  protected onLineProductFocus(index: number): void {
    this.autocompleteLineIndex.set(index);
    this.activeSuggestionIndex.set(0);
    this.variantSearchDraft.set(this.lines.at(index).controls.productName.value);
  }

  protected onLineProductBlur(index: number): void {
    if (this.autocompleteLineIndex() === index) {
      this.autocompleteLineIndex.set(null);
    }
    this.commitLineIfSignificant(index);
  }

  protected onLineOperationalBlur(index: number): void {
    this.commitLineIfSignificant(index);
  }

  private commitLineIfSignificant(index: number): void {
    const line = this.lines.at(index);
    if (!line || this.formReadOnly()) {
      return;
    }
    if (this.lineHasSignificantProductData(line) || Number(line.controls.quantity.value) > 0) {
      // Il blur collega i codici digitati; nessun salvataggio parte da qui.
      this.commitLineAndSave(index);
      return;
    }
    this.markFormDirty();
  }

  protected onLineCodeFocus(index: number, field: DocumentLineCodeField): void {
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
    this.commitLineIfSignificant(index);
  }

  protected commitSkuLookup(index: number): void {
    this.commitCodeLookup(index, 'sku');
  }

  protected commitBarcodeLookup(index: number): void {
    this.commitCodeLookup(index, 'barcode');
  }

  protected commitArticleCodeLookup(index: number): void {
    this.commitCodeLookup(index, 'articleCode');
  }

  /**
   * Conferma di un codice: si confronta col catalogo per corrispondenza esatta,
   * e gli esiti sono tre. La catena vive in `DocumentCodeLookupService`, uguale
   * per le tre maschere; qui resta solo cosa farne — agganciare, aprire la
   * scelta, o lasciare il valore scritto e proseguire.
   *
   * `locationId` non filtra i risultati: restringe soltanto le giacenze
   * mostrate alla sede del documento. Il fornitore della testata invece NON si
   * passa, ed è deliberato — vedi il commento in `DocumentCodeLookupService`.
   */
  private commitCodeLookup(index: number, field: DocumentLineCodeField): void {
    if (this.lineHasLinkedProduct(index)) {
      this.focusNextLineField(index, field);
      return;
    }
    const line = this.lines.at(index);
    const value =
      field === 'sku'
        ? line.controls.sku.value.trim()
        : field === 'articleCode'
          ? line.controls.articleCode.value.trim()
          : field === 'supplierCode'
            ? line.controls.supplierSku.value.trim()
            : line.controls.barcode.value.trim();
    if (!value) {
      this.codeLookup.clear();
      this.focusNextLineField(index, field);
      return;
    }

    this.codeLookupService
      .resolve(value, field, { locationId: this.form.controls.locationId.value || undefined })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((outcome) => {
        if (outcome.kind === 'one') {
          // Agganciando da Cod. fornitore, il codice digitato È quello con cui
          // si aggancia: va tenuto nella riga, non sostituito.
          this.onVariantSelect(
            index,
            outcome.variantId,
            field === 'supplierCode' ? value : undefined,
          );
          this.codeLookup.clear();
          this.focusLineField(index, 'quantity');
          return;
        }
        if (outcome.kind === 'many') {
          this.codeLookup.open(index, field, outcome.matches);
          return;
        }
        // Nessuna corrispondenza: il valore resta scritto e la riga prosegue.
        // Non è un errore — può essere il riferimento del fornitore, o un
        // articolo che non esiste ancora.
        //
        // Fino a 08/2026 qui compariva un banner «codice non trovato» in testa
        // alla maschera. Rimosso SENZA sostituto, deliberatamente: lo stato si
        // vede già — riga collegata mostra il nome del prodotto, riga non
        // collegata no. Chi digita un codice e non vede comparire nulla capisce
        // da sé, e prosegue compilando a mano, che è un uso legittimo. Un
        // avviso che spiega uno stato già visibile è di troppo, e stava per
        // giunta in testa alla maschera invece che sulla riga.
        this.codeLookup.clear();
        this.focusNextLineField(index, field);
      });
  }

  protected onCodeSuggestionPick(index: number, variantId: string): void {
    // Da leggere PRIMA di chiudere: dopo, il campo d'origine non c'è più.
    const linkedWith =
      this.codeLookup.field() === 'supplierCode'
        ? this.lines.at(index)?.controls.supplierSku.value.trim()
        : undefined;
    this.onVariantSelect(index, variantId, linkedWith);
    this.codeLookup.clear();
    this.focusLineField(index, 'quantity');
  }

  protected openLineProductSearch(index: number): void {
    const line = this.lines.at(index);
    const term = line?.controls.productName.value.trim() ?? '';
    line?.controls.productName.setValue(term, { emitEvent: false });
    this.productSearchLaunchTerm.set(term);
    this.productSearchLaunchSeq.update((seq) => seq + 1);
    this.productSearchLineIndex.set(index);
    this.productSearchPanelOpen.set(true);
  }

  protected closeLineProductSearch(): void {
    this.productSearchPanelOpen.set(false);
    this.productSearchLineIndex.set(null);
  }

  protected onLineProductSearchPick(variantId: string): void {
    const index = this.productSearchLineIndex();
    if (index != null) {
      this.onVariantSelect(index, variantId);
      this.refreshLineVariantSummary(index, variantId);
      this.focusLineField(index, 'quantity');
    }
    this.closeLineProductSearch();
  }

  protected onProductSuggestionPick(index: number, variantId: string): void {
    this.onVariantSelect(index, variantId);
    this.focusLineField(index, 'quantity');
  }

  protected onProductSuggestionNavigate(direction: 'next' | 'prev'): void {
    const lineIndex = this.autocompleteLineIndex();
    if (lineIndex == null) {
      return;
    }
    const suggestions = this.lineSuggestions(lineIndex);
    if (suggestions.length === 0) {
      return;
    }
    const current = this.activeSuggestionIndex();
    const nextIndex =
      direction === 'next'
        ? Math.min(current + 1, suggestions.length - 1)
        : Math.max(current - 1, 0);
    this.activeSuggestionIndex.set(nextIndex);
  }

  protected advanceToNextLine(index: number): void {
    this.commitLineAndSave(index, () => {
      const nextIndex = index + 1;
      if (nextIndex >= this.lines.length) {
        this.lines.push(this.createLine());
      }
      this.trimDuplicateTrailingEmptyRows();
      this.focusFirstLineField(nextIndex);
    });
  }

  protected advanceToPreviousLine(index: number): void {
    if (index <= 0) {
      return;
    }
    this.commitLineAndSave(index, () => {
      this.focusLastLineField(index - 1);
    });
  }

  protected moveLineUp(index: number): void {
    if (index <= 0 || this.formReadOnly()) {
      return;
    }
    const focusField = this.activeLineFocusField(index);
    this.swapLines(index, index - 1);
    this.markFormDirty();
    if (focusField) {
      this.focusLineField(index - 1, focusField);
    }
  }

  protected moveLineDown(index: number): void {
    if (index >= this.lines.length - 1 || this.formReadOnly()) {
      return;
    }
    const focusField = this.activeLineFocusField(index);
    this.swapLines(index, index + 1);
    this.markFormDirty();
    if (focusField) {
      this.focusLineField(index + 1, focusField);
    }
  }

  private activeLineFocusField(_index: number): GoodsReceiptLineFocusField | null {
    const active = globalThis.document.activeElement;
    if (!(active instanceof HTMLElement)) {
      return null;
    }
    const id = active.id;
    const prefixMap: readonly [string, GoodsReceiptLineFocusField][] = [
      ['gr-code-', 'articleCode'],
      ['gr-sku-', 'sku'],
      ['gr-barcode-', 'barcode'],
      ['gr-supplier-code-', 'supplierCode'],
      ['gr-product-', 'product'],
      ['gr-qty-', 'quantity'],
      ['gr-cost-', 'unitCost'],
      ['gr-discount-', 'discount'],
      ['gr-selling-', 'sellingPrice'],
      ['gr-compare-', 'compareAtPrice'],
      ['gr-vat-', 'vat'],
      ['gr-lot-', 'lot'],
      ['gr-lot-date-', 'expiry'],
      ['gr-serial-', 'serials'],
    ];
    for (const [prefix, field] of prefixMap) {
      if (id.startsWith(prefix)) {
        return field;
      }
    }
    return null;
  }

  protected lineRowActive(index: number): boolean {
    // Si chiede alla riga, non a un campo per volta: l'elenco scritto a mano
    // aveva dimenticato il codice fornitore da quando è diventato una cella
    // codice come gli altri, e la sua scelta si apriva senza alzare la riga.
    return this.lineSuggestionsOpen(index) || this.codeLookup.isOpenOnLine(index);
  }

  protected advanceFromProductField(index: number): void {
    if (this.lineHasLinkedProduct(index)) {
      this.focusLineField(index, 'quantity');
      return;
    }
    this.focusNextLineField(index, 'product');
  }

  protected onLineFieldKeydown(
    index: number,
    field: GoodsReceiptLineFocusField,
    event: KeyboardEvent,
  ): void {
    if (event.ctrlKey && event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveLineUp(index);
      return;
    }
    if (event.ctrlKey && event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveLineDown(index);
      return;
    }
    if (event.key === 'ArrowDown' && !event.shiftKey && !event.ctrlKey) {
      event.preventDefault();
      this.advanceToNextLine(index);
      return;
    }
    if (event.key === 'ArrowUp' && !event.shiftKey && !event.ctrlKey) {
      event.preventDefault();
      this.advanceToPreviousLine(index);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      // Qui c'era un ramo per «Cod. fornitore», morto da 08/2026: da quando quel
      // campo è una cella codice condivisa, Invio lo gestisce la cella, che
      // decide da sé ed emette `commit`. Questo gestore è agganciato a otto
      // campi e `supplierCode` non è tra loro, quindi il ramo non era più
      // raggiungibile. Tolto perché, letto qui, sembra una regola da riportare
      // dentro il punto unico della navigazione.
      if (field === 'quantity' && this.lineHasLinkedProduct(index)) {
        this.advanceToNextLine(index);
        return;
      }
      this.focusNextLineField(index, field);
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    // Tab deterministico (velocità inserimento): sempre e solo tra i campi
    // dati della riga — mai su icone, checkbox o pulsanti di servizio.
    if (event.shiftKey) {
      const order = this.visibleLineFocusFields(index);
      if (order.indexOf(field) <= 0 && index === 0) {
        // Prima cella della prima riga: lascia al browser l'uscita dalla tabella.
        return;
      }
      event.preventDefault();
      this.focusPreviousLineField(index, field);
      return;
    }
    event.preventDefault();
    this.focusNextLineField(index, field);
  }

  protected onLineSupplierSkuChange(index: number, value: string): void {
    this.lines.at(index).controls.supplierSku.setValue(value);
    this.markFormDirty();
  }

  /**
   * Cod. fornitore: stesso trattamento degli altri tre codici, senza eccezioni.
   *
   * Fino a 08/2026 cercava nella sola mappa in memoria degli articoli già
   * caricati nella maschera: lo stesso codice, corretto, veniva riconosciuto in
   * un documento e ignorato in un altro a seconda di cosa c'era a schermo — che
   * è peggio di non riconoscerlo mai. Ora passa dal catalogo come gli altri.
   *
   * A differenza degli altri il codice fornitore NON è unico: fornitori diversi
   * possono usare lo stesso per articoli diversi, quindi il caso «più di una
   * corrispondenza» qui è una scelta fra ARTICOLI, non fra varianti.
   */
  protected commitSupplierSkuLookup(index: number): void {
    this.commitCodeLookup(index, 'supplierCode');
  }

  private visibleLineFocusFields(index: number): readonly GoodsReceiptLineFocusField[] {
    const all: GoodsReceiptLineFocusField[] = [
      'articleCode',
      'sku',
      'barcode',
      'supplierCode',
      'product',
      'quantity',
      'unitCost',
      'discount',
      'sellingPrice',
      'compareAtPrice',
      'vat',
      'lot',
      'expiry',
      'serials',
    ];
    const linked = this.lineHasLinkedProduct(index);
    return all.filter((field) => {
      // La cella IVA è una select custom (§9.2): fuori dal giro Tab/Invio degli input.
      if (field === 'vat') {
        return false;
      }
      if (linked) {
        if (field === 'quantity' || field === 'unitCost' || field === 'discount') {
          return this.isLineColumnVisible(
            field === 'quantity' ? 'quantity' : field === 'unitCost' ? 'unitCost' : 'discount',
          );
        }
        if (field === 'lot' && this.isLineColumnVisible('lot')) {
          return true;
        }
        if (field === 'expiry' && this.isLineColumnVisible('expiry')) {
          return true;
        }
        if (field === 'serials' && this.isLineColumnVisible('serials')) {
          return true;
        }
        return false;
      }
      if (field === 'articleCode') {
        return this.isLineColumnVisible('articleCode');
      }
      if (field === 'sku') {
        return this.isLineColumnVisible('sku');
      }
      if (field === 'barcode') {
        return this.isLineColumnVisible('barcode');
      }
      if (field === 'supplierCode') {
        return this.isLineColumnVisible('supplierCode');
      }
      if (field === 'product') {
        return this.isLineColumnVisible('product');
      }
      if (field === 'quantity') {
        return this.isLineColumnVisible('quantity');
      }
      if (field === 'unitCost') {
        return this.isLineColumnVisible('unitCost');
      }
      if (field === 'discount') {
        return this.isLineColumnVisible('discount');
      }
      if (field === 'sellingPrice') {
        return this.isLineColumnVisible('sellingPrice');
      }
      if (field === 'compareAtPrice') {
        return this.isLineColumnVisible('compareAtPrice');
      }
      if (field === 'lot') {
        return this.isLineColumnVisible('lot');
      }
      if (field === 'expiry') {
        return this.isLineColumnVisible('expiry');
      }
      if (field === 'serials') {
        return this.isLineColumnVisible('serials');
      }
      return false;
    });
  }

  protected focusLineField(index: number, field: GoodsReceiptLineFocusField): void {
    const idMap: Record<GoodsReceiptLineFocusField, string> = {
      articleCode: `gr-code-${index}`,
      sku: `gr-sku-${index}`,
      barcode: `gr-barcode-${index}`,
      supplierCode: `gr-supplier-code-${index}`,
      product: `gr-product-${index}`,
      quantity: `gr-qty-${index}`,
      unitCost: `gr-cost-${index}`,
      discount: `gr-discount-${index}`,
      sellingPrice: `gr-selling-${index}`,
      compareAtPrice: `gr-compare-${index}`,
      vat: `gr-vat-${index}`,
      lot: `gr-lot-${index}`,
      expiry: `gr-lot-date-${index}`,
      serials: `gr-serial-${index}`,
    };
    globalThis.document.getElementById(idMap[field])?.focus();
  }

  protected focusFirstLineField(index: number): void {
    const order = this.visibleLineFocusFields(index);
    const first = order[0];
    if (first) {
      this.focusLineField(index, first);
    }
  }

  private focusLastLineField(index: number): void {
    const order = this.visibleLineFocusFields(index);
    const last = order[order.length - 1];
    if (last) {
      this.focusLineField(index, last);
    }
  }

  protected focusNextLineField(index: number, current: GoodsReceiptLineFocusField): void {
    const order = this.visibleLineFocusFields(index);
    const pos = order.indexOf(current);
    if (pos >= 0 && pos < order.length - 1) {
      this.focusLineField(index, order[pos + 1]!);
      return;
    }
    this.advanceToNextLine(index);
  }

  /** Shift+Tab: campo precedente della riga, o ultima cella della riga sopra. */
  protected focusPreviousLineField(index: number, current: GoodsReceiptLineFocusField): void {
    const order = this.visibleLineFocusFields(index);
    const pos = order.indexOf(current);
    if (pos > 0) {
      this.focusLineField(index, order[pos - 1]!);
      return;
    }
    this.advanceToPreviousLine(index);
  }

  private clearProductAutocomplete(): void {
    this.autocompleteLineIndex.set(null);
    this.activeSuggestionIndex.set(0);
  }

  private syncLineCodesFromVariants(): void {
    const summaries = this.pinnedVariants();
    for (const line of this.lines.controls) {
      const variantId = line.controls.variantId.value;
      if (!variantId) {
        continue;
      }
      const summary = summaries.find((row) => row.variantId === variantId);
      if (!summary) {
        continue;
      }
      line.controls.articleCode.setValue(summary.articleCode, { emitEvent: false });
      line.controls.sku.setValue(summary.sku, { emitEvent: false });
      line.controls.barcode.setValue(summary.barcode ?? '', { emitEvent: false });
      if (!line.controls.productName.value.trim()) {
        line.controls.productName.setValue(summary.productName, { emitEvent: false });
      }
      // Riallineamento in blocco: qui un «codice con cui hai agganciato» non
      // esiste, quindi vale solo quello del fornitore della testata.
      //
      // E riempie soltanto un campo VUOTO. Gira su un effect, quindi
      // sovrascrivere significherebbe vedersi cambiare sotto gli occhi, un
      // istante dopo, il codice appena digitato — in silenzio. Il ricalcolo su
      // tutte le righe quando cambia il fornitore resta invece un'altra cosa,
      // e lì sostituire è giusto: vedi `syncSupplierSkuOnAllLines`.
      const supplierSku = supplierCodeForDocumentLine({
        ofDocumentSupplier: this.supplierSkuByVariantId().get(variantId),
      });
      if (supplierSku && !line.controls.supplierSku.value.trim()) {
        line.controls.supplierSku.setValue(supplierSku, { emitEvent: false });
      }
    }
  }

  private ensureMinimumOneRow(): void {
    if (this.lines.length === 0) {
      // Riga di comodo dell'interfaccia: non e' una modifica dell'utente.
      this.withDirtySuppressed(() => this.lines.push(this.createLine()));
    }
  }

  private trimDuplicateTrailingEmptyRows(): void {
    while (this.lines.length > 1) {
      const lastIdx = this.lines.length - 1;
      const last = this.lines.at(lastIdx);
      const prev = this.lines.at(lastIdx - 1);
      if (this.lineIsEmpty(last) && this.lineIsEmpty(prev)) {
        this.withDirtySuppressed(() => this.lines.removeAt(lastIdx));
      } else {
        break;
      }
    }
  }

  private syncLineFieldAccess(): void {
    if (this.formReadOnly()) {
      return;
    }
    // Guardia di inizializzazione: patchFormFromDocument può girare in modo
    // sincrono (documento appena auto-creato) prima che i signal delle
    // summary siano istanziati come campi di classe.
    const summariesReady =
      typeof this.pinnedVariants === 'function' && typeof this.searchedVariants === 'function';
    const summaries: readonly VariantSummary[] = summariesReady
      ? mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants())
      : [];
    for (const line of this.lines.controls) {
      const linked = Boolean(line.controls.variantId.value);
      // Su riga collegata restano bloccati SOLO i campi che identificano il
      // prodotto (SKU/EAN/nome/lotto/seriali: si cambiano con la lente o
      // dall'anagrafica). Costo, IVA e prezzi restano modificabili: sono dati
      // economici della riga e un refuso deve poter essere corretto.
      const lockedWhenLinked = [
        line.controls.articleCode,
        line.controls.sku,
        line.controls.barcode,
        line.controls.supplierSku,
        line.controls.productName,
        line.controls.lotCode,
        line.controls.lotExpiryDate,
        line.controls.serialNumbersText,
      ] as const;
      for (const control of lockedWhenLinked) {
        if (linked) {
          control.disable({ emitEvent: false });
        } else {
          control.enable({ emitEvent: false });
        }
      }

      // Punto B: prodotto non gestito a magazzino (variante collegata o nuovo
      // articolo con toggle spento) → spunta "Mag." disattivata e bloccata.
      const variantId = line.controls.variantId.value;
      const summary = variantId ? summaries.find((row) => row.variantId === variantId) : undefined;
      let stockLock: 'lock' | 'unlock' | 'keep';
      if (variantId) {
        if (summary) {
          stockLock = summary.managesStock === false ? 'lock' : 'unlock';
        } else {
          // Summary non ancora caricata: non si tocca il flag della riga.
          stockLock = 'keep';
        }
      } else {
        stockLock = 'unlock';
      }
      if (stockLock === 'lock') {
        if (line.controls.loadsStock.value) {
          line.controls.loadsStock.setValue(false, { emitEvent: false });
        }
        line.controls.loadsStock.disable({ emitEvent: false });
      } else if (stockLock === 'unlock' && line.controls.loadsStock.disabled) {
        line.controls.loadsStock.enable({ emitEvent: false });
      }
    }
  }

  /** Valore grezzo riga nel formato del classificatore di stato (§5). */
  private lineDraft(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
  ): GoodsReceiptLineDraft {
    return line.getRawValue();
  }

  private lineIsEmpty(line: ReturnType<GoodsReceiptFormComponent['createLine']>): boolean {
    return lineDraftIsEmpty(this.lineDraft(line));
  }

  private lineHasSignificantProductData(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
  ): boolean {
    return lineDraftHasSignificantData(this.lineDraft(line));
  }

  private lineHasPersistableData(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
  ): boolean {
    return lineDraftPersistableForExplicitSave(this.lineDraft(line));
  }

  /**
   * Creazione articolo IMPLICITA: basta il nome digitato (≥ 2 caratteri)
   * senza articolo collegato. Lo SKU è facoltativo (chiarimento cliente su
   * audit "Creazione articolo"): il solo nome è sufficiente per creare
   * Product + variante tecnica. La creazione avviene lato server nella
   * stessa transazione del salvataggio (punto A): qui si decide solo se la
   * riga serializza `newProduct`.
   */
  private lineNeedsProductCreation(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
  ): boolean {
    if (line.controls.variantId.value) {
      return false;
    }
    return line.controls.productName.value.trim().length >= 2;
  }

  private lineNeedsVariantLink(line: ReturnType<GoodsReceiptFormComponent['createLine']>): boolean {
    if (line.controls.variantId.value || this.lineNeedsProductCreation(line)) {
      return false;
    }
    if (Number(line.controls.quantity.value) <= 0) {
      return false;
    }
    const code =
      line.controls.sku.value.trim() ||
      line.controls.barcode.value.trim() ||
      line.controls.articleCode.value.trim();
    return code.length > 0;
  }

  /**
   * Avvisi non bloccanti sulle righe dopo il salvataggio esplicito (§13):
   * la testata è sempre salvabile, le righe senza articolo restano nel
   * documento come righe economiche senza movimento.
   */
  private collectLineSaveWarnings(): string[] {
    const warnings: string[] = [];
    for (let index = 0; index < this.lines.length; index += 1) {
      const line = this.lines.at(index);
      const draft = this.lineDraft(line);
      if (draft.variantId || !line.controls.loadsStock.value) {
        continue;
      }
      if (!lineDraftPersistableForExplicitSave(draft)) {
        continue;
      }
      warnings.push(
        `Riga ${index + 1}: nessun articolo collegato, la riga è stata salvata senza carico magazzino.`,
      );
    }
    return warnings;
  }

  protected get lines(): FormArray<ReturnType<GoodsReceiptFormComponent['createLine']>> {
    return this.form.controls.lines;
  }

  private readonly selectedVariantIds = toSignal(
    this.form.controls.lines.valueChanges.pipe(
      startWith(this.form.getRawValue().lines),
      map((lines) => [...new Set(lines.map((l) => l.variantId).filter(Boolean))]),
    ),
    { initialValue: [] as string[] },
  );

  private readonly pinnedVariants = toSignal(
    toObservable(this.selectedVariantIds).pipe(
      switchMap((ids) => {
        if (ids.length === 0) {
          return of([] as readonly VariantSummary[]);
        }
        return forkJoin(
          ids.map((variantId) =>
            this.productService.searchVariantSummaries({ variantId }).pipe(
              map((rows) => rows[0] ?? null),
              catchError(() => of(null)),
            ),
          ),
        ).pipe(map((rows) => rows.filter((r): r is VariantSummary => r !== null)));
      }),
    ),
    { initialValue: [] as readonly VariantSummary[] },
  );

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /** Ultima nota anagrafica inserita in automatico (per sostituirla al cambio fornitore). */
  private lastAutoInsertedNote = '';

  protected readonly selectedSupplier = computed((): Supplier | null => {
    const supplierId = this.formValue()?.supplierId;
    if (!supplierId) {
      return null;
    }
    return this.suppliers().find((supplier) => supplier.id === supplierId) ?? null;
  });

  protected readonly supplierDocumentNote = computed(() => {
    const alert = this.selectedSupplier()?.documentCreationAlert?.trim();
    return alert ?? '';
  });

  protected readonly documentTotals = computed(() => {
    this.formValue();
    this.costEntryMode();
    this.vatCodes();

    // L'algoritmo dei totali è condiviso da tutti i tipi documento: qui si
    // riducono le righe a imponibile/imposta secondo la modalità costo
    // corrente, il resto (sconto documento, ripartizione IVA fra aliquote)
    // vive in domain/documents/utils/document-totals.util.
    const lines = this.lines.controls.map((line) => {
      const vat = this.lineVatInput(line);
      const amounts = this.lineVatAmounts(line);
      return {
        netMinor: amounts.lineNetMinor,
        vatMinor: amounts.lineVatMinor,
        vatRate: vat.ratePercent,
        countsVatInTotal: vat.vatAffectsSupplierTotal,
      };
    });

    return computeDocumentTotals(
      lines,
      parseEffectiveDiscountPercent(this.form.controls.documentDiscountPercent.value),
      this.currency,
    );
  });

  /** Riepilogo IVA raggruppato per Codice (§10.2), prima dello sconto documento. */
  protected readonly vatSummary = computed(() => {
    this.formValue();
    this.costEntryMode();
    this.vatCodes();
    const inputs = this.lines.controls.flatMap((line) => {
      const amounts = this.lineVatAmounts(line);
      if (amounts.lineNetMinor === 0 && amounts.lineVatMinor === 0) {
        return [];
      }
      const vatCode = this.vatCodeById().get(line.controls.vatCodeId.value);
      const vat = this.lineVatInput(line);
      return [
        {
          vatCodeId: vatCode?.id ?? null,
          code: vatCode?.code ?? formatVatRate(vat.ratePercent),
          ratePercent: vat.ratePercent,
          description: vatCode?.description ?? 'Aliquota da riga (senza Codice IVA)',
          lineNetMinor: amounts.lineNetMinor,
          lineVatMinor: amounts.lineVatMinor,
          lineGrossMinor: amounts.lineGrossMinor,
          reverseChargeVatMinor: amounts.reverseChargeVatMinor,
          nonDeductibleVatMinor: amounts.nonDeductibleVatMinor,
        },
      ];
    });
    return buildVatSummary(inputs);
  });

  protected readonly reverseChargeTotal = computed<Money>(() => ({
    amountMinor: this.vatSummary().reduce((sum, row) => sum + row.reverseChargeVatMinor, 0),
    currencyCode: this.currency,
  }));

  protected readonly nonDeductibleTotal = computed<Money>(() => ({
    amountMinor: this.vatSummary().reduce((sum, row) => sum + row.nonDeductibleVatMinor, 0),
    currencyCode: this.currency,
  }));

  /** Unità minori → Money per il riepilogo IVA nel template. */
  protected minorToMoney(amountMinor: number): Money {
    return { amountMinor, currencyCode: this.currency };
  }

  /** Opzioni per il dialog "Imposta IVA a tutte le righe" (formato esteso §10). */
  protected readonly applyVatSelectOptions = computed<readonly SelectMenuOption[]>(() =>
    this.purchaseVatCodes().map((vatCode) => ({
      value: vatCode.id,
      label: vatCodeOptionLabel(vatCode),
      detail: vatCode.nature.label,
    })),
  );

  protected readonly documentTotal = computed<Money>(() => this.documentTotals().total);

  protected readonly showSupplierForm = signal(false);
  readonly supplierForm = createSupplierFormGroup(this.fb);
  private readonly _savingSupplier = signal(false);
  protected readonly savingSupplier = this._savingSupplier.asReadonly();

  private supplierSubscription: Subscription | null = null;
  private submitSubscription: Subscription | null = null;
  private readonly dirtySinceLastSave = signal(false);
  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
  protected readonly saveHintStatus = computed(() => {
    if (this.saving()) {
      return 'saving' as const;
    }
    if (this.dirtySinceLastSave()) {
      return 'pending' as const;
    }
    return 'saved' as const;
  });
  protected readonly saving = computed(() => this._submitState().status === 'saving');
  protected readonly submitError = computed(() => {
    const state = this._submitState();
    return state.status === 'error' ? state.error : null;
  });

  protected lineGrossMoney(index: number): Money {
    this.formValue();
    const line = this.lines.at(index);
    return {
      amountMinor: this.lineGrossMinor(line),
      currencyCode: this.currency,
    };
  }

  protected lineMoney(index: number): Money {
    this.formValue();
    const line = this.lines.at(index);
    return {
      amountMinor: this.lineNetMinor(line),
      currencyCode: this.currency,
    };
  }

  protected lineHasDiscount(index: number): boolean {
    this.formValue();
    const line = this.lines.at(index);
    return parseEffectiveDiscountPercent(line.controls.discountPercent.value) > 0;
  }

  protected lineVariantSummary(index: number): VariantSummary | null {
    return findVariantSummaryById(
      this.lines.at(index)?.controls.variantId.value,
      this.pinnedVariants(),
      this.searchedVariants(),
    );
  }

  /**
   * Q.tà disp. con anteprima live: giacenza attuale + quantità in
   * arrivo su questa riga. Sul documento confermato i movimenti sono già
   * applicati (la giacenza del server include le righe salvate): per quelle
   * righe si mostra la giacenza così com'è, senza sommare di nuovo.
   */
  protected lineStockAvailable(index: number): string {
    const summary = this.lineVariantSummary(index);
    if (!summary || summary.stockOnHand == null) {
      return '—';
    }
    const line = this.lines.at(index);
    const incoming = this.lineIncomingQty(index);
    if (!line || incoming <= 0) {
      return String(summary.stockOnHand);
    }
    return String(summary.stockOnHand + incoming);
  }

  /** Tooltip della Q.tà disp.: esplicita giacenza attuale + in arrivo. */
  protected lineStockAvailableTitle(index: number): string | null {
    const summary = this.lineVariantSummary(index);
    if (!summary || summary.stockOnHand == null) {
      return null;
    }
    const incoming = this.lineIncomingQty(index);
    if (incoming <= 0) {
      return null;
    }
    return `Giacenza attuale ${summary.stockOnHand} + in arrivo ${incoming}`;
  }

  /** Quantità che questa riga aggiungerà alla giacenza alla conferma (0 se già applicata). */
  private lineIncomingQty(index: number): number {
    const line = this.lines.at(index);
    if (!line || !line.controls.loadsStock.value) {
      return 0;
    }
    // Riga già salvata su documento confermato: movimento già applicato.
    if (this.isConfirmedEdit() && line.controls.id.value) {
      return 0;
    }
    const qty = Number(line.controls.quantity.value);
    return Number.isFinite(qty) && qty > 0 ? qty : 0;
  }

  protected lineUnitOfMeasure(index: number): string {
    const summary = this.lineVariantSummary(index);
    return summary?.unitOfMeasure?.trim() || 'pz';
  }

  /** Unità di misura selezionabili per il nuovo articolo in creazione. */
  protected readonly unitOfMeasureOptions = COMMON_UNIT_OF_MEASURE;

  protected lineRowComplete(index: number): boolean {
    const line = this.lines.at(index);
    if (this.lineIsEmpty(line)) {
      return true;
    }
    const hasProduct =
      Boolean(line.controls.variantId.value.trim()) ||
      Boolean(line.controls.productName.value.trim());
    const hasCost = Boolean(line.controls.unitCost.value.trim());
    return hasProduct && hasCost;
  }

  /** Righe compilate e valide: contatore per testata righe e barra azioni. */
  protected validLinesCount(): number {
    return this.lines.controls.reduce(
      (count, line, index) =>
        count + (!this.lineIsEmpty(line) && this.lineRowComplete(index) ? 1 : 0),
      0,
    );
  }

  /** Pezzi totali sulle righe non vuote (somma delle quantità). */
  protected totalPiecesCount(): number {
    return this.lines.controls.reduce((sum, line) => {
      if (this.lineIsEmpty(line)) {
        return sum;
      }
      const qty = Number(line.controls.quantity.value);
      return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
    }, 0);
  }

  /** Valore riga pre-sconto nei termini digitati (per il barrato in colonna Totale). */
  private lineGrossMinor(line: ReturnType<GoodsReceiptFormComponent['createLine']>): number {
    const cost = parseMoneyInput(line.controls.unitCost.value, this.currency);
    const qty = Number(line.controls.quantity.value);
    return cost && Number.isFinite(qty) ? cost.amountMinor * qty : 0;
  }

  /** Imponibile riga (netto canonico dopo sconto, con eventuale scorporo IVA). */
  private lineNetMinor(line: ReturnType<GoodsReceiptFormComponent['createLine']>): number {
    return this.lineVatAmounts(line).lineNetMinor;
  }

  /** Dati IVA della riga: Codice IVA se presente, altrimenti aliquota legacy. */
  private lineVatInput(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
  ): VatComputationInput {
    const vatCode = this.vatCodeById().get(line.controls.vatCodeId.value);
    if (vatCode) {
      return vatInputFromVatCode(vatCode);
    }
    const raw = line.controls.vatRatePercent.value.trim();
    const rate = raw ? Number(raw) : null;
    return vatInputFromLegacyRate(rate != null && Number.isFinite(rate) ? rate : null);
  }

  /**
   * Costo NETTO d'anagrafica → valore da mostrare nella colonna, che con
   * «Costo ivato» attivo si legge lordo. Il costo memorizzato è sempre netto:
   * copiarlo tale e quale in una colonna ivata lo farebbe valere meno dell'IVA.
   */
  private costFieldValue(
    netMinor: number,
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
  ): string {
    const vat = this.lineVatInput(line);
    const displayed = entryIncludesVat(this.costEntryMode(), vat)
      ? grossFromNetMinor(netMinor, vat.ratePercent)
      : netMinor;
    return moneyToDecimalString({ amountMinor: displayed, currencyCode: this.currency }).replace(
      '.',
      ',',
    );
  }

  /** Importi IVA della riga secondo la modalità costo corrente (§15). */
  private lineVatAmounts(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
  ): VatLineAmounts {
    const cost = parseMoneyInput(line.controls.unitCost.value, this.currency);
    const qtyRaw = Number(line.controls.quantity.value);
    return computeVatLineAmounts({
      enteredUnitCostMinor: cost?.amountMinor ?? 0,
      costEntryMode: this.costEntryMode(),
      quantity: Number.isFinite(qtyRaw) ? qtyRaw : 0,
      discountPercent: parseEffectiveDiscountPercent(line.controls.discountPercent.value),
      vat: this.lineVatInput(line),
    });
  }

  // ── Colonna IVA: select riga, tooltip, applica a tutte (§9.2, §10, §13) ────

  /** Opzioni della riga: codici attivi + eventuale codice storico disattivato. */
  protected lineVatOptions(index: number): readonly SelectMenuOption[] {
    return vatOptionsIncludingSelected(
      this.purchaseVatOptions(),
      this.lines.at(index)?.controls.vatCodeId.value,
      this.vatCodeById(),
    );
  }

  protected lineVatValue(index: number): string {
    this.formValue();
    return this.lines.at(index)?.controls.vatCodeId.value ?? '';
  }

  /** Tooltip cella IVA: "22 · 22% · Imponibile 22%" (§9.2). */
  protected lineVatTooltip(index: number): string {
    const line = this.lines.at(index);
    const vatCode = this.vatCodeById().get(line.controls.vatCodeId.value);
    if (vatCode) {
      return vatCodeOptionLabel(vatCode);
    }
    const raw = line.controls.vatRatePercent.value.trim();
    return raw ? `IVA ${raw}% (senza Codice IVA)` : 'Nessun Codice IVA';
  }

  /** Cambio Codice IVA sulla singola riga (§13): il costo digitato resta invariato. */
  protected onLineVatSelect(index: number, value: string | null): void {
    const line = this.lines.at(index);
    if (!line || this.formReadOnly()) {
      return;
    }
    line.controls.vatCodeId.setValue(value ?? '');
    this.syncLegacyVatRate(line);
    this.markFormDirty();
  }

  /** Allinea l'aliquota legacy al Codice IVA (ordinamento colonna e fallback). */
  private syncLegacyVatRate(line: ReturnType<GoodsReceiptFormComponent['createLine']>): void {
    const vatCode = this.vatCodeById().get(line.controls.vatCodeId.value);
    if (vatCode) {
      line.controls.vatRatePercent.setValue(String(vatCode.ratePercent), { emitEvent: false });
    }
  }

  /**
   * Precedenza Codice IVA sulle nuove righe (§9.1): aliquota legacy già
   * presente → codice imponibile con la stessa aliquota (mai il default, per
   * non alterare l'IVA voluta); nessuna aliquota → predefinito aziendale.
   */
  private ensureLineVatCode(line: ReturnType<GoodsReceiptFormComponent['createLine']>): void {
    if (line.controls.vatCodeId.value) {
      return;
    }
    const raw = line.controls.vatRatePercent.value.trim();
    if (raw) {
      const rate = Number(raw);
      const matched = Number.isFinite(rate) ? this.vatCodeIdForRate(rate) : '';
      if (matched) {
        line.controls.vatCodeId.setValue(matched, { emitEvent: false });
        this.syncLegacyVatRate(line);
      }
      return;
    }
    const fallback = this.defaultVatCodeId();
    if (fallback) {
      line.controls.vatCodeId.setValue(fallback, { emitEvent: false });
      this.syncLegacyVatRate(line);
    }
  }

  /** Codice imponibile attivo con la stessa aliquota (per migrare aliquote legacy). */
  private vatCodeIdForRate(ratePercent: number): string {
    const match = this.purchaseVatCodes().find(
      (vatCode) =>
        vatCode.ratePercent === ratePercent &&
        (vatCode.calculationMode === 'standard' ||
          (ratePercent === 0 && vatCode.calculationMode === 'zero_rate')),
    );
    return match?.id ?? '';
  }

  // ── "Imposta IVA a tutte le righe…" (§10) ──────────────────────────────────

  /** Ambito del dialog IVA: tutte le righe (menu colonna) o solo le selezionate. */
  protected readonly applyVatScope = signal<'all' | 'selected'>('all');

  protected openApplyVatDialog(): void {
    this.vatHeaderMenuOpen.set(false);
    if (this.formReadOnly()) {
      return;
    }
    this.applyVatScope.set('all');
    this.applyVatCodeId.set(this.defaultVatCodeId());
    this.applyVatDialogOpen.set(true);
  }

  /** Variante massiva dalla barra di selezione: agisce sulle sole righe scelte. */
  protected openApplyVatDialogForSelection(): void {
    if (this.formReadOnly() || this.selectedLinesCount() === 0) {
      return;
    }
    this.applyVatScope.set('selected');
    this.applyVatCodeId.set(this.defaultVatCodeId());
    this.applyVatDialogOpen.set(true);
  }

  protected readonly applyVatDialogTitle = computed(() =>
    this.applyVatScope() === 'selected'
      ? 'Codice IVA da impostare sulle righe selezionate'
      : 'Codice IVA da impostare su tutte le righe',
  );

  protected closeApplyVatDialog(): void {
    this.applyVatDialogOpen.set(false);
  }

  /** Righe economiche interessate: esclude la riga vuota di inserimento (§10.1). */
  protected readonly applyVatTargetCount = computed(() => {
    this.formValue();
    const selected = this.selectedLineControls();
    const scoped =
      this.applyVatScope() === 'selected'
        ? this.lines.controls.filter((line) => selected.has(line))
        : this.lines.controls;
    return scoped.filter((line) => !this.lineIsEmpty(line)).length;
  });

  protected readonly applyVatSelectedCode = computed(() => {
    const id = this.applyVatCodeId();
    return id ? (this.vatCodeById().get(id) ?? null) : null;
  });

  /** Testo informativo del dialog coerente con la modalità costo (§14). */
  protected readonly applyVatModeHint = computed(() =>
    this.costEntryMode() === 'vat_included'
      ? 'Il costo ivato resterà invariato. Verranno ricalcolati imponibile e IVA scorporata.'
      : 'Il costo netto resterà invariato. Verranno ricalcolati IVA e totale.',
  );

  protected confirmApplyVatToAllLines(): void {
    const vatCodeId = this.applyVatCodeId();
    if (!vatCodeId || !this.vatCodeById().has(vatCodeId)) {
      return;
    }
    const selected = this.selectedLineControls();
    const selectedOnly = this.applyVatScope() === 'selected';
    for (const line of this.lines.controls) {
      if (this.lineIsEmpty(line) || (selectedOnly && !selected.has(line))) {
        continue;
      }
      line.controls.vatCodeId.setValue(vatCodeId, { emitEvent: false });
      this.syncLegacyVatRate(line);
    }
    this.applyVatDialogOpen.set(false);
    // Un solo salvataggio per l'intera operazione: il ricalcolo è atomico (§10.2).
    this.form.updateValueAndValidity();
    this.markFormDirty();
  }

  // ── Modalità costi netti / ivati (§11–§12) ─────────────────────────────────

  protected toggleCostModeMenu(): void {
    if (this.formReadOnly()) {
      return;
    }
    this.vatHeaderMenuOpen.set(false);
    this.costModeMenuOpen.update((open) => !open);
  }

  protected toggleVatHeaderMenu(): void {
    if (this.formReadOnly()) {
      return;
    }
    this.costModeMenuOpen.set(false);
    this.vatHeaderMenuOpen.update((open) => !open);
  }

  protected closeHeaderMenus(): void {
    this.costModeMenuOpen.set(false);
    this.vatHeaderMenuOpen.set(false);
  }

  protected selectCostMode(mode: PurchaseCostEntryMode): void {
    this.costModeMenuOpen.set(false);
    if (mode === this.costEntryMode() || this.formReadOnly()) {
      return;
    }
    const hasValuedCosts = this.lines.controls.some((line) => {
      const cost = parseMoneyInput(line.controls.unitCost.value, this.currency);
      return cost != null && cost.amountMinor > 0;
    });
    if (!hasValuedCosts) {
      this.costEntryModeTouched = true;
      this.costEntryMode.set(mode);
      this.markFormDirty();
      return;
    }
    this.pendingCostMode.set(mode);
    this.costModeDialogOpen.set(true);
  }

  /**
   * Conversione dei costi già inseriti (§12): il valore mostrato in colonna
   * viene convertito (netto ⇄ ivato) mantenendo invariati imponibile, IVA e
   * totale documento. Le righe senza IVA esposta restano invariate.
   */
  protected confirmCostModeConversion(): void {
    const mode = this.pendingCostMode();
    this.costModeDialogOpen.set(false);
    this.pendingCostMode.set(null);
    if (!mode || mode === this.costEntryMode()) {
      return;
    }
    for (const line of this.lines.controls) {
      const cost = parseMoneyInput(line.controls.unitCost.value, this.currency);
      if (!cost || cost.amountMinor <= 0) {
        continue;
      }
      const vat = this.lineVatInput(line);
      // Solo i codici con IVA esposta cambiano rappresentazione del valore.
      if (!entryIncludesVat('vat_included', vat)) {
        continue;
      }
      const converted =
        mode === 'vat_included'
          ? grossFromNetMinor(cost.amountMinor, vat.ratePercent)
          : netFromGrossMinor(cost.amountMinor, vat.ratePercent);
      line.controls.unitCost.setValue(
        moneyToDecimalString({ amountMinor: converted, currencyCode: this.currency }).replace(
          '.',
          ',',
        ),
        { emitEvent: false },
      );
    }
    this.costEntryModeTouched = true;
    this.costEntryMode.set(mode);
    this.form.updateValueAndValidity();
    this.markFormDirty();
  }

  protected cancelCostModeConversion(): void {
    this.costModeDialogOpen.set(false);
    this.pendingCostMode.set(null);
  }

  private applySupplierDefaultsToLine(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
  ): void {
    const supplierId = this.form?.controls.supplierId.value;
    if (!supplierId) {
      return;
    }
    const supplier = this.suppliers().find((item) => item.id === supplierId);
    if (!supplier) {
      return;
    }
    if (!line.controls.discountPercent.value.trim() && supplier.supplierDiscount?.trim()) {
      line.controls.discountPercent.setValue(supplier.supplierDiscount.trim(), {
        emitEvent: false,
      });
    }
    this.ensureLineVatCode(line);
  }

  protected onSupplierSelect(value: string | null): void {
    const wasGated = this.headerGateActive();
    this.form.controls.supplierId.setValue(value ?? '');
    this.form.controls.supplierId.markAsTouched();
    this.focusLinesWhenGateUnlocks(wasGated);
    // Il refetch dei collegamenti SKU fornitore parte già dalla subscription
    // su supplierId.valueChanges (costruttore): non ripeterlo qui, altrimenti
    // ogni selezione lancia due GET identiche in corsa tra loro.

    const supplier = this.suppliers().find((item) => item.id === value);
    if (supplier) {
      this.applySupplierPaymentDefault(supplier);
      for (const line of this.lines.controls) {
        if (!line.controls.discountPercent.value.trim() && supplier.supplierDiscount?.trim()) {
          line.controls.discountPercent.setValue(supplier.supplierDiscount.trim(), {
            emitEvent: false,
          });
        }
        // Precedenza Codice IVA fornitore (§9.1, Fase IVA §7): Codice IVA
        // predefinito del fornitore se attivo/acquisto, altrimenti predefinito
        // aziendale (risolto da ensureLineVatCode).
        if (!line.controls.vatCodeId.value) {
          const supplierVatCode = supplier.defaultVatCodeId
            ? this.vatCodeById().get(supplier.defaultVatCodeId)
            : undefined;
          if (supplierVatCode?.isActive && isPurchaseVatCode(supplierVatCode)) {
            line.controls.vatCodeId.setValue(supplierVatCode.id, { emitEvent: false });
            this.syncLegacyVatRate(line);
          }
        }
        this.ensureLineVatCode(line);
      }
    }
    this.markFormDirty();
  }

  protected onLocationSelect(value: string | null): void {
    const wasGated = this.headerGateActive();
    this.form.controls.locationId.setValue(value ?? '');
    this.form.controls.locationId.markAsTouched();
    this.focusLinesWhenGateUnlocks(wasGated);
  }

  protected onPaymentMethodChange(value: string | null): void {
    this.form.controls.paymentMethod.setValue(value ?? '');
    this.form.controls.paymentMethod.markAsDirty();
    this.markFormDirty();
  }

  /**
   * Precompila il «Pagamento» dalla modalità predefinita del fornitore, senza
   * mai sovrascrivere un valore già digitato dall'operatore (control dirty) o
   * quello di un documento esistente.
   */
  private applySupplierPaymentDefault(supplier: Supplier): void {
    const control = this.form.controls.paymentMethod;
    if (control.dirty || control.value.trim()) {
      return;
    }
    const method = supplier.paymentMethod?.trim();
    if (method) {
      control.setValue(method);
    }
  }

  /**
   * Appena fornitore+magazzino sono completi il blocco cade: il fuoco passa
   * alla prima riga per iniziare subito l'inserimento (velocità operativa).
   */
  private focusLinesWhenGateUnlocks(wasGated: boolean): void {
    if (!wasGated || this.headerGateActive()) {
      return;
    }
    // Doppio giro: prima Angular deve togliere il disabled dal fieldset.
    setTimeout(() => this.focusFirstLineField(0));
  }

  // ── Documento fornitore (tipo) e Causale di carico ─────────────────────────

  protected onExternalDocTypeSelect(value: string | null): void {
    if (value === this.NEW_TYPE_OPTION) {
      this.openNewTypeDialog();
      return;
    }
    if (value === this.MANAGE_TYPES_OPTION) {
      this.openTypePanel();
      return;
    }
    this.form.controls.externalDocumentTypeId.setValue(value ?? '');
  }

  /** Cambio tipo documento in modalità AUTO: applica il modello del tipo (§10). */
  private applyTemplateFromType(typeId: string): void {
    if (this.causalMode() === CausalGenerationMode.Manual) {
      return;
    }
    this.causalTemplate.set(this.templateForType(typeId));
    this.regenerateCausalFromTemplate();
  }

  private templateForType(typeId: string): string | null {
    if (!typeId) {
      return null;
    }
    const type = this.externalDocTypes().find((item) => item.id === typeId);
    if (!type) {
      return null;
    }
    return type.causalTemplate ?? `${type.shortLabel || type.name} {numero} del {data}`;
  }

  /** Numero/data documento fornitore cambiati: aggiorna la causale in AUTO. */
  private regenerateCausalFromTemplate(): void {
    if (this.causalMode() === CausalGenerationMode.Manual || this.formReadOnly()) {
      return;
    }
    this.applyGeneratedCausal({ emitEvent: false });
  }

  private applyGeneratedCausal(options: { readonly emitEvent: boolean }): void {
    const template = this.causalTemplate();
    if (template === null) {
      // Nessun tipo/modello selezionato: la causale generata si svuota solo se
      // era stata generata (mai toccare un testo manuale, qui mode è AUTO).
      this.form.controls.causalText.setValue('', { emitEvent: options.emitEvent });
      return;
    }
    const generated = renderCausalTemplate(template, {
      number: this.form.controls.externalDocNumber.value,
      dateIso: this.form.controls.externalDocDate.value || undefined,
    });
    this.form.controls.causalText.setValue(generated, { emitEvent: options.emitEvent });
  }

  // ── Nuovo tipo documento fornitore (§5) ────────────────────────────────────

  protected openNewTypeDialog(): void {
    this.newTypeName.set('');
    this.newTypeShortLabel.set('');
    this.newTypeTemplate.set('');
    this.newTypeError.set(null);
    this.newTypeDialogOpen.set(true);
  }

  protected closeNewTypeDialog(): void {
    this.newTypeDialogOpen.set(false);
  }

  /** "Salva e usa": crea il tipo, lo seleziona e genera la causale (§5). */
  protected saveAndUseNewType(): void {
    const name = this.newTypeName().trim();
    if (!name || this.newTypeBusy()) {
      return;
    }
    const shortLabel = this.newTypeShortLabel().trim() || name;
    const causalTemplate = this.newTypeTemplate().trim() || `${shortLabel} {numero} del {data}`;
    this.newTypeBusy.set(true);
    this.newTypeError.set(null);
    this.externalTypeService
      .create({ name, shortLabel, causalTemplate })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.newTypeBusy.set(false);
          this.newTypeDialogOpen.set(false);
          this.externalTypesReload.update((tick) => tick + 1);
          this.causalMode.set(CausalGenerationMode.Auto);
          this.form.controls.externalDocumentTypeId.setValue(created.id, { emitEvent: false });
          this.selectedExternalTypeId.set(created.id);
          this.causalTemplate.set(created.causalTemplate ?? causalTemplate);
          this.applyGeneratedCausal({ emitEvent: true });
        },
        error: (err: unknown) => {
          this.newTypeBusy.set(false);
          this.newTypeError.set(this.toAppError(err).message);
        },
      });
  }

  // ── Gestione tipi documento fornitore (§6) ─────────────────────────────────

  protected openTypePanel(): void {
    this.typePanelError.set(null);
    this.typePanelOpen.set(true);
  }

  protected closeTypePanel(): void {
    this.typePanelOpen.set(false);
    this.editingTypeId.set(null);
    this.addTypeName.set('');
    this.addTypeShortLabel.set('');
    this.addTypeTemplate.set('');
  }

  protected createTypeFromPanel(): void {
    const name = this.addTypeName().trim();
    if (!name || this.typePanelBusy()) {
      return;
    }
    const shortLabel = this.addTypeShortLabel().trim() || name;
    this.runTypeAction(
      this.externalTypeService.create({
        name,
        shortLabel,
        causalTemplate: this.addTypeTemplate().trim() || `${shortLabel} {numero} del {data}`,
      }),
      () => {
        this.addTypeName.set('');
        this.addTypeShortLabel.set('');
        this.addTypeTemplate.set('');
      },
    );
  }

  protected startEditType(type: ExternalDocumentType): void {
    this.editingTypeId.set(type.id);
    this.editingTypeName.set(type.name);
    this.editingTypeShortLabel.set(type.shortLabel);
    this.editingTypeTemplate.set(type.causalTemplate ?? '');
  }

  protected cancelEditType(): void {
    this.editingTypeId.set(null);
  }

  protected saveEditType(): void {
    const id = this.editingTypeId();
    const name = this.editingTypeName().trim();
    if (!id || !name || this.typePanelBusy()) {
      return;
    }
    this.runTypeAction(
      this.externalTypeService.update(id, {
        name,
        shortLabel: this.editingTypeShortLabel().trim() || name,
        causalTemplate: this.editingTypeTemplate().trim(),
      }),
      () => this.editingTypeId.set(null),
    );
  }

  protected duplicateType(type: ExternalDocumentType): void {
    if (this.typePanelBusy()) {
      return;
    }
    this.runTypeAction(
      this.externalTypeService.create({
        name: `${type.name} (copia)`,
        shortLabel: type.shortLabel,
        causalTemplate: type.causalTemplate,
      }),
    );
  }

  protected toggleTypeActive(type: ExternalDocumentType): void {
    if (this.typePanelBusy()) {
      return;
    }
    this.runTypeAction(this.externalTypeService.update(type.id, { isActive: !type.isActive }));
  }

  protected deleteType(type: ExternalDocumentType): void {
    if (this.typePanelBusy()) {
      return;
    }
    this.runTypeAction(this.externalTypeService.delete(type.id));
  }

  protected moveType(type: ExternalDocumentType, direction: -1 | 1): void {
    if (this.typePanelBusy()) {
      return;
    }
    const ordered = [...this.externalDocTypes()].map((item) => item.id);
    const index = ordered.indexOf(type.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) {
      return;
    }
    const swapped = ordered[target];
    if (swapped === undefined) {
      return;
    }
    ordered[target] = type.id;
    ordered[index] = swapped;
    this.runTypeAction(this.externalTypeService.reorder(ordered));
  }

  private runTypeAction(action$: Observable<unknown>, onSuccess?: () => void): void {
    this.typePanelBusy.set(true);
    this.typePanelError.set(null);
    action$.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.typePanelBusy.set(false);
        onSuccess?.();
        this.externalTypesReload.update((tick) => tick + 1);
      },
      error: (err: unknown) => {
        this.typePanelBusy.set(false);
        this.typePanelError.set(this.toAppError(err).message);
      },
    });
  }

  /**
   * `linkedWith` è il codice fornitore che l'operatore ha digitato e con cui
   * l'articolo si è agganciato. Passarlo è l'unico modo perché arrivi fin qui:
   * l'aggancio riceve l'id della variante, e «con quale codice» è
   * un'informazione che altrimenti si perde per strada.
   */
  protected onVariantSelect(index: number, value: string | null, linkedWith?: string): void {
    const line = this.lines.at(index);
    line.controls.variantId.setValue(value ?? '');
    if (value) {
      const summary = mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants()).find(
        (v) => v.variantId === value,
      );
      if (summary) {
        line.controls.articleCode.setValue(summary.articleCode, { emitEvent: false });
        line.controls.sku.setValue(summary.sku, { emitEvent: false });
        line.controls.barcode.setValue(summary.barcode ?? '', { emitEvent: false });
        const label = summary.productName || summary.title;
        line.controls.productName.setValue(label, { emitEvent: false });
        if (!line.controls.sellingPrice.value.trim() && summary.sellingPrice.amountMinor > 0) {
          line.controls.sellingPrice.setValue(
            moneyToDecimalString(summary.sellingPrice).replace('.', ','),
          );
        }
        if (!line.controls.compareAtPrice.value.trim() && summary.compareAtPrice?.amountMinor) {
          line.controls.compareAtPrice.setValue(
            moneyToDecimalString(summary.compareAtPrice).replace('.', ','),
          );
        }
        // Precedenza Codice IVA (§9.1, Fase IVA §7): articolo → Codice IVA
        // predefinito del fornitore (se attivo/acquisto) → predefinito
        // aziendale (risolto da ensureLineVatCode). La riga già valorizzata
        // (es. da documento origine) non viene toccata.
        if (!line.controls.vatCodeId.value) {
          const productVatCode = summary.defaultVatCodeId
            ? this.vatCodeById().get(summary.defaultVatCodeId)
            : undefined;
          if (productVatCode?.isActive && isPurchaseVatCode(productVatCode)) {
            line.controls.vatCodeId.setValue(productVatCode.id, { emitEvent: false });
            this.syncLegacyVatRate(line);
          }
        }
        if (!line.controls.vatCodeId.value) {
          const supplierVatCode = this.selectedSupplier()?.defaultVatCodeId
            ? this.vatCodeById().get(this.selectedSupplier()!.defaultVatCodeId!)
            : undefined;
          if (supplierVatCode?.isActive && isPurchaseVatCode(supplierVatCode)) {
            line.controls.vatCodeId.setValue(supplierVatCode.id, { emitEvent: false });
            this.syncLegacyVatRate(line);
          }
        }
        this.ensureLineVatCode(line);
        // Il costo va dopo il Codice IVA: senza aliquota non si saprebbe come
        // mostrarlo quando la colonna lavora a costi ivati.
        if (!line.controls.unitCost.value.trim() && summary.purchasePrice?.amountMinor) {
          line.controls.unitCost.setValue(
            this.costFieldValue(summary.purchasePrice.amountMinor, line),
          );
        }
        if (!line.controls.discountPercent.value.trim()) {
          const supplierDiscount = this.selectedSupplier()?.supplierDiscount?.trim();
          if (supplierDiscount) {
            line.controls.discountPercent.setValue(supplierDiscount, { emitEvent: false });
          }
        }
        // NON da `summary.supplierSku`: da quando la conferma non filtra per
        // fornitore, quel campo è il primo collegamento in ordine
        // deterministico — il codice di un fornitore qualsiasi. Vedi
        // `supplierCodeForDocumentLine`.
        const supplierSku = supplierCodeForDocumentLine({
          linkedWith,
          ofDocumentSupplier: this.supplierSkuByVariantId().get(value),
        });
        if (supplierSku) {
          line.controls.supplierSku.setValue(supplierSku, { emitEvent: false });
        }
      }
    }
    this.codeLookup.clear();
    this.clearProductAutocomplete();
    this.syncLineFieldAccess();
    this.markFormDirty();
  }

  protected productPanelPrefill = computed(() => {
    if (this.productPanelMode() !== 'create') {
      return null;
    }
    const index = this.productPanelLineIndex();
    if (index == null) {
      return null;
    }
    const line = this.lines.at(index);
    if (!line) {
      return null;
    }
    const name = line.controls.productName.value.trim();
    const cost = parseMoneyInput(line.controls.unitCost.value, this.currency);
    const selling = parseMoneyInput(line.controls.sellingPrice.value, this.currency);
    const compareAt = parseMoneyInput(line.controls.compareAtPrice.value, this.currency);
    return {
      name,
      description: line.controls.description.value.trim() || undefined,
      sku: line.controls.sku.value.trim() || undefined,
      barcode: line.controls.barcode.value.trim() || undefined,
      purchasePriceMajor: cost ? cost.amountMinor / 100 : null,
      sellingPriceMajor: selling ? selling.amountMinor / 100 : null,
      compareAtPriceMajor: compareAt ? compareAt.amountMinor / 100 : null,
      defaultVatCodeId: line.controls.vatCodeId.value.trim() || null,
    };
  });

  protected openProductAnagraphic(index: number): void {
    const line = this.lines.at(index);
    if (!line) {
      return;
    }
    const hasLineData =
      line.controls.productName.value.trim() ||
      line.controls.sku.value.trim() ||
      line.controls.barcode.value.trim();
    if (!hasLineData) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: "Inserisci almeno SKU, EAN o nome prodotto prima di completare l'anagrafica.",
        },
      });
      return;
    }
    this.openFullProductCreate(index);
  }

  protected openNewProduct(): void {
    this.productPanel.openForNewProduct();
  }

  protected openProductDetail(index: number): void {
    const variantId = this.lines.at(index)?.controls.variantId.value;
    if (!variantId) {
      return;
    }
    this.productService
      .searchVariantSummaries({ variantId })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          const productId = rows[0]?.productId;
          if (!productId) {
            this._submitState.set({
              status: 'error',
              error: {
                kind: AppErrorKind.NotFound,
                message: 'Prodotto collegato non trovato.',
              },
            });
            return;
          }
          this.openProductEditInPanel(index, productId);
        },
        error: (err: unknown) => {
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  protected poLineContext(index: number): {
    ordered: number;
    received: number;
    remaining: number;
  } | null {
    const poLineId = this.lines.at(index).controls.supplierOrderLineId.value;
    if (!poLineId) {
      return null;
    }
    const ctx = this.supplierOrderLineMap().get(poLineId);
    if (!ctx) {
      return null;
    }
    return {
      ordered: ctx.orderedQuantity,
      received: ctx.receivedQuantity,
      remaining: Math.max(0, ctx.orderedQuantity - ctx.receivedQuantity),
    };
  }

  protected openIncludeOrderPanel(): void {
    const supplierId = this.form.controls.supplierId.value;
    if (!supplierId) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: 'Seleziona un fornitore prima di includere un ordine.',
        },
      });
      return;
    }
    if (this.resolveSupplierOrderId()) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: 'Questo documento è già collegato a un ordine fornitore.',
        },
      });
      return;
    }
    this.includeOrderPanelOpen.set(true);
    this.loadReceivableOrders(supplierId);
  }

  protected closeIncludeOrderPanel(): void {
    this.includeOrderPanelOpen.set(false);
  }

  protected includeSupplierOrder(orderId: string): void {
    if (this.saving() || this.formReadOnly()) {
      return;
    }
    this.receivableOrdersLoading.set(true);
    this.supplierOrderService
      .getSupplierOrderById(orderId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (order) => {
          this.receivableOrdersLoading.set(false);
          this.mergeSupplierOrderLines(order);
          this.includeOrderPanelOpen.set(false);
        },
        error: (err: unknown) => {
          this.receivableOrdersLoading.set(false);
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  protected triggerCsvImport(input: HTMLInputElement): void {
    if (this.formReadOnly() || this.saving()) {
      return;
    }
    input.click();
  }

  protected onCsvFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.formReadOnly()) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = reader.result;
        const text = typeof raw === 'string' ? raw : '';
        const parsed = parseGoodsReceiptLinesCsv(text);
        this.applyImportedCsvLines(parsed);
      } catch (err: unknown) {
        const message =
          err instanceof GoodsReceiptCsvParseError
            ? err.message
            : 'Impossibile leggere il file CSV selezionato.';
        this._submitState.set({
          status: 'error',
          error: { kind: AppErrorKind.Validation, message },
        });
      }
    };
    reader.onerror = () => {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Unknown,
          message: 'Impossibile leggere il file CSV selezionato.',
        },
      });
    };
    reader.readAsText(file);
  }

  /**
   * "Salva documento" (prompt §2.1): unico salvataggio che scrive testata,
   * righe, totali, movimenti di magazzino e giacenze.
   */
  protected requestSaveDocument(): void {
    if (this.saving() || this.formReadOnly()) {
      return;
    }
    const validationError = this.validateForFinalSave();
    if (validationError) {
      this._submitState.set({ status: 'error', error: validationError });
      return;
    }
    // Nessun dialog: la scelta è la spunta per-documento (default acceso).
    this.executeExplicitSave(this.updateArticleReferenceCost());
  }

  /** Spunta «Aggiorna anche il costo di riferimento in anagrafica». */
  protected setUpdateArticleReferenceCost(checked: boolean): void {
    this.updateArticleReferenceCost.set(checked);
  }

  private syncSupplierOrderLineMapFromDocument(doc: DocumentRecord): void {
    if (!doc.linkedSupplierOrderLines?.length) {
      return;
    }
    const poMap = new Map<string, LinkedSupplierOrderLineContext>();
    for (const line of doc.linkedSupplierOrderLines) {
      poMap.set(line.id, line);
    }
    this.supplierOrderLineMap.set(poMap);
    this.pendingSupplierOrderId.set(null);
    this.pendingLinkedSupplierOrderRef.set(null);
  }

  protected requestUnlockEdit(): void {
    this.unlockDialogOpen.set(true);
  }

  protected confirmUnlockEdit(): void {
    this.unlockDialogOpen.set(false);
    this.editLock.unlock(this.persistedDocumentId());
    this.syncLineFieldAccess();
  }

  protected openSupplierDetail(): void {
    const supplierId = this.form.controls.supplierId.value;
    if (supplierId) {
      void this.router.navigate(['/app/suppliers', supplierId]);
    }
  }

  protected visibleLineColumnCount(): number {
    const poColumns = ['poOrdered', 'poReceived', 'poRemaining'] as const;
    let count = 0;
    for (const columnId of GOODS_RECEIPT_LINE_COLUMNS.map((column) => column.id)) {
      if ((poColumns as readonly string[]).includes(columnId)) {
        if (this.hasLinkedSupplierOrder() && this.isLineColumnVisible(columnId)) {
          count += 1;
        }
        continue;
      }
      if (this.isLineColumnVisible(columnId)) {
        count += 1;
      }
    }
    return Math.max(count, 1);
  }

  protected onLoadsStockChange(_index: number): void {
    this.markFormDirty();
  }

  protected addLine(): void {
    if (this.headerGateActive()) {
      return;
    }
    const lastIndex = Math.max(0, this.lines.length - 1);
    this.commitLineAndSave(lastIndex, () => {
      const line = this.createLine();
      this.applySupplierDefaultsToLine(line);
      this.lines.push(line);
      this.trimDuplicateTrailingEmptyRows();
      this.focusFirstLineField(this.lines.length - 1);
    });
  }

  protected toggleBarcodeScanMode(): void {
    if (this.formReadOnly()) {
      return;
    }
    this.barcodeScanMode.set(true);
    this.scheduleBarcodeScanFocus();
  }

  protected onBarcodeScanInput(value: string): void {
    this.barcodeScanDraft.set(value);
  }

  protected commitBarcodeScan(): void {
    if (this.formReadOnly() || this.barcodeScanBusy() || this.headerGateActive()) {
      return;
    }
    const raw = this.barcodeScanDraft().trim();
    if (!raw) {
      return;
    }
    const { quantity, code } = this.barcodeLookup.parseScanInput(raw);
    if (!code) {
      return;
    }
    this.barcodeScanDraft.set('');
    this.barcodeScanBusy.set(true);

    const supplierId = this.form.controls.supplierId.value || undefined;
    const locationId = this.form.controls.locationId.value || undefined;

    this.barcodeLookup
      .resolveVariantIdByCode(code, {
        supplierId,
        locationId,
        // Fallback proprio dell'Arrivo merce: SKU fornitore → variante nota.
        localFallback: (value) => this.variantIdBySupplierSku().get(normalizeSku(value)),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (variantId) => {
          this.barcodeScanBusy.set(false);
          if (variantId) {
            this.applyScannedVariant(variantId, quantity);
            return;
          }
          this.applyUnknownBarcodeScan(code, quantity);
        },
        error: () => {
          this.barcodeScanBusy.set(false);
          this.applyUnknownBarcodeScan(code, quantity);
        },
      });
  }

  protected isLineColumnSortable(columnId: string): boolean {
    return (GOODS_RECEIPT_SORTABLE_LINE_COLUMNS as readonly string[]).includes(columnId);
  }

  protected toggleLineSort(columnId: GoodsReceiptLineSortColumn): void {
    if (this.formReadOnly() || !this.isLineColumnVisible(columnId)) {
      return;
    }
    if (this.lineSortColumn() === columnId) {
      this.lineSortDirection.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      this.lineSortColumn.set(columnId);
      this.lineSortDirection.set('asc');
    }
    this.applyLineSort();
  }

  protected lineSortAriaLabel(columnId: GoodsReceiptLineSortColumn, label: string): string {
    if (this.lineSortColumn() !== columnId) {
      return `Ordina per ${label}`;
    }
    return this.lineSortDirection() === 'asc'
      ? `${label}: ordinamento crescente`
      : `${label}: ordinamento decrescente`;
  }

  private applyLineSort(): void {
    const column = this.lineSortColumn();
    if (!column || this.lines.length <= 1) {
      return;
    }
    const direction = this.lineSortDirection();
    const controls = [...this.lines.controls];
    controls.sort((left, right) => {
      const leftRaw = left.getRawValue();
      const rightRaw = right.getRawValue();
      const cmp = compareGoodsReceiptLines(
        {
          sku: leftRaw.sku,
          barcode: leftRaw.barcode,
          supplierSku: leftRaw.supplierSku,
          productName: leftRaw.productName,
          quantity: Number(leftRaw.quantity) || 0,
          unitCost: leftRaw.unitCost,
          vatRatePercent: leftRaw.vatRatePercent,
        },
        {
          sku: rightRaw.sku,
          barcode: rightRaw.barcode,
          supplierSku: rightRaw.supplierSku,
          productName: rightRaw.productName,
          quantity: Number(rightRaw.quantity) || 0,
          unitCost: rightRaw.unitCost,
          vatRatePercent: rightRaw.vatRatePercent,
        },
        column,
        this.currency,
      );
      return direction === 'asc' ? cmp : -cmp;
    });
    this.lines.clear();
    for (const control of controls) {
      this.lines.push(control);
    }
    this.markFormDirty();
  }

  private applyScannedVariant(variantId: string, quantity: number): void {
    let targetIndex = this.lines.controls.findIndex(
      (line) => line.controls.variantId.value === variantId,
    );
    if (targetIndex < 0) {
      targetIndex = this.lines.controls.findIndex((line) => this.lineIsEmpty(line));
      if (targetIndex < 0) {
        this.lines.push(this.createLine());
        targetIndex = this.lines.length - 1;
      }
      this.onVariantSelect(targetIndex, variantId);
      this.refreshLineVariantSummary(targetIndex, variantId);
    }
    const line = this.lines.at(targetIndex);
    const currentQty = Number(line.controls.quantity.value) || 0;
    line.controls.quantity.setValue(currentQty + quantity);
    line.controls.loadsStock.setValue(true);
    this.commitLineAndSave(targetIndex, () => this.scheduleBarcodeScanFocus());
  }

  private applyUnknownBarcodeScan(code: string, quantity: number): void {
    let targetIndex = this.lines.controls.findIndex((line) => this.lineIsEmpty(line));
    if (targetIndex < 0) {
      this.lines.push(this.createLine());
      targetIndex = this.lines.length - 1;
    }
    const line = this.lines.at(targetIndex);
    line.controls.barcode.setValue(code);
    line.controls.quantity.setValue(quantity);
    line.controls.loadsStock.setValue(true);
    this._submitState.set({
      status: 'error',
      error: {
        kind: AppErrorKind.NotFound,
        message: `Codice "${code}" non trovato. Completa SKU e nome prodotto sulla riga evidenziata.`,
      },
    });
    this.commitLineAndSave(targetIndex, () => this.focusLineField(targetIndex, 'sku'));
  }

  private scheduleBarcodeScanFocus(): void {
    queueMicrotask(() => this.focusBarcodeScanInput());
  }

  private focusBarcodeScanInput(): void {
    // Due input scanner (inline desktop, dock mobile): il focus va a quello
    // effettivamente visibile nel viewport corrente.
    const candidates = [this.barcodeScanInputRef(), this.barcodeScanDockInputRef()];
    for (const ref of candidates) {
      const el = ref?.nativeElement;
      if (el && el.offsetParent !== null) {
        el.focus();
        return;
      }
    }
  }

  private scheduleInitialLineFocus(): void {
    if (this.isEditMode() || this.formReadOnly()) {
      return;
    }
    queueMicrotask(() => {
      if (this.barcodeScanMode()) {
        this.focusBarcodeScanInput();
        return;
      }
      this.focusFirstLineField(0);
    });
  }

  protected removeLine(index: number): void {
    if (this.lines.length <= 1) {
      return;
    }
    this.lines.removeAt(index);
    this.ensureMinimumOneRow();
    this.trimDuplicateTrailingEmptyRows();
    this.markFormDirty();
  }

  /**
   * Duplica una riga sotto quella corrente (§10.3). La copia è una riga NUOVA
   * (senza id): al salvataggio genera il proprio movimento distinto (caso F).
   * Seriali e collegamento all'ordine fornitore non vengono copiati.
   */
  protected duplicateLine(index: number): void {
    if (this.formReadOnly()) {
      return;
    }
    this.insertLineCopy(index);
    this.syncLineFieldAccess();
    this.markFormDirty();
    this.focusLineField(index + 1, 'quantity');
  }

  private insertLineCopy(index: number): void {
    const source = this.lines.at(index).getRawValue();
    const copy = this.createLine();
    copy.patchValue(
      {
        variantId: source.variantId,
        sku: source.sku,
        barcode: source.barcode,
        supplierSku: source.supplierSku,
        productName: source.productName,
        description: source.description,
        quantity: source.quantity,
        unitCost: source.unitCost,
        discountPercent: source.discountPercent,
        sellingPrice: source.sellingPrice,
        compareAtPrice: source.compareAtPrice,
        vatRatePercent: source.vatRatePercent,
        vatCodeId: source.vatCodeId,
        loadsStock: source.loadsStock,
        lotCode: source.lotCode,
        lotExpiryDate: source.lotExpiryDate,
      },
      { emitEvent: false },
    );
    this.lines.insert(index + 1, copy);
  }

  // ── Selezione multipla righe: operazioni massive ────────────────────────────
  /** Righe selezionate, per riferimento al FormGroup: stabile su riordino/sort. */
  protected readonly selectedLineControls = signal<
    ReadonlySet<ReturnType<GoodsReceiptFormComponent['createLine']>>
  >(new Set());

  protected lineSelected(line: ReturnType<GoodsReceiptFormComponent['createLine']>): boolean {
    return this.selectedLineControls().has(line);
  }

  protected toggleLineSelected(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
    checked: boolean,
  ): void {
    this.selectedLineControls.update((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(line);
      } else {
        next.delete(line);
      }
      return next;
    });
  }

  /** Conteggio robusto: ignora selezioni di righe nel frattempo rimosse. */
  protected readonly selectedLinesCount = computed(() => {
    this.formValue();
    const selected = this.selectedLineControls();
    return this.lines.controls.filter((line) => selected.has(line)).length;
  });

  protected readonly allLinesSelected = computed(() => {
    this.formValue();
    const selected = this.selectedLineControls();
    return this.lines.length > 0 && this.lines.controls.every((line) => selected.has(line));
  });

  protected readonly someLinesSelected = computed(
    () => this.selectedLinesCount() > 0 && !this.allLinesSelected(),
  );

  protected toggleSelectAllLines(checked: boolean): void {
    this.selectedLineControls.set(checked ? new Set(this.lines.controls) : new Set());
  }

  protected clearLineSelection(): void {
    this.selectedLineControls.set(new Set());
  }

  protected removeSelectedLines(): void {
    if (this.formReadOnly() || this.selectedLinesCount() === 0) {
      return;
    }
    const selected = this.selectedLineControls();
    for (let i = this.lines.length - 1; i >= 0; i -= 1) {
      if (selected.has(this.lines.at(i))) {
        this.lines.removeAt(i);
      }
    }
    this.clearLineSelection();
    this.ensureMinimumOneRow();
    this.trimDuplicateTrailingEmptyRows();
    this.markFormDirty();
  }

  protected duplicateSelectedLines(): void {
    if (this.formReadOnly() || this.selectedLinesCount() === 0) {
      return;
    }
    const selected = this.selectedLineControls();
    // Dal basso verso l'alto: gli indici delle righe sopra restano validi.
    for (let i = this.lines.length - 1; i >= 0; i -= 1) {
      if (selected.has(this.lines.at(i))) {
        this.insertLineCopy(i);
      }
    }
    this.clearLineSelection();
    this.syncLineFieldAccess();
    this.markFormDirty();
  }

  protected fieldInvalid(name: 'supplierId' | 'locationId' | 'documentDate'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected lineFieldInvalid(index: number, name: 'productName' | 'quantity'): boolean {
    const control = this.lines.at(index).controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected unitCostInvalid(index: number): boolean {
    const control = this.lines.at(index).controls.unitCost;
    if (!(control.touched || control.dirty) || !control.value.trim()) {
      return false;
    }
    const parsed = parseMoneyInput(control.value, this.currency);
    return parsed === null || parsed.amountMinor < 0;
  }

  protected toggleSupplierForm(): void {
    this.showSupplierForm.update((open) => !open);
  }

  /**
   * Modifiche non salvate che meritano il dialog di uscita: form sporco E
   * contenuto significativo (documento esistente, fornitore scelto o almeno
   * una riga con dati). La sola riga vuota di comodo non blocca l'uscita.
   */
  private hasUnsavedWork(): boolean {
    if (!this.dirtySinceLastSave()) {
      return false;
    }
    if (this.editDocumentId() || this.form.controls.supplierId.value) {
      return true;
    }
    return this.lines.controls.some((line) => this.lineHasSignificantProductData(line));
  }

  canDeactivate(): boolean | Promise<boolean> {
    if (this.preserveEditSession()) {
      return true;
    }
    if (this.exitDialogOpen()) {
      return false;
    }
    if (this.saving()) {
      return false;
    }
    if (!this.hasUnsavedWork()) {
      return true;
    }
    // Modifiche non salvate (anche sola testata, §9.2): dialog
    // "Salva e chiudi / Chiudi senza salvare / Annulla" (§10.7).
    this.exitDialogOpen.set(true);
    return new Promise<boolean>((resolve) => {
      this.pendingDeactivate = resolve;
    });
  }

  protected confirmExitSaveDocument(): void {
    this.syncActiveFieldBeforeSave();
    const headerError = this.validateHeaderForSave();
    if (headerError) {
      this._submitState.set({ status: 'error', error: headerError });
      return;
    }
    this.exitDialogOpen.set(false);
    this._submitState.set({ status: 'saving' });
    this.linkAllLineCodes$()
      .pipe(
        switchMap(() => this.saveDocument$()),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (doc) => {
          this._submitState.set({ status: 'idle' });
          this.dirtySinceLastSave.set(false);
          this.loadedDocument.set(doc);
          this.resolveExit(true);
        },
        error: (err: unknown) => {
          this._submitState.set({
            status: 'error',
            error: this.toAppError(err),
          });
          this.resolveExit(false);
        },
      });
  }

  /** "Chiudi senza salvare": esce scartando le modifiche non ancora salvate. */
  protected confirmExitWithoutSaving(): void {
    this.exitDialogOpen.set(false);
    this.resolveExit(true);
  }

  protected cancelExitDialog(): void {
    this.exitDialogOpen.set(false);
    this.resolveExit(false);
  }

  private resolveExit(allow: boolean): void {
    const resolve = this.pendingDeactivate;
    this.pendingDeactivate = null;
    resolve?.(allow);
  }

  /** Ctrl/Cmd + S esegue "Salva documento" (prompt §12). */
  @HostListener('window:keydown', ['$event'])
  protected onWindowKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.requestSaveDocument();
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedWork() || this.saving()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  protected saveSupplier(): void {
    if (this.supplierForm.invalid || this._savingSupplier()) {
      this.supplierForm.markAllAsTouched();
      return;
    }
    const raw = this.supplierForm.getRawValue();
    this._savingSupplier.set(true);
    this.supplierSubscription = this.supplierService
      .createSupplier(mapSupplierFormToInput(raw))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (supplier) => {
          this._savingSupplier.set(false);
          this.showSupplierForm.set(false);
          resetSupplierFormGroup(this.supplierForm);
          this.suppliersReload.update((t) => t + 1);
          this.form.controls.supplierId.setValue(supplier.id);
          this.markFormDirty();
        },
        error: (err: unknown) => {
          this._savingSupplier.set(false);
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  protected isLineColumnVisible(columnId: string): boolean {
    this.lineTableColumnState();
    const normalizedId = normalizeGoodsReceiptColumnId(columnId);
    const settings = this.tenantSettings();
    if (normalizedId === 'lot' || normalizedId === 'expiry') {
      if (settings && !settings.lotsEnabled) {
        return false;
      }
    }
    if (normalizedId === 'serials' && settings && !settings.serialsEnabled) {
      return false;
    }
    if (
      (normalizedId === 'poOrdered' ||
        normalizedId === 'poReceived' ||
        normalizedId === 'poRemaining') &&
      !this.hasLinkedSupplierOrder()
    ) {
      return false;
    }
    if (normalizedId === 'supplierCode' && !this.form.controls.supplierId.value) {
      return false;
    }
    return this.columnPreferences.isColumnVisible(GOODS_RECEIPT_LINES_VIEW, normalizedId);
  }

  protected lineColumnWidth(columnId: string): string {
    this.lineTableColumnState();
    const normalizedId = normalizeGoodsReceiptColumnId(columnId);
    const def = GOODS_RECEIPT_LINE_COLUMNS.find((col) => col.id === normalizedId);
    const fallback = def?.defaultWidthPx ?? 96;
    return `${this.columnPreferences.columnWidth(GOODS_RECEIPT_LINES_VIEW, normalizedId, fallback)}px`;
  }

  protected lineColumnMinWidth(columnId: string): number {
    const normalizedId = normalizeGoodsReceiptColumnId(columnId);
    const def = GOODS_RECEIPT_LINE_COLUMNS.find((col) => col.id === normalizedId);
    return def?.minWidthPx ?? 48;
  }

  protected onLineColumnResize(columnId: string, widthPx: number): void {
    this.columnPreferences.setColumnWidth(
      GOODS_RECEIPT_LINES_VIEW,
      normalizeGoodsReceiptColumnId(columnId),
      widthPx,
    );
  }

  protected openFullProductCreate(lineIndex: number): void {
    this.productPanel.openForLine(lineIndex);
  }

  private openProductEditInPanel(lineIndex: number, productId: string): void {
    this.productPanel.openForEdit(lineIndex, productId);
  }

  protected closeProductPanel(): void {
    this.productPanel.close();
  }

  protected onProductCreatedFromPanel(event: { readonly variantId: string }): void {
    const lineIndex = this.productPanelLineIndex();
    if (lineIndex != null) {
      this.onVariantSelect(lineIndex, event.variantId);
      this.syncLineFieldAccess();
    }
    this.closeProductPanel();
  }

  protected onProductUpdatedFromPanel(_event: { readonly productId: string }): void {
    const lineIndex = this.productPanelLineIndex();
    const variantId =
      lineIndex != null ? (this.lines.at(lineIndex)?.controls.variantId.value ?? null) : null;
    if (lineIndex != null && variantId) {
      this.refreshLineVariantSummary(lineIndex, variantId);
    }
    this.closeProductPanel();
  }

  private refreshLineVariantSummary(index: number, variantId: string): void {
    this.productService
      .searchVariantSummaries({ variantId })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          const summary = rows[0];
          if (!summary) {
            return;
          }
          const line = this.lines.at(index);
          line.controls.articleCode.setValue(summary.articleCode, { emitEvent: false });
          line.controls.sku.setValue(summary.sku, { emitEvent: false });
          line.controls.barcode.setValue(summary.barcode ?? '', { emitEvent: false });
          const label = summary.productName || summary.title;
          line.controls.productName.setValue(label, { emitEvent: false });
          if (!line.controls.sellingPrice.value.trim() && summary.sellingPrice.amountMinor > 0) {
            line.controls.sellingPrice.setValue(
              moneyToDecimalString(summary.sellingPrice).replace('.', ','),
              { emitEvent: false },
            );
          }
          if (!line.controls.compareAtPrice.value.trim() && summary.compareAtPrice?.amountMinor) {
            line.controls.compareAtPrice.setValue(
              moneyToDecimalString(summary.compareAtPrice).replace('.', ','),
              { emitEvent: false },
            );
          }
          this.syncLineFieldAccess();
          this.markFormDirty();
        },
      });
  }

  protected onProductSavedWithoutAttach(event: { readonly variantId: string }): void {
    this.productPanel.savedWithoutAttach(event.variantId);
  }

  protected attachPendingVariantToLine(): void {
    const variantId = this.pendingAttachVariantId();
    const lineIndex = this.attachTargetLineIndex();
    if (variantId != null && lineIndex != null) {
      this.onVariantSelect(lineIndex, variantId);
    }
    this.productPanel.dismissAttach();
  }

  protected dismissAttachPendingVariant(): void {
    this.productPanel.dismissAttach();
  }

  protected openPrintPreview(): void {
    const id = this.persistedDocumentId();
    if (!id) {
      return;
    }
    void this.router.navigate(['/app/documents', id, 'print']);
  }

  protected downloadDocumentPdf(): void {
    const id = this.persistedDocumentId();
    if (!id || this.downloadingPdf()) {
      return;
    }
    const doc = this.loadedDocument();
    this.downloadingPdf.set(true);
    this.documentService
      .exportPdf(id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloadingPdf.set(false);
          const reference = doc?.reference ?? 'bozza';
          const stamp = (doc?.documentDate ?? new Date().toISOString()).slice(0, 10);
          this.downloadBlob(blob, `arrivo-merce-${reference}-${stamp}.pdf`);
        },
        error: (err: unknown) => {
          this.downloadingPdf.set(false);
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
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

  protected cancel(): void {
    const result = this.canDeactivate();
    if (result === false) {
      return;
    }
    if (result instanceof Promise) {
      void result.then((allow) => {
        if (allow) {
          this.navHistory.backOr(this.listPath);
        }
      });
      return;
    }
    if (!result) {
      return;
    }
    this.navHistory.backOr(this.listPath);
  }

  protected printLabels(): void {
    const raw = this.form.getRawValue();
    this.labelPrintService
      .printFromDocumentLines(
        raw.lines.map((line) => ({
          variantId: line.variantId || undefined,
          quantity: Number(line.quantity),
        })),
      )
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  protected reload(): void {
    this.loadTick.update((t) => t + 1);
  }

  private initDefaultsForCreate(): void {
    // Nessuna autoselezione della sede (specifica cliente «sede predefinita»):
    // il campo parte vuoto e l'utente conferma esplicitamente — la predefinita
    // è solo suggerita (prima nelle opzioni + hint cliccabile), anche quando
    // l'utente ha UNA sola sede autorizzata.
    this.ensureMinimumOneRow();
    this.scheduleInitialLineFocus();

    // Arrivo da ordine fornitore (percorso unico): il dettaglio ordine apre
    // questo form con ?supplierOrderId=… e le righe residue vengono copiate
    // client-side — nessuna bozza pre-creata dal backend. Il collegamento
    // all'ordine viaggia nel payload di «Salva documento».
    const supplierOrderId = this.route.snapshot.queryParamMap.get('supplierOrderId');
    if (supplierOrderId) {
      this.includeSupplierOrder(supplierOrderId);
    }

    // «Duplica documento» (Fase 3, no bozze): il param `duplicateFrom` porta
    // l'arrivo merce originale, copiato in un documento NUOVO. Nessuna copia
    // nasce a monte: si crea (confermato) solo al salvataggio.
    const duplicateFrom = this.route.snapshot.queryParamMap.get('duplicateFrom');
    if (duplicateFrom) {
      this.prefillFromDuplicate(duplicateFrom);
    } else {
      // Nuovo da zero: la modalità costo parte dalla preferenza operatore. Il
      // duplicato eredita invece la modalità dell'originale (patchFormFromDocument).
      this.initCostModeForNewDocument();
    }
  }

  private prefillFromDuplicate(duplicateFrom: string): void {
    this.documentService
      .getDocumentById(duplicateFrom)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (doc) => this.applyDuplicatePrefill(doc),
        error: () => this.prefillError.fail('duplicate'),
      });
  }

  private applyDuplicatePrefill(doc: DocumentRecord): void {
    this.patchFormFromDocument(doc);
    // Documento indipendente: numero fresco e data odierna.
    this.form.patchValue({
      protocolNumber: null,
      documentDate: new Date().toISOString().slice(0, 10),
    });
    // Nessun aggancio all'ordine fornitore dell'originale e righe come nuove
    // (nessun id riga né link riga-ordine): «Salva documento» crea un carico
    // nuovo, non aggiorna i movimenti né evade l'ordine del documento di partenza.
    this.supplierOrderLineMap.set(new Map());
    this.pendingSupplierOrderId.set(null);
    for (const line of this.lines.controls) {
      line.get('id')?.setValue('');
      line.get('supplierOrderLineId')?.setValue('');
    }
    this.refreshNumberPreview();
  }

  private resolveSupplierOrderId(): string | null {
    return this.loadedDocument()?.linkedSupplierOrder?.id ?? this.pendingSupplierOrderId() ?? null;
  }

  private loadReceivableOrders(supplierId: string): void {
    this.receivableOrdersLoading.set(true);
    this.receivableOrdersError.set(null);
    this.supplierOrderService
      .getSupplierOrders({ supplierId, page: 1, pageSize: 50 })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          // Mappa «Includi documento»: l'Arrivo merce può includere solo
          // ordini fornitore Confermati (non ancora conclusi da un arrivo).
          const orders = response.data.filter(
            (order) => order.status === SupplierOrderStatus.Confirmed,
          );
          this.receivableOrders.set(orders);
          this.receivableOrdersLoading.set(false);
        },
        error: (err: unknown) => {
          this.receivableOrdersLoading.set(false);
          this.receivableOrdersError.set(this.toAppError(err));
        },
      });
  }

  private mergeSupplierOrderLines(order: SupplierOrder): void {
    const existingPoLineIds = new Set(
      this.lines.controls
        .map((line) => line.controls.supplierOrderLineId.value)
        .filter((value) => value.length > 0),
    );

    const poMap = new Map(this.supplierOrderLineMap());
    for (const line of order.lines) {
      poMap.set(line.id, {
        id: line.id,
        variantId: line.variantId,
        sku: line.sku,
        orderedQuantity: line.orderedQuantity,
        receivedQuantity: line.receivedQuantity,
      });
    }
    this.supplierOrderLineMap.set(poMap);
    this.pendingSupplierOrderId.set(order.id);
    this.pendingLinkedSupplierOrderRef.set(order.reference);

    if (!this.form.controls.supplierId.value) {
      this.form.controls.supplierId.setValue(order.supplierId);
    }
    if (!this.form.controls.locationId.value && order.destinationLocationId) {
      this.form.controls.locationId.setValue(order.destinationLocationId);
    }

    let added = 0;
    for (const orderLine of order.lines) {
      const remaining = orderLine.orderedQuantity - orderLine.receivedQuantity;
      if (remaining <= 0 || existingPoLineIds.has(orderLine.id)) {
        continue;
      }
      this.lines.push(this.createLineFromSupplierOrderLine(orderLine, remaining));
      added += 1;
    }

    if (added === 0) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: "Nessuna quantità residua da ricevere sulle righe dell'ordine selezionato.",
        },
      });
      return;
    }

    this.trimDuplicateTrailingEmptyRows();
    this.syncLineFieldAccess();
    this.markFormDirty();
  }

  private createLineFromSupplierOrderLine(
    orderLine: SupplierOrder['lines'][number],
    quantity: number,
  ): ReturnType<GoodsReceiptFormComponent['createLine']> {
    const line = this.fb.group({
      id: this.fb.control(''),
      variantId: this.fb.control(orderLine.variantId),
      articleCode: this.fb.control(''),
      sku: this.fb.control(orderLine.sku),
      barcode: this.fb.control(''),
      supplierSku: this.fb.control(this.supplierSkuByVariantId().get(orderLine.variantId) ?? ''),
      productName: this.fb.control(orderLine.sku),
      description: this.fb.control(orderLine.sku),
      quantity: this.fb.control(quantity, {
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      // Costo netto dell'ordine: mostrato nella modalità di QUESTO documento,
      // che può essere diversa da quella con cui l'ordine era stato compilato.
      // Valorizzato sotto, quando la riga ha già il suo Codice IVA.
      unitCost: this.fb.control(''),
      discountPercent: this.fb.control(''),
      sellingPrice: this.fb.control(''),
      compareAtPrice: this.fb.control(''),
      vatRatePercent: this.fb.control(''),
      vatCodeId: this.fb.control(''),
      loadsStock: this.fb.control(true),
      newProductUnitOfMeasure: this.fb.control('pz'),
      supplierOrderLineId: this.fb.control(orderLine.id),
      lotCode: this.fb.control(''),
      lotExpiryDate: this.fb.control(''),
      serialNumbersText: this.fb.control(''),
    });
    this.applySupplierDefaultsToLine(line);
    line.controls.unitCost.setValue(this.costFieldValue(orderLine.unitCost.amountMinor, line), {
      emitEvent: false,
    });
    return line;
  }

  private applyImportedCsvLines(csvLines: readonly GoodsReceiptCsvLine[]): void {
    this._submitState.set({ status: 'saving' });
    from(csvLines)
      .pipe(
        concatMap((line) => {
          const code = line.sku || line.barcode;
          if (code) {
            return this.productService.findVariantByCode(code).pipe(
              map((variant) => ({ line, variant })),
              catchError(() => of({ line, variant: null as VariantByCodeDto | null })),
            );
          }
          const supplierSku = line.supplierSku.trim();
          if (supplierSku) {
            const variantId = this.variantIdBySupplierSku().get(normalizeSku(supplierSku));
            if (!variantId) {
              return of({ line, variant: null as VariantByCodeDto | null });
            }
            return this.productService.searchVariantSummaries({ variantId }).pipe(
              map((rows) => {
                const summary = rows[0];
                if (!summary) {
                  return { line, variant: null as VariantByCodeDto | null };
                }
                return {
                  line,
                  variant: {
                    variantId: summary.variantId,
                    productId: summary.productId,
                    sku: summary.sku,
                    barcode: summary.barcode ?? null,
                    productName: summary.productName,
                  } satisfies VariantByCodeDto,
                };
              }),
              catchError(() => of({ line, variant: null as VariantByCodeDto | null })),
            );
          }
          return of({ line, variant: null as VariantByCodeDto | null });
        }),
        toArray(),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (rows) => {
          let linked = 0;
          for (const { line, variant } of rows) {
            this.lines.push(this.createLineFromCsv(line, variant));
            if (variant) {
              linked += 1;
            }
          }
          this.csvImportSummary.set(
            `${rows.length} righe importate${linked > 0 ? ` (${linked} articoli collegati)` : ''}.`,
          );
          this.trimDuplicateTrailingEmptyRows();
          this.syncLineFieldAccess();
          this._submitState.set({ status: 'idle' });
          this.markFormDirty();
        },
        error: (err: unknown) => {
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  private createLineFromCsv(
    line: GoodsReceiptCsvLine,
    variant: VariantByCodeDto | null,
  ): ReturnType<GoodsReceiptFormComponent['createLine']> {
    const productName = variant?.productName ?? line.productName ?? line.sku ?? line.barcode;
    const row = this.fb.group({
      id: this.fb.control(''),
      variantId: this.fb.control(variant?.variantId ?? ''),
      articleCode: this.fb.control(''),
      sku: this.fb.control(variant?.sku ?? line.sku),
      barcode: this.fb.control(variant?.barcode ?? line.barcode),
      supplierSku: this.fb.control(
        line.supplierSku ||
          (variant ? (this.supplierSkuByVariantId().get(variant.variantId) ?? '') : ''),
      ),
      productName: this.fb.control(productName),
      description: this.fb.control(productName),
      quantity: this.fb.control(line.quantity, {
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      unitCost: this.fb.control(line.unitCostText),
      discountPercent: this.fb.control(''),
      sellingPrice: this.fb.control(''),
      compareAtPrice: this.fb.control(''),
      vatRatePercent: this.fb.control(line.vatRatePercentText),
      vatCodeId: this.fb.control(''),
      loadsStock: this.fb.control(true),
      newProductUnitOfMeasure: this.fb.control('pz'),
      supplierOrderLineId: this.fb.control(''),
      lotCode: this.fb.control(''),
      lotExpiryDate: this.fb.control(''),
      serialNumbersText: this.fb.control(''),
    });
    this.applySupplierDefaultsToLine(row);
    return row;
  }

  private validateForFinalSave(): AppError | null {
    // La sola testata è salvabile (§9.1-9.2): il documento resta in elenco
    // con totale 0,00 e senza movimenti finché non ci sono righe valide.
    const headerError = this.validateHeaderForSave();
    if (headerError) {
      return headerError;
    }
    if (this.hasInvalidCost()) {
      this.form.markAllAsTouched();
      return {
        kind: AppErrorKind.Validation,
        message: 'Controlla i costi delle righe prima di salvare.',
      };
    }
    // Le righe senza articolo NON bloccano il salvataggio (§13): la testata è
    // sempre salvabile e le righe restano senza movimento, con avviso.
    return null;
  }

  private executeExplicitSave(updateArticleReferenceCost: boolean): void {
    if (this.saving()) {
      return;
    }
    const validationError = this.validateForFinalSave();
    if (validationError) {
      this._submitState.set({ status: 'error', error: validationError });
      return;
    }

    this.syncActiveFieldBeforeSave();
    this._submitState.set({ status: 'saving' });
    this.submitSubscription?.unsubscribe();
    this.submitSubscription = this.linkAllLineCodes$()
      .pipe(
        switchMap(() => this.saveDocument$({ updateArticleReferenceCost })),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (doc) => {
          this._submitState.set({ status: 'idle' });
          this.dirtySinceLastSave.set(false);
          this.loadedDocument.set(doc);
          this.pendingSupplierOrderId.set(null);
          this.pendingLinkedSupplierOrderRef.set(null);
          // "Salva documento" salva e resta nella maschera (§10.7): si esce solo
          // con "Chiudi". Ma il documento si RIBLOCCA — decisione del 08/2026,
          // che supera §10.7 sul punto: meglio un gesto in più che una schermata
          // salvata e lasciata aperta a chiunque passi. Chi vuole continuare
          // sblocca, con lo stesso gesto di sempre.
          this.editLock.relock(doc.id);
          if (!this.editDocumentId()) {
            this.preserveEditSession.set(true);
            void this.router.navigate(['/app/documents', doc.id, 'edit'], { replaceUrl: true });
          }
          this.syncLineFieldAccess();
          this.ensureMinimumOneRow();
          this.trimDuplicateTrailingEmptyRows();
        },
        error: (err: unknown) => {
          // Protocollo già preso: il vincolo del database non ammette
          // duplicati, si può solo prendere il primo libero o correggere.
          const conflict = documentNumberConflictOf(err);
          if (conflict) {
            this._submitState.set({ status: 'idle' });
            this.numberConflictDialog.open(conflict);
            return;
          }
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  /** «Usa N»: prende il primo protocollo libero e risalva. */
  /**
   * Presa d'atto dell'avviso: scrive il numero aggiornato nella testata e si
   * ferma. Il salvataggio resta una pressione esplicita di Salva.
   */
  protected acknowledgeConflictNumber(): void {
    const nextAvailable = this.numberConflictDialog.acknowledge();
    if (nextAvailable === null) {
      return;
    }
    this.form.controls.protocolNumber.setValue(nextAvailable);
    this.form.controls.protocolNumber.markAsDirty();
  }

  private reloadSupplierVariantLinks(supplierId: string): void {
    if (!supplierId) {
      this.supplierSkuByVariantId.set(new Map());
      this.variantIdBySupplierSku.set(new Map());
      return;
    }
    this.supplierService
      .getVariantLinksBySupplier(supplierId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (links) => {
          const byVariant = new Map<string, string>();
          const bySku = new Map<string, string>();
          for (const link of links) {
            const sku = link.supplierSku?.trim();
            if (!sku) {
              continue;
            }
            byVariant.set(link.variantId, sku);
            bySku.set(normalizeSku(sku), link.variantId);
          }
          this.supplierSkuByVariantId.set(byVariant);
          this.variantIdBySupplierSku.set(bySku);
          this.syncSupplierSkuOnAllLines();
        },
        error: () => {
          this.supplierSkuByVariantId.set(new Map());
          this.variantIdBySupplierSku.set(new Map());
        },
      });
  }

  private syncSupplierSkuOnAllLines(): void {
    const byVariant = this.supplierSkuByVariantId();
    for (const line of this.lines.controls) {
      const variantId = line.controls.variantId.value;
      if (!variantId) {
        continue;
      }
      const sku = byVariant.get(variantId);
      if (sku) {
        line.controls.supplierSku.setValue(sku, { emitEvent: false });
      }
    }
  }

  private swapLines(from: number, to: number): void {
    const control = this.lines.at(from);
    this.lines.removeAt(from);
    this.lines.insert(to, control);
  }

  private persistedDocumentId(): string | null {
    return this.editDocumentId() ?? this.loadedDocument()?.id ?? null;
  }

  /**
   * Righe inviate nell'ultimo salvataggio, per riadottare id/variante dal
   * server. `registryOnly` marca le righe che creano un articolo a quantità
   * 0: il server crea la sola anagrafica e NON restituisce una riga
   * documento per esse.
   */
  private lastSavedLineEntries: {
    readonly control: ReturnType<GoodsReceiptFormComponent['createLine']>;
    readonly registryOnly: boolean;
  }[] = [];

  private buildSaveGoodsReceiptBody(): SaveGoodsReceiptBody {
    const raw = this.form.getRawValue();
    const supplierOrderId = this.resolveSupplierOrderId();
    const persistableControls = this.lines.controls.filter((line) =>
      lineDraftPersistableForExplicitSave(this.lineDraft(line)),
    );
    // Le righe che vanno in salvataggio ricevono il Codice IVA di precedenza
    // (§9.1) se ancora mancante (es. riga manuale digitata senza select).
    for (const control of persistableControls) {
      this.ensureLineVatCode(control);
    }
    this.lastSavedLineEntries = persistableControls.map((control) => ({
      control,
      registryOnly:
        this.lineNeedsProductCreation(control) && Number(control.getRawValue().quantity) <= 0,
    }));
    return {
      id: this.persistedDocumentId() ?? undefined,
      type: raw.type,
      // Data solo-giorno inviata così com'è (niente Date/UTC: nessuno
      // slittamento di giorno per fuso orario, §2/§18 caso 7).
      documentDate: raw.documentDate,
      supplierId: raw.supplierId || undefined,
      locationId: raw.locationId || undefined,
      currency: this.currency,
      causalText: raw.causalText.trim() || undefined,
      causalGenerationMode: this.causalMode(),
      causalTemplateSnapshot:
        this.causalMode() === CausalGenerationMode.Auto
          ? (this.causalTemplate() ?? undefined)
          : undefined,
      externalDocumentTypeId: raw.externalDocumentTypeId || undefined,
      notes: raw.notes.trim() || undefined,
      internalComment: raw.internalComment.trim() || undefined,
      paymentMethod: raw.paymentMethod.trim() || undefined,
      billingCause: raw.invoicePending ? 'In attesa fattura' : raw.billingCause.trim() || undefined,
      externalDocNumber: raw.externalDocNumber.trim() || undefined,
      externalDocDate: raw.externalDocDate || undefined,
      // Protocollo imposto a mano: non sposta il progressivo della serie.
      number: raw.protocolNumber ?? undefined,
      series: (raw.series ?? '').trim() || undefined,
      ...(supplierOrderId ? { supplierOrderId } : {}),
      documentDiscountPercent: parseEffectiveDiscountPercent(raw.documentDiscountPercent),
      purchaseCostEntryMode: this.costEntryMode(),
      lines: persistableControls.map((control) => {
        const line = control.getRawValue();
        const cost = parseMoneyInput(line.unitCost, this.currency);
        const name = line.productName.trim() || line.description.trim();
        const newProduct = this.lineNeedsProductCreation(control)
          ? this.buildNewProductBody(control)
          : undefined;
        return {
          id: line.id || undefined,
          variantId: line.variantId || undefined,
          sku: line.sku.trim() || undefined,
          description: name || line.description.trim() || 'Riga documento',
          quantity: Number(line.quantity),
          unitPriceMinor: cost?.amountMinor ?? 0,
          enteredUnitCostMinor: cost?.amountMinor ?? 0,
          discountPercent: parseEffectiveDiscountPercent(line.discountPercent ?? ''),
          vatRatePercent: line.vatRatePercent ? Number(line.vatRatePercent) : undefined,
          vatCodeId: line.vatCodeId || undefined,
          // Le righe senza articolo collegato non caricano ancora il magazzino;
          // con `newProduct` la variante nasce in transazione e il movimento
          // parte nello stesso salvataggio (punto A).
          loadsStock: line.loadsStock && (Boolean(line.variantId) || newProduct != null),
          supplierOrderLineId: line.supplierOrderLineId || undefined,
          lotCode: line.lotCode.trim() || undefined,
          lotExpiryDate: line.lotExpiryDate
            ? new Date(line.lotExpiryDate).toISOString()
            : undefined,
          serialNumbers: parseSerialNumbersText(line.serialNumbersText),
          newProduct,
        };
      }),
    };
  }

  /** Dati del nuovo articolo dalla riga (SKU facoltativo, punto A). */
  private buildNewProductBody(
    control: ReturnType<GoodsReceiptFormComponent['createLine']>,
  ): SaveGoodsReceiptNewProductBody {
    const line = control.getRawValue();
    const purchase = parseMoneyInput(line.unitCost, this.currency);
    const selling = parseMoneyInput(line.sellingPrice, this.currency);
    const compareAt = parseMoneyInput(line.compareAtPrice, this.currency);
    return {
      name: line.productName.trim(),
      sku: line.sku.trim() || undefined,
      barcode: line.barcode.trim() || undefined,
      sellingPriceMinor: selling?.amountMinor ?? undefined,
      compareAtPriceMinor: compareAt?.amountMinor || undefined,
      purchasePriceMinor: purchase?.amountMinor || undefined,
      vatCodeId: line.vatCodeId || undefined,
      unitOfMeasure: line.newProductUnitOfMeasure?.trim() || undefined,
    };
  }

  /**
   * Salvataggio unico "Salva documento" (prompt §2.1): testata + righe +
   * totali + movimenti + giacenze. Idempotente: gli id riga restituiti dal
   * server vengono riadottati per aggiornare i movimenti ai salvataggi futuri.
   */
  private saveDocument$(options?: {
    readonly updateArticleReferenceCost?: boolean;
  }): Observable<DocumentRecord> {
    const body = {
      ...this.buildSaveGoodsReceiptBody(),
      updateArticleReferenceCost: options?.updateArticleReferenceCost,
    };
    return this.documentService.saveGoodsReceipt(body).pipe(
      map(({ document, warnings, createdProducts }) => {
        this.adoptSavedLineState(document, createdProducts);
        // Avvisi locali sulle righe senza articolo (§13): salvate ma senza
        // carico magazzino.
        this.saveWarnings.set([...warnings, ...this.collectLineSaveWarnings()]);
        return document;
      }),
    );
  }

  /**
   * Riassegna id riga e articoli creati dal salvataggio ai form group
   * inviati. Le righe tornano nello stesso ordine (lineNumber progressivo sul
   * payload), MA le righe solo-anagrafica (nuovo articolo a quantità 0) non hanno
   * una riga documento nella risposta: vanno saltate nello zip. I prodotti
   * creati in transazione (punto A) arrivano in `createdProducts` indicizzati
   * sulla posizione della riga nel payload: la riga adotta variantId/sku.
   */
  private adoptSavedLineState(
    doc: DocumentRecord,
    createdProducts: readonly GoodsReceiptCreatedProductApiRow[] | undefined,
  ): void {
    const savedLines = doc.lines ?? [];
    const createdByIndex = new Map((createdProducts ?? []).map((row) => [row.lineIndex, row]));
    let savedIndex = 0;
    let adoptedVariant = false;
    for (let index = 0; index < this.lastSavedLineEntries.length; index += 1) {
      const entry = this.lastSavedLineEntries[index];
      if (!entry) {
        continue;
      }
      const stillPresent = this.lines.controls.includes(entry.control);
      const created = createdByIndex.get(index);
      if (created && stillPresent) {
        entry.control.controls.variantId.setValue(created.variantId, { emitEvent: false });
        entry.control.controls.sku.setValue(created.sku ?? '', { emitEvent: false });
        entry.control.controls.barcode.setValue(created.barcode ?? '', { emitEvent: false });
        adoptedVariant = true;
      }
      if (entry.registryOnly) {
        // Nessuna riga documento corrispondente nella risposta del server.
        continue;
      }
      const saved = savedLines[savedIndex];
      savedIndex += 1;
      if (stillPresent && saved) {
        entry.control.controls.id.setValue(saved.id, { emitEvent: false });
      }
    }
    this.lastSavedLineEntries = [];
    if (adoptedVariant) {
      this.syncLineFieldAccess();
    }
  }

  private syncActiveFieldBeforeSave(): void {
    const active = globalThis.document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  }

  /**
   * Gesto sulla riga (Invio / aggiungi riga / scansione / blur): collega
   * eventuali codici digitati e prosegue. NON salva: il documento si
   * persiste solo con "Salva documento".
   */
  private commitLineAndSave(index: number, after?: () => void): void {
    if (this.formReadOnly()) {
      after?.();
      return;
    }
    this.linkLineCodes$([index])
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          after?.();
        },
        error: (err: unknown) => {
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
          after?.();
        },
      });
  }

  /** Collega per SKU/EAN le righe con codice digitato ma senza articolo. */
  private linkAllLineCodes$() {
    const indices = this.lines.controls
      .map((_, lineIndex) => lineIndex)
      .filter((lineIndex) => this.lineNeedsVariantLink(this.lines.at(lineIndex)));
    return this.linkLineCodes$(indices);
  }

  private linkLineCodes$(lineIndices: readonly number[]) {
    const pending = lineIndices
      .map((index) => ({ line: this.lines.at(index), index }))
      .filter(({ line }) => line != null && this.lineNeedsVariantLink(line));
    if (pending.length === 0) {
      return of(undefined);
    }
    return from(pending).pipe(
      concatMap(({ line, index }) => this.linkLineByCode(line, index)),
      defaultIfEmpty(undefined),
      last(),
    );
  }

  /**
   * Codici già cercati e assenti a catalogo: evita di ripetere la stessa
   * lookup (404) a ogni autosave/salvataggio. Si svuota quando l'utente
   * modifica un codice riga.
   */
  private readonly codesNotFound = new Set<string>();

  private linkLineByCode(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
    index: number,
  ): Observable<void> {
    const code =
      line.controls.sku.value.trim() ||
      line.controls.barcode.value.trim() ||
      line.controls.articleCode.value.trim();
    if (!code || this.codesNotFound.has(code)) {
      return of(undefined);
    }
    return this.productService.findVariantByCode(code).pipe(
      switchMap((variant) => {
        if (!variant) {
          return of(undefined);
        }
        this.onVariantSelect(index, variant.variantId);
        return of(undefined);
      }),
      catchError((err: unknown) => {
        if ((err as { kind?: AppErrorKind })?.kind === AppErrorKind.NotFound) {
          this.codesNotFound.add(code);
        }
        return of(undefined);
      }),
    );
  }

  private patchFormFromDocument(doc: DocumentRecord): void {
    this.withDirtySuppressed(() => this.patchFormFromDocumentInner(doc));
    this.dirtySinceLastSave.set(false);
  }

  private patchFormFromDocumentInner(doc: DocumentRecord): void {
    if (this.preserveEditSession()) {
      // Cambio di rotta new → :id/edit: non è un caricamento nuovo, e il
      // documento è già stato ribloccato dal salvataggio che l'ha creato.
      this.preserveEditSession.set(false);
      return;
    }
    // Un documento che si riapre nasce protetto. La regola vive in
    // DocumentEditLockService ed è la stessa per ogni maschera: qui non si
    // decide più niente, si sincronizza soltanto.
    this.editLock.syncOnLoad(doc.id);
    const poMap = new Map<string, LinkedSupplierOrderLineContext>();
    for (const line of doc.linkedSupplierOrderLines ?? []) {
      poMap.set(line.id, line);
    }
    this.supplierOrderLineMap.set(poMap);

    this.form.patchValue({
      type: doc.type,
      supplierId: doc.supplierId ?? '',
      locationId: doc.locationId ?? '',
      documentDate: doc.documentDate.slice(0, 10),
      externalDocumentTypeId: doc.externalDocumentTypeId ?? '',
      externalDocNumber: doc.externalDocNumber ?? '',
      externalDocDate: doc.externalDocDate ? doc.externalDocDate.slice(0, 10) : '',
      protocolNumber: doc.number ?? null,
      series: doc.series ?? '',
      causalText: doc.causalText ?? '',
      notes: doc.notes ?? '',
      internalComment: doc.internalComment ?? '',
      paymentMethod: doc.paymentMethod ?? '',
      billingCause: doc.billingCause === 'In attesa fattura' ? '' : (doc.billingCause ?? ''),
      invoicePending: doc.billingCause === 'In attesa fattura',
      documentDiscountPercent:
        doc.documentDiscountPercent != null && doc.documentDiscountPercent > 0
          ? formatDiscountPercentValue(Number(doc.documentDiscountPercent))
          : '',
    });
    // Ripristina modalità e modello causale DOPO il patch (il patch dei campi
    // numero/data non deve rigenerare sopra il testo storico, §10/§13).
    this.selectedExternalTypeId.set(doc.externalDocumentTypeId ?? '');
    this.causalMode.set(
      doc.causalGenerationMode ??
        (doc.causalText?.trim() ? CausalGenerationMode.Manual : CausalGenerationMode.Auto),
    );
    this.causalTemplate.set(
      doc.causalTemplateSnapshot ?? this.templateForType(doc.externalDocumentTypeId ?? ''),
    );
    this.form.controls.causalText.setValue(doc.causalText ?? '', { emitEvent: false });
    // Modalità costi del documento (§11.1): mai sovrascritta dal default tenant.
    this.costEntryMode.set(doc.purchaseCostEntryMode ?? 'vat_excluded');
    this.costEntryModeTouched = true;
    this.lines.clear();
    for (const line of doc.lines ?? []) {
      this.lines.push(
        this.fb.group({
          id: this.fb.control(line.id),
          variantId: this.fb.control(line.variantId ?? ''),
          articleCode: this.fb.control(''),
          sku: this.fb.control(line.sku ?? ''),
          barcode: this.fb.control(''),
          supplierSku: this.fb.control(''),
          productName: this.fb.control(line.description),
          description: this.fb.control(line.description),
          quantity: this.fb.control(line.quantity, {
            validators: [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)],
          }),
          // Con costi ivati la colonna mostra il valore digitato (lordo), non
          // il netto canonico persistito in unitPrice (§11.4).
          unitCost: this.fb.control(
            moneyToDecimalString(
              line.enteredUnitCostMinor != null
                ? { amountMinor: line.enteredUnitCostMinor, currencyCode: this.currency }
                : line.unitPrice,
            ).replace('.', ','),
          ),
          sellingPrice: this.fb.control(''),
          compareAtPrice: this.fb.control(''),
          discountPercent: this.fb.control(
            line.discountPercent > 0 ? String(line.discountPercent) : '',
          ),
          vatRatePercent: this.fb.control(line.vatSnapshot?.ratePercent?.toString() ?? ''),
          vatCodeId: this.fb.control(line.vatCodeId ?? ''),
          // Le righe senza articolo persistono loadsStock=false come artefatto
          // tecnico (nessun movimento possibile): in UI il flag resta al
          // default attivo, così al collegamento dell'articolo il carico parte (§11).
          loadsStock: this.fb.control(line.variantId ? line.loadsStock : true),
          newProductUnitOfMeasure: this.fb.control('pz'),
          supplierOrderLineId: this.fb.control(line.supplierOrderLineId ?? ''),
          lotCode: this.fb.control(line.lotCode ?? ''),
          lotExpiryDate: this.fb.control(line.lotExpiryDate ? line.lotExpiryDate.slice(0, 10) : ''),
          serialNumbersText: this.fb.control((line.serialNumbers ?? []).join(', ')),
        }),
      );
    }
    if (this.lines.length === 0) {
      this.lines.push(this.createLine());
    }
    this.trimDuplicateTrailingEmptyRows();
    this.syncLineFieldAccess();
    this.reloadSupplierVariantLinks(doc.supplierId ?? '');
  }

  private createLine() {
    const line = this.fb.group({
      id: this.fb.control(''),
      variantId: this.fb.control(''),
      // Codice articolo: terzo criterio di ricerca accanto a SKU/EAN (§6).
      articleCode: this.fb.control(''),
      sku: this.fb.control(''),
      barcode: this.fb.control(''),
      supplierSku: this.fb.control(''),
      productName: this.fb.control(''),
      description: this.fb.control(''),
      quantity: this.fb.control(1, {
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      unitCost: this.fb.control(''),
      discountPercent: this.fb.control(''),
      sellingPrice: this.fb.control(''),
      compareAtPrice: this.fb.control(''),
      vatRatePercent: this.fb.control(''),
      vatCodeId: this.fb.control(''),
      loadsStock: this.fb.control(true),
      // Toggle "Gestito a magazzino" del nuovo articolo (punto B, default sì).
      newProductUnitOfMeasure: this.fb.control('pz'),
      supplierOrderLineId: this.fb.control(''),
      lotCode: this.fb.control(''),
      lotExpiryDate: this.fb.control(''),
      serialNumbersText: this.fb.control(''),
    });
    return line;
  }

  private hasInvalidCost(): boolean {
    return this.lines.controls.some((line) => {
      const value = line.controls.unitCost.value.trim();
      if (!value) {
        return false;
      }
      const parsed = parseMoneyInput(value, this.currency);
      return parsed === null || parsed.amountMinor < 0;
    });
  }

  private syncSupplierRequirement(type: DocumentType): void {
    const required = type !== DocumentType.ManualLoad && type !== DocumentType.InitialLoad;
    const control = this.form.controls.supplierId;
    if (required) {
      control.setValidators([Validators.required]);
    } else {
      control.clearValidators();
    }
    control.updateValueAndValidity({ emitEvent: false });
  }

  /**
   * Chiusura del pannello numerazioni: ricarica l'elenco serie SENZA riproporre
   * serie/protocollo — la selezione resta quella che era. Una serie appena
   * creata diventa scegliibile; cambiando serie il numero si ricalcola come oggi.
   */
  protected onSeriesManagerClosed(): void {
    this.seriesDialogOpen.set(false);
    const locationId = this.form.controls.locationId.value || null;
    this.countersService
      .available(this.form.controls.type.value, locationId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ counters }) => this._availableCounters.set(counters),
        error: () => undefined,
      });
  }

  /**
   * Propone il primo protocollo libero della serie. Non tocca un valore
   * digitato a mano (control «dirty»): quello è una scelta dell'operatore, e
   * un protocollo imposto non sposta il progressivo della serie.
   */
  private refreshNumberPreview(): void {
    const type = this.form.controls.type.value;
    const locationId = this.form.controls.locationId.value || null;
    this.countersService
      .available(type, locationId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ counters, proposedCounterId }) => {
          this._availableCounters.set(counters);
          // Documento già numerato o protocollo digitato: non si tocca.
          if (this.loadedDocument()?.reference || this.form.controls.protocolNumber.dirty) {
            return;
          }
          const proposed = counters.find((entry) => entry.id === proposedCounterId);
          if (proposed) {
            this.form.controls.series.setValue(proposed.series ?? '');
            this.form.controls.protocolNumber.setValue(proposed.nextNumber);
          }
        },
        error: () => undefined,
      });
  }

  /** Protocollo digitato in testata: vuoto = «assegnalo tu». */
  protected onProtocolNumberChange(value: number | null): void {
    this.form.controls.protocolNumber.setValue(value);
    this.form.controls.protocolNumber.markAsDirty();
  }

  /** Serie scelta: il protocollo passa al progressivo di quel contatore. */
  protected onSeriesChange(value: string): void {
    this.form.controls.series.setValue(value);
    this.form.controls.series.markAsDirty();
    const counter = this._availableCounters().find((entry) => (entry.series ?? '') === value);
    if (counter) {
      this.form.controls.protocolNumber.setValue(counter.nextNumber);
      this.form.controls.protocolNumber.markAsPristine();
    }
  }

  private toAppError(err: unknown): AppError {
    const base = isAppError(err) ? err : mapHttpErrorToAppError(err);
    return { ...base, message: this.toGoodsReceiptUserMessage(base.message) };
  }

  private toGoodsReceiptUserMessage(message: string): string {
    const normalized = message.trim();
    if (/carica magazzino ma non ha una variante associata/i.test(normalized)) {
      return 'Non è stato possibile salvare alcune righe. Collega un articolo esistente o inserisci lo SKU per crearne uno nuovo.';
    }
    if (/property .* should not exist/i.test(normalized)) {
      return 'Non è stato possibile salvare alcune righe. Controlla i dati evidenziati e riprova.';
    }
    if (/variante non trovata/i.test(normalized)) {
      return 'Non è stato possibile salvare alcune righe. Controlla i dati evidenziati e riprova.';
    }
    return (
      normalized ||
      'Non è stato possibile salvare alcune righe. Controlla i dati evidenziati e riprova.'
    );
  }
}
