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

import type { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import type { AppError } from '@core/models/app-error.model';
import type { Money } from '@core/models/common.model';
import type { LinkedSupplierOrderLineContext } from '@core/models/document.model';
import { CausalGenerationMode, DocumentStatus, DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { isConfirmedEditableDocumentStatus } from '@core/models/document.model';
import { COMMON_UNIT_OF_MEASURE } from '@core/models/product-catalog.model';
import {
  formatVatRate,
  isPurchaseVatCode,
  vatCodeOptionLabel,
  type PurchaseCostEntryMode,
  type VatCode,
} from '@core/models/vat-code.model';
import { BarcodeLookupService } from '@core/services/barcode-lookup.service';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
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
import { mapHttpErrorToAppError } from '@core/interceptors/http-error.mapper';
import { parseEffectiveDiscountPercent } from '@core/utils/discount-percent.util';
import type { Supplier } from '@core/models/supplier.model';
import { normalizeSku } from '@features/products/models/product-form.validators';
import { ProductService } from '@features/products/services/product.service';
import { mergeVariantSummaries } from '@features/products/utils/variant-summary-search.util';
import { SupplierService } from '@features/suppliers/services/supplier.service';
import { SupplierFormFieldsComponent } from '@features/suppliers/components/supplier-form-fields/supplier-form-fields.component';
import {
  createSupplierFormGroup,
  mapSupplierFormToInput,
  resetSupplierFormGroup,
} from '@features/suppliers/utils/supplier-form.util';
import { SupplierOrderService } from '@features/orders/services/supplier-order.service';
import { SupplierOrderStatus, type SupplierOrder } from '@core/models/supplier-order.model';
import { ProductLabelPrintService } from '@features/products/services/product-label-print.service';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
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
import { toIsoDateLocal } from '@shared/utils/calendar.util';

import { TenantFeatureSettingsService } from '@features/settings/services/tenant-feature-settings.service';
import type { TenantFeatureSettings } from '@features/settings/models/tenant-feature-settings.model';
import { ProductFormComponent } from '@features/products/product-form.component';

import type { VariantSummary } from '@features/products/models/variant-summary.model';
import type { VariantByCodeDto } from '@features/products/models/product.dto';
import { GoodsReceiptLineCardComponent } from './components/goods-receipt-line-card/goods-receipt-line-card.component';
import { GoodsReceiptLineCodeCellComponent } from './components/goods-receipt-line-code-cell/goods-receipt-line-code-cell.component';
import { GoodsReceiptLineProductCellComponent } from './components/goods-receipt-line-product-cell/goods-receipt-line-product-cell.component';
import { GoodsReceiptProductSearchPanelComponent } from './components/goods-receipt-product-search-panel/goods-receipt-product-search-panel.component';
import {
  GOODS_RECEIPT_LINE_COLUMNS,
  GOODS_RECEIPT_LINE_PRESETS,
  GOODS_RECEIPT_LINES_VIEW,
  normalizeGoodsReceiptColumnId,
} from './models/goods-receipt-line-columns.config';
import { DocumentAttachmentsPanelComponent } from './components/document-attachments-panel/document-attachments-panel.component';
import {
  documentTypeLabel,
  documentStatusDisplayLabel,
  documentStatusDisplayTone,
} from './models/document-labels.util';
import { isGoodsReceiptDocumentType } from './models/document-goods-receipt.util';
import { renderCausalTemplate } from './models/causal-template.util';
import type { ExternalDocumentType } from './models/external-document-type.model';
import { DocumentService } from './services/document.service';
import { ExternalDocumentTypeService } from './services/external-document-type.service';
import type {
  GoodsReceiptCreatedProductApiRow,
  SaveGoodsReceiptBody,
  SaveGoodsReceiptNewProductBody,
} from './services/document-api.mapper';
import { parseSerialNumbersText } from './utils/serial-numbers-input.util';
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
} from './utils/goods-receipt-vat.util';
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

/**
 * Documenti sbloccati nella sessione di lavoro corrente (§9): vive a livello
 * di modulo perché il componente viene distrutto/ricreato quando la route
 * passa da `goods-receipt/new` a `:id/edit`, e quel passaggio non deve
 * ribloccare il documento. Regola severa: uscendo dalla maschera gli id
 * sbloccati vengono rilasciati (vedi onDestroy), così ogni riapertura del
 * documento ripresenta il blocco.
 */
const SESSION_UNLOCKED_DOC_IDS = new Set<string>();

type GoodsReceiptLineFocusField =
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

type GoodsReceiptCodeLookupField = 'sku' | 'barcode';

/**
 * Form operativo arrivo merce / carico fornitore (§3). Righe editabili, creazione
 * rapida articolo dalla riga, conferma con carico magazzino server-side.
 */
@Component({
  selector: 'app-goods-receipt-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BadgeComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    DateInputComponent,
    SelectMenuComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    TableColumnPickerComponent,
    HoverTooltipComponent,
    TableColumnResizeDirective,
    DocumentAttachmentsPanelComponent,
    GoodsReceiptLineCardComponent,
    GoodsReceiptLineCodeCellComponent,
    GoodsReceiptLineProductCellComponent,
    GoodsReceiptProductSearchPanelComponent,
    SlidePanelComponent,
    ProductFormComponent,
    SupplierFormFieldsComponent,
    LocationSuggestionHintComponent,
  ],
  templateUrl: './goods-receipt-form.component.html',
  // Banda footer sticky (totali orizzontali + azioni) condivisa con
  // l'Ordine cliente: secondo stylesheet, fuori dal budget del principale.
  styleUrls: ['./goods-receipt-form.component.scss', './document-form-footer.shared.scss'],
})
export class GoodsReceiptFormComponent implements CanComponentDeactivate {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly documentService = inject(DocumentService);
  private readonly externalTypeService = inject(ExternalDocumentTypeService);
  private readonly supplierService = inject(SupplierService);
  private readonly supplierOrderService = inject(SupplierOrderService);
  private readonly labelPrintService = inject(ProductLabelPrintService);
  private readonly productService = inject(ProductService);
  private readonly barcodeLookup = inject(BarcodeLookupService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly paymentOptionsService = inject(PaymentOptionsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly listPath = '/app/documents/arrivi-merce';
  protected readonly currency = DEFAULT_CURRENCY;
  protected readonly formatMoney = formatMoney;
  protected readonly formatVatRate = formatVatRate;
  protected readonly documentTypeLabel = documentTypeLabel;

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

  protected readonly typeOptions: readonly SelectMenuOption[] = [
    DocumentType.GoodsReceipt,
    DocumentType.SupplierDdt,
    DocumentType.SupplierInvoiceAccompanying,
    DocumentType.ManualLoad,
    DocumentType.InitialLoad,
  ].map((type) => ({ value: type, label: documentTypeLabel(type) }));

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
  protected readonly editUnlocked = signal(false);
  /** Evita il lock immediato dopo auto-save che crea il documento e cambia route. */
  private readonly preserveEditSession = signal(false);
  protected readonly unlockDialogOpen = signal(false);

  /** Id sbloccati da QUESTA istanza: rilasciati all'uscita (riblocco alla riapertura). */
  private readonly unlockedByThisInstance = new Set<string>();

  private markSessionUnlocked(docId: string | null | undefined): void {
    if (docId) {
      SESSION_UNLOCKED_DOC_IDS.add(docId);
      this.unlockedByThisInstance.add(docId);
    }
  }
  protected readonly productPanelOpen = signal(false);
  protected readonly productPanelLineIndex = signal<number | null>(null);
  protected readonly productPanelMode = signal<'create' | 'edit'>('create');
  protected readonly productPanelEditProductId = signal<string | null>(null);
  protected readonly attachTargetLineIndex = signal<number | null>(null);
  protected readonly downloadingPdf = signal(false);
  private readonly supplierSkuByVariantId = signal<Map<string, string>>(new Map());
  private readonly variantIdBySupplierSku = signal<Map<string, string>>(new Map());
  protected readonly productSearchPanelOpen = signal(false);
  protected readonly productSearchLineIndex = signal<number | null>(null);
  protected readonly productSearchLaunchTerm = signal('');
  protected readonly productSearchLaunchSeq = signal(0);
  protected readonly autocompleteLineIndex = signal<number | null>(null);
  protected readonly activeSuggestionIndex = signal(0);
  protected readonly codeLookupLineIndex = signal<number | null>(null);
  protected readonly codeLookupField = signal<GoodsReceiptCodeLookupField | null>(null);
  protected readonly codeLookupSuggestions = signal<readonly VariantSummary[]>([]);
  protected readonly deleteDocumentDialogOpen = signal(false);
  protected readonly attachWithoutAddDialogOpen = signal(false);
  protected readonly pendingAttachVariantId = signal<string | null>(null);
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
  protected readonly supplierPriceDialogOpen = signal(false);
  private readonly pendingSupplierOrderId = signal<string | null>(null);
  private readonly pendingLinkedSupplierOrderRef = signal<string | null>(null);
  private pendingConfirmAfterPriceAsk: ((applyPrices: boolean) => void) | null = null;

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

  private readonly vatCodeById = computed(
    () => new Map(this.vatCodes().map((vatCode) => [vatCode.id, vatCode])),
  );

  /** Codici attivi utilizzabili in acquisto, ordinati come in Impostazioni. */
  private readonly purchaseVatCodes = computed(() =>
    this.vatCodes().filter((vatCode) => vatCode.isActive && isPurchaseVatCode(vatCode)),
  );

  protected readonly purchaseVatOptions = computed<readonly SelectMenuOption[]>(() =>
    this.purchaseVatCodes().map((vatCode) => this.vatOptionFromCode(vatCode)),
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

  /** Copia l'impostazione tenant nei nuovi documenti (mai in quelli caricati). */
  private readonly costModeDefaultEffect = effect(() => {
    const settings = this.tenantSettings();
    if (!settings || this.editDocumentId() || this.costEntryModeTouched) {
      return;
    }
    this.costEntryMode.set(settings.defaultPurchaseCostEntryMode ?? 'vat_excluded');
  });

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

  protected readonly formReadOnly = computed(() => this.isConfirmedEdit() && !this.editUnlocked());

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
              isConfirmedEditableDocumentStatus(doc.status) &&
              isGoodsReceiptDocumentType(doc.type) &&
              doc.blockAfterConfirm !== true;
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
    causalText: this.fb.control(''),
    notes: this.fb.control(''),
    internalComment: this.fb.control(''),
    billingCause: this.fb.control(''),
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

    // Regola severa: lo sblocco vale solo finché si lavora nella maschera.
    // All'uscita gli id sbloccati da questa istanza vengono rilasciati e il
    // documento torna protetto alla riapertura. Il passaggio di route
    // new → :id/edit (preserveEditSession) non è un'uscita: lo sblocco deve
    // sopravvivere per l'istanza ricreata.
    this.destroyRef.onDestroy(() => {
      if (this.preserveEditSession()) {
        return;
      }
      for (const id of this.unlockedByThisInstance) {
        SESSION_UNLOCKED_DOC_IDS.delete(id);
      }
    });
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

  protected codeSuggestions(
    index: number,
    field: GoodsReceiptCodeLookupField,
  ): readonly VariantSummary[] {
    if (this.codeLookupLineIndex() !== index || this.codeLookupField() !== field) {
      return [];
    }
    return this.codeLookupSuggestions();
  }

  protected codeSuggestionsOpen(index: number, field: GoodsReceiptCodeLookupField): boolean {
    return (
      this.codeLookupLineIndex() === index &&
      this.codeLookupField() === field &&
      this.codeLookupSuggestions().length > 0
    );
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
   * Codice articolo del prodotto collegato alla riga (colonna selezionabile
   * §Codice articolo): risolto dalle summary varianti, come il nome prodotto.
   */
  protected lineArticleCode(index: number): string {
    const line = this.lines.at(index);
    const variantId = line?.controls.variantId.value;
    if (!variantId) {
      return '—';
    }
    const summary = mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants()).find(
      (v) => v.variantId === variantId,
    );
    return summary?.articleCode || '—';
  }

  protected onLineSkuChange(index: number, value: string): void {
    this.lines.at(index).controls.sku.setValue(value);
    this.codesNotFound.clear();
    this.clearProductAutocomplete();
    // Ricerca contestuale live anche sul codice (§7): da 3 caratteri in su.
    const term = value.trim();
    if (term.length >= VARIANT_SEARCH_MIN_CHARS && !this.lineHasLinkedProduct(index)) {
      this.codeLookupLineIndex.set(index);
      this.codeLookupField.set('sku');
      this.codeSearchDraft.set(term);
    } else {
      this.clearCodeLookup();
    }
    this.markFormDirty();
  }

  /** Ricerca live per SKU: debounce condiviso con la ricerca per nome (§7). */
  private readonly codeSearchDraft = signal('');

  private readonly skuLiveSearchSubscription = toObservable(this.codeSearchDraft)
    .pipe(
      debounceTime(VARIANT_SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
      switchMap((term) => {
        const value = term.trim();
        if (value.length < VARIANT_SEARCH_MIN_CHARS) {
          return of(null);
        }
        const supplierId = this.form.controls.supplierId.value || undefined;
        const locationId = this.form.controls.locationId.value || undefined;
        return this.productService
          .searchVariantSummaries({ search: value, pageSize: 20, supplierId, locationId })
          .pipe(catchError(() => of([] as readonly VariantSummary[])));
      }),
      takeUntilDestroyed(),
    )
    .subscribe((results) => {
      if (results === null) {
        return;
      }
      // La lookup potrebbe essere stata chiusa (blur/Esc) mentre la ricerca
      // era in corso: in quel caso i risultati non vanno mostrati.
      if (this.codeLookupField() !== 'sku' || this.codeLookupLineIndex() == null) {
        return;
      }
      this.codeLookupSuggestions.set(results);
    });

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
    this.clearCodeLookup();
  }

  protected onLineBarcodeChange(index: number, value: string): void {
    this.lines.at(index).controls.barcode.setValue(value);
    this.codesNotFound.clear();
    this.clearCodeLookup();
    this.markFormDirty();
  }

  protected onLineProductNameChange(index: number, value: string): void {
    const line = this.lines.at(index);
    line.controls.productName.setValue(value);
    this.autocompleteLineIndex.set(index);
    this.activeSuggestionIndex.set(0);
    this.variantSearchDraft.set(value);
    this.clearCodeLookup();
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
    this.clearCodeLookup();
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

  protected onLineCodeFocus(index: number, field: GoodsReceiptCodeLookupField): void {
    this.clearProductAutocomplete();
    if (this.codeLookupLineIndex() === index && this.codeLookupField() === field) {
      return;
    }
    this.clearCodeLookup();
  }

  protected onLineCodeBlur(index: number): void {
    if (this.codeLookupLineIndex() === index) {
      this.clearCodeLookup();
    }
    this.commitLineIfSignificant(index);
  }

  protected commitSkuLookup(index: number): void {
    this.commitCodeLookup(index, 'sku');
  }

  protected commitBarcodeLookup(index: number): void {
    this.commitCodeLookup(index, 'barcode');
  }

  private commitCodeLookup(index: number, field: GoodsReceiptCodeLookupField): void {
    if (this.lineHasLinkedProduct(index)) {
      this.focusNextLineField(index, field);
      return;
    }
    const line = this.lines.at(index);
    const value =
      field === 'sku' ? line.controls.sku.value.trim() : line.controls.barcode.value.trim();
    if (!value) {
      this.clearCodeLookup();
      this.focusNextLineField(index, field);
      return;
    }

    const supplierId = this.form.controls.supplierId.value || undefined;
    const locationId = this.form.controls.locationId.value || undefined;

    this.productService
      .searchVariantSummaries({ search: value, pageSize: 20, supplierId, locationId })
      .pipe(
        take(1),
        catchError(() => of([] as readonly VariantSummary[])),
      )
      .subscribe((results) => {
        const matches = this.filterLookupMatches(results, value, field);
        if (matches.length === 1) {
          const match = matches[0];
          if (match) {
            this.onVariantSelect(index, match.variantId);
            this.clearCodeLookup();
            this.focusLineField(index, 'quantity');
          }
          return;
        }
        if (matches.length > 1) {
          this.codeLookupLineIndex.set(index);
          this.codeLookupField.set(field);
          this.codeLookupSuggestions.set(matches);
          return;
        }

        this.productService
          .findVariantByCode(value)
          .pipe(
            take(1),
            catchError(() => of(null)),
          )
          .subscribe((variant) => {
            if (variant) {
              this.onVariantSelect(index, variant.variantId);
              this.clearCodeLookup();
              this.focusLineField(index, 'quantity');
              return;
            }
            this.clearCodeLookup();
            // Nessun articolo per il codice digitato: senza feedback l'utente
            // crede di aver collegato l'articolo e il salvataggio "non salva".
            this._submitState.set({
              status: 'error',
              error: {
                kind: AppErrorKind.NotFound,
                message: `Codice "${value}" non trovato a catalogo. Verifica il codice oppure crea l'articolo dal campo Nome prodotto (azione "Crea" nell'elenco).`,
              },
            });
            this.focusNextLineField(index, field);
          });
      });
  }

  private filterLookupMatches(
    results: readonly VariantSummary[],
    value: string,
    field: GoodsReceiptCodeLookupField,
  ): readonly VariantSummary[] {
    if (field === 'sku') {
      const exact = results.filter((row) => normalizeSku(row.sku) === normalizeSku(value));
      return exact.length > 0 ? exact : results;
    }
    const normalized = value.trim();
    const exact = results.filter((row) => row.barcode?.trim() === normalized);
    return exact.length > 0 ? exact : results;
  }

  protected onCodeSuggestionPick(index: number, variantId: string): void {
    this.onVariantSelect(index, variantId);
    this.clearCodeLookup();
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
    return (
      this.lineSuggestionsOpen(index) ||
      this.codeSuggestionsOpen(index, 'sku') ||
      this.codeSuggestionsOpen(index, 'barcode')
    );
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
      if (field === 'supplierCode') {
        this.commitSupplierSkuLookup(index);
        return;
      }
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

  protected commitSupplierSkuLookup(index: number): void {
    const line = this.lines.at(index);
    if (!line || line.controls.variantId.value) {
      this.focusNextLineField(index, 'supplierCode');
      return;
    }
    const code = line.controls.supplierSku.value.trim();
    if (!code) {
      this.focusNextLineField(index, 'supplierCode');
      return;
    }
    const variantId = this.variantIdBySupplierSku().get(normalizeSku(code));
    if (!variantId) {
      this.focusNextLineField(index, 'supplierCode');
      return;
    }
    this.onVariantSelect(index, variantId);
    this.refreshLineVariantSummary(index, variantId);
    this.focusLineField(index, 'quantity');
  }

  private visibleLineFocusFields(index: number): readonly GoodsReceiptLineFocusField[] {
    const all: GoodsReceiptLineFocusField[] = [
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

  private clearCodeLookup(): void {
    this.codeLookupLineIndex.set(null);
    this.codeLookupField.set(null);
    this.codeLookupSuggestions.set([]);
    this.codeSearchDraft.set('');
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
      line.controls.sku.setValue(summary.sku, { emitEvent: false });
      line.controls.barcode.setValue(summary.barcode ?? '', { emitEvent: false });
      if (!line.controls.productName.value.trim()) {
        line.controls.productName.setValue(summary.productName, { emitEvent: false });
      }
      const supplierSku =
        summary.supplierSku?.trim() || this.supplierSkuByVariantId().get(variantId) || '';
      if (supplierSku) {
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
    const code = line.controls.sku.value.trim() || line.controls.barcode.value.trim();
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
    const currency = this.currency;
    let lineSumMinor = 0;
    const lineTaxParts: {
      readonly netMinor: number;
      readonly vatMinor: number;
      readonly vatRate: number;
      readonly affectsSupplierTotal: boolean;
    }[] = [];

    for (const line of this.lines.controls) {
      const vat = this.lineVatInput(line);
      const amounts = this.lineVatAmounts(line);
      lineSumMinor += amounts.lineNetMinor;
      lineTaxParts.push({
        netMinor: amounts.lineNetMinor,
        vatMinor: amounts.lineVatMinor,
        vatRate: vat.ratePercent,
        affectsSupplierTotal: vat.vatAffectsSupplierTotal,
      });
    }

    const docDiscountPercent = parseEffectiveDiscountPercent(
      this.form.controls.documentDiscountPercent.value,
    );
    const docDiscountAmount = Math.round((lineSumMinor * docDiscountPercent) / 100);
    const discountedLineSum = lineSumMinor - docDiscountAmount;

    // L'IVA concorre al totale SOLO per i codici con vatAffectsSupplierTotal
    // (reverse charge e 0% restano fuori); con sconto documento la quota IVA è
    // ricalcolata sulla ripartizione proporzionale (stessa logica del backend).
    let taxMinor: number;
    if (docDiscountPercent === 0 || lineSumMinor === 0) {
      taxMinor = lineTaxParts.reduce(
        (sum, part) => sum + (part.affectsSupplierTotal ? part.vatMinor : 0),
        0,
      );
    } else {
      taxMinor = lineTaxParts.reduce((sum, part) => {
        if (!part.affectsSupplierTotal || part.vatRate <= 0) {
          return sum;
        }
        const share = part.netMinor / lineSumMinor;
        const discountedNet = Math.round(discountedLineSum * share);
        return sum + Math.round((discountedNet * part.vatRate) / 100);
      }, 0);
    }

    return {
      linesTotal: { amountMinor: lineSumMinor, currencyCode: currency },
      documentDiscount: { amountMinor: docDiscountAmount, currencyCode: currency },
      subtotal: { amountMinor: discountedLineSum, currencyCode: currency },
      tax: { amountMinor: taxMinor, currencyCode: currency },
      total: {
        amountMinor: discountedLineSum + taxMinor,
        currencyCode: currency,
      },
    };
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
    const line = this.lines.at(index);
    const variantId = line.controls.variantId.value;
    if (!variantId) {
      return null;
    }
    return (
      mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants()).find(
        (summary) => summary.variantId === variantId,
      ) ?? null
    );
  }

  /**
   * Q.tà disponibile con anteprima live: giacenza attuale + quantità in
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

  /** Tooltip della Q.tà disponibile: esplicita giacenza attuale + in arrivo. */
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

  private vatOptionFromCode(vatCode: VatCode): SelectMenuOption {
    // Riga sintetica su UNA riga (dropdown IVA): codice + aliquota + descrizione,
    // senza ripetere la natura per ogni voce (resta nel tooltip di cella).
    const rate = formatVatRate(vatCode.ratePercent);
    const description = vatCode.description.trim();
    const detail = description.toLowerCase().includes(rate.toLowerCase())
      ? description
      : `${rate} · ${description}`;
    return {
      value: vatCode.id,
      label: vatCode.code,
      detail,
    };
  }

  /** Opzioni della riga: codici attivi + eventuale codice storico disattivato. */
  protected lineVatOptions(index: number): readonly SelectMenuOption[] {
    const options = this.purchaseVatOptions();
    const selectedId = this.lines.at(index)?.controls.vatCodeId.value;
    if (!selectedId || options.some((option) => option.value === selectedId)) {
      return options;
    }
    const selected = this.vatCodeById().get(selectedId);
    if (!selected) {
      return options;
    }
    return [...options, this.vatOptionFromCode(selected)];
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

  protected onTypeSelect(value: string | null): void {
    if (value && isGoodsReceiptDocumentType(value as DocumentType)) {
      this.form.controls.type.setValue(value as DocumentType);
    }
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

  protected onVariantSelect(index: number, value: string | null): void {
    const line = this.lines.at(index);
    line.controls.variantId.setValue(value ?? '');
    if (value) {
      const summary = mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants()).find(
        (v) => v.variantId === value,
      );
      if (summary) {
        line.controls.sku.setValue(summary.sku, { emitEvent: false });
        line.controls.barcode.setValue(summary.barcode ?? '', { emitEvent: false });
        const label = summary.productName || summary.title;
        line.controls.productName.setValue(label, { emitEvent: false });
        if (!line.controls.unitCost.value.trim() && summary.purchasePrice?.amountMinor) {
          line.controls.unitCost.setValue(
            moneyToDecimalString(summary.purchasePrice).replace('.', ','),
          );
        }
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
        if (!line.controls.discountPercent.value.trim()) {
          const supplierDiscount = this.selectedSupplier()?.supplierDiscount?.trim();
          if (supplierDiscount) {
            line.controls.discountPercent.setValue(supplierDiscount, { emitEvent: false });
          }
        }
        const supplierSku =
          summary.supplierSku?.trim() || this.supplierSkuByVariantId().get(value) || '';
        if (supplierSku) {
          line.controls.supplierSku.setValue(supplierSku, { emitEvent: false });
        }
      }
    }
    this.clearCodeLookup();
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

  protected readonly productPanelTitle = computed(() => {
    if (this.productPanelMode() === 'edit') {
      return 'Anagrafica prodotto';
    }
    if (this.productPanelLineIndex() != null) {
      return 'Completa anagrafica';
    }
    return 'Nuovo prodotto';
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
    this.attachTargetLineIndex.set(null);
    this.productPanelLineIndex.set(null);
    this.productPanelEditProductId.set(null);
    this.productPanelMode.set('create');
    this.productPanelOpen.set(true);
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
    this.maybeAskSupplierPrices((applyPrices) => this.executeExplicitSave(applyPrices));
  }

  protected applySupplierPriceAndConfirm(): void {
    this.supplierPriceDialogOpen.set(false);
    this.pendingConfirmAfterPriceAsk?.(true);
    this.pendingConfirmAfterPriceAsk = null;
  }

  protected skipSupplierPriceAndConfirm(): void {
    this.supplierPriceDialogOpen.set(false);
    this.pendingConfirmAfterPriceAsk?.(false);
    this.pendingConfirmAfterPriceAsk = null;
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
    this.markSessionUnlocked(this.persistedDocumentId());
    this.editUnlocked.set(true);
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

  protected requestDeleteDocument(): void {
    this.deleteDocumentDialogOpen.set(true);
  }

  protected confirmDeleteDocument(): void {
    const id = this.persistedDocumentId();
    this.deleteDocumentDialogOpen.set(false);
    if (!id || this.saving()) {
      return;
    }
    this._submitState.set({ status: 'saving' });
    this.documentService
      .deleteDocument(id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this._submitState.set({ status: 'idle' });
          void this.router.navigateByUrl(this.listPath);
        },
        error: (err: unknown) => {
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
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
    this.attachTargetLineIndex.set(lineIndex);
    this.productPanelLineIndex.set(lineIndex);
    this.productPanelEditProductId.set(null);
    this.productPanelMode.set('create');
    this.productPanelOpen.set(true);
  }

  private openProductEditInPanel(lineIndex: number, productId: string): void {
    this.attachTargetLineIndex.set(lineIndex);
    this.productPanelLineIndex.set(lineIndex);
    this.productPanelEditProductId.set(productId);
    this.productPanelMode.set('edit');
    this.productPanelOpen.set(true);
  }

  protected closeProductPanel(): void {
    this.productPanelOpen.set(false);
    this.productPanelLineIndex.set(null);
    this.productPanelEditProductId.set(null);
    this.productPanelMode.set('create');
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
    this.pendingAttachVariantId.set(event.variantId);
    this.attachWithoutAddDialogOpen.set(true);
    this.closeProductPanel();
  }

  protected attachPendingVariantToLine(): void {
    const variantId = this.pendingAttachVariantId();
    const lineIndex = this.attachTargetLineIndex();
    if (variantId != null && lineIndex != null) {
      this.onVariantSelect(lineIndex, variantId);
    }
    this.pendingAttachVariantId.set(null);
    this.attachWithoutAddDialogOpen.set(false);
    this.attachTargetLineIndex.set(null);
  }

  protected dismissAttachPendingVariant(): void {
    this.pendingAttachVariantId.set(null);
    this.attachWithoutAddDialogOpen.set(false);
    this.attachTargetLineIndex.set(null);
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
          void this.router.navigateByUrl(this.listPath);
        }
      });
      return;
    }
    if (!result) {
      return;
    }
    void this.router.navigateByUrl(this.listPath);
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
          const orders = response.data.filter(
            (order) =>
              order.status === SupplierOrderStatus.Sent ||
              order.status === SupplierOrderStatus.PartiallyReceived,
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
      sku: this.fb.control(orderLine.sku),
      barcode: this.fb.control(''),
      supplierSku: this.fb.control(this.supplierSkuByVariantId().get(orderLine.variantId) ?? ''),
      productName: this.fb.control(orderLine.sku),
      description: this.fb.control(orderLine.sku),
      quantity: this.fb.control(quantity, {
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      unitCost: this.fb.control(moneyToDecimalString(orderLine.unitCost).replace('.', ',')),
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

  private maybeAskSupplierPrices(then: (applyPrices: boolean) => void): void {
    const settings = this.tenantSettings();
    if (settings?.updateSupplierPriceOnLoad === 'never') {
      then(false);
      return;
    }
    if (settings?.updateSupplierPriceOnLoad === 'always') {
      then(true);
      return;
    }

    const id = this.persistedDocumentId();
    if (!id) {
      then(false);
      return;
    }

    this.documentService
      .listSupplierPriceDiffs(id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ items }) => {
          if (items.length === 0) {
            then(false);
            return;
          }
          this.pendingConfirmAfterPriceAsk = then;
          this.supplierPriceDialogOpen.set(true);
        },
        error: () => then(false),
      });
  }

  private executeExplicitSave(applySupplierPriceUpdates: boolean): void {
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
        switchMap(() => this.saveDocument$({ applySupplierPriceUpdates })),
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
          // "Salva documento" salva e resta nella maschera (§10.7):
          // si esce solo con "Chiudi".
          this.markSessionUnlocked(doc.id);
          this.editUnlocked.set(true);
          if (!this.editDocumentId()) {
            this.preserveEditSession.set(true);
            void this.router.navigate(['/app/documents', doc.id, 'edit'], { replaceUrl: true });
          }
          this.syncLineFieldAccess();
          this.ensureMinimumOneRow();
          this.trimDuplicateTrailingEmptyRows();
        },
        error: (err: unknown) => {
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
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
      billingCause: raw.invoicePending ? 'In attesa fattura' : raw.billingCause.trim() || undefined,
      externalDocNumber: raw.externalDocNumber.trim() || undefined,
      externalDocDate: raw.externalDocDate || undefined,
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
    readonly applySupplierPriceUpdates?: boolean;
  }): Observable<DocumentRecord> {
    const body = {
      ...this.buildSaveGoodsReceiptBody(),
      applySupplierPriceUpdates: options?.applySupplierPriceUpdates,
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
    const code = line.controls.sku.value.trim() || line.controls.barcode.value.trim();
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
      this.preserveEditSession.set(false);
      this.markSessionUnlocked(doc.id);
      this.editUnlocked.set(true);
      return;
    }
    // Lo sblocco vale per la sessione di lavoro sul documento (§9): i
    // salvataggi intermedi (status confirmed) non devono ribloccare la
    // maschera. Se lo sblocco arriva dal set condiviso (istanza ricreata dal
    // passaggio new → edit), questa istanza lo adotta: sarà lei a rilasciarlo
    // all'uscita, rimettendo il blocco alla prossima riapertura.
    if (SESSION_UNLOCKED_DOC_IDS.has(doc.id)) {
      this.unlockedByThisInstance.add(doc.id);
      this.editUnlocked.set(true);
    } else {
      this.editUnlocked.set(doc.status === DocumentStatus.Draft);
    }
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
      causalText: doc.causalText ?? '',
      notes: doc.notes ?? '',
      internalComment: doc.internalComment ?? '',
      billingCause: doc.billingCause === 'In attesa fattura' ? '' : (doc.billingCause ?? ''),
      invoicePending: doc.billingCause === 'In attesa fattura',
      documentDiscountPercent:
        doc.documentDiscountPercent != null && doc.documentDiscountPercent > 0
          ? String(doc.documentDiscountPercent)
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

  private refreshNumberPreview(): void {
    if (this.loadedDocument()?.reference) {
      this.previewReference.set(null);
      return;
    }
    const type = this.form.controls.type.value;
    // La data è "YYYY-MM-DD": l'anno si legge dalla stringa per evitare
    // slittamenti di fuso orario con new Date().
    const yearRaw = Number(this.form.controls.documentDate.value.slice(0, 4));
    const year = Number.isFinite(yearRaw) && yearRaw > 0 ? yearRaw : new Date().getFullYear();
    this.documentService
      .previewDocumentNumber(type, { year })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (preview) => this.previewReference.set(preview.reference),
        error: () => this.previewReference.set(null),
      });
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
