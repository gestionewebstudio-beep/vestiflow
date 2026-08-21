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
import {
  AbstractControl,
  FormArray,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ViewportService } from '@core/services/viewport.service';
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
import { AuthService } from '@core/auth';
import { canManageCatalog, canManageDocFamily } from '@core/permissions/tenant-permissions.util';
import { hasTenantPermission } from '@core/permissions/user-permissions.util';
import { TenantPermission } from '@core/models/tenant-permission.model';
import type { AppError } from '@core/models/app-error.model';
import type { Money } from '@core/models/common.model';
import type { LinkedSupplierOrderLineContext } from '@core/models/document.model';
import { CausalGenerationMode, DocumentStatus, DocumentType } from '@core/models/document.model';
import type { DocumentRecord, DocumentTypeSetting } from '@core/models/document.model';
import { isConfirmedEditableDocumentStatus } from '@core/models/document.model';
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
import { prefillDefaultLocation } from '@domain/inventory/utils/default-location-prefill.util';
import type { PaymentOption } from '@core/models/payment-option.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { ToastService } from '@core/services/toast.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { toLocationSelectOptions } from '@core/utils/location-select-options.util';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  moneyToDecimalString,
  parseMoneyInput,
  toStorableMinor,
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
import { DocumentCounterpartyRefComponent } from '@domain/documents/components/document-counterparty-ref/document-counterparty-ref.component';
import { DocumentMobilePanelComponent } from '@domain/documents/components/document-mobile-panel/document-mobile-panel.component';
import { DocumentLineProductCellComponent } from '@domain/documents/components/document-line-product-cell/document-line-product-cell.component';
import { DocumentLineSelectCellComponent } from '@domain/documents/components/document-line-select-cell/document-line-select-cell.component';
import { DocumentLineUnitCellComponent } from '@domain/documents/components/document-line-unit-cell/document-line-unit-cell.component';
import { DocumentPrintActionsComponent } from '@domain/documents/components/document-print-actions/document-print-actions.component';
import { UnitOfMeasureManagerDialogComponent } from '@domain/products/components/unit-of-measure-manager-dialog/unit-of-measure-manager-dialog.component';
import type { UnitOfMeasureOption } from '@domain/products/models/unit-of-measure-option.model';
import { UnitOfMeasureOptionService } from '@domain/products/services/unit-of-measure-option.service';
import { showShopifyIntegration } from '@core/models/tenant-channel-profile.model';
import { unitOfMeasureSelectOptions } from '@domain/products/utils/unit-of-measure-options.util';
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
import { isPrintableDocumentType } from './models/document-print.util';
import { renderCausalTemplate } from './models/causal-template.util';
import type { ExternalDocumentType } from '@domain/documents/models/external-document-type.model';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentNumberingStore } from '@domain/documents/state/document-numbering.store';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { DocumentSettingsService } from './services/document-settings.service';
import { ExternalDocumentTypeService } from '@domain/documents/services/external-document-type.service';
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
  type GoodsReceiptLineSortColumn,
} from './utils/goods-receipt-line-sort.util';
import {
  buildVatSummary,
  computeVatLineAmounts,
  entryIncludesVat,
  grossFromNetMinor,
  netFromGrossExact,
  netFromGrossMinor,
  vatInputFromLegacyRate,
  vatInputFromVatCode,
  type VatComputationInput,
  type VatLineAmounts,
} from '@domain/documents/utils/document-vat.util';
import { DocumentNumberConflictStore } from '@domain/documents/state/document-number-conflict.store';
import { DocumentChronologyGuard } from '@domain/documents/state/document-chronology-guard';
import { DocumentChronologyWarningDialogComponent } from '@domain/documents/components/document-chronology-warning-dialog/document-chronology-warning-dialog.component';
import { DocumentPrefillErrorStore } from '@domain/documents/state/document-prefill-error.store';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { DocumentProductPanelStore } from '@domain/documents/state/document-product-panel.store';
import { DocumentLineSearchPanelStore } from '@domain/documents/state/document-line-search-panel.store';
import { DocumentEditLockService } from '@domain/documents/services/document-edit-lock.service';
import { computeDocumentTotals } from '@domain/documents/utils/document-totals.util';
import { DocumentCodeLookupStore } from '@domain/documents/state/document-code-lookup.store';
import { DocumentProductSuggestStore } from '@domain/documents/state/document-product-suggest.store';
import { DocumentLineSortStore } from '@domain/documents/state/document-line-sort.store';
import { sortByValue, type SortValueKind } from '@shared/utils/sort-values.util';
import { DocumentLineFocusStore } from '@domain/documents/state/document-line-focus.store';
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
import { FirstClickSelectsDirective } from '@shared/directives/first-click-selects.directive';
import { CdkDrag, CdkDragHandle, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { documentSearchLaunchTerm } from '@domain/documents/utils/document-search-launch-term.util';
import { trailingEmptyLineIndices } from '@domain/documents/utils/trailing-empty-lines.util';
import { PriceModeMenuComponent } from '@domain/documents/components/price-mode-menu/price-mode-menu.component';

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
  | 'unitOfMeasure'
  | 'unitCost'
  | 'discount'
  | 'sellingPrice'
  | 'shopifyPrice'
  | 'compareAtPrice'
  | 'vat'
  | 'lot'
  | 'expiry'
  | 'serials';

/**
 * Form operativo arrivo merce / carico fornitore (§3). Righe editabili, creazione
 * rapida articolo dalla riga, conferma con carico magazzino server-side.
 */
/**
 * I tre valori commerciali dell'ARTICOLO scrivibili da una riga di arrivo
 * merce. Seguono tutti la stessa modalità netto/ivato, che è un'altra da
 * quella del COSTO — il costo concorre al totale del documento, questi no.
 */
type SalesPriceField = 'sellingPrice' | 'shopifyPrice' | 'compareAtPrice';

const SALES_PRICE_FIELDS: readonly SalesPriceField[] = [
  'sellingPrice',
  'shopifyPrice',
  'compareAtPrice',
];

@Component({
  selector: 'app-goods-receipt-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    FirstClickSelectsDirective,
    InlineBannerComponent,
    PriceModeMenuComponent,
    ReactiveFormsModule,
    RouterLink,
    BackButtonComponent,
    BadgeComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    DateInputComponent,
    DocumentNumberFieldComponent,
    DocumentSeriesManagerDialogComponent,
    DocumentChronologyWarningDialogComponent,
    SelectMenuComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    TableColumnPickerComponent,
    HoverTooltipComponent,
    TableColumnResizeDirective,
    DocumentAttachmentsPanelComponent,
    GoodsReceiptLineCardComponent,
    DocumentCounterpartyRefComponent,
    DocumentLineCodeCellComponent,
    DocumentLineProductCellComponent,
    DocumentLineSelectCellComponent,
    DocumentLineUnitCellComponent,
    DocumentPrintActionsComponent,
    UnitOfMeasureManagerDialogComponent,
    DocumentMobilePanelComponent,
    DocumentProductSearchPanelComponent,
    SlidePanelComponent,
    ProductFormComponent,
    SupplierFormFieldsComponent,
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
  private readonly viewport = inject(ViewportService);

  /**
   * Quale delle due viste di riga è viva. Le due sono **esclusive**: sotto la
   * soglia esiste la card, sopra la tabella, mai entrambe (specifica §4.11).
   *
   * Qui mancava, ed è l'ultima delle tre maschere a riceverlo: le due viste
   * erano entrambe rese e una nascosta dal CSS — su un documento da trenta
   * righe circa 1.700 nodi e 420 controlli invisibili sul telefono, più il
   * rischio vero, che uno stato condiviso si apra nella vista che non si vede.
   */
  protected readonly compactView = this.viewport.compact;
  private readonly toasts = inject(ToastService);
  private readonly navHistory = inject(NavigationHistoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly editLock = inject(DocumentEditLockService);
  private readonly authService = inject(AuthService);

  // ── Cosa l'operatore può davvero fare (§permessi) ─────────────────────────
  // Il server nega comunque: qui si evita di mostrare comandi che al primo
  // clic rispondono 403.

  /**
   * Senza il permesso, accanto alla serie non c'è l'ingranaggio (nessun
   * pannello numerazioni da aprire) e la tendina del tipo documento fornitore
   * resta il solo elenco dei tipi già configurati.
   */
  protected readonly puoConfigurareDocumenti = computed(() =>
    hasTenantPermission(this.authService.currentUser(), TenantPermission.DocumentsConfigure),
  );

  /**
   * L'anagrafica fornitore si crea con la stessa chiave degli ordini
   * fornitore. Senza, resta la sola tendina dei fornitori già registrati:
   * la scorciatoia «Nuovo fornitore» non compare.
   */
  protected readonly puoGestireOrdiniFornitore = computed(() =>
    canManageDocFamily(this.authService.currentUser(), 'supplier_order'),
  );

  /**
   * Senza la gestione del catalogo la scheda articolo non si apre in
   * creazione: le righe si compilano scegliendo articoli già a catalogo.
   */
  protected readonly puoGestireCatalogo = computed(() =>
    canManageCatalog(this.authService.currentUser()),
  );

  protected readonly listPath = '/app/documents/arrivi-merce';
  protected readonly currency = DEFAULT_CURRENCY;
  protected readonly formatMoney = formatMoney;
  protected readonly formatVatRate = formatVatRate;

  private readonly columnPreferences = inject(TableColumnPreferenceService);
  private readonly tenantFeatureSettingsService = inject(TenantFeatureSettingsService);

  protected readonly lineColumnsView = TableViewId.GoodsReceiptLines;
  /**
   * Il modulo Shopify del tenant decide se la colonna «Prezzo Shopify»
   * **esiste**, non se si vede: un tenant senza Shopify non deve trovarla
   * nemmeno nel selettore Colonne, né avere riferimenti o chiamate al canale.
   */
  protected readonly showShopifyPrice = computed(() =>
    showShopifyIntegration(this.authService.currentUser()?.tenantChannelProfile),
  );

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

  // Letto anche dal template, per nominare il file scaricato.
  protected readonly loadedDocument = signal<DocumentRecord | null>(null);
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

  /** Conflitto sul numero restituito dal server: dialogo «Usa N» / «Annulla». */
  // Stato del dialog «numero già assegnato»: la macchina vive in domain,
  // il form decide solo quale controllo riceve il numero e cosa risalvare.
  // ── Numerazione ───────────────────────────────────────────────────────────
  //
  // Il meccanismo vive in `domain/` (`DocumentNumberingStore`): proposta,
  // scelta della serie, numero imposto. Era copiato in sei maschere.

  protected readonly numbering = new DocumentNumberingStore({
    // «Il documento esiste» — una condizione sola, ed è la stessa cosa che le
    // altre maschere dicono con `isEditMode()`: loro dopo il salvataggio se ne
    // vanno al dettaglio, quindi un documento salvato lo si incontra solo sulla
    // rotta `:id`. Questa invece salva e RESTA (§10.7), e sulla rotta di
    // creazione continua a esserci un documento che ormai ha il suo numero.
    //
    // Decisione di prodotto 13/08/2026: numerare come tutti, senza la regola
    // propria che deduceva «già numerato» dal RIFERIMENTO. Quella è caduta —
    // qui si guarda l'esistenza, non il riferimento — mentre la sola rotta non
    // basta, e non è un'opinione: la prova «dopo il salvataggio il numero
    // assegnato non torna a essere una proposta» fallisce con `isEditMode()`
    // da solo, perché la riproposta dei contatori riporta il campo dal numero
    // assegnato a quello proposto prima.
    isEdit: () => this.persistedDocumentId() !== null,
    number: () => this.form.controls.documentNumber.value,
    setNumber: (value) => this.form.controls.documentNumber.setValue(value),
    series: () => this.form.controls.series.value,
    setSeries: (value) => this.form.controls.series.setValue(value),
    numberIsDirty: () => !this.documentNumberPristine(),
    markNumberDirty: () => this.form.controls.documentNumber.markAsDirty(),
    markNumberPristine: () => this.form.controls.documentNumber.markAsPristine(),
    // I contatori: il giro — chiamata, `take(1)`, chiusura col ciclo di vita,
    // «riproponi» contro «ricarica l'elenco» — vive nello store comune (E-6).
    // Qui restano le tre letture che cambiano da una maschera all'altra.
    countersSource: {
      service: this.countersService,
      destroyRef: this.destroyRef,
      documentType: () => this.form.controls.type.value,
      locationId: () => this.form.controls.locationId.value || null,
      documentDate: () => this.form.controls.documentDate.value,
    },
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

  /** Reattivo per costruzione: `isProposal()` legge il signal degli eventi. */
  protected readonly numberIsProposal = computed(() => this.numbering.isProposal());

  /**
   * Chiusura del pannello numerazioni: ricarica l'elenco serie SENZA riproporre
   * serie e numero — la selezione resta quella che era.
   */
  protected onSeriesManagerClosed(): void {
    this.seriesDialogOpen.set(false);
    this.numbering.reloadCounters();
  }

  /**
   * Avviso cronologico (§4): la serie contiene documenti fuori posto. Avviso e
   * non blocco — da lì si salva comunque — e tutto il meccanismo vive in
   * `domain/`, come quello del conflitto sul numero.
   */
  protected readonly chronology = new DocumentChronologyGuard({
    documentType: () => this.form.controls.type.value,
    series: () => this.form.controls.series.value,
    number: () => this.form.controls.documentNumber.value,
    documentDate: () => this.form.controls.documentDate.value,
    // In modifica il documento non deve risultare fuori ordine con la
    // propria riga vecchia: cambiare numero E data basterebbe.
    excludeId: () => this.editDocumentId(),
  });

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
  /**
   * Stato del pannello di ricerca aperto da una riga: E-5, estratto in
   * `domain/documents/state/` perche' era scritto identico in tre maschere.
   */
  protected readonly lineSearchPanel = new DocumentLineSearchPanelStore();
  /** Il pannello suggerimenti del nome prodotto: stato e regole in domain/. */
  protected readonly productSuggest = new DocumentProductSuggestStore();
  /**
   * Scelta fra più corrispondenze esatte di un codice. Lo stato vive in
   * `domain/`, identico nelle tre maschere; qui resta solo cosa farne.
   *
   * Il suo indice evidenziato è PROPRIO, distinto da quello di
   * `productSuggest`:
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
  /**
   * Riordino righe e avviso: stato e regole in `domain/`, identici a ogni altro
   * documento. Qui resta solo COME si legge il valore di una colonna.
   */
  protected readonly lineSort = new DocumentLineSortStore<GoodsReceiptLineSortColumn>();
  /**
   * Spunta per-documento «Aggiorna anche il costo di riferimento in anagrafica».
   * Spuntata, il costo digitato su ogni riga diventa il costo dell'articolo in
   * anagrafica — **riga per riga**: richiamare tre taglie significa richiamare
   * tre righe, e ognuna governa la propria. Spenta, in anagrafica non va nulla e
   * il costo resta un dato del DOCUMENTO, per report e contabilità.
   *
   * Default ACCESO: di norma l'anagrafica segue l'ultimo costo pagato, chi non
   * lo vuole la spegne su quel documento (§Punto A).
   *
   * ⛔ **Fino al 19/08/2026 comandava un'altra cosa**: il costo della variante si
   * scriveva sempre e la spunta governava un costo sul `Product`. Chi la toglieva
   * credeva di registrare un costo solo documentale, e stava riscrivendo il costo
   * effettivo di ogni variante caricata (`03b`).
   */
  protected readonly updateArticleCost = signal(true);

  /**
   * Spunta per-documento «Aggiorna prezzi articolo». Default ACCESO.
   *
   * ⚠️ **Non è la gemella di quella del costo, e la differenza conta.** Il
   * costo ha un valore proprio del documento e la spunta decide solo se
   * propagarlo anche al costo di RIFERIMENTO dell’articolo. Il prezzo al
   * pubblico invece **non esiste sulla riga**: è un dato dell’anagrafica.
   *
   * Perciò a spunta spenta i due campi prezzo non sono «non propagati»: sono
   * **in sola lettura**. Lasciarli editabili significherebbe accettare un
   * valore che non ha dove andare — il difetto che questa fetta ha trovato.
   */
  protected readonly updateArticlePrices = signal(true);
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

  // ── Modalità dei PREZZI DI VENDITA di riga (§17/08/2026) ───────────────────
  //
  // Un solo stato per i tre valori commerciali dell'articolo che si possono
  // scrivere da qui: Prezzo di vendita, Prezzo barrato, Prezzo Shopify. Il
  // COSTO ha la sua modalità, sopra, e le due non si toccano — sono due domini
  // diversi, e il costo concorre al totale del documento mentre questi no.
  //
  // ⚠️ È uno stato DI SESSIONE, inizializzato dalla convenzione aziendale e mai
  // persistito: il selettore serve a guardare, non a dichiarare qualcosa sul
  // documento. Nessuna memoria dell'operatore, per la stessa ragione per cui
  // non ce l'ha l'anagrafica — il prezzo dell'ARTICOLO è un dato di catalogo, e
  // due colleghi devono leggerlo uguale.
  //
  // ⚠️ E NON si legge `resolvePricesIncludeVat`: l'Arrivo merce è un documento
  // di ACQUISTO, quindi quella catena gli risponde `false` per costruzione. La
  // convenzione va presa dal tenant, che questo componente ha già.
  protected readonly salesPricesIncludeVat = signal(false);
  protected readonly salesPriceModeMenuOpen = signal(false);
  private salesPriceModeTouched = false;

  /**
   * Seme dalla convenzione aziendale.
   *
   * Le impostazioni del tenant arrivano dal server, quindi dopo il primo
   * render: l'effect le aspetta. Se nel frattempo l'operatore ha già mosso il
   * selettore, la sua scelta vince — è il motivo per cui `salesPriceModeTouched`
   * esiste e non basta un `??`.
   */
  private readonly seedSalesPriceMode = effect(() => {
    const convenzione = this.tenantSettings()?.salesPricesIncludeVat;
    if (convenzione == null || this.salesPriceModeTouched) {
      return;
    }
    if (this.salesPricesIncludeVat() !== convenzione) {
      this.applySalesPriceMode(convenzione);
    }
  });

  /**
   * Cambio modalità: cambia SOLO come i tre prezzi si vedono.
   *
   * I campi si riscrivono dal netto canonico ricordato, non riconvertendo il
   * valore mostrato: quello ha due decimali, e un giro netto → ivato → netto ne
   * limerebbe la coda. È la stessa regola dell'Ordine cliente e dell'anagrafica.
   */
  protected selectSalesPriceMode(pricesIncludeVat: boolean): void {
    this.salesPriceModeMenuOpen.set(false);
    if (pricesIncludeVat === this.salesPricesIncludeVat() || this.formReadOnly()) {
      return;
    }
    this.salesPriceModeTouched = true;
    this.applySalesPriceMode(pricesIncludeVat);
  }

  /**
   * Cambia modalità conservando il valore economico.
   *
   * ⚠️ I netti si leggono PRIMA di cambiare modalità, e si riscrivono dopo.
   * Leggerli dopo sarebbe un'identità: `lineSalesNetMinor` interpreterebbe il
   * valore mostrato con la modalità NUOVA, e `salesPriceFieldValue` lo
   * rimostrerebbe con la stessa — il campo non si muoverebbe di un centesimo,
   * e la modalità cambierebbe solo di nome. Lo hanno trovato le prove.
   */
  private applySalesPriceMode(pricesIncludeVat: boolean): void {
    const prima = this.lines.controls.map((line) =>
      SALES_PRICE_FIELDS.map((field) => this.lineSalesNetMinor(line, field)),
    );
    this.salesPricesIncludeVat.set(pricesIncludeVat);
    this.lines.controls.forEach((line, i) => {
      SALES_PRICE_FIELDS.forEach((field, j) => {
        const netMinor = prima[i]?.[j];
        if (netMinor == null) {
          return;
        }
        const control = line.controls[field];
        const shown = this.salesPriceFieldValue(netMinor, line);
        control.setValue(shown, { emitEvent: false });
        this.rememberSalesNet(control, netMinor, shown);
      });
    });
  }

  // ── Il netto canonico dei tre campi ────────────────────────────────────────
  //
  // Il campo mostra due decimali; il netto memorizzato può avere la coda (70,00
  // ivati al 22% valgono 5737,704918 centesimi netti). Il netto caricato resta
  // quindi il buono FINCHÉ il campo mostra ancora quello che ci era stato
  // scritto: appena l'operatore ridigita, il valore vero è il suo.
  private readonly salesNetCanonical = new WeakMap<
    AbstractControl,
    { readonly net: number; readonly shown: string }
  >();

  private rememberSalesNet(control: AbstractControl, netMinor: number, shown: string): void {
    this.salesNetCanonical.set(control, { net: netMinor, shown });
  }

  /**
   * Scrive un prezzo di vendita NETTO nel campo, mostrandolo nella modalità
   * corrente e ricordandone la forma canonica.
   *
   * `null` svuota il campo: un prezzo assente resta assente, e non diventa zero.
   */
  private setSalesPrice(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
    field: SalesPriceField,
    netMinor: number | null,
  ): void {
    const control = line.controls[field];
    if (netMinor == null) {
      control.setValue('');
      this.salesNetCanonical.delete(control);
      return;
    }
    const shown = this.salesPriceFieldValue(netMinor, line);
    control.setValue(shown);
    this.rememberSalesNet(control, netMinor, shown);
  }

  /** Netto memorizzato → stringa da mettere nel campo, nella modalità corrente. */
  private salesPriceFieldValue(
    netMinor: number,
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
  ): string {
    const vat = this.lineVatInput(line);
    const displayed =
      this.salesPricesIncludeVat() && vat.ratePercent > 0
        ? grossFromNetMinor(netMinor, vat.ratePercent)
        : netMinor;
    return moneyToDecimalString({ amountMinor: displayed, currencyCode: this.currency }).replace(
      '.',
      ',',
    );
  }

  /**
   * Netto canonico da salvare per un campo di vendita, o `null` se vuoto.
   *
   * `null` non è zero: un prezzo barrato assente resta assente, e verso Shopify
   * la chiave non deve nemmeno comparire.
   */
  private lineSalesNetMinor(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
    field: SalesPriceField,
  ): number | null {
    const control = line.controls[field];
    const ricordato = this.salesNetCanonical.get(control);
    if (ricordato && ricordato.shown === control.value) {
      return ricordato.net;
    }
    const digitato = parseMoneyInput(control.value, this.currency);
    if (!digitato) {
      return null;
    }
    const vat = this.lineVatInput(line);
    // Scorporo ESATTO: è il valore da MEMORIZZARE. Arrotondarlo qui farebbe
    // tornare 69,99 al posto di 70,00 alla riapertura (§sei decimali).
    return this.salesPricesIncludeVat() && vat.ratePercent > 0
      ? toStorableMinor(netFromGrossExact(digitato.amountMinor, vat.ratePercent))
      : digitato.amountMinor;
  }

  /**
   * ⚠️ Qui la modalità costo partiva dalla preferenza ricordata
   * dell'operatore. Rimosso il 16/08/2026: **i costi partono sempre netti**.
   *
   * Per un'azienda che detrae l'IVA il costo *è* il netto, e l'inserimento
   * ivato resta una comodità del singolo documento — il selettore in testata
   * non è cambiato. Non essendo una convenzione aziendale non ha un default
   * nelle Impostazioni, e non essendo una preferenza non se la ricorda
   * nessuno: un arrivo merce nuovo riapre sempre in netto.
   *
   * La memoria che c’era finiva per giunta nella tabella dei PREZZI, tradotta
   * da un ponte costo↔prezzo: reggeva solo perché i tipi di acquisto e quelli
   * di vendita non si sovrappongono.
   */
  private initCostModeForNewDocument(): void {
    // Il segnale nasce già `vat_excluded`: non c’è niente da chiedere.
  }

  protected readonly operationalStatusWarning = computed(() => {
    const status = this.documentStatus();
    if (status === DocumentStatus.Printed) {
      return 'Documento segnato come stampato: verifica coerenza con il documento cartaceo prima di modificarlo.';
    }
    if (status === DocumentStatus.Sent) {
      return 'Documento segnato come inviato al fornitore o al commercialista.';
    }
    return null;
  });

  /**
   * I due campi prezzo sono scrivibili solo quando la spunta è accesa: senza,
   * il valore digitato non avrebbe nessuna destinazione.
   */
  protected readonly articlePricesReadOnly = computed(
    () => this.formReadOnly() || !this.updateArticlePrices(),
  );

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

  /**
   * Titolo dello stato vuoto delle righe: dice **cosa manca**, non che manca
   * qualcosa. Stessa forma dell'Ordine cliente: a testata incompleta le righe
   * non si mostrano affatto, e questo sta al loro posto.
   */
  protected readonly linesEmptyTitle = computed(() => {
    this.formValue();
    if (!this.headerGateActive()) {
      return 'Nessuna riga inserita';
    }
    const type = this.form.controls.type.value;
    const supplierRequired = type !== DocumentType.ManualLoad && type !== DocumentType.InitialLoad;
    const supplierMissing = supplierRequired && !this.form.controls.supplierId.value;
    const locationMissing = !this.form.controls.locationId.value;
    if (supplierMissing && locationMissing) {
      return 'Scegli il fornitore e il magazzino';
    }
    if (supplierMissing) {
      return 'Scegli il fornitore';
    }
    return 'Scegli il magazzino di destinazione';
  });

  protected readonly linesEmptyDescription = computed(() =>
    this.headerGateActive()
      ? 'Le righe si aggiungono dopo: da qui potrai cercare un articolo, scansionare un codice o includere un ordine fornitore.'
      : 'Cerca un articolo, scansiona un codice o includi un ordine fornitore.',
  );

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
  /**
   * Il riferimento del documento APERTO, e solo quello: l'etichetta compare in
   * sola modifica, dove il numero è assegnato. Qui c'era un ripiego su
   * un'anteprima che nessuno scriveva mai — un `signal` senza produttori — e
   * che, se avesse funzionato, avrebbe scritto «N. documento» sopra il prossimo
   * numero libero invece che sopra quello del documento.
   */
  protected readonly internalReferenceLabel = computed(
    () => this.loadedDocument()?.reference ?? null,
  );

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

  /**
   * Il documento è salvato E il suo tipo ha davvero un foglio.
   *
   * Il solo `persistedDocumentId()` non bastava, ed è il difetto che ha aperto
   * questo lavoro: la maschera serve anche Carico manuale e Carico iniziale,
   * che non erano fra i tipi stampabili — i due bottoni comparivano lo stesso e
   * il click prendeva un 422 che su questa schermata non si vedeva. Oggi quei
   * tipi stampano, ma il gate resta legato al predicato: se un tipo un domani
   * esce dalla lista, il bottone sparisce invece di tornare a mentire.
   */
  protected readonly canExportPdf = computed(
    () =>
      Boolean(this.persistedDocumentId()) && isPrintableDocumentType(this.form.controls.type.value),
  );

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
            // Un altro documento è un'altra storia: l'avviso del riordino torna
            // dovuto. Serve QUI e non alla creazione del componente, perché
            // passando da un documento all'altro senza uscire dalla rotta
            // Angular riusa la stessa istanza — cambia solo il parametro — e il
            // ricordo di aver già avvisato sopravviverebbe al documento che
            // l'aveva ricevuto.
            this.lineSort.reset();
            this.numbering.refreshProposal();
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

  // ── Documento della controparte: i tipi documento del tenant ────────────────
  /**
   * La tendina dei tipi, la voce «Gestisci tipi documento…» e il pannello che
   * apre vivono ora nel componente condiviso `app-document-counterparty-ref`.
   * Qui resta la sola LISTA, perché da lei dipendono due cose che il
   * componente non conosce: il modello della causale di carico
   * (`templateForType`) e il riepilogo del pannello di testata mobile.
   */
  private readonly _externalDocTypes = signal<readonly ExternalDocumentType[]>([]);
  protected readonly externalDocTypes = this._externalDocTypes.asReadonly();

  /**
   * Etichetta del tipo fotografata sul documento al salvataggio. Un tipo
   * eliminato non arriva più dalla lista: senza lo snapshot il campo si
   * riaprirebbe vuoto e al salvataggio successivo la dicitura sparirebbe
   * davvero.
   */
  protected readonly externalDocTypeSnapshot = computed(
    () => this.loadedDocument()?.externalDocumentTypeSnapshot,
  );

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
    /** Numero interno: proposto dal progressivo di serie, editabile. */
    documentNumber: this.fb.control<number | null>(null),
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
      // Senza il modulo Shopify la colonna del prezzo canale non entra
      // proprio nel selettore: è il gating, e sta qui perché è l'unico punto
      // in cui le colonne si dichiarano.
      this.showShopifyPrice()
        ? GOODS_RECEIPT_LINE_COLUMNS
        : GOODS_RECEIPT_LINE_COLUMNS.filter((column) => column.id !== 'shopifyPrice'),
      GOODS_RECEIPT_LINE_PRESETS,
    );

    // Sede predefinita in testata (§1-bis): la regola vive in `domain/`, ed è
    // la stessa per tutte le maschere. Qui restano i due ganci che cambiano.
    prefillDefaultLocation({
      control: this.form.controls.locationId,
      isEdit: () => this.isEditMode(),
      write: (apply) => this.withDirtySuppressed(apply),
    });

    // Il rilascio degli sblocchi all'uscita non vive più qui: lo fa
    // DocumentEditLockService, uguale per ogni maschera.
    this.syncSupplierRequirement(this.form.controls.type.value);
    this.form.controls.type.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => {
        this.syncSupplierRequirement(type);
        this.numbering.refreshProposal();
      });
    this.form.controls.documentDate.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.numbering.refreshProposal());
    // Cambio sede: la tendina Serie cambia con lei — un contatore legato a una
    // sede è disponibile SOLO lì, e quelli senza sede ovunque (§1-bis). Senza
    // questa ricarica l'elenco resterebbe quello chiesto all'apertura, e
    // mostrerebbe serie che in questa sede non si possono usare.
    //
    // `refreshNumberProposal` ricarica l'elenco e ripropone serie e numero solo
    // se il documento è nuovo e nessuno ha toccato il numero: su un documento
    // salvato, o con un numero digitato, cambia solo la tendina.
    this.form.controls.locationId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.numbering.refreshProposal());
    this.form.controls.externalDocumentTypeId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((typeId) => this.applyTemplateFromType(typeId));
    this.form.controls.externalDocNumber.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.regenerateCausalFromTemplate());
    this.form.controls.externalDocDate.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.regenerateCausalFromTemplate());
    // La lista dei tipi serve alla causale di carico e al riepilogo mobile:
    // si carica all'avvio e si ricarica a ogni scelta fatta nel componente
    // condiviso.
    this.loadExternalDocTypes();
    this.numbering.refreshProposal();
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
    return this.productSuggest.suggestionsFor(index, this.suggestInputs(index));
  }

  protected lineSuggestionsOpen(index: number): boolean {
    return this.productSuggest.isOpenOn(index, this.suggestInputs(index));
  }

  private suggestInputs(index: number) {
    return { hasLinked: this.lineHasLinkedProduct(index), searched: this.searchedVariants() };
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
    this.productSuggest.focusLine(index);
    this.variantSearchDraft.set(value);
    this.codeLookup.clear();
    this.markFormDirty();
  }

  /**
   * Variante per la card mobile: il valore è già scritto dal formControl,
   * qui si aggiornano solo i segnali della ricerca contestuale (§7).
   */
  protected onCardProductNameInput(index: number, value: string): void {
    this.productSuggest.focusLine(index);
    this.variantSearchDraft.set(value);
    this.codeLookup.clear();
  }

  protected onLineProductFocus(index: number): void {
    this.productSuggest.focusLine(index);
    this.variantSearchDraft.set(this.lines.at(index).controls.productName.value);
  }

  protected onLineProductBlur(index: number): void {
    this.productSuggest.blurLine(index);
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
      this.linkLineCodesThen(index);
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

  protected commitSkuLookup(index: number, advance = true): void {
    this.commitCodeLookup(index, 'sku', advance);
  }

  protected commitBarcodeLookup(index: number, advance = true): void {
    this.commitCodeLookup(index, 'barcode', advance);
  }

  protected commitArticleCodeLookup(index: number, advance = true): void {
    this.commitCodeLookup(index, 'articleCode', advance);
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
  private commitCodeLookup(index: number, field: DocumentLineCodeField, advance = true): void {
    if (this.lineHasLinkedProduct(index)) {
      if (advance) {
        this.focusNextLineField(index, field);
      }
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
      if (advance) {
        this.focusNextLineField(index, field);
      }
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
        //
        // Col Tab si prosegue; con Invio si resta (§4.5).
        this.codeLookup.clear();
        if (advance) {
          this.focusNextLineField(index, field);
        }
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
    this.lineSearchPanel.openForLine(
      index,
      documentSearchLaunchTerm({
        linked: this.lineHasLinkedProduct(index),
        name: term,
        sku: line?.controls.sku.value,
        articleCode: line?.controls.articleCode.value,
        barcode: line?.controls.barcode.value,
      }),
    );
  }

  protected closeLineProductSearch(): void {
    this.lineSearchPanel.close();
  }

  /**
   * «Crea articolo» dal pannello di ricerca. La riga che ha aperto il pannello
   * porta gia' i dati digitati: la scheda nuova nasce precompilata con quelli.
   *
   * Il pannello si chiude, l'anagrafica si apre SOPRA il documento — che resta
   * dov'e', con quel che si e' scritto finora. Nessuna via porta fuori
   * perdendo il lavoro.
   */
  /**
   * «Crea articolo» nel pannello di ricerca ha senso solo se la riga che l'ha
   * aperto è ancora libera. Su una riga già agganciata il pannello è di sola
   * consultazione: non stai cercando cosa aggiungere, stai guardando quello che
   * c'è.
   */
  protected readonly productSearchCanCreate = computed(() => {
    this.formValue();
    const index = this.lineSearchPanel.lineIndex();
    return index === null ? true : !this.lineHasLinkedProduct(index);
  });

  protected onProductSearchCreate(): void {
    const index = this.lineSearchPanel.lineIndex();
    this.closeLineProductSearch();
    if (index !== null) {
      this.openFullProductCreate(index);
    }
  }

  /** Apri la scheda di un articolo trovato, senza aggiungerlo alla riga. */
  protected onProductSearchDetail(productId: string): void {
    const index = this.lineSearchPanel.lineIndex();
    this.closeLineProductSearch();
    if (index !== null) {
      this.productPanel.openForEdit(index, productId);
    }
  }

  protected onLineProductSearchPick(variantId: string): void {
    const index = this.lineSearchPanel.lineIndex();
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
    const lineIndex = this.productSuggest.lineIndex();
    if (lineIndex === null) {
      return;
    }
    this.productSuggest.navigate(direction, this.lineSuggestions(lineIndex).length);
  }

  protected advanceToNextLine(index: number): void {
    this.linkLineCodesThen(index, () => {
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
    this.linkLineCodesThen(index, () => {
      this.lineFocus.focusLastField(index - 1);
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
      ['gr-shopify-', 'shopifyPrice'],
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
  protected commitSupplierSkuLookup(index: number, advance = true): void {
    this.commitCodeLookup(index, 'supplierCode', advance);
  }

  /**
   * Il giro del fuoco. Il meccanismo vive in `domain/`; qui restano le nove voci
   * del contratto — ed è la maschera che le esercita tutte, gancio compreso.
   *
   * Le 82 righe di `visibleLineFocusFields` erano quasi tutte la stessa riga
   * ripetuta (`if (field === X) return isLineColumnVisible(X)`): quattordici
   * volte lo stesso controllo, scritto una per campo.
   */
  protected readonly lineFocus = new DocumentLineFocusStore<GoodsReceiptLineFocusField>({
    fields: [
      'articleCode',
      'sku',
      'barcode',
      'supplierCode',
      'product',
      'quantity',
      // Rientrata nel giro: la cella era una tendina di sola creazione
      // articolo e testo calcolato altrove. Ora l'unità si scrive sulla riga.
      'unitOfMeasure',
      'unitCost',
      'discount',
      'sellingPrice',
      'shopifyPrice',
      'compareAtPrice',
      // Rientrata nel giro: era fuori perché la cella IVA era un
      // `app-select-menu`, che non ha un campo con quell'identificativo. Ora è
      // la cella a ricerca-e-selezione, con un input vero.
      'vat',
      'lot',
      'expiry',
      'serials',
    ],
    elementId: (index, field) => this.lineFieldElementId(index, field),
    isFieldEnabled: (index, field) => {
      // Su riga collegata i codici e il nome sono testo: restano i dati.
      const identita =
        field === 'articleCode' ||
        field === 'sku' ||
        field === 'barcode' ||
        field === 'supplierCode' ||
        field === 'product';
      if (this.lineHasLinkedProduct(index) && identita) {
        return false;
      }
      return this.isLineColumnVisible(field);
    },
    isReadOnly: () => this.formReadOnly(),
    lineCount: () => this.lines.length,
    createLine: () => {
      this.lines.push(this.createLine());
      // La pulizia può togliere la riga appena nata se in fondo ce n'era già una
      // vuota: il fuoco va all'ULTIMA esistente, che il punto unico rilegge dopo
      // questa chiamata. Prima puntava a un indice che non c'era più.
      this.trimDuplicateTrailingEmptyRows();
    },
    // Voce 8, e questa è l'unica maschera che la esercita davvero: il gancio
    // collega i codici digitati alla variante PRIMA che il fuoco si sposti, e la
    // sua asincronia è ciò che dà al DOM il tempo di rendere la riga nuova.
    onRowChange: (index, then) => {
      this.linkLineCodesThen(index, then);
    },
    isLineEmpty: (index) => {
      const line = this.lines.at(index);
      return line ? this.lineIsEmpty(line) : true;
    },
    removeLine: (index) => this.removeLine(index),
  });

  private lineFieldElementId(index: number, field: GoodsReceiptLineFocusField): string {
    return {
      articleCode: `gr-code-${index}`,
      sku: `gr-sku-${index}`,
      barcode: `gr-barcode-${index}`,
      supplierCode: `gr-supplier-code-${index}`,
      product: `gr-product-${index}`,
      quantity: `gr-qty-${index}`,
      unitOfMeasure: `gr-uom-${index}`,
      unitCost: `gr-cost-${index}`,
      discount: `gr-discount-${index}`,
      sellingPrice: `gr-selling-${index}`,
      shopifyPrice: `gr-shopify-${index}`,
      compareAtPrice: `gr-compare-${index}`,
      vat: `gr-vat-${index}`,
      lot: `gr-lot-${index}`,
      expiry: `gr-lot-date-${index}`,
      serials: `gr-serial-${index}`,
    }[field];
  }

  protected focusLineField(index: number, field: GoodsReceiptLineFocusField): void {
    this.lineFocus.focusField(index, field);
  }

  protected focusFirstLineField(index: number): void {
    this.lineFocus.focusFirstField(index);
  }

  protected focusNextLineField(index: number, current: GoodsReceiptLineFocusField): void {
    this.lineFocus.next(index, current);
  }

  /** Shift+Tab: campo precedente della riga, o ultima cella della riga sopra. */
  protected focusPreviousLineField(index: number, current: GoodsReceiptLineFocusField): void {
    this.lineFocus.previous(index, current);
  }

  /**
   * Ctrl + ↑↓ sposta la RIGA, e resta **fuori dal contratto**: è l'unica delle
   * tre maschere ad averlo, quindi non è un meccanismo condiviso. Il punto unico
   * ignora gli eventi con `ctrlKey`, e qui si intercettano prima di passargli
   * tutto il resto.
   */
  /**
   * ⛔ Ctrl+↑/↓ non sposta più la riga (11/08/2026, decisione del proprietario).
   *
   * Esisteva solo qui, e la scelta era fra darlo alle altre due o toglierlo.
   * Tolto: spostare una riga è un aggiustamento occasionale, non un gesto del
   * flusso di compilazione — e da oggi c'è anche l'ordinamento per colonna.
   * Chi lo fa due volte al mese può staccare la mano dalla tastiera.
   *
   * L'argomento dell'accessibilità non regge quanto sembra, ed era il mio: una
   * combinazione che si scopre solo dal suggerimento sulla maniglia la trova
   * **chi sta già usando il mouse**, cioè chi può trascinare. Un gesto che
   * nessuno scopre e che duplica una funzione disponibile è codice da mantenere
   * senza ritorno.
   *
   * Non è «funzione rimossa e basta»: è un **rimando**. Se servirà riordinare da
   * tastiera si progetta con un comando visibile (specifica §7.3).
   *
   * Le frecce di spostamento in colonna Azioni restano, e restano
   * `moveLineUp`/`moveLineDown`: quelle si vedono.
   */
  protected onLineFieldKeydown(
    index: number,
    field: GoodsReceiptLineFocusField,
    event: KeyboardEvent,
  ): void {
    this.lineFocus.handleKeydown(index, field, event);
  }

  private clearProductAutocomplete(): void {
    this.productSuggest.clear();
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
      // L'unità di misura si CATTURA dall'anagrafica, come il nome e lo SKU:
      // il documento è una fotografia, e la riga se la tiene anche se domani
      // l'articolo cambia. Senza questa riga il controllo restava vuoto, a
      // schermo compariva lo stesso il valore dell'articolo — il ripiego di
      // `lineUnitOfMeasure` — e sul documento non si salvava niente:
      // **zero righe su 99 avevano una U.M.**, e sembrava che l'avessero tutte.
      if (!line.controls.unitOfMeasure.value.trim()) {
        line.controls.unitOfMeasure.setValue(summary.unitOfMeasure ?? 'pz', {
          emitEvent: false,
        });
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
    warnings.push(...this.missingCostWarnings());
    return warnings;
  }

  /**
   * Righe salvate senza costo: si AVVISA, non si blocca (11/08/2026).
   *
   * Vale su questo documento e sull'Ordine fornitore, con le stesse parole.
   * Un ordine si fa spesso al volo, senza avere ancora il listino del
   * fornitore sotto mano, e un costo mancante non rompe niente: il documento
   * vale zero su quella riga finché non lo si scrive. Chi invece il costo lo
   * conosce va avvisato che se n'è dimenticato — che è un'altra cosa dal non
   * poter salvare.
   */
  private missingCostWarnings(): readonly string[] {
    const righe: string[] = [];
    for (let index = 0; index < this.lines.length; index += 1) {
      const line = this.lines.at(index);
      if (!lineDraftPersistableForExplicitSave(this.lineDraft(line))) {
        continue;
      }
      if (line.controls.unitCost.value.trim()) {
        continue;
      }
      righe.push(String(index + 1));
    }
    if (righe.length === 0) {
      return [];
    }
    return [
      righe.length === 1
        ? `Riga ${righe[0]}: salvata senza costo.`
        : `Righe ${righe.join(', ')}: salvate senza costo.`,
    ];
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

  /**
   * «L'operatore ha toccato il numero?» in forma reattiva. Lo stato vero resta
   * `documentNumber.dirty` — qui non se ne tiene una copia, si ascolta: gli
   * eventi del controllo includono `PristineChangeEvent`, quindi il signal si
   * aggiorna anche su `markAsDirty()`, che `valueChanges` non emette.
   */
  private readonly documentNumberPristine = toSignal(
    this.form.controls.documentNumber.events.pipe(
      map(() => this.form.controls.documentNumber.pristine),
    ),
    { initialValue: true },
  );

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

  /**
   * L'unità di misura della riga — **prima quella della riga**, poi quella
   * dell'articolo, poi `pz`. È la stessa precedenza dell'Ordine cliente, e per
   * la stessa ragione: il documento è una fotografia, e la riga tiene per sé
   * l'unità con cui è stata compilata.
   *
   * Il controllo è **uno solo**. Prima ce n'era uno per la creazione articolo e
   * niente per la riga: l'unità si poteva scegliere solo mentre si creava
   * l'articolo, e su una riga normale era testo calcolato. Ora è lo stesso
   * dato — quando l'articolo nasce, il valore va anche in anagrafica.
   */
  protected lineUnitOfMeasure(index: number): string {
    const line = this.lines.at(index);
    const summary = this.lineVariantSummary(index);
    return line?.controls.unitOfMeasure.value.trim() || summary?.unitOfMeasure?.trim() || 'pz';
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
    this.lines.at(index)?.controls.unitOfMeasure.setValue(value.trim());
    this.markFormDirty();
  }

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

  // Un perimetro solo: tutte le righe. Ne esisteva un secondo — «le righe
  // selezionate» — che arrivava dalla barra della selezione multipla: stesso
  // dialogo, stesso codice che applica, cambiava solo su quante righe. Con le
  // spunte e' caduto anche lui.
  protected openApplyVatDialog(): void {
    this.vatHeaderMenuOpen.set(false);
    if (this.formReadOnly()) {
      return;
    }
    this.applyVatCodeId.set(this.defaultVatCodeId());
    this.applyVatDialogOpen.set(true);
  }

  protected readonly applyVatDialogTitle = 'Codice IVA da impostare su tutte le righe';

  protected closeApplyVatDialog(): void {
    this.applyVatDialogOpen.set(false);
  }

  /** Righe economiche interessate: esclude la riga vuota di inserimento (§10.1). */
  protected readonly applyVatTargetCount = computed(() => {
    this.formValue();
    return this.lines.controls.filter((line) => !this.lineIsEmpty(line)).length;
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
    for (const line of this.lines.controls) {
      if (this.lineIsEmpty(line)) {
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

  /**
   * Tipo scelto nel componente condiviso. Il valore vive nel form — da lì va
   * al salvataggio — e la lista locale si ricarica: il tipo può essere nato
   * un attimo prima nel pannello «Gestisci tipi documento…», e finché non
   * arriva qui il suo modello di causale non esiste.
   */
  protected onExternalDocTypeChange(typeId: string): void {
    const known = !typeId || this.externalDocTypes().some((type) => type.id === typeId);
    this.form.controls.externalDocumentTypeId.setValue(typeId);
    this.loadExternalDocTypes(() => {
      // Il giro di rete può finire quando l'operatore ha già cambiato idea:
      // il modello si applica solo se il tipo scelto è ancora quello.
      if (!known && this.form.controls.externalDocumentTypeId.value === typeId) {
        this.applyTemplateFromType(typeId);
      }
    });
  }

  /**
   * L'operatore ha toccato i tipi nel pannello di gestione. Anche senza cambiare
   * la selezione la lista locale va riallineata: un tipo rinominato lascerebbe
   * altrimenti l'etichetta vecchia nel riepilogo di testata mobile e il modello
   * vecchio nella causale di carico.
   */
  protected onExternalDocTypesChanged(): void {
    this.loadExternalDocTypes();
  }

  /** Ricarica la lista locale dei tipi (la tendina la serve il componente condiviso). */
  private loadExternalDocTypes(onLoaded?: () => void): void {
    this.externalTypeService
      .list()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (types) => {
          this._externalDocTypes.set(types);
          onLoaded?.();
        },
        // Una lista che non arriva non svuota quella in mano: al massimo la
        // causale generata resta indietro di un giro.
        error: () => undefined,
      });
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

  /**
   * `linkedWith` è il codice fornitore che l'operatore ha digitato e con cui
   * l'articolo si è agganciato. Passarlo è l'unico modo perché arrivi fin qui:
   * l'aggancio riceve l'id della variante, e «con quale codice» è
   * un'informazione che altrimenti si perde per strada.
   */
  protected onVariantSelect(
    index: number,
    value: string | null,
    linkedWith?: string,
    /**
     * Uso interno: lo passa il ripiego asincrono qui sotto. Alla seconda
     * chiamata la riga porta già il nuovo articolo, quindi il confronto con il
     * precedente direbbe «nessuna sostituzione» e i campi del vecchio
     * resterebbero — cioè il difetto che questo ramo esiste per chiudere.
     */
    replacedArticleOverride?: boolean,
  ): void {
    const line = this.lines.at(index);
    // Sostituzione d'articolo: la riga aveva già un altro articolo. I dati di
    // quello vecchio — costo, prezzi, Codice IVA — non devono sopravvivergli.
    // Il ramo «solo se vuoto» qui sotto resta per l'altro caso, che è opposto:
    // la riga precompilata da un documento d'origine, che non si tocca.
    const previousVariantId = line.controls.variantId.value;
    const replacedArticle =
      replacedArticleOverride ?? (Boolean(previousVariantId) && previousVariantId !== value);
    line.controls.variantId.setValue(value ?? '');
    if (value) {
      const summary = mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants()).find(
        (v) => v.variantId === value,
      );
      if (!summary) {
        // L'articolo può non essere fra i risultati di ricerca: succede ogni
        // volta che si aggancia per CODICE — SKU, EAN, codice articolo — senza
        // aver prima cercato per nome. Senza questo ripiego la riga restava
        // con l'articolo agganciato e i campi di PRIMA: costo, prezzi e Codice
        // IVA di un altro articolo, oppure vuoti.
        //
        // Non basta aspettare `pinnedVariants`: quel segnale carica davvero la
        // summary, ma nessuno la riapplica alla riga — l'effetto che lo osserva
        // sincronizza solo codici e accessibilità dei campi.
        const locationId = this.form.controls.locationId.value || undefined;
        this.productService
          .searchVariantSummaries({ variantId: value, locationId })
          .pipe(take(1), takeUntilDestroyed(this.destroyRef))
          .subscribe((rows) => {
            const fetched = rows[0];
            // La riga può essere cambiata nel frattempo: si applica solo se
            // l'articolo agganciato è ancora quello per cui si è chiesto.
            if (!fetched || this.lines.at(index)?.controls.variantId.value !== value) {
              return;
            }
            this.applyVariantSummaryToLine(index, fetched, replacedArticle, linkedWith);
          });
      }
      if (summary) {
        this.applyVariantSummaryToLine(index, summary, replacedArticle, linkedWith);
      }
    }
    this.codeLookup.clear();
    this.clearProductAutocomplete();
    this.syncLineFieldAccess();
    this.markFormDirty();
  }

  /**
   * Scrive sulla riga i dati dell'articolo scelto.
   *
   * Vive fuori da `onVariantSelect` perché serve a DUE strade: la scelta da
   * elenco, dove la summary è già in mano, e l'aggancio per codice, dove
   * arriva dopo un giro di rete. Prima esisteva solo la prima, e agganciando
   * per SKU o EAN la riga restava con i dati dell'articolo precedente.
   *
   * `replacedArticle` distingue i due gesti, che chiedono l'opposto:
   * - **riga nuova o precompilata da un documento d'origine** (`false`): si
   *   riempie solo ciò che è vuoto, perché quei valori sono di quel documento;
   * - **articolo sostituito su una riga già compilata** (`true`): costo,
   *   prezzi e Codice IVA si **riscrivono**, anche svuotandosi. Il costo di un
   *   altro articolo non è un dato da conservare: è un dato sbagliato.
   */
  private applyVariantSummaryToLine(
    index: number,
    summary: VariantSummary,
    replacedArticle: boolean,
    linkedWith?: string,
  ): void {
    const line = this.lines.at(index);
    const value = summary.variantId;
    line.controls.articleCode.setValue(summary.articleCode, { emitEvent: false });
    line.controls.sku.setValue(summary.sku, { emitEvent: false });
    line.controls.barcode.setValue(summary.barcode ?? '', { emitEvent: false });
    const label = summary.productName || summary.title;
    line.controls.productName.setValue(label, { emitEvent: false });
    if (replacedArticle) {
      // Sostituzione: i prezzi seguono il nuovo articolo, e se non ne ha
      // si svuotano. Tenere quelli di prima farebbe pubblicare su Shopify
      // il prezzo di un articolo diverso.
      // I prezzi dell'anagrafica sono NETTI: si mostrano nella modalità di
      // riga, e il netto si ricorda per non limarne la coda al primo giro.
      this.setSalesPrice(line, 'sellingPrice', summary.sellingPrice.amountMinor || null);
      this.setSalesPrice(line, 'compareAtPrice', summary.compareAtPrice?.amountMinor ?? null);
      // Il prezzo del canale segue lo stesso criterio: tenere quello di prima
      // pubblicherebbe su Shopify il prezzo di un articolo diverso.
      this.setSalesPrice(line, 'shopifyPrice', summary.shopifyPrice?.amountMinor ?? null);
    } else {
      if (!line.controls.sellingPrice.value.trim() && summary.sellingPrice.amountMinor > 0) {
        this.setSalesPrice(line, 'sellingPrice', summary.sellingPrice.amountMinor);
      }
      if (!line.controls.shopifyPrice.value.trim() && summary.shopifyPrice?.amountMinor) {
        this.setSalesPrice(line, 'shopifyPrice', summary.shopifyPrice.amountMinor);
      }
      if (!line.controls.compareAtPrice.value.trim() && summary.compareAtPrice?.amountMinor) {
        this.setSalesPrice(line, 'compareAtPrice', summary.compareAtPrice.amountMinor);
      }
    }
    // Precedenza Codice IVA (§9.1, Fase IVA §7): articolo → Codice IVA
    // predefinito del fornitore (se attivo/acquisto) → predefinito
    // aziendale (risolto da ensureLineVatCode). La riga già valorizzata
    // (es. da documento origine) non viene toccata.
    if (replacedArticle) {
      // Il Codice IVA della riga è quello dell'articolo: sostituendolo si
      // riparte dalla catena di precedenza, non si eredita il precedente.
      line.controls.vatCodeId.setValue('', { emitEvent: false });
    }
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
    if (replacedArticle) {
      // Come i prezzi: il costo segue il nuovo articolo, o si svuota.
      line.controls.unitCost.setValue(
        summary.purchasePrice?.amountMinor
          ? this.costFieldValue(summary.purchasePrice.amountMinor, line)
          : '',
      );
    } else if (!line.controls.unitCost.value.trim() && summary.purchasePrice?.amountMinor) {
      line.controls.unitCost.setValue(this.costFieldValue(summary.purchasePrice.amountMinor, line));
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
    // ⛔ Riga già agganciata: NIENTE precompilato.
    //
    // I campi della riga sono quelli dell'articolo che c'è già — nome, SKU, EAN.
    // Copiarli in una scheda NUOVA produce un doppione vestito coi codici di un
    // altro: al salvataggio o sbatte contro l'unicità dello SKU, o nasce un
    // gemello. «Crea» deve partire pulito, sempre.
    if (line.controls.variantId.value) {
      return null;
    }
    const name = line.controls.productName.value.trim();
    const cost = parseMoneyInput(line.controls.unitCost.value, this.currency);
    // NETTI canonici: se la riga mostra gli ivati, qui si scorpora — l'anagrafica
    // memorizza sempre il netto, e questa è una delle due porte che la scrivono.
    const sellingNet = this.lineSalesNetMinor(line, 'sellingPrice');
    const compareAtNet = this.lineSalesNetMinor(line, 'compareAtPrice');
    return {
      name,
      description: line.controls.description.value.trim() || undefined,
      sku: line.controls.sku.value.trim() || undefined,
      barcode: line.controls.barcode.value.trim() || undefined,
      purchasePriceMajor: cost ? cost.amountMinor / 100 : null,
      sellingPriceMajor: sellingNet != null ? sellingNet / 100 : null,
      compareAtPriceMajor: compareAtNet != null ? compareAtNet / 100 : null,
      defaultVatCodeId: line.controls.vatCodeId.value.trim() || null,
    };
  });

  protected openNewProduct(): void {
    this.productPanel.openForNewProduct();
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
    this.dropTrailingEmptyLines();
    const validationError = this.validateForFinalSave();
    if (validationError) {
      this._submitState.set({ status: 'error', error: validationError });
      return;
    }
    // Controllo cronologico (§4): se la serie contiene documenti fuori posto
    // l'operatore lo deve sapere PRIMA di aggiungerne un altro. Avviso, non
    // blocco — da lì si salva comunque. La regola vive nella guardia condivisa.
    this.chronology.run(() =>
      // Nessun dialog: la scelta è la spunta per-documento (default acceso).
      this.executeExplicitSave(this.updateArticleCost()),
    );
  }

  /** Spunta «Aggiorna il costo in anagrafica con quello inserito». */
  protected setUpdateArticleCost(checked: boolean): void {
    this.updateArticleCost.set(checked);
  }

  /** Spunta «Aggiorna prezzi articolo»: spegnendola i prezzi tornano in sola lettura. */
  protected setUpdateArticlePrices(checked: boolean): void {
    this.updateArticlePrices.set(checked);
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

  /** C'è un fornitore scelto? Tocca `formValue()`: vedi `hasCustomer` in Ordine cliente. */
  protected hasSupplier(): boolean {
    this.formValue();
    return !!this.form.controls.supplierId.value;
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
    this.linkLineCodesThen(lastIndex, () => {
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
    // Il primo riordino del documento apre l'avviso e si ferma qui: riprende
    // dalla conferma. Dal secondo in poi `request` ordina e basta.
    if (this.lineSort.request(columnId)) {
      this.applyLineSort();
    }
  }

  /** L'operatore ha confermato l'avviso: il riordino in attesa parte. */
  protected confirmLineSort(): void {
    if (this.lineSort.confirm() !== null) {
      this.applyLineSort();
    }
  }

  protected lineSortAriaLabel(columnId: GoodsReceiptLineSortColumn, label: string): string {
    if (this.lineSort.column() !== columnId) {
      return `Ordina per ${label}`;
    }
    return this.lineSort.direction() === 'asc'
      ? `${label}: ordinamento crescente`
      : `${label}: ordinamento decrescente`;
  }

  /**
   * Come si confronta ogni colonna. E' l'UNICA cosa che questa maschera deve
   * dire sul riordino: il resto — il confronto, il verso, l'avviso — vive in
   * `domain/` ed e' identico in ogni documento.
   */
  private readonly lineSortKinds: Readonly<Record<GoodsReceiptLineSortColumn, SortValueKind>> = {
    sku: 'text',
    barcode: 'text',
    supplierCode: 'text',
    product: 'text',
    quantity: 'number',
    unitCost: 'money',
    vat: 'percent',
  };

  private lineSortValue(
    raw: ReturnType<ReturnType<GoodsReceiptFormComponent['createLine']>['getRawValue']>,
    column: GoodsReceiptLineSortColumn,
  ): string | number {
    switch (column) {
      case 'sku':
        return raw.sku;
      case 'barcode':
        return raw.barcode;
      case 'supplierCode':
        return raw.supplierSku;
      case 'product':
        return raw.productName;
      case 'quantity':
        return Number(raw.quantity) || 0;
      case 'unitCost':
        return raw.unitCost;
      case 'vat':
        return raw.vatRatePercent;
    }
  }

  private applyLineSort(): void {
    const column = this.lineSort.column();
    if (!column || this.lines.length <= 1) {
      return;
    }
    const controls = sortByValue(
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
    this.linkLineCodesThen(targetIndex, () => this.scheduleBarcodeScanFocus());
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
    this.linkLineCodesThen(targetIndex, () => this.focusLineField(targetIndex, 'sku'));
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
   * Trascinamento riga (§7.2). Non chiede conferma, a differenza del riordino
   * per colonna: e' un movimento singolo e visibile, si vede dove la riga
   * finisce, e chi lo fa sa cosa sta facendo. L'avviso serve al riordino che
   * ribalta tutto in un colpo.
   */
  protected onLineDrop(event: CdkDragDrop<unknown>): void {
    // Guardia, non ridondanza: il template disabilita gia' il drop su documento
    // protetto, ma quella e' una riga di binding che si perde in un refactor
    // senza che niente diventi rosso.
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
    this.markFormDirty();
    // removeAt/insert silenziosi: un giro esplicito riallinea vista e totali.
    this.lines.updateValueAndValidity();
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

  protected fieldInvalid(name: 'supplierId' | 'locationId' | 'documentDate'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  /**
   * Il campo tiene ferme le righe: obbligatorio, ancora vuoto, e finché resta
   * così il documento non ha righe da compilare. Distinto da `fieldInvalid`,
   * che dice «hai provato a salvare e questo è sbagliato»: aprire un documento
   * nuovo non è un errore, è l'inizio del lavoro.
   */
  protected fieldWaiting(name: 'supplierId' | 'locationId'): boolean {
    this.formValue();
    if (!this.headerGateActive()) {
      return false;
    }
    return !this.form.controls[name].value;
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
    // Come nel salvataggio esplicito: il numero mostrato si legge prima dell'invio.
    const shownDocumentNumber = this.form.controls.documentNumber.value;
    const documentNumberWasImposed = this.form.controls.documentNumber.dirty;
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
          this.reconcileAssignedDocumentNumber(doc, shownDocumentNumber, documentNumberWasImposed);
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
            this.setSalesPrice(line, 'sellingPrice', summary.sellingPrice.amountMinor);
          }
          if (!line.controls.compareAtPrice.value.trim() && summary.compareAtPrice?.amountMinor) {
            this.setSalesPrice(line, 'compareAtPrice', summary.compareAtPrice.amountMinor);
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

  /** Lo scarico PDF è fallito: l'errore entra nella fascia della maschera. */
  protected onPrintFailed(err: unknown): void {
    this._submitState.set({ status: 'error', error: this.toAppError(err) });
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
      documentNumber: null,
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
    this.numbering.refreshProposal();
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
      shopifyPrice: this.fb.control(''),
      compareAtPrice: this.fb.control(''),
      vatRatePercent: this.fb.control(''),
      vatCodeId: this.fb.control(''),
      loadsStock: this.fb.control(true),
      unitOfMeasure: this.fb.control(''),
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
      shopifyPrice: this.fb.control(''),
      compareAtPrice: this.fb.control(''),
      vatRatePercent: this.fb.control(line.vatRatePercentText),
      vatCodeId: this.fb.control(''),
      loadsStock: this.fb.control(true),
      unitOfMeasure: this.fb.control(''),
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

  private executeExplicitSave(updateArticleCost: boolean): void {
    if (this.saving()) {
      return;
    }
    const validationError = this.validateForFinalSave();
    if (validationError) {
      this._submitState.set({ status: 'error', error: validationError });
      return;
    }

    this.syncActiveFieldBeforeSave();
    // Il numero mostrato va letto PRIMA di partire: se il server ne assegna
    // un altro serve il confronto con quello che l'operatore aveva sotto gli occhi.
    const shownDocumentNumber = this.form.controls.documentNumber.value;
    const documentNumberWasImposed = this.form.controls.documentNumber.dirty;
    this._submitState.set({ status: 'saving' });
    this.submitSubscription?.unsubscribe();
    this.submitSubscription = this.linkAllLineCodes$()
      .pipe(
        switchMap(() => this.saveDocument$({ updateArticleCost })),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (doc) => {
          this._submitState.set({ status: 'idle' });
          this.dirtySinceLastSave.set(false);
          this.loadedDocument.set(doc);
          this.reconcileAssignedDocumentNumber(doc, shownDocumentNumber, documentNumberWasImposed);
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
          // Numero già preso: il vincolo del database non ammette
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

  protected acknowledgeConflictNumber(): void {
    this.numbering.acknowledgeConflict(this.numberConflictDialog);
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

  // Letto anche dal template, per passarlo alle azioni di stampa.
  protected persistedDocumentId(): string | null {
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

  /**
   * Numero da inviare: SOLO quello digitato dall'operatore.
   *
   * Quello proposto all'apertura è il primo libero *di quel momento*: rimandarlo
   * indietro lo trasformerebbe in una pretesa, e due maschere aperte insieme si
   * contenderebbero un numero che nessuna delle due ha scelto — con un dialogo
   * di conflitto a lavoro finito per il secondo che salva. Omesso, il numero lo
   * assegna il server dentro la transazione che scrive il documento, e la
   * contesa si risolve da sola, in silenzio.
   *
   * `dirty` è la distinzione, e la tiene lo store: la proposta si scrive senza
   * sporcare il controllo, la scelta sì.
   */
  private requestedDocumentNumber(): number | undefined {
    return this.numbering.imposedNumber();
  }

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
      // Numero imposto a mano: non sposta il progressivo della serie.
      number: this.requestedDocumentNumber(),
      series: this.numbering.chosenSeries(),
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
          unitOfMeasure: line.unitOfMeasure?.trim() || undefined,
          // I prezzi partono SOLO con la spunta accesa: a spunta spenta i campi
          // sono in sola lettura, e mandarli sarebbe mandare un valore che
          // l’operatore non ha potuto scegliere.
          ...(this.updateArticlePrices()
            ? {
                sellingPriceMinor: this.lineSalesNetMinor(control, 'sellingPrice') ?? undefined,
                shopifyPriceMinor: this.showShopifyPrice()
                  ? (this.lineSalesNetMinor(control, 'shopifyPrice') ?? undefined)
                  : undefined,
              }
            : {}),
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
    // NETTI canonici, come per l'anteprima: la riga può mostrare gli ivati.
    const sellingNet = this.lineSalesNetMinor(control, 'sellingPrice');
    const compareAtNet = this.lineSalesNetMinor(control, 'compareAtPrice');
    return {
      name: line.productName.trim(),
      sku: line.sku.trim() || undefined,
      barcode: line.barcode.trim() || undefined,
      sellingPriceMinor: sellingNet ?? undefined,
      // `?? undefined` e non `|| undefined`: uno zero e' una scelta, non
      // un'assenza — e un barrato assente non deve diventare zero.
      compareAtPriceMinor: compareAtNet ?? undefined,
      purchasePriceMinor: purchase?.amountMinor || undefined,
      vatCodeId: line.vatCodeId || undefined,
      unitOfMeasure: line.unitOfMeasure?.trim() || undefined,
    };
  }

  /**
   * Salvataggio unico "Salva documento" (prompt §2.1): testata + righe +
   * totali + movimenti + giacenze. Idempotente: gli id riga restituiti dal
   * server vengono riadottati per aggiornare i movimenti ai salvataggi futuri.
   */
  private saveDocument$(options?: {
    readonly updateArticleCost?: boolean;
  }): Observable<DocumentRecord> {
    const body = {
      ...this.buildSaveGoodsReceiptBody(),
      updateArticleCost: options?.updateArticleCost,
      updateArticlePrices: this.updateArticlePrices(),
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
   * Gesto sulla riga (Invio / aggiungi riga / scansione / sfocamento): collega
   * eventuali codici digitati, poi prosegue con `after`.
   *
   * Si chiamava `commitLineAndSave`, e il nome mentiva: nessun salvataggio è
   * mai partito da qui — il documento si persiste solo col pulsante. Un nome che
   * promette una scrittura fa esitare chi legge proprio dove servirebbe
   * scorrere veloce, e fa cercare una persistenza che non esiste.
   */
  private linkLineCodesThen(index: number, after?: () => void): void {
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
   * lookup (404) a ogni tentativo di collegamento. Si svuota quando l'utente
   * modifica un codice riga.
   *
   * ⚠️ Diceva «a ogni autosave/salvataggio»: era il residuo di un autosave
   * rimosso a luglio. Il salvataggio progressivo è stato **ritirato come
   * requisito** il 19/08/2026 — il documento si salva solo col pulsante — e
   * quel nome non descriveva più niente (`GUARDIE-MANCANTI` voce 22).
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
      documentNumber: doc.number ?? null,
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
      // Una riga la sa costruire `createLine`, e basta lei: qui c'era una
      // SECONDA copia dei ventuno controlli, scritta a mano. Copie così non
      // divergono con un errore, divergono con un campo aggiunto da una parte
      // sola — e nel silenzio, perché il caso comune (documento nuovo) passa
      // per l'originale e funziona.
      const group = this.createLine();
      group.patchValue({
        id: line.id,
        variantId: line.variantId ?? '',
        sku: line.sku ?? '',
        productName: line.description,
        description: line.description,
        quantity: line.quantity,
        // Con costi ivati la colonna mostra il valore digitato (lordo), non
        // il netto canonico persistito in unitPrice (§11.4).
        unitCost: moneyToDecimalString(
          line.enteredUnitCostMinor != null
            ? { amountMinor: line.enteredUnitCostMinor, currencyCode: this.currency }
            : line.unitPrice,
        ).replace('.', ','),
        discountPercent: line.discountPercent > 0 ? String(line.discountPercent) : '',
        vatRatePercent: line.vatSnapshot?.ratePercent?.toString() ?? '',
        vatCodeId: line.vatCodeId ?? '',
        // Le righe senza articolo persistono loadsStock=false come artefatto
        // tecnico (nessun movimento possibile): in UI il flag resta al default
        // attivo, così al collegamento dell'articolo il carico parte (§11).
        loadsStock: line.variantId ? line.loadsStock : true,
        // La fotografia salvata sulla riga, non quella dell'anagrafica di
        // adesso: è il punto in cui il documento riaperto dice quello che
        // diceva quando è stato compilato.
        unitOfMeasure: line.unitOfMeasure ?? '',
        supplierOrderLineId: line.supplierOrderLineId ?? '',
        lotCode: line.lotCode ?? '',
        lotExpiryDate: line.lotExpiryDate ? line.lotExpiryDate.slice(0, 10) : '',
        serialNumbersText: (line.serialNumbers ?? []).join(', '),
      });
      // L'unica differenza vera fra riga nuova e riga già registrata, e adesso
      // si legge in una riga invece che confrontando due elenchi: su un arrivo
      // già salvato la quantità può essere ZERO — una riga ordinata e non
      // ricevuta — mentre una riga nuova parte da uno.
      group.controls.quantity.setValidators([
        Validators.required,
        Validators.min(0),
        Validators.pattern(/^\d+$/),
      ]);
      group.controls.quantity.updateValueAndValidity({ emitEvent: false });
      this.lines.push(group);
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
      shopifyPrice: this.fb.control(''),
      compareAtPrice: this.fb.control(''),
      vatRatePercent: this.fb.control(''),
      vatCodeId: this.fb.control(''),
      loadsStock: this.fb.control(true),
      // Toggle "Gestito a magazzino" del nuovo articolo (punto B, default sì).
      unitOfMeasure: this.fb.control(''),
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
   * Numero assegnato dal server diverso da quello che la testata mostrava: la
   * proposta era «il primo libero adesso», e nel frattempo l'ha preso un altro.
   * La testata si allinea al numero vero — un campo che continua a mostrare il
   * 42 quando il documento è il 46 è peggio di nessun numero — e l'operatore lo
   * viene a sapere: senza avviso trascriverebbe altrove un numero che non è
   * il suo.
   *
   * Niente avviso se il numero l'aveva imposto lui: quel caso ha già il suo
   * dialogo di conflitto, e due messaggi per lo stesso fatto sono uno di troppo.
   * Niente avviso nemmeno se la testata non mostrava alcun numero: non c'è
   * nulla che cambia sotto gli occhi di chi guarda.
   */
  private reconcileAssignedDocumentNumber(
    doc: DocumentRecord,
    shownNumber: number | null,
    imposed: boolean,
  ): void {
    const assigned = doc.number ?? null;
    if (assigned == null || assigned === shownNumber) {
      return;
    }
    // Allineare il campo non è una modifica dell'operatore: il documento resta
    // salvato, e `setValue` non tocca `dirty` — la proposta resta proposta e la
    // scelta resta scelta.
    this.withDirtySuppressed(() => this.form.controls.documentNumber.setValue(assigned));
    if (imposed || shownNumber == null) {
      return;
    }
    this.toasts.showInfo(
      `Salvato con il n. ${assigned}: il ${shownNumber} è stato preso da un altro operatore.`,
    );
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
