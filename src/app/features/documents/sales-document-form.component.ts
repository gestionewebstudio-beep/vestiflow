import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  map,
  of,
  startWith,
  switchMap,
  take,
} from 'rxjs';
import type { Subscription } from 'rxjs';

import {
  VARIANT_SEARCH_DEBOUNCE_MS,
  VARIANT_SEARCH_MIN_CHARS,
  VARIANT_SEARCH_PAGE_SIZE,
} from '@domain/documents/utils/document-variant-search.config';
import { NavigationHistoryService } from '@core/services/navigation-history.service';
import { formatDate } from '@core/utils/date.util';
import { toLocationSelectOptions } from '@core/utils/location-select-options.util';
import type { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import { AuthService } from '@core/auth';
import { canViewPurchaseCosts } from '@core/permissions/tenant-permissions.util';
import { hasTenantPermission } from '@core/permissions/user-permissions.util';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { DocumentStatus, DocumentType, TransportPort } from '@core/models/document.model';
import { requireSalesDocumentType } from './models/document-routing.util';
import type { DocumentRecord } from '@core/models/document.model';
import { isConfirmedEditableDocumentStatus } from '@core/models/document.model';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  moneyToDecimalString,
  parseMoneyInput,
  toStorableMinor,
} from '@core/utils/money.util';
import {
  formatDiscountPercentValue,
  parseEffectiveDiscountPercent,
} from '@core/utils/discount-percent.util';
import { customerDisplayName, type Customer } from '@core/models/customer.model';
import { isSalesVatCode, vatCodeOptionLabel, type VatCode } from '@core/models/vat-code.model';
import {
  vatCodeSelectOption,
  vatOptionsIncludingSelected,
} from '@domain/documents/utils/document-vat-options.util';
import { vatCodeIdForLinePayload } from '@domain/documents/utils/document-line-vat-payload.util';
import { bindBreadcrumbEntityLabel } from '@core/services/breadcrumb-label.service';
import { ToastService } from '@core/services/toast.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { CustomerService } from '@domain/customers/services/customer.service';
import {
  ARTICLE_LISTINO_VALUE,
  listinoSelectOptions,
  listinoUnitPrice,
  parseListinoChoice,
  type DocumentListinoChoice,
} from '@domain/documents/utils/document-listino.util';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import { ProductService } from '@domain/products/services/product.service';
import { mergeVariantSummaries } from '@domain/products/utils/variant-summary-search.util';
import { toVariantSelectMenuOptions } from '@domain/products/utils/variant-select-menu.util';
import type { TenantFeatureSettings } from '@domain/tenant/models/tenant-feature-settings.model';
import { TenantFeatureSettingsService } from '@domain/tenant/services/tenant-feature-settings.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { documentNumberConflictOf } from '@core/models/document-number-conflict.util';
import { DocumentNumberConflictStore } from '@domain/documents/state/document-number-conflict.store';
import { DocumentChronologyGuard } from '@domain/documents/state/document-chronology-guard';
import { DocumentChronologyWarningDialogComponent } from '@domain/documents/components/document-chronology-warning-dialog/document-chronology-warning-dialog.component';
import { DocumentPrefillErrorStore } from '@domain/documents/state/document-prefill-error.store';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DocumentNumberFieldComponent } from '@shared/components/document-number-field/document-number-field.component';
import { DocumentSeriesManagerDialogComponent } from '@domain/documents/components/document-series-manager-dialog/document-series-manager-dialog.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { EditLockBannerComponent } from '@shared/components/edit-lock-banner/edit-lock-banner.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { DocumentEditLockService } from '@domain/documents/services/document-edit-lock.service';
import { formatItalianInputDate } from '@shared/utils/calendar.util';

import { CdkDrag, CdkDragHandle, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import {
  lineColumnQuotaWidth,
  sumVisibleLineColumnsPx,
} from '@shared/table-columns/line-column-quota.util';
import { TableColumnResizeDirective } from '@shared/directives/table-column-resize.directive';
import { DocumentLineSortStore } from '@domain/documents/state/document-line-sort.store';
import { sortByValue, type SortValueKind } from '@shared/utils/sort-values.util';
import {
  SALES_DOCUMENT_LINES_VIEW,
  SALES_DOCUMENT_LINE_COLUMNS,
  SALES_DOCUMENT_LINE_PRESETS,
} from './models/sales-document-line-columns.config';
import { SalesDocumentLineCardComponent } from '@domain/documents/components/sales-document-line-card/sales-document-line-card.component';
import { ViewportService } from '@core/services/viewport.service';
import { DocumentProductSearchPanelComponent } from '@domain/documents/components/document-product-search-panel/document-product-search-panel.component';
import { DocumentLineCodeCellComponent } from '@domain/documents/components/document-line-code-cell/document-line-code-cell.component';
import { DocumentLineProductCellComponent } from '@domain/documents/components/document-line-product-cell/document-line-product-cell.component';
import { DocumentLineSelectCellComponent } from '@domain/documents/components/document-line-select-cell/document-line-select-cell.component';
import { DocumentCodeLookupStore } from '@domain/documents/state/document-code-lookup.store';
import { DocumentCodeLookupService } from '@domain/documents/services/document-code-lookup.service';
import { DocumentProductSuggestStore } from '@domain/documents/state/document-product-suggest.store';
import { DocumentLineFocusStore } from '@domain/documents/state/document-line-focus.store';
import type { DocumentLineCodeField } from '@domain/documents/utils/document-code-match.util';
import type { LineCodeChoice } from '@domain/documents/models/document-line-code-choice.model';
import { DocumentIncludePanelComponent } from '@domain/documents/components/document-include-panel/document-include-panel.component';
import { DocumentMobilePanelComponent } from '@domain/documents/components/document-mobile-panel/document-mobile-panel.component';
import { PriceModeMenuComponent } from '@domain/documents/components/price-mode-menu/price-mode-menu.component';
import {
  IncludeSourceKind,
  conversionReferenceLine,
  includeReferenceLine,
  includeSourceKindsForDocumentType,
  type IncludedDocumentPayload,
} from '@domain/documents/models/document-include.util';
import {
  documentReferenceLabel,
  documentTypeLabel,
} from '@domain/documents/models/document-labels.util';
import {
  isInvoiceAccompanyingDocumentType,
  isInvoiceDraftDocumentType,
  isProformaDocumentType,
  isSalesFormDocumentType,
  isSalesInvoiceDocumentType,
  supportsLinkedSalesDdt,
} from '@domain/documents/models/document-sales.util';
import {
  TRANSPORT_INCOMPLETE_MESSAGE,
  TRANSPORT_INCOMPLETE_TITLE,
  transportDataIncomplete,
} from '@domain/documents/models/document-transport.util';
import { priceModeRowLabel } from '@domain/documents/models/document-price-mode.util';
import {
  grossFromNetMinor,
  lineVatFromNetExact,
  netFromGrossExact,
  netFromGrossMinor,
} from '@domain/documents/utils/document-vat.util';
import { DocumentService } from '@domain/documents/services/document.service';
import type {
  CreateDocumentBody,
  UpdateDocumentBody,
} from '@domain/documents/services/document-api.mapper';
import { SalesOrderService } from '@domain/sales-orders/services/sales-order.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { prefillDefaultLocation } from '@domain/inventory/utils/default-location-prefill.util';
import { DocumentNumberingStore } from '@domain/documents/state/document-numbering.store';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { pickVatCodeId, toVatCodeById } from './utils/vat-code-resolution.util';
import { FirstClickSelectsDirective } from '@shared/directives/first-click-selects.directive';
import { trailingEmptyLineIndices } from '@domain/documents/utils/trailing-empty-lines.util';

const PROFORMA_DISCLAIMER = 'Documento non fiscale / Proforma non valida ai fini IVA.';
/** Colonne su cui si può ordinare le righe (§7.1). */
export type SalesDocumentLineSortColumn =
  'articleCode' | 'sku' | 'barcode' | 'product' | 'quantity' | 'unitPrice' | 'discount';

/**
 * Quanto si aspetta, allo sfocamento di un campo codice della card, prima di
 * decidere cosa fare: il tempo che serve al tocco su una voce per arrivare.
 */
const MOBILE_PICK_GRACE_MS = 200;

/** I campi di riga nell'ordine in cui il Tab li attraversa. */
type SalesDocumentLineFocusField =
  'articleCode' | 'sku' | 'barcode' | 'product' | 'quantity' | 'unitPrice' | 'discount' | 'vat';

/** I tre codici di questa maschera: niente codice fornitore, è una vendita. */
type SalesDocumentCodeField = Extract<DocumentLineCodeField, 'articleCode' | 'sku' | 'barcode'>;

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Precompilato di apertura: arriva da DUE strade con forme diverse —
 * `convert-prefill` porta anche il tipo dell'origine, «Concludi ordine» no.
 * La riga di riferimento nasce solo quando quel tipo c'è.
 */
type ConversionPrefill = CreateDocumentBody & {
  readonly sourceDocumentType?: DocumentType;
  readonly sourceSalesOrderNumber?: string;
  readonly sourceSalesOrderPlacedAt?: string;
};

@Component({
  selector: 'app-sales-document-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FirstClickSelectsDirective,
    InlineBannerComponent,
    ReactiveFormsModule,
    BackButtonComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    DocumentNumberFieldComponent,
    DocumentSeriesManagerDialogComponent,
    DocumentChronologyWarningDialogComponent,
    DateInputComponent,
    DocumentIncludePanelComponent,
    DocumentMobilePanelComponent,
    PriceModeMenuComponent,
    DocumentLineCodeCellComponent,
    DocumentLineProductCellComponent,
    DocumentLineSelectCellComponent,
    DocumentProductSearchPanelComponent,
    SalesDocumentLineCardComponent,
    TableColumnPickerComponent,
    TableColumnResizeDirective,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    SelectMenuComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SlidePanelComponent,
    TableSkeletonComponent,
    EditLockBannerComponent,
  ],
  providers: [DocumentEditLockService],
  templateUrl: './sales-document-form.component.html',
  // Foglio nuovo (FASE 1): solo i delta che l'anatomia condivisa non copre.
  styleUrl: './sales-document-form.component.scss',
})
export class SalesDocumentFormComponent implements CanComponentDeactivate {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly editLock = inject(DocumentEditLockService);
  private readonly authService = inject(AuthService);
  private readonly documentService = inject(DocumentService);
  private readonly salesOrderService = inject(SalesOrderService);
  private readonly countersService = inject(DocumentCountersService);
  private readonly customerService = inject(CustomerService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly productService = inject(ProductService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly tenantFeatureSettingsService = inject(TenantFeatureSettingsService);
  private readonly router = inject(Router);
  private readonly navHistory = inject(NavigationHistoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly listPath = '/app/documents';
  protected readonly currency = DEFAULT_CURRENCY;
  protected readonly formatMoney = formatMoney;
  protected readonly proformaDisclaimer = PROFORMA_DISCLAIMER;
  protected readonly DocumentType = DocumentType;

  /**
   * Il tipo dichiarato dalla rotta. **Obbligatorio**: ogni indirizzo che apre
   * questa maschera lo porta, in creazione e in modifica.
   *
   * Se manca è una rotta scritta male, e si ferma qui con un errore leggibile
   * invece di aprire il documento sbagliato: su una fattura, «comportarsi da
   * proforma» significa stampare «non valida ai fini IVA» sopra un documento
   * fiscale. Una pagina che non si apre è un difetto che si vede; un documento
   * fiscale vestito da proforma, no.
   */
  private readonly routeType = requireSalesDocumentType(this.route.snapshot.data);

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly editDocumentId = computed(() => this.paramMap().get('id'));
  protected readonly isEditMode = computed(() => Boolean(this.editDocumentId()));

  private readonly loadedDocument = signal<DocumentRecord | null>(null);
  /** Documento d'origine, se il form è aperto precompilato da una conversione. */
  private readonly _sourceDocumentId = signal<string | null>(null);
  /**
   * Ordini cliente agganciati (Concludi ordine → Fattura accompagnatoria):
   * inviati al salvataggio, si concludono alla conferma del documento.
   */
  private readonly _includedSalesOrderIds = signal<readonly string[]>([]);

  /**
   * Modalità prezzo del documento (netto/ivato). true = i prezzi riga si
   * inseriscono e mostrano IVA inclusa (l'IVA si scorpora); false = netti.
   * Sorgente iniziale: preferenza operatore (doc nuovo), documento (modifica),
   * origine (documento generato/duplicato). Cambiandola i prezzi si convertono
   * così i totali non si spostano.
   */
  protected readonly pricesIncludeVat = signal<boolean>(false);
  protected readonly priceRowLabel = computed(() => priceModeRowLabel(this.pricesIncludeVat()));
  protected readonly priceModeOptions: readonly SelectMenuOption[] = [
    { value: 'net', label: 'Netto' },
    { value: 'gross', label: 'Ivato' },
  ];

  // ── Listino del documento (§B4) ────────────────────────────────────────────
  //
  // Non è un dato del documento ma un modo di riempirlo: sceglierlo riscrive i
  // prezzi delle righe, che restano modificabili una per una. Per questo non si
  // memorizza — quello che conta sono i prezzi che restano nel documento.
  protected readonly listinoChoice = signal<DocumentListinoChoice>('article');
  protected readonly listinoOptions = computed(() => listinoSelectOptions(this.tenantSettings()));
  protected readonly listinoValue = computed(() => {
    const choice = this.listinoChoice();
    return choice === 'article' ? ARTICLE_LISTINO_VALUE : String(choice);
  });
  /** Righe rimaste a zero perché l'articolo non ha un prezzo per quel listino. */
  protected readonly listinoWarnings = signal<readonly string[]>([]);
  protected readonly showListinoSelect = computed(() => this.listinoOptions().length > 1);

  /**
   * Il tipo del documento in maschera. Viene dalla ROTTA, sempre: creazione e
   * modifica hanno entrambe un indirizzo per tipo, e `routeType` non è mai
   * indefinito (lo prova `documents.routes.spec.ts`).
   *
   * Il documento caricato conferma, non decide: se i due divergessero sarebbe
   * un link sbagliato, non un caso da gestire.
   *
   * Qui c'era `?? DocumentType.Proforma`, e non era una precauzione innocua:
   * sulla vecchia rotta `sales/:id/edit` il tipo non c'era, quindi fino alla
   * risposta della GET **ogni** documento si comportava da proforma — titolo,
   * dicitura «non valida ai fini IVA», serie sbagliate (`07-…§18`). Il ripiego
   * non è stato reso più intelligente: è stato tolto il caso che lo rendeva
   * necessario.
   */
  protected readonly documentType = computed(() => this.loadedDocument()?.type ?? this.routeType);

  protected readonly isProforma = computed(() => isProformaDocumentType(this.documentType()));
  protected readonly isInvoiceDraft = computed(() =>
    isInvoiceDraftDocumentType(this.documentType()),
  );

  /** Fattura o Fattura accompagnatoria: testata fiscale e dati pagamento. */
  protected readonly isSalesInvoice = computed(() =>
    isSalesInvoiceDocumentType(this.documentType()),
  );

  /** Solo accompagnatoria: sezioni Trasporto e Destinazione. */
  protected readonly isInvoiceAccompanying = computed(() =>
    isInvoiceAccompanyingDocumentType(this.documentType()),
  );

  /**
   * ⛔ **Chi può agganciare un DDT.** Non è `isSalesInvoice()`: quella è la
   * famiglia intera — giusta per XML, numeratore e azioni fiscali, sbagliata
   * qui. L'accompagnatoria **sostituisce** il DDT nella stessa uscita, e la
   * matrice (`12`) dice «mai DDT».
   */
  protected readonly supportsLinkedDdt = computed(() =>
    supportsLinkedSalesDdt(this.documentType()),
  );

  protected readonly hasLinkedDdt = computed(() => this.linkedDdtIds().length > 0);

  /**
   * Colonna «Scarica mag.»: presente solo nella Fattura accompagnatoria e solo
   * se non è agganciato alcun DDT. Con un DDT le giacenze sono già state
   * scaricate da quel documento, quindi la colonna non viene renderizzata.
   */
  protected readonly showLoadsStockColumn = computed(
    () => this.isInvoiceAccompanying() && !this.hasLinkedDdt(),
  );

  // ── Includi documento (mappa in document-include.util): proforma e bozza
  //     fattura non includono da nessun documento. ─────────────────────────
  protected readonly includeSourceKinds = computed(() =>
    includeSourceKindsForDocumentType(this.documentType()),
  );
  protected readonly includePanelOpen = signal(false);
  protected readonly includeLaunchSeq = signal(0);

  protected readonly confirmDialogMessage = computed(() => {
    const base = 'Salvando verrà assegnato il numero progressivo e il documento sarà definitivo.';
    // L'accompagnatoria senza DDT scarica davvero le giacenze: dirlo prima
    // del salvataggio, non dopo.
    if (this.showLoadsStockColumn()) {
      return `${base} Le righe con «Scarica mag.» attivo scaricheranno le giacenze. Procedere?`;
    }
    if (this.isInvoiceAccompanying()) {
      return `${base} Le giacenze sono già state scaricate dal DDT agganciato. Procedere?`;
    }
    return `${base} Il documento non muove il magazzino. Procedere?`;
  });

  protected readonly confirmDialogTitle = computed(() => 'Salva documento');

  protected readonly confirmButtonLabel = computed(() => 'Salva');

  protected readonly isConfirmedEdit = computed(() => {
    const doc = this.loadedDocument();
    return doc != null && isConfirmedEditableDocumentStatus(doc.status);
  });

  /** Un confermato si apre bloccato: sola lettura finché l'operatore non sblocca. */
  protected readonly formReadOnly = computed(
    () => this.isConfirmedEdit() && !this.editLock.unlocked(),
  );
  protected readonly unlockDialogOpen = signal(false);

  protected requestUnlock(): void {
    this.unlockDialogOpen.set(true);
  }

  protected confirmUnlock(): void {
    this.unlockDialogOpen.set(false);
    this.editLock.unlock(this.editDocumentId());
  }

  protected readonly pageTitle = computed(() => {
    const label = documentTypeLabel(this.documentType());
    if (!this.isEditMode()) {
      return `Nuova ${label.toLowerCase()}`;
    }
    return this.isConfirmedEdit()
      ? `Modifica ${label.toLowerCase()} confermata`
      : `Modifica ${label.toLowerCase()}`;
  });

  protected readonly form = this.fb.group({
    customerId: this.fb.control('', { validators: [Validators.required] }),
    locationId: this.fb.control(''),
    documentDate: this.fb.control(new Date().toISOString().slice(0, 10), {
      validators: [Validators.required],
    }),
    /** Numero documento: proposto dal progressivo di serie, editabile. */
    documentNumber: this.fb.control<number | null>(null),
    series: this.fb.control(''),
    // ── Documento della controparte ────────────────────────────────────
    // Tipo, numero e data del documento che ha emesso il cliente (il suo
    // ordine): non identificano questo documento, lo agganciano al foglio
    // che sta dall'altra parte della transazione.
    billingCause: this.fb.control(''),
    relatedDdtRef: this.fb.control(''),
    notes: this.fb.control(this.routeType === DocumentType.Proforma ? PROFORMA_DISCLAIMER : ''),
    internalComment: this.fb.control(''),
    documentDiscountPercent: this.fb.control(''),
    // ── Fattura: dati pagamento in testata ──────────────────────────────
    paymentTerms: this.fb.control(''),
    paymentDueDate: this.fb.control(''),
    iban: this.fb.control(''),
    // ── Fattura accompagnatoria: trasporto (identico al DDT vendita) ────
    transportCausal: this.fb.control(''),
    transportStartAt: this.fb.control(''),
    transportPort: this.fb.control(''),
    transportCarrier: this.fb.control(''),
    transportPackagesCount: this.fb.control(''),
    transportWeight: this.fb.control(''),
    transportGoodsAspect: this.fb.control(''),
    transportShippingCode: this.fb.control(''),
    transportTrackingCode: this.fb.control(''),
    // ── Fattura accompagnatoria: indirizzo di destinazione ──────────────
    destinationName: this.fb.control(''),
    destinationAddress: this.fb.control(''),
    destinationZip: this.fb.control(''),
    destinationCity: this.fb.control(''),
    destinationProvince: this.fb.control(''),
    destinationCountry: this.fb.control(''),
    lines: this.fb.array([this.createLine()]),
  });

  /** DDT agganciati («Riferimento DDT»): id selezionati, testata condivisa. */
  protected readonly linkedDdtIds = signal<readonly string[]>([]);

  /** «Cambia destinazione»: finché è false i campi restano quelli del cliente. */
  protected readonly destinationOverridden = signal(false);

  // Snapshot reattivo del form: i totali stimati (lineTotals) leggono valori dai
  // FormControl, che non sono signal. Senza questa dipendenza il computed
  // resterebbe memoizzato e i totali non si aggiornerebbero digitando quantità,
  // prezzo o sconto (stesso pattern di goods-receipt-form.documentTotals).
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

  private readonly selectedCustomer = signal<Customer | null>(null);

  protected readonly confirmDialogOpen = signal(false);
  /** Conflitto numero restituito dal server: dialogo «Usa N» / «Annulla». */
  // Avviso «numero già assegnato»: la macchina a stati vive in domain, qui
  // resta solo quale controllo della testata riceve il numero aggiornato.
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
    // I contatori: il giro — chiamata, `take(1)`, chiusura col ciclo di vita,
    // «riproponi» contro «ricarica l'elenco» — vive nello store comune (E-6).
    // Qui restano le tre letture che cambiano da una maschera all'altra.
    countersSource: {
      service: this.countersService,
      destroyRef: this.destroyRef,
      documentType: () => this.documentType(),
      locationId: () => this.form.controls.locationId.value || null,
      documentDate: () => this.form.controls.documentDate.value,
    },
    asProgrammatic: (write) => {
      // La proposta iniziale non è una modifica dell'operatore: scriverla non
      // deve accendere il guard di uscita.
      this.withoutDirtyMarking(write);
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
   * Avviso cronologico (§4): la serie contiene documenti fuori posto. Avviso
   * e non blocco — da lì si salva comunque — e il meccanismo vive in
   * `domain/`, come quello del conflitto sul numero.
   */
  protected readonly chronology = new DocumentChronologyGuard({
    documentType: () => this.documentType(),
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

  /** Pannello «gestisci numerazioni» aperto dall'ingranaggio del campo Serie. */
  protected readonly seriesDialogOpen = signal(false);

  /**
   * Senza il permesso, accanto alla serie resta solo il campo: niente
   * ingranaggio e nessun pannello numerazioni da aprire.
   */
  protected readonly puoConfigurareDocumenti = computed(() =>
    hasTenantPermission(this.authService.currentUser(), TenantPermission.DocumentsConfigure),
  );

  /**
   * Perché il salvataggio non è partito, in parole. `validateForm()` usciva
   * muto su tre condizioni diverse — form invalido, prezzo illeggibile,
   * nessuna riga valida — e l'utente premeva il pulsante senza vedere nulla.
   */
  private readonly _validationError = signal<string | null>(null);
  protected readonly validationError = this._validationError.asReadonly();

  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
  protected readonly saving = computed(() => this._submitState().status === 'saving');
  protected readonly submitError = computed(() => {
    const state = this._submitState();
    return state.status === 'error' ? state.error : null;
  });

  private submitSubscription?: Subscription;

  private readonly loadTick = signal(0);
  private readonly loadState = toSignal(
    toObservable(computed(() => ({ id: this.editDocumentId(), tick: this.loadTick() }))).pipe(
      switchMap(({ id }) => {
        if (!id) {
          return of<'ready' | 'loading' | 'not-found' | 'error'>('ready');
        }
        return this.documentService.getDocumentById(id).pipe(
          map((doc) => {
            if (!isSalesFormDocumentType(doc.type)) {
              return 'not-found' as const;
            }
            if (doc.linkedSalesOrder) {
              return 'not-found' as const;
            }
            const editable =
              doc.status === DocumentStatus.Draft || isConfirmedEditableDocumentStatus(doc.status);
            if (!editable) {
              return 'not-found' as const;
            }
            this.loadedDocument.set(doc);
            // Confermato → si riapre bloccato (salvo sblocco già dato in sessione).
            this.editLock.syncOnLoad(doc.id);
            this.patchFormFromDocument(doc);
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

  private readonly customersReload = signal(0);
  private readonly customers = toSignal(
    toObservable(this.customersReload).pipe(
      switchMap(() => this.customerService.getCustomers({ page: 1, pageSize: 100, active: true })),
      map((response) => response.data),
    ),
    { initialValue: [] },
  );

  protected readonly customerOptions = computed<readonly SelectMenuOption[]>(() =>
    this.customers().map((c) => ({
      value: c.id,
      label: customerDisplayName(c),
    })),
  );

  // ── Codice IVA (§Piano IVA fase 3): stessa risoluzione di Arrivo merce, ma
  // lato vendita (Codici IVA usageScope 'sales'/'both', nessun fornitore). ──
  protected readonly vatCodes = toSignal(
    this.vatCodeService.list().pipe(catchError(() => of([] as readonly VatCode[]))),
    { initialValue: [] as readonly VatCode[] },
  );

  private readonly vatCodeById = computed(() => toVatCodeById(this.vatCodes()));

  /** Codici attivi utilizzabili in vendita, ordinati come in Impostazioni. */
  /**
   * Opzioni Codice IVA di vendita, nella forma condivisa: in cella si legge il
   * **codice**, aliquota e descrizione stanno nel `detail` del menu e nel
   * tooltip di riga. Qui l'etichetta era la dicitura intera — «22 · 22% ·
   * Imponibile» — che in una cella stretta arrivava troncata a metà parola.
   * Era l'ultima maschera rimasta sulla forma vecchia.
   */
  protected readonly salesVatOptions = computed<readonly SelectMenuOption[]>(() =>
    this.vatCodes()
      .filter((vatCode) => vatCode.isActive && isSalesVatCode(vatCode))
      .map(vatCodeSelectOption),
  );

  private readonly tenantSettings = toSignal(
    this.tenantFeatureSettingsService.getSettings().pipe(catchError(() => of(null))),
    { initialValue: null as TenantFeatureSettings | null },
  );

  /** Codice IVA predefinito aziendale (impostazioni → flag isDefault attivo). */
  private readonly tenantDefaultVatCodeId = computed(() => {
    const codes = this.vatCodes();
    const settingsId = this.tenantSettings()?.defaultVatCodeId;
    const fromSettings = settingsId
      ? codes.find((vatCode) => vatCode.id === settingsId && vatCode.isActive)
      : undefined;
    const fallback = codes.find((vatCode) => vatCode.isDefault && vatCode.isActive);
    return (fromSettings ?? fallback)?.id ?? '';
  });

  /*
   * L'IBAN non si precompila più da qui. L'anagrafica azienda la legge solo il
   * titolare, e chiedere quella chiamata a ogni operatore che emette una
   * fattura significherebbe o un 403 o un buco nella riserva. Lo mette l'API
   * alla creazione, se il campo è vuoto: sul documento salvato c'è, e in
   * modifica si vede e si cambia.
   */

  /**
   * DDT vendita agganciabili: quelli confermati del cliente selezionato.
   * L'elenco si ricarica al cambio cliente — un DDT di un altro cliente non
   * ha senso come riferimento di questa fattura.
   */
  private readonly selectableDdts = toSignal(
    toObservable(computed(() => this.form.controls.customerId.value)).pipe(
      switchMap((customerId) => {
        if (!customerId) {
          return of({ data: [] as readonly DocumentRecord[] });
        }
        return this.documentService
          .getDocuments({
            type: DocumentType.SalesDdt,
            customerId,
            page: 1,
            pageSize: 50,
          })
          .pipe(catchError(() => of({ data: [] as readonly DocumentRecord[] })));
      }),
      map((response) => response.data),
    ),
    { initialValue: [] as readonly DocumentRecord[] },
  );

  protected readonly ddtOptions = computed<readonly SelectMenuOption[]>(() =>
    this.selectableDdts()
      .filter((ddt) => ddt.status !== DocumentStatus.Cancelled)
      .map((ddt) => ({
        value: ddt.id,
        label: `${ddt.reference ?? `Bozza ${ddt.series}`} del ${formatDate(ddt.documentDate)}`,
      })),
  );

  /** DDT agganciati con etichetta, per i chip di riepilogo in testata. */
  protected readonly linkedDdts = computed(() => {
    const options = this.ddtOptions();
    return this.linkedDdtIds().map((id) => ({
      id,
      label: options.find((option) => option.value === id)?.label ?? id,
    }));
  });

  /** Porto: stesse voci del DDT vendita. */
  protected readonly transportPortOptions: readonly SelectMenuOption[] = [
    { value: '', label: 'Non indicato' },
    { value: 'franco', label: 'Franco' },
    { value: 'assegnato', label: 'Assegnato' },
  ];

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
        // `locationId` non filtra i risultati: restringe le giacenze mostrate
        // alla sede del documento.
        const locationId = this.form.controls.locationId.value || undefined;
        return (
          this.productService
            .searchVariantSummaries({
              search: term,
              pageSize: VARIANT_SEARCH_PAGE_SIZE,
              locationId,
            })
            // Senza questo un errore di rete chiude il flusso di `toSignal` e
            // SPEGNE la ricerca per il resto della sessione, senza dire niente.
            .pipe(catchError(() => of([] as readonly VariantSummary[])))
        );
      }),
    ),
    { initialValue: [] as readonly VariantSummary[] },
  );

  /**
   * Costo d'acquisto nel selettore articolo (dato sensibile §permessi): senza
   * "Visualizza costi d'acquisto" non compare, come già per la colonna Costo
   * dell'Ordine cliente.
   */
  private readonly canSeeCosts = computed(() =>
    canViewPurchaseCosts(this.authService.currentUser()),
  );

  protected readonly variantOptions = computed(() =>
    toVariantSelectMenuOptions(mergeVariantSummaries(this.searchedVariants(), []), {
      canSeeCosts: this.canSeeCosts(),
    }),
  );

  protected readonly customerCommercialHint = computed(() => {
    const customer = this.selectedCustomer();
    if (!customer) {
      return null;
    }
    const parts: string[] = [];
    if (customer.customerDiscount?.trim()) {
      parts.push(`Sconto cliente: ${customer.customerDiscount.trim()}`);
    }
    if (customer.paymentMethod?.trim()) {
      parts.push(`Modalità: ${customer.paymentMethod.trim()}`);
    }
    if (customer.paymentTerms?.trim()) {
      parts.push(`Pagamento: ${customer.paymentTerms.trim()}`);
    }
    if (customer.commercialNotes?.trim()) {
      parts.push(customer.commercialNotes.trim());
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  });

  /** "Mostra avviso" (anagrafica cliente): banner alla selezione. */
  protected readonly customerDocumentAlert = computed(() => {
    const alert = this.selectedCustomer()?.documentCreationAlert?.trim();
    return alert ?? '';
  });

  /** Ultima nota anagrafica inserita in automatico nelle note documento. */
  private lastAutoInsertedNote = '';

  protected readonly lineTotals = computed(() => {
    this.formValue();
    let subtotalMinor = 0;
    let taxMinor = 0;
    for (const line of this.lines.controls) {
      const qty = Number(line.controls.quantity.value) || 0;
      const vat = Number(line.controls.vatRatePercent.value) || 0;
      // Il prezzo di riga è netto: se a schermo si vede ivato, si scorpora
      // PRIMA di moltiplicare, come fa il server con il valore che riceve.
      const unitNetMinor = this.lineUnitNetMinor(line);
      // L'imponibile di riga resta esatto fino a qui: si arrotonda una volta,
      // e l'imposta nasce dal valore esatto. È così che un prezzo digitato
      // ivato torna nel totale per intero (§sei decimali).
      const discount = parseEffectiveDiscountPercent(line.controls.discountPercent.value);
      const lineNetExactMinor = (qty * unitNetMinor * (100 - discount)) / 100;
      subtotalMinor += Math.round(lineNetExactMinor);
      taxMinor += lineVatFromNetExact(lineNetExactMinor, vat);
    }
    const docDiscount = parseEffectiveDiscountPercent(
      this.form.controls.documentDiscountPercent.value,
    );
    const docMultiplier = (100 - docDiscount) / 100;
    const adjustedSubtotal = Math.round(subtotalMinor * docMultiplier);
    const adjustedTax = Math.round(taxMinor * docMultiplier);
    return {
      subtotal: { amountMinor: adjustedSubtotal, currencyCode: this.currency },
      tax: { amountMinor: adjustedTax, currencyCode: this.currency },
      total: { amountMinor: adjustedSubtotal + adjustedTax, currencyCode: this.currency },
      grossSubtotal: { amountMinor: subtotalMinor, currencyCode: this.currency },
      hasDocumentDiscount: docDiscount > 0,
    };
  });

  /**
   * Dettaglio IVA per aliquota: mostrato nei totali quando le righe usano
   * aliquote miste. Lo sconto extra documento è già applicato, come nei totali,
   * così la somma delle quote coincide sempre con l'IVA totale.
   */
  protected readonly vatBreakdown = computed(() => {
    this.formValue();
    const docDiscount = parseEffectiveDiscountPercent(
      this.form.controls.documentDiscountPercent.value,
    );
    const docMultiplier = (100 - docDiscount) / 100;
    const byRate = new Map<number, { netMinor: number; vatMinor: number }>();
    for (const line of this.lines.controls) {
      const qty = Number(line.controls.quantity.value) || 0;
      const rate = Number(line.controls.vatRatePercent.value) || 0;
      // Come nei totali: dal netto di riga, mai dal valore mostrato a schermo,
      // e con l'imposta ricavata dall'imponibile esatto (§sei decimali).
      const discount = parseEffectiveDiscountPercent(line.controls.discountPercent.value);
      const netExact =
        ((qty * this.lineUnitNetMinor(line) * (100 - discount)) / 100) * docMultiplier;
      const net = Math.round(netExact);
      if (net === 0) {
        continue;
      }
      const vat = lineVatFromNetExact(netExact, rate);
      const entry = byRate.get(rate) ?? { netMinor: 0, vatMinor: 0 };
      entry.netMinor += net;
      entry.vatMinor += vat;
      byRate.set(rate, entry);
    }
    return [...byRate.entries()]
      .sort(([a], [b]) => a - b)
      .map(([ratePercent, entry]) => ({
        ratePercent,
        net: { amountMinor: entry.netMinor, currencyCode: this.currency },
        vat: { amountMinor: entry.vatMinor, currencyCode: this.currency },
      }));
  });

  /** Aliquote miste: solo allora il dettaglio per aliquota aggiunge informazione. */
  protected readonly hasMixedVatRates = computed(() => this.vatBreakdown().length > 1);

  // ── Testata a pannelli su mobile (adozione M1) — SOLO display ─────────────
  // Concatenazioni di valori form già esistenti: nessuna logica nuova.

  /** Pannello «Cliente e listino»: nome del cliente scelto o intestazione neutra. */
  protected readonly customerPanelTitle = computed(() => {
    this.formValue();
    const customerId = this.form.controls.customerId.value;
    return (
      this.customerOptions().find((option) => option.value === customerId)?.label ??
      'Cliente e listino'
    );
  });

  /** Riepilogo sotto il titolo: data · modalità prezzo · listino scelto. */
  protected readonly customerPanelSummaryParts = computed<readonly string[]>(() => {
    this.formValue();
    const documentDate = this.form.controls.documentDate.value;
    const parts: string[] = [
      documentDate ? formatItalianInputDate(documentDate) : 'Data non indicata',
      this.pricesIncludeVat() ? 'Prezzi ivati' : 'Prezzi netti',
    ];
    if (this.showListinoSelect()) {
      const listino = this.listinoOptions().find(
        (option) => option.value === this.listinoValue(),
      )?.label;
      if (listino) {
        parts.push(listino);
      }
    }
    return parts;
  });

  /** Il cliente è l'unico dato di testata che blocca il salvataggio. */
  protected readonly customerPanelReady = computed(() => {
    this.formValue();
    return this.form.controls.customerId.value !== '';
  });

  protected readonly customerPanelStatus = computed(() =>
    this.customerPanelReady()
      ? 'Dati principali completi.'
      : 'Il cliente è obbligatorio per salvare.',
  );

  /** Pannello «Dettagli fattura»: pagamento · scadenza · DDT agganciati. */
  protected readonly invoicePanelSummaryParts = computed<readonly string[]>(() => {
    this.formValue();
    const parts: string[] = [
      this.form.controls.paymentTerms.value.trim() || 'Pagamento non indicato',
    ];
    const dueDate = this.form.controls.paymentDueDate.value;
    if (dueDate) {
      parts.push(`Scadenza ${formatItalianInputDate(dueDate)}`);
    }
    const ddtCount = this.linkedDdts().length;
    if (ddtCount > 0) {
      parts.push(ddtCount === 1 ? '1 DDT agganciato' : `${ddtCount} DDT agganciati`);
    }
    return parts;
  });

  /**
   * Etichetta del documento per il breadcrumb: il numero quando c'è, altrimenti
   * la dicitura di bozza/serie — mai il generico «Dettaglio».
   */
  private readonly breadcrumbLabel = computed(() => {
    const doc = this.loadedDocument();
    return doc ? documentReferenceLabel(doc.type, doc.reference, doc.series) : null;
  });

  // ── Uscita con modifiche non salvate (pattern Arrivo merce / Ordine fornitore) ──
  protected readonly dirtySinceLastSave = signal(false);
  protected readonly exitDialogOpen = signal(false);
  private pendingDeactivate: ((allow: boolean) => void) | null = null;
  /** True durante i patch programmatici del form (caricamento e prefill). */
  private suppressDirtyMarking = false;

  constructor() {
    this.columnPreferences.registerView(
      SALES_DOCUMENT_LINES_VIEW,
      SALES_DOCUMENT_LINE_COLUMNS,
      SALES_DOCUMENT_LINE_PRESETS,
    );

    // Sede predefinita in testata (§1-bis): la regola vive in `domain/`, ed è
    // la stessa per tutte le maschere. Qui restano i due ganci che cambiano.
    prefillDefaultLocation({
      control: this.form.controls.locationId,
      isEdit: () => this.isEditMode(),
      write: (apply) => this.withoutDirtyMarking(apply),
    });

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

    // Cambio data: il numero proposto dipende dalla data (§2), quindi la
    // testata deve rifare l'anteprima — o mostrerebbe il primo libero di OGGI
    // mentre il salvataggio assegna quello della data scelta.
    this.form.controls.documentDate.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.numbering.refreshProposal());

    // Carica i contatori disponibili (tendina serie); su documento nuovo
    // propone il predefinito, in modifica resta il numero già assegnato.
    afterNextRender(() => {
      this.numbering.refreshProposal();
      this.prefillFromConversionIfRequested();
      this.prefillFromIncludedOrderIfRequested();
      this.prefillFromDuplicateIfRequested();
      this.initPriceModeForNewDocument();
    });

    // Ogni modifica del form (testata e righe) marca il documento come sporco;
    // i patch programmatici la sopprimono con withoutDirtyMarking().
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.markFormDirty();
    });

    // Breadcrumb: numero del documento al posto del generico «Dettaglio».
    bindBreadcrumbEntityLabel(() => ({
      id: this.editDocumentId() || null,
      label: this.breadcrumbLabel(),
    }));
    // Applica il Codice IVA predefinito alle righe ancora senza scelta non
    // appena i Codici IVA sono disponibili (caricamento asincrono): copre la
    // riga iniziale in creazione, senza toccare righe già valorizzate da un
    // documento caricato o da una scelta esplicita dell'utente.
    effect(() => {
      if (this.vatCodes().length === 0) {
        return;
      }
      for (const line of this.lines.controls) {
        this.ensureLineVatCode(line);
      }
    });
  }

  private markFormDirty(): void {
    if (!this.suppressDirtyMarking) {
      this.dirtySinceLastSave.set(true);
    }
  }

  /**
   * Esegue un patch programmatico senza marcare il form come modificato.
   * Salva e ripristina il flag: i patch possono annidarsi (duplica → carica).
   */
  private withoutDirtyMarking(patch: () => void): void {
    const previous = this.suppressDirtyMarking;
    this.suppressDirtyMarking = true;
    try {
      patch();
    } finally {
      this.suppressDirtyMarking = previous;
    }
  }

  canDeactivate(): boolean | Promise<boolean> {
    // In sola lettura (confermato non sbloccato) non c'è nulla da perdere.
    if (this.formReadOnly() || !this.dirtySinceLastSave()) {
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

  /** «Salva e chiudi» dal dialogo: salva il documento e prosegue l'uscita. */
  protected confirmExitSaveDocument(): void {
    this.persist(() => {
      this.exitDialogOpen.set(false);
      this.pendingDeactivate?.(true);
      this.pendingDeactivate = null;
    });
  }

  protected get lines(): FormArray<ReturnType<SalesDocumentFormComponent['createLine']>> {
    return this.form.controls.lines;
  }

  protected fieldInvalid(name: 'customerId' | 'locationId' | 'documentDate'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  /**
   * Un campo di riga si accende in rosso solo dopo che l'utente l'ha toccato
   * (o dopo il `markAllAsTouched()` del salvataggio): prima sarebbe un
   * rimprovero a chi non ha ancora scritto niente.
   */
  protected lineFieldInvalid(index: number, name: 'description' | 'quantity'): boolean {
    const control = this.lines.at(index).controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  /**
   * Prezzo di riga illeggibile o negativo: è la condizione che fa uscire
   * `validateForm()` senza che nessun validator del form la registri, quindi
   * senza questo segnale la cella non direbbe nulla.
   */
  protected lineUnitPriceInvalid(index: number): boolean {
    const control = this.lines.at(index).controls.unitPrice;
    if (!(control.touched || control.dirty) || !control.value.trim()) {
      return false;
    }
    const parsed = parseMoneyInput(control.value, this.currency);
    return parsed === null || parsed.amountMinor < 0;
  }

  /**
   * Sedi su cui l'operatore può scrivere, con la sua predefinita in cima.
   *
   * Il campo Sede c'è anche sulla Proforma, che non scarica e non impegna: è il
   * primo anello di una catena che scarica (proforma → DDT → fattura), e la
   * sede decisa qui si propaga a valle invece di essere scelta diversa tre
   * documenti dopo (§1-bis).
   */
  protected readonly locationOptions = computed<readonly SelectMenuOption[]>(() =>
    toLocationSelectOptions(
      this.operationalLocations.writeLocations(),
      this.operationalLocations.defaultLocation()?.id ?? null,
    ),
  );

  protected onLocationSelect(value: string | null): void {
    this.form.controls.locationId.setValue(value ?? '');
    this.form.controls.locationId.markAsTouched();
  }

  protected onCustomerSelect(value: string | null): void {
    this.form.controls.customerId.setValue(value ?? '');
    this.form.controls.customerId.markAsTouched();
    const customer = value ? (this.customers().find((c) => c.id === value) ?? null) : null;
    this.selectedCustomer.set(customer);
    if (customer) {
      this.applyCustomerCommercialDefaults(customer);
    }
  }

  private applyCustomerCommercialDefaults(customer: Customer): void {
    const discount = customer.customerDiscount?.trim();
    if (discount) {
      for (const line of this.lines.controls) {
        if (!line.controls.discountPercent.value.trim()) {
          line.controls.discountPercent.setValue(discount, { emitEvent: false });
        }
      }
    }

    const commentParts: string[] = [];
    if (customer.paymentMethod?.trim()) {
      commentParts.push(`Modalità di pagamento: ${customer.paymentMethod.trim()}`);
    }
    if (customer.paymentTerms?.trim()) {
      commentParts.push(`Pagamento: ${customer.paymentTerms.trim()}`);
    }
    if (customer.commercialNotes?.trim()) {
      commentParts.push(customer.commercialNotes.trim());
    }
    const internalControl = this.form.controls.internalComment;
    if (commentParts.length > 0 && !internalControl.value.trim()) {
      internalControl.setValue(commentParts.join('\n'));
    }

    // Condizioni di pagamento dai tipi pagamento in VestiFlow (anagrafica).
    const termsControl = this.form.controls.paymentTerms;
    if (customer.paymentTerms?.trim() && !termsControl.value.trim()) {
      termsControl.setValue(customer.paymentTerms.trim());
    }

    // Incaricato del trasporto configurato sull'anagrafica del cliente.
    const carrierControl = this.form.controls.transportCarrier;
    if (customer.transportResponsible?.trim() && !carrierControl.value.trim()) {
      carrierControl.setValue(customer.transportResponsible.trim());
    }

    this.applyDestinationFromCustomer(customer);
    this.applyCustomerDocumentNote(customer);
  }

  /**
   * Indirizzo di destinazione precompilato dall'anagrafica cliente. Non tocca
   * nulla dopo un «Cambia destinazione»: da quel momento i campi appartengono
   * all'operatore e un cambio cliente non deve sovrascriverli in silenzio.
   */
  private applyDestinationFromCustomer(customer: Customer): void {
    if (this.destinationOverridden()) {
      return;
    }
    this.form.patchValue(
      {
        destinationName: customerDisplayName(customer),
        destinationAddress: customer.address?.line1 ?? '',
        destinationZip: customer.address?.postalCode ?? '',
        destinationCity: customer.address?.city ?? '',
        destinationProvince: customer.address?.province ?? '',
        destinationCountry: customer.address?.country ?? '',
      },
      { emitEvent: false },
    );
  }

  /**
   * "Inserisci nota" (anagrafica cliente): compila le note del documento con
   * la nota configurata sul ruolo, preservando il disclaimer proforma e
   * senza sovrascrivere testo digitato dall'operatore.
   */
  private applyCustomerDocumentNote(customer: Customer): void {
    const note = customer.documentCreationNote?.trim() ?? '';
    const control = this.form.controls.notes;
    const current = control.value.trim();
    const base = this.routeType === DocumentType.Proforma ? PROFORMA_DISCLAIMER : '';
    const previousAuto = [base, this.lastAutoInsertedNote].filter(Boolean).join('\n');
    if (note && (current === base.trim() || (previousAuto && current === previousAuto.trim()))) {
      control.setValue([base, note].filter(Boolean).join('\n'));
      this.lastAutoInsertedNote = note;
    } else if (!note && previousAuto && current === previousAuto.trim()) {
      control.setValue(base);
      this.lastAutoInsertedNote = '';
    }
  }

  // ── Riferimento DDT (aggancio opzionale 1:N) ────────────────────────────
  protected onAddLinkedDdt(value: string | null): void {
    if (!value || this.linkedDdtIds().includes(value)) {
      return;
    }
    this.linkedDdtIds.update((ids) => [...ids, value]);
    // L'aggancio DDT non vive nel form: va marcato a mano.
    this.markFormDirty();
  }

  protected onRemoveLinkedDdt(id: string): void {
    this.linkedDdtIds.update((ids) => ids.filter((current) => current !== id));
    this.markFormDirty();
  }

  /** «Cambia destinazione»: sblocca i campi precompilati dall'anagrafica. */
  protected onChangeDestination(): void {
    this.destinationOverridden.set(true);
  }

  protected onVariantSearch(value: string): void {
    this.variantSearchDraft.set(value);
  }

  // ── Cella nome: si digita e i suggerimenti arrivano sotto ─────────────────

  // ── Larghezza e visibilità delle colonne ──────────────────────────────────
  //
  // Stesso sistema condiviso degli altri documenti. La vista è UNA per i tre
  // tipi che questa maschera ospita: sono la stessa tabella.

  private readonly columnPreferences = inject(TableColumnPreferenceService);
  protected readonly lineColumnsView = SALES_DOCUMENT_LINES_VIEW;

  protected isLineColumnVisible(columnId: string): boolean {
    // «Scarica mag.» ha una condizione sua che viene prima della preferenza:
    // senza di essa la colonna non esiste per questo tipo documento.
    if (columnId === 'loadsStock' && !this.showLoadsStockColumn()) {
      return false;
    }
    return this.columnPreferences.isColumnVisible(this.lineColumnsView, columnId);
  }

  private lineColumnPx(columnId: string): number {
    const def = SALES_DOCUMENT_LINE_COLUMNS.find((column) => column.id === columnId);
    return this.columnPreferences.columnWidth(
      this.lineColumnsView,
      columnId,
      def?.defaultWidthPx ?? 96,
    );
  }

  /** Somma delle sole colonne visibili: è il 100% di cui ciascuna prende una quota. */
  private lineColumnsTotalPx(): number {
    return sumVisibleLineColumnsPx(
      SALES_DOCUMENT_LINE_COLUMNS,
      (id) => this.isLineColumnVisible(id),
      (id) => this.lineColumnPx(id),
    );
  }

  /**
   * Larghezza come QUOTA percentuale del totale: la tabella occupa sempre
   * esattamente il contenitore. Coi pixel assoluti resterebbe larga quanto la
   * somma e scorrerebbe invece di adattarsi.
   */
  protected lineColumnWidth(columnId: string): string {
    return lineColumnQuotaWidth(columnId, this.lineColumnsTotalPx(), (id) => this.lineColumnPx(id));
  }

  protected onLineColumnResize(columnId: string, widthPx: number): void {
    this.columnPreferences.setColumnWidth(this.lineColumnsView, columnId, widthPx);
  }

  // ── Riordino delle righe (§7.1 e §7.2) ────────────────────────────────────

  protected readonly lineSort = new DocumentLineSortStore<SalesDocumentLineSortColumn>();

  private readonly lineSortKinds: Readonly<Record<SalesDocumentLineSortColumn, SortValueKind>> = {
    articleCode: 'text',
    sku: 'text',
    barcode: 'text',
    product: 'text',
    quantity: 'number',
    unitPrice: 'money',
    discount: 'number',
  };

  protected toggleLineSort(columnId: SalesDocumentLineSortColumn): void {
    if (this.formReadOnly()) {
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

  protected lineSortAriaLabel(columnId: SalesDocumentLineSortColumn, label: string): string {
    if (this.lineSort.column() !== columnId) {
      return `Ordina per ${label}`;
    }
    return this.lineSort.direction() === 'asc'
      ? `${label}: ordinamento crescente`
      : `${label}: ordinamento decrescente`;
  }

  private applyLineSort(): void {
    const column = this.lineSort.column();
    if (!column || this.lines.length <= 1) {
      return;
    }
    const controls = sortByValue(
      this.lines.controls,
      (control) => {
        const raw = control.getRawValue();
        if (column === 'quantity') {
          return Number(raw.quantity) || 0;
        }
        // Due colonne portano in tabella un nome e nel form un altro: la
        // colonna si chiama `product` e `discount` in ogni documento, i
        // controlli sotto hanno i nomi che hanno sul database.
        if (column === 'product') {
          return raw.description;
        }
        if (column === 'discount') {
          return raw.discountPercent;
        }
        return raw[column];
      },
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
   * Trascinamento riga (§7.2). Non chiede conferma, a differenza del riordino
   * per colonna: è un movimento singolo e visibile.
   */
  protected onLineDrop(event: CdkDragDrop<unknown>): void {
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
    this.lines.updateValueAndValidity();
  }

  /**
   * Sotto la soglia esiste SOLO la vista a card (§4.11): la stessa riga non
   * esiste due volte. Finché la tabella restava viva sotto il breakpoint, gli
   * identificativi dei campi puntavano a elementi nascosti — e `.focus()` su
   * `display:none` è un no-op silenzioso.
   */
  private readonly viewport = inject(ViewportService);
  protected readonly compactView = this.viewport.compact;

  /**
   * Totale della singola riga, già formattato: la card non fa conti in valuta.
   * Stessa catena dei totali documento — netto scorporato se il prezzo si
   * digita ivato, sconto di riga, e **un solo arrotondamento in fondo**.
   * Lo sconto extra documento NON entra: è del documento, non della riga.
   */
  protected lineTotalLabel(index: number): string {
    const line = this.lines.at(index);
    if (!line) {
      return '';
    }
    const qty = Number(line.controls.quantity.value) || 0;
    const discount = parseEffectiveDiscountPercent(line.controls.discountPercent.value);
    const netExactMinor = (qty * this.lineUnitNetMinor(line) * (100 - discount)) / 100;
    const netMinor = Math.round(netExactMinor);
    // Se la riga si digita ivata, il totale si legge ivato: mostrare il netto
    // accanto a un prezzo lordo farebbe sembrare sbagliato il conto.
    const amountMinor = this.pricesIncludeVat()
      ? netMinor + lineVatFromNetExact(netExactMinor, this.lineRatePercent(line))
      : netMinor;
    return formatMoney({ amountMinor, currencyCode: this.currency });
  }

  /** Riga senza nome, dopo che l'operatore l'ha toccata. */
  protected lineNameInvalid(index: number): boolean {
    const control = this.lines.at(index)?.controls.description;
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  protected readonly productSuggest = new DocumentProductSuggestStore();

  /** Il pannello di ricerca a tutta pagina, aperto dalla lente della riga. */
  protected readonly productPanelOpen = signal(false);
  protected readonly productPanelTerm = signal('');
  protected readonly productPanelSeq = signal(0);
  private productPanelLineIndex = -1;

  protected openLineProductSearch(index: number): void {
    this.productPanelLineIndex = index;
    this.productPanelTerm.set(this.lines.at(index)?.controls.description.value ?? '');
    this.productPanelSeq.update((seq) => seq + 1);
    this.productPanelOpen.set(true);
  }

  protected onProductPanelSelected(variantId: string): void {
    if (this.productPanelLineIndex >= 0) {
      this.onVariantSelect(this.productPanelLineIndex, variantId);
    }
    this.productPanelOpen.set(false);
  }

  private suggestInputs(index: number): {
    hasLinked: boolean;
    searched: readonly VariantSummary[];
  } {
    return {
      hasLinked: !!this.lines.at(index)?.controls.variantId.value,
      searched: this.searchedVariants() ?? [],
    };
  }

  protected lineSuggestions(index: number): readonly VariantSummary[] {
    return this.productSuggest.suggestionsFor(index, this.suggestInputs(index));
  }

  protected lineSuggestionsOpen(index: number): boolean {
    return this.productSuggest.isOpenOn(index, this.suggestInputs(index));
  }

  protected onLineProductNameChange(index: number, value: string): void {
    this.lines.at(index)?.controls.description.setValue(value);
    this.productSuggest.focusLine(index);
    this.variantSearchDraft.set(value);
  }

  protected onLineProductFocus(index: number): void {
    this.productSuggest.focusLine(index);
    this.variantSearchDraft.set(this.lines.at(index)?.controls.description.value ?? '');
  }

  /** Riga senza descrizione, dopo che l'operatore l'ha toccata. */
  protected lineDescriptionInvalid(index: number): boolean {
    const control = this.lines.at(index)?.controls.description;
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  protected onLineProductBlur(index: number): void {
    this.productSuggest.blurLine(index);
  }

  protected onProductSuggestionPick(index: number, variantId: string): void {
    this.onVariantSelect(index, variantId);
    this.productSuggest.clear();
  }

  /** Frecce sui suggerimenti: il conteggio lo sa solo la maschera. */
  protected onProductSuggestionNavigate(direction: 'next' | 'prev'): void {
    const lineIndex = this.productSuggest.lineIndex();
    if (lineIndex === null) {
      return;
    }
    this.productSuggest.navigate(direction, this.lineSuggestions(lineIndex).length);
  }

  // ── Celle codice: confronto esatto alla conferma ──────────────────────────
  //
  // Il campo codice NON cerca mentre si digita: confronta col catalogo alla
  // conferma (Tab/Invio), per corrispondenza esatta, e gli esiti sono tre —
  // una aggancia, più d'una apre la scelta, nessuna lascia il valore scritto.

  protected readonly codeLookup = new DocumentCodeLookupStore();
  private readonly codeLookupService = inject(DocumentCodeLookupService);

  protected onLineCodeChange(index: number, field: SalesDocumentCodeField, value: string): void {
    this.lines.at(index)?.controls[field].setValue(value);
    this.codeLookup.clear();
    this.markFormDirty();
  }

  protected onLineCodeFocus(index: number, field: SalesDocumentCodeField): void {
    this.productSuggest.clear();
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

  protected onLineSearchEscape(index: number): void {
    this.codeLookup.clear();
    this.productSuggest.blurLine(index);
  }

  protected commitCodeLookup(index: number, field: SalesDocumentCodeField, advance = true): void {
    const line = this.lines.at(index);
    if (!line) {
      return;
    }
    if (line.controls.variantId.value) {
      if (advance) {
        this.lineFocus.next(index, field);
      }
      return;
    }
    const code = line.controls[field].value.trim();
    if (!code) {
      this.codeLookup.clear();
      if (advance) {
        this.lineFocus.next(index, field);
      }
      return;
    }
    const locationId = this.form.controls.locationId.value || undefined;
    this.codeLookupService
      .resolve(code, field, { locationId })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((outcome) => {
        if (outcome.kind === 'one') {
          this.onVariantSelect(index, outcome.variantId, outcome.summary);
          this.codeLookup.clear();
          this.lineFocus.focusField(index, 'quantity');
          return;
        }
        if (outcome.kind === 'many') {
          this.codeLookup.open(index, field, outcome.matches);
          return;
        }
        // Nessuna corrispondenza: il valore resta scritto e la riga prosegue.
        this.codeLookup.clear();
        if (advance) {
          this.lineFocus.next(index, field);
        }
      });
  }

  /**
   * La scelta fra più corrispondenze, per la vista compatta: quale campo la
   * mostra e con quali voci. Il testo lo compone qui.
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
        detail: [variant.productName, variant.sku, variant.barcode ? `EAN ${variant.barcode}` : '']
          .filter(Boolean)
          .join(' · '),
      })),
    };
  }

  /**
   * Uscita da un campo codice della card. **Lo sfocamento conferma**, come Tab
   * sul desktop: perdere il fuoco su un telefono non è un caso.
   *
   * ⚠️ È un punto solo e RITARDATO, perché qui si incrociano due meccanismi che
   * presi separatamente si pestano: la conferma allo sfocamento e la grazia che
   * lascia arrivare il tocco su una voce della scelta. Toccando una voce, se lo
   * sfocamento confermasse per primo partirebbe una seconda ricerca il cui
   * esito «più d'una» riaprirebbe la scelta DOPO che il tocco l'aveva risolta.
   * I tre casi sotto sono in ordine, e l'ordine conta.
   */
  protected onMobileCodeBlur(index: number, field: SalesDocumentCodeField): void {
    if (this.mobileCodeBlurTimer !== null) {
      clearTimeout(this.mobileCodeBlurTimer);
    }
    this.mobileCodeBlurTimer = setTimeout(() => {
      this.mobileCodeBlurTimer = null;
      // 1. Il tocco su una voce ha già agganciato la riga: niente da fare.
      if (this.lines.at(index)?.controls.variantId.value) {
        return;
      }
      // 2. Scelta aperta e non presa: si abbandona. Il valore digitato resta
      //    scritto, e NON si cerca di nuovo — è ciò che la farebbe ricomparire.
      if (this.codeLookup.isOpenOn(index, field)) {
        this.codeLookup.clear();
        return;
      }
      // 3. Codice digitato e mai confermato: qui lo sfocamento fa la conferma.
      this.commitCodeLookup(index, field);
    }, MOBILE_PICK_GRACE_MS);
  }

  private mobileCodeBlurTimer: ReturnType<typeof setTimeout> | null = null;

  protected onCodeSuggestionPick(index: number, variantId: string): void {
    this.onVariantSelect(index, variantId);
    this.codeLookup.clear();
    this.lineFocus.focusField(index, 'quantity');
  }

  // ── Il giro del fuoco fra i campi riga ────────────────────────────────────

  protected readonly lineFocus = new DocumentLineFocusStore<SalesDocumentLineFocusField>({
    fields: [
      'articleCode',
      'sku',
      'barcode',
      'product',
      'quantity',
      'unitPrice',
      'discount',
      'vat',
    ],
    elementId: (index, field) =>
      ({
        articleCode: `sd-code-` + index,
        sku: `sd-sku-` + index,
        barcode: `sd-barcode-` + index,
        product: `sd-product-` + index,
        quantity: `sd-qty-` + index,
        unitPrice: `sd-price-` + index,
        discount: `sd-discount-` + index,
        vat: `sd-vat-` + index,
      })[field],
    // Su riga agganciata i tre codici diventano testo: il Tab li salta.
    isFieldEnabled: (index, field) => {
      const identita = field === 'articleCode' || field === 'sku' || field === 'barcode';
      return !(identita && !!this.lines.at(index)?.controls.variantId.value);
    },
    isReadOnly: () => this.formReadOnly(),
    lineCount: () => this.lines.length,
    createLine: () => this.addLine(),
    onRowChange: (_index, then) => {
      setTimeout(then);
    },
    isLineEmpty: (index) => {
      const line = this.lines.at(index);
      if (!line) {
        return true;
      }
      const raw = line.getRawValue();
      return (
        !raw.variantId &&
        !raw.articleCode.trim() &&
        !raw.sku.trim() &&
        !raw.barcode.trim() &&
        !raw.description.trim()
      );
    },
    removeLine: (index) => this.removeLine(index),
  });

  /**
   * Aggancia la riga a una variante. `known` è il riepilogo quando chi chiama
   * ce l'ha già in mano — la conferma di un codice lo riceve dalla ricerca —:
   * senza, si cerca fra i risultati, dove una variante trovata per codice non
   * c'è ancora e i campi resterebbero vuoti.
   */
  protected onVariantSelect(
    index: number,
    variantId: string | null,
    known: VariantSummary | null = null,
  ): void {
    const line = this.lines.at(index);
    // Sostituzione d'articolo: la riga ne aveva già un altro. Qui il prezzo si
    // riscriveva già; il Codice IVA no, e restava quello dell'articolo
    // precedente — un'aliquota sbagliata su un documento fiscale.
    const previousVariantId = line.controls.variantId.value;
    const replacedArticle = Boolean(previousVariantId) && previousVariantId !== variantId;
    line.controls.variantId.setValue(variantId ?? '');
    const match = known ?? this.searchedVariants().find((v) => v.variantId === variantId);
    if (match) {
      if (replacedArticle) {
        // Si riparte dalla catena di precedenza (articolo → aliquota legacy →
        // predefinito aziendale) invece di ereditare la scelta di prima.
        line.controls.vatCodeId.setValue('', { emitEvent: false });
      }
      line.controls.description.setValue(match.productName);
      line.controls.sku.setValue(match.sku);
      line.controls.articleCode.setValue(match.articleCode);
      line.controls.barcode.setValue(match.barcode ?? '');
      // «Scarica mag.» segue il tipo articolo già esistente in VestiFlow:
      // un Articolo scarica, un Servizio no. Resta modificabile a mano.
      line.controls.loadsStock.setValue(match.managesStock !== false, { emitEvent: false });
      // Precedenza Codice IVA (§Piano IVA fase 3): articolo → aliquota legacy
      // già presente (reverse-match) → predefinito aziendale. Va risolto PRIMA
      // del prezzo: senza aliquota non si saprebbe come mostrarlo in ivato.
      if (!line.controls.vatCodeId.value) {
        const productVatCodeId = pickVatCodeId(
          [match.defaultVatCodeId],
          this.vatCodeById(),
          isSalesVatCode,
        );
        if (productVatCodeId) {
          line.controls.vatCodeId.setValue(productVatCodeId, { emitEvent: false });
          this.syncLegacyVatRate(line);
        }
      }
      this.ensureLineVatCode(line);
      // Il prezzo d'anagrafica è netto: in modalità ivata si mostra con l'IVA,
      // non si copia com'è (varrebbe il 22% in meno di quanto vale).
      // Segue il listino scelto in testata (§B4): una riga aggiunta dopo aver
      // scelto un listino nasce con quel prezzo, non col prezzo articolo.
      const listinoPrice = listinoUnitPrice(match, this.listinoChoice());
      line.controls.unitPrice.setValue(
        this.priceFieldValue(listinoPrice?.amountMinor ?? 0, this.lineRatePercent(line)),
      );
    }
  }

  /** Opzioni della riga: codici attivi + eventuale codice storico disattivato. */
  protected lineVatOptions(index: number): readonly SelectMenuOption[] {
    // Stessa funzione condivisa delle altre tre maschere: qui c'era una copia
    // scritta a mano che faceva la stessa cosa — tenere il codice già scelto
    // fra le opzioni anche se nel frattempo è stato disattivato, o riaprendo un
    // documento storico la cella risulterebbe vuota.
    return vatOptionsIncludingSelected(
      this.salesVatOptions(),
      this.lines.at(index)?.controls.vatCodeId.value,
      this.vatCodeById(),
    );
  }

  /** Sulla cella si legge il codice; il resto sta qui, come nelle altre tre. */
  protected lineVatTooltip(index: number): string {
    const vatCode = this.vatCodeById().get(this.lines.at(index)?.controls.vatCodeId.value ?? '');
    return vatCode ? vatCodeOptionLabel(vatCode) : 'Nessun Codice IVA';
  }

  protected onLineVatSelect(index: number, value: string | null): void {
    const line = this.lines.at(index);
    if (!line) {
      return;
    }
    line.controls.vatCodeId.setValue(value ?? '');
    this.syncLegacyVatRate(line);
  }

  /** Allinea l'aliquota legacy al Codice IVA (dual-write, §Piano IVA fase 2). */
  private syncLegacyVatRate(line: ReturnType<SalesDocumentFormComponent['createLine']>): void {
    const vatCode = this.vatCodeById().get(line.controls.vatCodeId.value);
    if (vatCode) {
      line.controls.vatRatePercent.setValue(String(vatCode.ratePercent), { emitEvent: false });
    }
  }

  /**
   * Precedenza Codice IVA sulle righe senza scelta esplicita (§Piano IVA
   * fase 3): aliquota legacy già presente → codice imponibile con la stessa
   * aliquota (mai il default, per non alterare l'IVA voluta); altrimenti
   * predefinito aziendale.
   */
  private ensureLineVatCode(line: ReturnType<SalesDocumentFormComponent['createLine']>): void {
    if (line.controls.vatCodeId.value) {
      return;
    }
    const raw = line.controls.vatRatePercent.value.trim();
    if (raw) {
      const rate = Number(raw);
      const matched = Number.isFinite(rate)
        ? this.vatCodes().find(
            (vatCode) =>
              isSalesVatCode(vatCode) &&
              vatCode.isActive &&
              vatCode.ratePercent === rate &&
              (vatCode.calculationMode === 'standard' ||
                (rate === 0 && vatCode.calculationMode === 'zero_rate')),
          )
        : undefined;
      if (matched) {
        line.controls.vatCodeId.setValue(matched.id, { emitEvent: false });
        this.syncLegacyVatRate(line);
      }
      return;
    }
    const fallback = this.tenantDefaultVatCodeId();
    if (fallback) {
      line.controls.vatCodeId.setValue(fallback, { emitEvent: false });
      this.syncLegacyVatRate(line);
    }
  }

  protected addLine(): void {
    if (this.formReadOnly()) {
      return;
    }
    const line = this.createLine();
    const discount = this.selectedCustomer()?.customerDiscount?.trim();
    if (discount) {
      line.controls.discountPercent.setValue(discount, { emitEvent: false });
    }
    this.ensureLineVatCode(line);
    this.lines.push(line);
  }

  protected removeLine(index: number): void {
    if (this.formReadOnly() || this.lines.length <= 1) {
      return;
    }
    this.lines.removeAt(index);
  }

  // ── Includi documento: inserimento righe dal documento di origine ───────
  protected openIncludePanel(): void {
    if (this.formReadOnly()) {
      return;
    }
    this.includeLaunchSeq.update((seq) => seq + 1);
    this.includePanelOpen.set(true);
  }

  protected closeIncludePanel(): void {
    this.includePanelOpen.set(false);
  }

  /**
   * Documento incluso (logica trasversale «Includi documento»): riga di testo
   * descrittiva col riferimento all'origine (es. «Rif. Preventivo
   * PRE-2026-0001 del 17/07/2026») seguita dalle righe articolo copiate.
   * I dati di testata restano quelli del documento corrente.
   */
  protected onDocumentIncluded(payload: IncludedDocumentPayload): void {
    this.closeIncludePanel();
    const groups: ReturnType<SalesDocumentFormComponent['createLine']>[] = [];

    const referenceLine = this.createLine();
    referenceLine.patchValue(
      { ...payload.referenceLine, vatRatePercent: '' },
      { emitEvent: false },
    );
    groups.push(referenceLine);

    for (const line of payload.lines) {
      const group = this.createLine();
      group.patchValue(
        {
          variantId: line.variantId ?? '',
          description: line.description,
          quantity: line.quantity,
          discountPercent: line.discount,
          isReference: line.isReference === true,
          vatCodeId: line.vatCodeId ?? '',
          persistedVatCodeId: line.vatCodeId ?? null,
          vatRatePercent: '',
        },
        { emitEvent: false },
      );
      if (group.controls.vatCodeId.value) {
        this.syncLegacyVatRate(group);
      } else {
        this.ensureLineVatCode(group);
      }
      // Il documento di origine ha memorizzato il netto: qui si mostra nella
      // modalità di questo documento, che può essere diversa da quella di là.
      group.controls.unitPrice.setValue(
        line.unitPriceMinor > 0
          ? this.priceFieldValue(line.unitPriceMinor, this.lineRatePercent(group))
          : '',
        { emitEvent: false },
      );
      groups.push(group);
    }

    // Le righe incluse entrano prima delle eventuali righe vuote in coda.
    let insertAt = this.lines.length;
    while (insertAt > 0 && this.emptyIncludeTargetLine(this.lines.at(insertAt - 1))) {
      insertAt -= 1;
    }
    groups.forEach((group, offset) => {
      this.lines.insert(insertAt + offset, group);
    });
  }

  /** Riga vuota (né descrizione né variante): le incluse le precedono. */
  private emptyIncludeTargetLine(
    line: ReturnType<SalesDocumentFormComponent['createLine']>,
  ): boolean {
    return !line.controls.description.value.trim() && !line.controls.variantId.value;
  }

  // ── Avviso dati trasporto/indirizzi (Fattura accompagnatoria, §AVVISI) ──
  // Promemoria non bloccante al salvataggio: il documento viaggia con la
  // merce, quindi i dati mancanti vanno segnalati — mai impediti.

  protected readonly incompleteDataDialogOpen = signal(false);
  protected readonly incompleteDataTitle = TRANSPORT_INCOMPLETE_TITLE;
  protected readonly incompleteDataMessage = TRANSPORT_INCOMPLETE_MESSAGE;
  /** Flusso sospeso in attesa della scelta: true = conferma, false = bozza. */
  private pendingConfirmAfterIncomplete: boolean | null = null;

  /** Dati trasporto/destinazione incompleti nei valori correnti del form. */
  private transportIncomplete(): boolean {
    const raw = this.form.getRawValue();
    return transportDataIncomplete(this.documentType(), {
      transportCausal: raw.transportCausal,
      transportPort: raw.transportPort,
      transportCarrier: raw.transportCarrier,
      transportPackagesCount: raw.transportPackagesCount,
      transportGoodsAspect: raw.transportGoodsAspect,
      destinationAddress: {
        name: raw.destinationName,
        address: raw.destinationAddress,
        zip: raw.destinationZip,
        city: raw.destinationCity,
        province: raw.destinationProvince,
        country: raw.destinationCountry,
      },
    });
  }

  /** «Sì»: prosegue il flusso sospeso (salvataggio bozza o conferma). */
  protected confirmIncompleteData(): void {
    this.incompleteDataDialogOpen.set(false);
    const confirmAfter = this.pendingConfirmAfterIncomplete;
    this.pendingConfirmAfterIncomplete = null;
    if (confirmAfter) {
      this.confirmDialogOpen.set(true);
      return;
    }
    void this.persist();
  }

  /** «No»: si resta in maschera per completare i dati. */
  protected dismissIncompleteData(): void {
    this.incompleteDataDialogOpen.set(false);
    this.pendingConfirmAfterIncomplete = null;
  }

  protected saveDraft(): void {
    if (this.transportIncomplete()) {
      this.pendingConfirmAfterIncomplete = false;
      this.incompleteDataDialogOpen.set(true);
      return;
    }
    this.chronology.run(() => void this.persist());
  }

  protected requestConfirm(): void {
    if (!this.validateForm()) {
      return;
    }
    if (this.transportIncomplete()) {
      this.pendingConfirmAfterIncomplete = true;
      this.incompleteDataDialogOpen.set(true);
      return;
    }
    this.confirmDialogOpen.set(true);
  }

  /**
   * Il controllo cronologico (§4) sta DOPO la conferma del documento: sono due
   * domande diverse, e chiederle nell'ordine inverso farebbe rispondere «sì»
   * due volte prima di aver deciso la cosa principale.
   */
  protected confirmAndSave(): void {
    this.confirmDialogOpen.set(false);
    this.chronology.run(() => void this.persist());
  }

  protected cancel(): void {
    this.navHistory.backOr(this.listPath);
  }

  protected reload(): void {
    this.loadTick.update((t) => t + 1);
  }

  /**
   * Corpo del PATCH: il corpo della creazione meno i due campi che valgono solo
   * alla nascita. Sta in un metodo suo, e non in un `...body` spread, perché il
   * giorno in cui la creazione guadagnerà un altro campo di sola nascita questo
   * è il posto dove si nota — un `delete` sparso nel salvataggio no.
   */
  private toUpdateBody(body: CreateDocumentBody): UpdateDocumentBody {
    const { type: _type, sourceDocumentId: _sourceDocumentId, ...rest } = body;
    return rest;
  }

  private validateForm(): boolean {
    if (this.form.invalid || this.hasInvalidPrice() || !this.hasValidLine()) {
      this.form.markAllAsTouched();
      this._validationError.set(this.buildValidationMessage());
      return false;
    }
    this._validationError.set(null);
    return true;
  }

  /**
   * Dice cosa manca, non che «qualcosa» manca: il documento è una fattura e
   * chi la emette deve sapere dove guardare. I campi elencati qui sono anche
   * evidenziati singolarmente nel template.
   */
  private buildValidationMessage(): string {
    const problems: string[] = [];
    if (this.form.controls.customerId.invalid) {
      problems.push('seleziona il cliente');
    }
    if (this.form.controls.documentDate.invalid) {
      problems.push('indica la data del documento');
    }
    if (!this.hasValidLine()) {
      problems.push('aggiungi almeno una riga con descrizione e quantità (minimo 1)');
    } else if (this.lines.invalid) {
      problems.push('completa descrizione e quantità delle righe evidenziate');
    }
    if (this.hasInvalidPrice()) {
      problems.push('correggi i prezzi delle righe evidenziate (numeri positivi, es. 12,50)');
    }
    if (problems.length === 0) {
      // Rete di sicurezza: un validator aggiunto in futuro senza voce qui non
      // deve far tornare la maschera muta.
      return 'Impossibile salvare: controlla i campi obbligatori del documento.';
    }
    return `Impossibile salvare: ${problems.join('; ')}.`;
  }

  private hasValidLine(): boolean {
    return this.lines.controls.some(
      (line) => line.controls.description.value.trim() && Number(line.controls.quantity.value) > 0,
    );
  }

  private hasInvalidPrice(): boolean {
    return this.lines.controls.some((line) => {
      const value = line.controls.unitPrice.value.trim();
      if (!value) {
        return false;
      }
      const parsed = parseMoneyInput(value, this.currency);
      return parsed === null || parsed.amountMinor < 0;
    });
  }

  private persist(onSaved?: () => void): void {
    if (this.formReadOnly() || this.saving()) {
      return;
    }
    this.dropTrailingEmptyLines();
    if (!this.validateForm()) {
      if (onSaved) {
        // «Salva e chiudi» dal dialogo di uscita: l'errore va mostrato lì.
        this._submitState.set({
          status: 'error',
          error: {
            kind: AppErrorKind.Validation,
            message:
              this._validationError() ??
              'Impossibile salvare: controlla cliente e righe (campi obbligatori o valori non validi).',
          },
        });
      }
      return;
    }
    const raw = this.form.getRawValue();
    const editId = this.editDocumentId();
    // Il numero si manda SOLO se l'operatore l'ha scelto. La proposta viene
    // scritta senza sporcare il controllo (withoutDirtyMarking + patchValue),
    // quindi `dirty` distingue davvero i due casi.
    // Si omette SOLO la proposta di un documento nuovo. In modifica il numero
    // è una proprietà del documento, non una proposta: va sempre mandato,
    // altrimenti un cambio di serie lascerebbe il documento con il numero della
    // serie vecchia e un riferimento che la contraddice.
    const numberImposed = !this.numberIsProposal();
    // Numero che la maschera stava mostrando: letto PRIMA dell'invio, perché è
    // con questo che si confronta quello assegnato dal server.
    const shownNumber = raw.documentNumber;
    const body = {
      type: this.documentType(),
      // Conversione: collega il documento generato all'origine (proforma/DDT).
      sourceDocumentId: this._sourceDocumentId() ?? undefined,
      // Concludi ordine → Fattura accompagnatoria: aggancia l'ordine di origine,
      // che alla conferma del documento passa a Concluso (il resto lo ignora).
      ...(this._includedSalesOrderIds().length > 0
        ? { includedSalesOrderIds: this._includedSalesOrderIds() }
        : {}),
      documentDate: new Date(raw.documentDate).toISOString(),
      customerId: raw.customerId,
      // La sede sta in testata su TUTTI e tre i tipi (§1-bis), quindi viaggia
      // sempre. Fino al 13/08 partiva solo dalla Fattura accompagnatoria, dove
      // serve allo scarico: sulle altre due il campo non c'era. Averlo aggiunto
      // senza spostare questa riga avrebbe prodotto il difetto peggiore — un
      // campo che si compila, si vede, e non arriva da nessuna parte.
      locationId: raw.locationId || undefined,
      currency: this.currency,
      // Numero imposto in testata: non sposta il progressivo della serie.
      // Se invece è la proposta (nessuno l'ha digitato) il campo si omette: il
      // server assegna il primo libero sotto lock, e due operatori che salvano
      // insieme prendono due numeri diversi senza vedere alcun conflitto.
      number: this.numbering.imposedNumber(),
      series: this.numbering.chosenSeries(),
      notes: raw.notes.trim() || undefined,
      internalComment: raw.internalComment.trim() || undefined,
      billingCause: raw.billingCause.trim() || undefined,
      externalRef: raw.relatedDdtRef.trim() || undefined,
      // ── Documento della controparte ──────────────────────────────────
      // Il tipo si nomina SEMPRE, anche vuoto: nel PATCH un campo assente
      // vuol dire «non toccare», quindi senza il null esplicito togliere il
      // tipo da un documento salvato non lo toglierebbe davvero (e con lui
      documentDiscountPercent: parseEffectiveDiscountPercent(raw.documentDiscountPercent),
      pricesIncludeVat: this.pricesIncludeVat(),
      ...(this.isSalesInvoice()
        ? {
            paymentTerms: raw.paymentTerms.trim() || undefined,
            paymentDueDate: raw.paymentDueDate
              ? new Date(raw.paymentDueDate).toISOString()
              : undefined,
            iban: raw.iban.trim() || undefined,
            // ⛔ Solo per chi può agganciarli: un'accompagnatoria non manda
            // l'elenco nemmeno vuoto — il server la rifiuta, e mandarlo
            // significherebbe chiedere di essere rifiutati.
            ...(this.supportsLinkedDdt() ? { linkedSalesDdtIds: [...this.linkedDdtIds()] } : {}),
          }
        : {}),
      ...(this.isInvoiceAccompanying()
        ? {
            transportCausal: raw.transportCausal.trim() || undefined,
            transportStartAt: raw.transportStartAt
              ? new Date(raw.transportStartAt).toISOString()
              : undefined,
            transportPort: (raw.transportPort as TransportPort) || undefined,
            transportCarrier: raw.transportCarrier.trim() || undefined,
            transportPackagesCount: raw.transportPackagesCount
              ? Number(raw.transportPackagesCount)
              : undefined,
            transportWeight: raw.transportWeight.trim() || undefined,
            transportGoodsAspect: raw.transportGoodsAspect.trim() || undefined,
            transportShippingCode: raw.transportShippingCode.trim() || undefined,
            transportTrackingCode: raw.transportTrackingCode.trim() || undefined,
            destinationAddress: {
              name: raw.destinationName.trim() || undefined,
              address: raw.destinationAddress.trim() || undefined,
              zip: raw.destinationZip.trim() || undefined,
              city: raw.destinationCity.trim() || undefined,
              province: raw.destinationProvince.trim() || undefined,
              country: raw.destinationCountry.trim() || undefined,
            },
          }
        : {}),
      lines: raw.lines
        .filter((line) => line.description.trim() || line.variantId)
        .map((line) => {
          const price = parseMoneyInput(line.unitPrice, this.currency);
          const ratePercent = Number(line.vatRatePercent) || 0;
          return {
            // Vuoto = riga nuova. Presente = aggiorna quella riga, non ricrearla.
            id: line.id || undefined,
            variantId: line.variantId || undefined,
            // Fotografia dello SKU sulla riga, come su ogni altro documento: il
            // documento riaperto dice quello che diceva quando fu compilato.
            sku: line.sku?.trim() || undefined,
            description: line.description.trim() || 'Riga documento',
            quantity: Number(line.quantity),
            // Al server va il netto: se il campo mostrava l'ivato, si scorpora qui.
            unitPriceMinor: this.netFromDisplayed(price?.amountMinor ?? 0, ratePercent),
            vatRatePercent: line.vatRatePercent ? Number(line.vatRatePercent) : undefined,
            vatCodeId: vatCodeIdForLinePayload({
              currentVatCodeId: line.vatCodeId,
              persistedVatCodeId: line.persistedVatCodeId,
              isExistingLine: Boolean(line.id),
            }),
            discountPercent: parseEffectiveDiscountPercent(line.discountPercent),
            // Proforma e Fattura non movimentano mai il magazzino. La Fattura
            // accompagnatoria lo fa solo senza DDT agganciato: con un DDT le
            // giacenze sono già scese, quindi le righe non devono scaricare.
            loadsStock: this.showLoadsStockColumn() ? line.loadsStock : false,
            // Senza questo il flag non sopravvive al salvataggio: la riga
            // riaperta tornerebbe una riga qualunque.
            isReference: line.isReference === true,
          };
        }),
    };

    this._submitState.set({ status: 'saving' });

    const save$ = editId
      ? // Il PATCH non accetta `type` né `sourceDocumentId`, e l'API valida con
        // `forbidNonWhitelisted`: mandarli fa rispondere **400** — senza un
        // messaggio da mostrare, quindi a schermo il salvataggio semplicemente
        // non accadeva. Ed è giusto che il DTO non li accetti: il tipo di un
        // documento non cambia in modifica, e l'origine è un legame che nasce
        // con lui. La maschera del DDT costruisce da sempre un corpo suo per la
        // modifica; qui si spediva quello della creazione.
        this.documentService.updateDocument(editId, this.toUpdateBody(body))
      : this.documentService.createDocument(body);

    // Nascita-confermato (Fase 3): create e update producono già un documento
    // confermato in transazione — non esiste più un passaggio di conferma.
    const request$ = save$;

    this.submitSubscription?.unsubscribe();
    this.submitSubscription = request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (doc) => {
        this._submitState.set({ status: 'idle' });
        this.notifyIfNumberChanged({ numberImposed, shownNumber, assigned: doc.number ?? null });
        // Documento salvato: il guard di uscita non deve più fermare la
        // navigazione — azzerare PRIMA di navigare, o il dialogo si riapre.
        this.dirtySinceLastSave.set(false);
        if (onSaved) {
          // «Salva e chiudi»: prosegue la navigazione sospesa dal guard,
          // senza aggiungerne una seconda verso il dettaglio.
          onSaved();
          return;
        }
        void this.router.navigate([this.listPath, doc.id]);
      },
      error: (err: unknown) => {
        // Numero già preso: il vincolo del database non ammette duplicati,
        // si può solo prendere il primo libero o correggere a mano.
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

  /**
   * Il numero proposto poteva essere già di qualcun altro: se il server ne ha
   * assegnato un altro l'operatore deve saperlo, altrimenti scriverebbe sul
   * cartaceo (o al cliente) il numero che aveva davanti fino a un attimo prima.
   *
   * Vale solo per la proposta: un numero scelto a mano e già preso non arriva
   * qui — il server lo rifiuta e se ne occupa il dialogo di conflitto.
   */
  private notifyIfNumberChanged(outcome: {
    readonly numberImposed: boolean;
    readonly shownNumber: number | null;
    readonly assigned: number | null;
  }): void {
    const { numberImposed, shownNumber, assigned } = outcome;
    if (numberImposed || shownNumber === null || assigned === null || assigned === shownNumber) {
      return;
    }
    this.toast.showInfo(
      `Salvato con il n. ${assigned}: il ${shownNumber} è stato preso da un altro operatore.`,
    );
  }

  // ── Netto memorizzato, netto o ivato a schermo ────────────────────────────
  //
  // La riga porta sempre il prezzo NETTO: è quello che viene salvato e quello
  // da cui si calcolano imposta e totali. La modalità dice soltanto come lo si
  // vede e lo si digita.

  /** Aliquota della riga (0 = nessuna imposta da aggiungere o scorporare). */
  private lineRatePercent(line: ReturnType<SalesDocumentFormComponent['createLine']>): number {
    return Number(line.controls.vatRatePercent.value) || 0;
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

  /** Prezzo unitario netto della riga, qualunque cosa mostri il campo. */
  private lineUnitNetMinor(line: ReturnType<SalesDocumentFormComponent['createLine']>): number {
    const entered = parseMoneyInput(line.controls.unitPrice.value, this.currency);
    return this.netFromDisplayed(entered?.amountMinor ?? 0, this.lineRatePercent(line));
  }

  /** Netto → stringa per il campo prezzo, nella modalità corrente. */
  private priceFieldValue(netMinor: number, ratePercent: number): string {
    const displayed = this.displayedFromNet(netMinor, ratePercent);
    return moneyToDecimalString({ amountMinor: displayed, currencyCode: this.currency }).replace(
      '.',
      ',',
    );
  }

  /**
   * Cambio modalità prezzo dalla testata: converte i prezzi già inseriti
   * (netto↔ivato per aliquota di riga) così l'importo effettivo delle righe — e
   * i totali — non cambiano; muta solo come i valori sono interpretati e mostrati.
   */
  /**
   * Cambio listino: riscrive il prezzo di ogni riga col valore che quel listino
   * dà all'ARTICOLO — uguale per ogni taglia, come da modello.
   *
   * Le righe già in documento non portano con sé la scheda dell'articolo: le
   * si rilegge qui, una volta, perché scegliere un listino è un gesto
   * deliberato e raro. Un articolo senza valore per il listino scelto NON
   * ripiega sul prezzo articolo: la riga va a zero e l'avviso dice quale.
   */
  protected onListinoChange(value: string | null): void {
    const choice = parseListinoChoice(value);
    this.listinoChoice.set(choice);
    if (this.formReadOnly()) {
      return;
    }

    const targets = this.lines.controls
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => Boolean(line.controls.variantId.value));
    if (targets.length === 0) {
      this.listinoWarnings.set([]);
      return;
    }

    forkJoin(
      targets.map(({ line }) =>
        this.productService
          .searchVariantSummaries({ variantId: line.controls.variantId.value })
          .pipe(
            map((rows) => rows[0] ?? null),
            catchError(() => of(null)),
          ),
      ),
    )
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((summaries) => {
        const missing: string[] = [];
        summaries.forEach((summary, position) => {
          const target = targets[position];
          if (!summary || !target) {
            return;
          }
          const price = listinoUnitPrice(summary, choice);
          if (!price) {
            missing.push(target.line.controls.description.value.trim() || summary.title);
          }
          target.line.controls.unitPrice.setValue(
            this.priceFieldValue(price?.amountMinor ?? 0, this.lineRatePercent(target.line)),
          );
        });
        this.listinoWarnings.set(
          missing.length === 0
            ? []
            : [
                `${this.listinoLabel()}: nessun prezzo per ${
                  missing.length === 1 ? "l'articolo" : 'gli articoli'
                } ${missing.join(', ')}. ${
                  missing.length === 1 ? 'La riga è rimasta' : 'Le righe sono rimaste'
                } a zero.`,
              ],
        );
      });
  }

  /** Nome del listino scelto, per gli avvisi. */
  private listinoLabel(): string {
    const value = this.listinoValue();
    return this.listinoOptions().find((option) => option.value === value)?.label ?? 'Listino';
  }

  protected setPriceMode(pricesIncludeVat: boolean): void {
    if (pricesIncludeVat === this.pricesIncludeVat() || this.formReadOnly()) {
      return;
    }
    for (const line of this.lines.controls) {
      const price = parseMoneyInput(line.controls.unitPrice.value, this.currency);
      const rate = Number(line.controls.vatRatePercent.value) || 0;
      if (!price || price.amountMinor <= 0 || rate <= 0) {
        continue;
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
    }
    this.pricesIncludeVat.set(pricesIncludeVat);
    this.form.markAsDirty();
    // Lo switch netto/ivato non vive nel form (e i prezzi si riscrivono senza
    // emettere valueChanges): va marcato a mano.
    this.markFormDirty();
  }

  protected acknowledgeConflictNumber(): void {
    this.numbering.acknowledgeConflict(this.numberConflictDialog);
  }

  /**
   * Apertura precompilata da una conversione (proforma/DDT → fattura/proforma):
   * il param `fromDocument` chiede al backend il prefill (testata + righe +
   * `sourceDocumentId`) senza creare nulla. Il documento nasce solo al Salva.
   */
  private prefillFromConversionIfRequested(): void {
    if (this.isEditMode()) {
      return;
    }
    const fromDocument = this.route.snapshot.queryParamMap.get('fromDocument');
    if (!fromDocument) {
      return;
    }
    this.documentService
      .convertPrefill(fromDocument, this.documentType())
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (prefill) => this.prefillFromConversion(prefill),
        error: () => this.prefillError.fail('convert'),
      });
  }

  /**
   * «Concludi ordine» → Fattura accompagnatoria: il param `includeOrder` porta
   * l'ordine cliente da concludere. Il backend restituisce il documento di
   * scarico precompilato (righe già scontate, IVA, aggancio ordine); il form si
   * apre pronto e il salvataggio crea+conferma+conclude in un'unica transazione.
   */
  private prefillFromIncludedOrderIfRequested(): void {
    if (this.isEditMode()) {
      return;
    }
    const includeOrder = this.route.snapshot.queryParamMap.get('includeOrder');
    if (!includeOrder) {
      return;
    }
    this.salesOrderService
      .concludeManualPrefill(includeOrder, this.documentType())
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (prefill) => this.prefillFromConversion(prefill),
        error: () => this.prefillError.fail('include'),
      });
  }

  /**
   * «Duplica documento» (Fase 3, no bozze): il param `duplicateFrom` porta il
   * documento originale, di cui si copia il contenuto in un documento NUOVO —
   * nessuna copia nasce a monte, si crea (confermato) solo al salvataggio.
   */
  private prefillFromDuplicateIfRequested(): void {
    if (this.isEditMode()) {
      return;
    }
    const duplicateFrom = this.route.snapshot.queryParamMap.get('duplicateFrom');
    if (!duplicateFrom) {
      return;
    }
    this.documentService
      .getDocumentById(duplicateFrom)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (doc) => this.applyDuplicatePrefill(doc),
        error: () => this.prefillError.fail('duplicate'),
      });
  }

  /**
   * Documento nuovo «da zero»: la modalità prezzo parte dalla preferenza
   * ricordata dell'operatore (?? primo utilizzo). I documenti generati o
   * duplicati non passano di qui: ereditano la modalità dell'origine.
   */
  private initPriceModeForNewDocument(): void {
    if (this.isEditMode()) {
      return;
    }
    const params = this.route.snapshot.queryParamMap;
    if (params.get('fromDocument') || params.get('includeOrder') || params.get('duplicateFrom')) {
      return;
    }
    this.documentService
      .getPriceModePreference(this.documentType())
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (pricesIncludeVat) => this.pricesIncludeVat.set(pricesIncludeVat),
        error: () => undefined,
      });
  }

  private applyDuplicatePrefill(doc: DocumentRecord): void {
    // Prefill programmatico: la maschera parte «pulita» come un documento nuovo.
    this.withoutDirtyMarking(() => {
      this.patchFormFromDocument(doc);
      // Documento indipendente: si azzerano identità e collegamenti dell'originale
      // (numero, serie, riferimenti, DDT agganciati); la data è quella odierna.
      this.form.patchValue({
        documentNumber: null,
        series: '',
        documentDate: new Date().toISOString().slice(0, 10),
        relatedDdtRef: '',
      });
      this.linkedDdtIds.set([]);
      this._sourceDocumentId.set(null);
      this._includedSalesOrderIds.set([]);
    });
    this.numbering.refreshProposal();
  }

  private prefillFromConversion(prefill: ConversionPrefill): void {
    // Prefill programmatico (conversione/da ordine): non è una modifica utente.
    this.withoutDirtyMarking(() => {
      this.applyConversionPrefill(prefill);
    });
  }

  private applyConversionPrefill(prefill: ConversionPrefill): void {
    this._sourceDocumentId.set(prefill.sourceDocumentId ?? null);
    this._includedSalesOrderIds.set([...(prefill.includedSalesOrderIds ?? [])]);
    // Documento generato: eredita la modalità prezzo dell'origine (dal prefill).
    if (prefill.pricesIncludeVat !== undefined) {
      this.pricesIncludeVat.set(prefill.pricesIncludeVat);
    }
    this.form.patchValue({
      customerId: prefill.customerId ?? '',
      locationId: prefill.locationId ?? '',
      documentDate: prefill.documentDate.slice(0, 10),
      billingCause: prefill.billingCause ?? '',
      // Se il precompilato porta il documento della controparte (ordine del
      // cliente, documento d'origine) il riferimento passa al documento
      // generato: è la stessa transazione vista dall'altra parte.
      relatedDdtRef: prefill.externalRef ?? '',
      notes: prefill.notes ?? '',
      internalComment: prefill.internalComment ?? '',
      paymentTerms: prefill.paymentTerms ?? '',
      documentDiscountPercent:
        prefill.documentDiscountPercent && prefill.documentDiscountPercent > 0
          ? formatDiscountPercentValue(Number(prefill.documentDiscountPercent))
          : '',
    });
    if (prefill.customerId) {
      this.selectedCustomer.set(this.customers().find((c) => c.id === prefill.customerId) ?? null);
    }
    this.lines.clear();

    // Riferimento al predecessore diretto (`07` §12). Qui NON c'era: convertendo
    // una Proforma in Fattura il riferimento all'origine spariva, mentre
    // convertendola in Ordine cliente compariva — perché quella maschera se lo
    // costruiva da sé. La riga la compone ora l'utility condivisa, per entrambe.
    // Due strade, una regola. La conversione porta il tipo dell'origine; il
    // «Concludi ordine» porta numero e data dell'ordine cliente — che ha già la
    // sua etichetta canonica fra le sorgenti includibili. Il testo lo compone
    // sempre la stessa utility.
    const seed = prefill.sourceDocumentType
      ? conversionReferenceLine(
          prefill.sourceDocumentType,
          prefill.externalRef,
          prefill.documentDate,
        )
      : prefill.sourceSalesOrderNumber
        ? includeReferenceLine(
            IncludeSourceKind.CustomerOrder,
            prefill.sourceSalesOrderNumber,
            prefill.sourceSalesOrderPlacedAt ?? prefill.documentDate,
          )
        : null;
    if (seed) {
      const referenceLine = this.createLine();
      referenceLine.patchValue({ ...seed, vatRatePercent: '' }, { emitEvent: false });
      this.lines.push(referenceLine);
    }

    for (const line of prefill.lines ?? []) {
      // Una riga la costruisce `createLine`, e basta lei: qui c'era una seconda
      // copia dei controlli, scritta a mano. Copie così non divergono con un
      // errore, divergono con un campo aggiunto da una parte sola.
      const group = this.createLine();
      group.patchValue({
        variantId: line.variantId ?? '',
        description: line.description,
        quantity: line.quantity,
        // Prezzo memorizzato netto: mostrato nella modalità di questo documento.
        unitPrice:
          Number(line.unitPriceMinor) > 0
            ? this.priceFieldValue(Number(line.unitPriceMinor), line.vatRatePercent ?? 0)
            : '',
        vatRatePercent: line.vatRatePercent != null ? String(line.vatRatePercent) : '',
        vatCodeId: '',
        discountPercent:
          line.discountPercent && line.discountPercent > 0 ? String(line.discountPercent) : '',
        isReference: line.isReference === true,
        loadsStock: line.loadsStock ?? false,
      });
      this.lines.push(group);
    }
    if (this.lines.length === 0) {
      this.lines.push(this.createLine());
    }
  }

  private patchFormFromDocument(doc: DocumentRecord): void {
    // Patch programmatico: non è una modifica dell'utente.
    this.withoutDirtyMarking(() => {
      this.applyDocumentToForm(doc);
    });
  }

  private applyDocumentToForm(doc: DocumentRecord): void {
    // Documento esistente: si mostra la modalità con cui è stato creato.
    this.pricesIncludeVat.set(doc.pricesIncludeVat);
    this.form.patchValue({
      customerId: doc.customerId ?? '',
      locationId: doc.locationId ?? '',
      documentDate: doc.documentDate.slice(0, 10),
      documentNumber: doc.number ?? null,
      series: doc.series ?? '',
      // Il campo data lavora sul giorno: dell'ISO tiene solo «AAAA-MM-GG».
      billingCause: doc.billingCause ?? '',
      relatedDdtRef: doc.externalRef ?? '',
      notes: doc.notes ?? '',
      internalComment: doc.internalComment ?? '',
      documentDiscountPercent:
        doc.documentDiscountPercent && doc.documentDiscountPercent > 0
          ? formatDiscountPercentValue(Number(doc.documentDiscountPercent))
          : '',
      paymentTerms: doc.paymentTerms ?? '',
      paymentDueDate: doc.paymentDueDate?.slice(0, 10) ?? '',
      iban: doc.iban ?? '',
      transportCausal: doc.transportCausal ?? '',
      // datetime-local vuole «YYYY-MM-DDTHH:mm», senza secondi né fuso.
      transportStartAt: doc.transportStartAt?.slice(0, 16) ?? '',
      transportPort: doc.transportPort ?? '',
      transportCarrier: doc.transportCarrier ?? '',
      transportPackagesCount:
        doc.transportPackagesCount != null ? String(doc.transportPackagesCount) : '',
      transportWeight: doc.transportWeight ?? '',
      transportGoodsAspect: doc.transportGoodsAspect ?? '',
      transportShippingCode: doc.transportShippingCode ?? '',
      transportTrackingCode: doc.transportTrackingCode ?? '',
      destinationName: doc.destinationAddress?.name ?? '',
      destinationAddress: doc.destinationAddress?.address ?? '',
      destinationZip: doc.destinationAddress?.zip ?? '',
      destinationCity: doc.destinationAddress?.city ?? '',
      destinationProvince: doc.destinationAddress?.province ?? '',
      destinationCountry: doc.destinationAddress?.country ?? '',
    });
    this.linkedDdtIds.set((doc.linkedSalesDdts ?? []).map((ddt) => ddt.id));
    // Una destinazione già salvata è per definizione quella voluta: il
    // pulsante «Cambia destinazione» parte quindi già in modalità modifica.
    this.destinationOverridden.set(Boolean(doc.destinationAddress?.address));
    if (doc.customerId) {
      const customer = this.customers().find((c) => c.id === doc.customerId) ?? null;
      this.selectedCustomer.set(customer);
    }
    this.lines.clear();
    for (const line of doc.lines ?? []) {
      // Come sopra: la riga si costruisce in un punto solo.
      const group = this.createLine();
      group.patchValue({
        // L'identità della riga sopravvive al salvataggio: si rimanda indietro
        // così com'è arrivata.
        id: line.id,
        variantId: line.variantId ?? '',
        sku: line.sku ?? '',
        description: line.description,
        quantity: line.quantity,
        // Il documento ha memorizzato il netto: si rimostra nella modalità con
        // cui era stato compilato, che è l'unica cosa che quel flag racconta.
        unitPrice: this.priceFieldValue(
          line.unitPrice.amountMinor,
          line.vatSnapshot?.ratePercent ?? 0,
        ),
        vatRatePercent: line.vatSnapshot?.ratePercent?.toString() ?? '',
        vatCodeId: line.vatCodeId ?? '',
        discountPercent:
          line.discountPercent && line.discountPercent > 0 ? String(line.discountPercent) : '',
        loadsStock: line.loadsStock,
        // Chiude il giro: senza, il documento riaperto perdeva la natura della
        // riga e il salvataggio successivo la rimandava indietro come ordinaria.
        isReference: line.isReference === true,
      });
      this.lines.push(group);
    }
    if (this.lines.length === 0) {
      this.lines.push(this.createLine());
    }
  }

  private createLine() {
    return this.fb.group({
      /**
       * Id della riga già salvata: vuoto per una riga nuova. Viaggia al server
       * in modifica, ed è ciò che gli consente di aggiornare la riga invece di
       * ricrearla — con lei restano agganciati movimento e seriali.
       * Va azzerato in ogni duplicazione: due righe non possono avere lo stesso id.
       */
      id: this.fb.control(''),
      variantId: this.fb.control(''),
      // Le tre chiavi d'identità e lo SKU fotografato. I primi tre non si
      // salvano — si digitano per TROVARE l'articolo e restano scritti se non
      // corrisponde niente; lo SKU invece viaggia, come su ogni altro documento.
      articleCode: this.fb.control(''),
      sku: this.fb.control(''),
      barcode: this.fb.control(''),
      description: this.fb.control('', { validators: [Validators.required] }),
      quantity: this.fb.control(1, {
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      unitPrice: this.fb.control(''),
      vatRatePercent: this.fb.control('22'),
      vatCodeId: this.fb.control(''),
      /**
       * Il Codice IVA COM'ERA quando il documento e' stato caricato. Non e' un
       * campo dell'operatore: serve a dichiarare al server se l'assegnazione IVA
       * e' cambiata (contratto binario, `document-line-vat-payload.util`).
       *
       * ⛔ Non si aggiorna durante le modifiche locali: si riallinea solo dopo un
       * salvataggio riuscito o un nuovo caricamento. Confrontarlo col valore
       * PRECEDENTE invece che con quello persistito farebbe annullare due
       * modifiche di fila.
       */
      persistedVatCodeId: this.fb.control<string | null>(null),
      discountPercent: this.fb.control(''),
      // Riga di RIFERIMENTO (§12): descrittiva, non economica e non fisica.
      // Non e' editabile dall'operatore — la valorizzano inclusione e
      // conversione, e deve sopravvivere a save -> reopen.
      isReference: this.fb.control(false),

      // «Scarica mag.»: il default segue il tipo articolo già in VestiFlow
      // (Articolo scarica, Servizio no). Righe senza variante non muovono nulla.
      loadsStock: this.fb.control(false),
    });
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }

  /**
   * Le righe vuote in coda si SCARTANO al salvataggio, non bloccano.
   *
   * Stessa regola delle altre maschere documento (`domain/`, 11/08/2026). Qui
   * la riga vuota non nasce dalla navigazione ma dal pulsante «Aggiungi riga»,
   * e il blocco era anche peggio: ogni riga ha campi obbligatori propri, quindi
   * una riga aggiunta e lasciata lì rendeva invalido l'intero form — e il
   * salvataggio usciva **in silenzio**, senza dire perché.
   *
   * Vuota = nessun articolo e nessuna descrizione. La quantità non conta: nasce
   * a 1 da sola.
   */
  private dropTrailingEmptyLines(): void {
    if (this.formReadOnly()) {
      return;
    }
    const indices = trailingEmptyLineIndices(this.lines.length, (index) => {
      const line = this.lines.at(index);
      if (!line) {
        return true;
      }
      return !line.controls.variantId.value.trim() && !line.controls.description.value.trim();
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
