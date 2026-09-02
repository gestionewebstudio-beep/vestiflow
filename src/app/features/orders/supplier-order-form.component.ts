import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  VARIANT_SEARCH_DEBOUNCE_MS,
  VARIANT_SEARCH_MIN_CHARS,
  VARIANT_SEARCH_PAGE_SIZE,
} from '@domain/documents/utils/document-variant-search.config';
import { NoImplicitSubmitDirective } from '@shared/directives/no-implicit-submit.directive';
import { ViewportService } from '@core/services/viewport.service';
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

import { NavigationHistoryService } from '@core/services/navigation-history.service';
import type { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import { AuthService } from '@core/auth';
import {
  canManageDocuments,
  canViewPurchaseCosts,
} from '@core/permissions/tenant-permissions.util';
import { hasTenantPermission } from '@core/permissions/user-permissions.util';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Money } from '@core/models/common.model';
import { DocumentType } from '@core/models/document.model';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import type { SupplierOrder } from '@core/models/supplier-order.model';
import {
  ORDER_STATE_OPTIONS,
  OrderState,
  isOrderStateLocked,
  isSelectableOrderState,
  orderStateLabel,
} from '@core/models/order-state.model';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  moneyToDecimalString,
  parseMoneyInput,
  roundToMinor,
  toStorableMinor,
} from '@core/utils/money.util';
import {
  applyCascadeDiscountMinor,
  cascadeDiscountMultiplier,
  formatDiscountPercentValue,
  parseEffectiveDiscountPercent,
} from '@core/utils/discount-percent.util';
import type { PaymentOption } from '@core/models/payment-option.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { isPurchaseVatCode, vatCodeOptionLabel } from '@core/models/vat-code.model';
import type { PurchaseCostEntryMode, VatCode } from '@core/models/vat-code.model';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { toLocationSelectOptions } from '@core/utils/location-select-options.util';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { prefillDefaultLocation } from '@domain/inventory/utils/default-location-prefill.util';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { EditLockBannerComponent } from '@shared/components/edit-lock-banner/edit-lock-banner.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { TableViewId } from '@shared/table-columns/table-column.model';
import { createLineColumnWidths } from '@shared/table-columns/line-column-widths.store';
import { formatItalianInputDate } from '@shared/utils/calendar.util';

import {
  SUPPLIER_ORDER_LINE_COLUMNS,
  SUPPLIER_ORDER_LINE_PRESETS,
  SUPPLIER_ORDER_LINES_VIEW,
  normalizeSupplierOrderColumnId,
} from './models/supplier-order-line-columns.config';

import type { ProductEmbeddedCreatePrefill } from '@domain/products/models/product-form.mapper';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import { ProductFormComponent } from '@domain/products/product-form.component';
import { ProductService } from '@domain/products/services/product.service';
import { DocumentLineArticleService } from '@domain/documents/services/document-line-article.service';
import { DocumentActionsComponent } from '@domain/documents/components/document-actions/document-actions.component';
import { DocumentPageStateComponent } from '@domain/documents/components/document-page-state/document-page-state.component';
import { DocumentLineHeadComponent } from '@domain/documents/components/document-line-head/document-line-head.component';
import { DocumentTotalsComponent } from '@domain/documents/components/document-totals/document-totals.component';
import type { DocumentTotalRow } from '@domain/documents/components/document-totals/document-totals.model';
import { DocumentLineRowComponent } from '@domain/documents/components/document-line-row/document-line-row.component';
import { DocumentLineCardComponent } from '@domain/documents/components/document-line-card/document-line-card.component';
import { DocumentLineCardBodyComponent } from '@domain/documents/components/document-line-card/document-line-card-body.component';
import { DocumentLineCardStripComponent } from '@domain/documents/components/document-line-card/document-line-card-strip.component';
import { documentLineCardHead } from '@domain/documents/components/document-line-card/document-line-card.model';
import type { DocumentLineCardHead } from '@domain/documents/components/document-line-card/document-line-card.model';
import { DocumentLineCardOpenStore } from '@domain/documents/state/document-line-card-open.store';
import { DOCUMENT_LINE_ROW_VIEW_VUOTA } from '@domain/documents/components/document-line-row/document-line-row.model';
import type {
  DocumentLineColumnId,
  DocumentLineFieldEvent,
  DocumentLineRowView,
  DocumentLineSuggestionDirection,
  DocumentLineSuggestionPick,
} from '@domain/documents/components/document-line-row/document-line-row.model';
import {
  campiEffettivi,
  PROFILI_RIGA_DOCUMENTO,
} from '@domain/documents/models/document-line-article.model';
import type {
  ContestoRichiamoArticolo,
  PolicyRichiamoArticolo,
} from '@domain/documents/models/document-line-article.model';
import { UnitOfMeasureManagerDialogComponent } from '@domain/products/components/unit-of-measure-manager-dialog/unit-of-measure-manager-dialog.component';
import type { UnitOfMeasureOption } from '@domain/products/models/unit-of-measure-option.model';
import { UnitOfMeasureOptionService } from '@domain/products/services/unit-of-measure-option.service';
import { unitOfMeasureSelectOptions } from '@domain/products/utils/unit-of-measure-options.util';
import {
  vatCodeSelectOption,
  vatOptionsIncludingSelected,
} from '@domain/documents/utils/document-vat-options.util';
import { DocumentProductSearchPanelComponent } from '@domain/documents/components/document-product-search-panel/document-product-search-panel.component';
import { findVariantSummaryById } from '@domain/products/utils/variant-summary-search.util';

import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentEditLockService } from '@domain/documents/services/document-edit-lock.service';
import { DocumentCodeLookupService } from '@domain/documents/services/document-code-lookup.service';
import { DocumentCodeLookupStore } from '@domain/documents/state/document-code-lookup.store';
import { DocumentLineSearchPanelStore } from '@domain/documents/state/document-line-search-panel.store';
import { DocumentProductSuggestStore } from '@domain/documents/state/document-product-suggest.store';
import { DocumentLineSortStore } from '@domain/documents/state/document-line-sort.store';
import { sortByValue, type SortValueKind } from '@shared/utils/sort-values.util';
import { DocumentLineFocusStore } from '@domain/documents/state/document-line-focus.store';
// `supplierCodeForDocumentLine` non si importa più: lo chiama il risolutore
// comune, che è l'unico posto in cui la regola del codice fornitore vive.
import { type DocumentLineCodeField } from '@domain/documents/utils/document-code-match.util';
import { DocumentHeaderComponent } from '@domain/documents/components/document-header/document-header.component';
import { DocumentHeaderFieldComponent } from '@domain/documents/components/document-header/document-header-field.component';
import {
  grossFromNetExact,
  grossFromNetMinor,
  lineVatFromNetExact,
  netFromGrossExact,
} from '@domain/documents/utils/document-vat.util';

import { readSupplierOrderPrefill } from '@domain/supplier-orders/models/supplier-order-prefill.model';
import { SupplierOrderService } from '@domain/supplier-orders/services/supplier-order.service';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { DocumentNumberingStore } from '@domain/documents/state/document-numbering.store';
import { DocumentNumberConflictStore } from '@domain/documents/state/document-number-conflict.store';
import { DocumentChronologyGuard } from '@domain/documents/state/document-chronology-guard';
import { DocumentChronologyWarningDialogComponent } from '@domain/documents/components/document-chronology-warning-dialog/document-chronology-warning-dialog.component';
import { DocumentSeriesManagerDialogComponent } from '@domain/documents/components/document-series-manager-dialog/document-series-manager-dialog.component';
import { DocumentNumberFieldComponent } from '@shared/components/document-number-field/document-number-field.component';
import { documentNumberConflictOf } from '@core/models/document-number-conflict.util';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import { SupplierFormFieldsComponent } from '@domain/suppliers/components/supplier-form-fields/supplier-form-fields.component';
import {
  createSupplierFormGroup,
  mapSupplierFormToInput,
  resetSupplierFormGroup,
} from '@domain/suppliers/utils/supplier-form.util';
import { CdkDrag, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { documentSearchLaunchTerm } from '@domain/documents/utils/document-search-launch-term.util';
import { AttachmentsPanelComponent } from '@shared/components/attachments-panel/attachments-panel.component';
import { computeDocumentTotals } from '@domain/documents/utils/document-totals.util';
import { trailingEmptyLineIndices } from '@domain/documents/utils/trailing-empty-lines.util';

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Le quattro chiavi di ricerca dell'articolo, nell'ordine delle colonne. Sono
 * quelle condivise: il nome locale resta perché il resto del file lo usa, ma
 * l'insieme è dichiarato una volta sola, in `document-code-match.util`.
 */
type LineCodeField = DocumentLineCodeField;
const CODE_FOCUS_FIELDS: readonly LineCodeField[] = [
  'articleCode',
  'sku',
  'barcode',
  'supplierCode',
];

/** Campi della riga che ricevono il fuoco, nell'ordine di attraversamento. */
/** Colonne dell'Ordine fornitore su cui si può ordinare le righe (§7.1). */
export type SupplierOrderLineSortColumn =
  | 'articleCode'
  | 'sku'
  | 'barcode'
  | 'supplierCode'
  | 'product'
  | 'unitOfMeasure'
  | 'quantity'
  | 'unitCost'
  | 'discount';

const SUPPLIER_ORDER_SORTABLE_LINE_COLUMNS: readonly SupplierOrderLineSortColumn[] = [
  'articleCode',
  'sku',
  'barcode',
  'supplierCode',
  'product',
  'unitOfMeasure',
  'quantity',
  'unitCost',
  'discount',
];

const SUPPLIER_ORDER_LINE_FOCUS_FIELDS = [
  'articleCode',
  'sku',
  'barcode',
  'supplierCode',
  'product',
  'quantity',
  'unitOfMeasure',
  'unitCost',
  'discount',
  'vat',
] as const;

type SupplierOrderLineFocusField = (typeof SUPPLIER_ORDER_LINE_FOCUS_FIELDS)[number];

type LineFocusField = SupplierOrderLineFocusField;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Maschera Ordine fornitore (prompt 2026-07). Testata: Fornitore, Data,
 * Consegna prevista, Rif. ordine fornitore; numerazione dal numeratore
 * supplier_order (Numeratori). Righe con Sconto, IVA e switch costi
 * netto/ivato come l'Arrivo merce. L'ordine nasce Confermato e NON incide
 * su giacenze o disponibilità. Owner: gestionale (CRUD locale).
 * Uscita protetta con modifiche non salvate (stesso pattern di Arrivo merce
 * e Ordine cliente): chip «← Ordini Fornitori», Annulla e back del browser
 * chiedono conferma prima di scartare i dati.
 */
@Component({
  selector: 'app-supplier-order-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NoImplicitSubmitDirective,
    DocumentLineHeadComponent,
    DocumentTotalsComponent,
    DocumentLineRowComponent,
    DocumentLineCardComponent,
    DocumentLineCardStripComponent,
    DocumentLineCardBodyComponent,
    AttachmentsPanelComponent,
    CdkDropList,
    CdkDrag,
    ReactiveFormsModule,
    BackButtonComponent,
    ButtonComponent,
    DateInputComponent,
    SelectMenuComponent,
    EmptyStateComponent,
    DocumentNumberFieldComponent,
    DocumentSeriesManagerDialogComponent,
    DocumentChronologyWarningDialogComponent,
    TableColumnPickerComponent,
    SupplierFormFieldsComponent,
    SlidePanelComponent,
    ProductFormComponent,
    DocumentHeaderComponent,
    DocumentHeaderFieldComponent,
    UnitOfMeasureManagerDialogComponent,
    DocumentProductSearchPanelComponent,
    ConfirmDialogComponent,
    EditLockBannerComponent,
    DocumentActionsComponent,
    DocumentPageStateComponent,
  ],
  // Una maschera = un'istanza del blocco: è lei a tracciare gli id che ha
  // sbloccato e a rilasciarli all'uscita, così alla riapertura tornano protetti.
  providers: [DocumentEditLockService],
  templateUrl: './supplier-order-form.component.html',
  styleUrl: './supplier-order-form.component.scss',
})
export class SupplierOrderFormComponent implements CanComponentDeactivate {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly orderService = inject(SupplierOrderService);
  private readonly countersService = inject(DocumentCountersService);
  private readonly supplierService = inject(SupplierService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly productService = inject(ProductService);
  private readonly lineArticles = inject(DocumentLineArticleService);
  private readonly codeLookupService = inject(DocumentCodeLookupService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly paymentOptionsService = inject(PaymentOptionsService);
  private readonly documentService = inject(DocumentService);
  private readonly router = inject(Router);
  private readonly viewport = inject(ViewportService);

  /**
   * Quale delle due viste di riga è viva. Le due sono **esclusive**: sotto la
   * soglia esiste la card, sopra la tabella, mai entrambe (specifica §4.11 —
   * «la stessa riga non esiste due volte»).
   */
  protected readonly compactView = this.viewport.compact;
  private readonly navHistory = inject(NavigationHistoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly columnPreferences = inject(TableColumnPreferenceService);
  /** Serve a misurare la tabella resa: la ridistribuzione lavora in pixel. */
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  // Il lookup da scanner non serve più qui: questa maschera non ha lettore, e
  // la conferma dei codici passa ora da `DocumentCodeLookupService`.
  private readonly editLock = inject(DocumentEditLockService);

  protected readonly lineColumnsView = TableViewId.SupplierOrderLines;

  protected readonly listPath = '/app/orders';
  protected readonly currency = DEFAULT_CURRENCY;

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly editOrderId = computed(() => this.paramMap().get('id'));

  /**
   * Allegati: stesso permesso degli altri documenti. Fino all'11/08/2026
   * l'ordine fornitore era l'unico senza — non per scelta di prodotto, ma
   * perché il sottosistema generico degli allegati, dichiarato «estendibile»,
   * non era mai stato esteso. La conferma d'ordine che il fornitore rimanda è
   * esattamente il file che si tiene attaccato all'ordine.
   */
  protected readonly canManageAttachments = computed(() =>
    canManageDocuments(this.authService.currentUser()),
  );

  /**
   * Senza il permesso, accanto alla serie resta solo il campo: niente
   * ingranaggio e nessun pannello numerazioni da aprire.
   *
   * L'ordine fornitore ha ricevuto la numerazione in testata (12/08/2026) dopo
   * che il gate era già stato scritto sulle altre sei maschere, e ci era
   * arrivato con `canManageSeries` fisso a `true`: il comando compariva a
   * chiunque, e l'API rispondeva 403 al primo clic.
   */
  protected readonly puoConfigurareDocumenti = computed(() =>
    hasTenantPermission(this.authService.currentUser(), TenantPermission.DocumentsConfigure),
  );
  protected readonly isEditMode = computed(() => Boolean(this.editOrderId()));

  private readonly loadTick = signal(0);
  private readonly loadRequest = computed(() => ({
    id: this.editOrderId(),
    tick: this.loadTick(),
  }));

  protected readonly loadState = toSignal(
    toObservable(this.loadRequest).pipe(
      switchMap(({ id }) => {
        if (!id) {
          return of<'ready' | 'loading' | 'not-found' | 'error'>('ready');
        }
        return this.orderService.getSupplierOrderById(id).pipe(
          map((order) => {
            // ⛔ Qui c’era `if (order.status !== SupplierOrderStatus.Confirmed)
            //   return 'not-found'`, cioè: un ordine CONCLUSO o ANNULLATO non si
            //   apriva affatto — la maschera mostrava «Ordine non modificabile».
            //
            // ⭐ Superato dal proprietario il 28/08/2026. **Gli stati dell’Ordine
            //   fornitore — Confermato, Concluso, Annullato — servono ai
            //   COLLEGAMENTI documentali**: Confermato è eleggibile in
            //   «Includi/Genera», Concluso e Annullato no. Non governano
            //   l’apertura di questa maschera, né la modifica, né il lucchetto.
            //
            // ⚠️ Il blocco non sparisce, si SPOSTA: `formReadOnly` protegge ogni
            //   ordine riaperto e chiede lo sblocco esplicito prima di scrivere,
            //   qualunque sia lo stato.
            //
            // ⚠️ Senza questa riga il clic sulla riga di un ordine concluso
            //   sarebbe finito su un vicolo cieco, che è peggio del Dettaglio da
            //   cui la decisione lo toglie.
            // Solo QUI, non dentro patchFormFromOrder: quel metodo viene
            // richiamato anche dopo un salvataggio in modifica, e ricalcolare il
            // blocco lì richiuderebbe la maschera in faccia a chi sta lavorando.
            this.editLock.syncOnLoad(order.id);
            this.patchFormFromOrder(order);
            // Un altro documento e' un'altra storia: l'avviso torna dovuto. Qui e
            // non alla creazione del componente, che passando da un ordine
            // all'altro non riavviene (cambia solo il parametro di rotta).
            this.lineSort.reset();
            return 'ready' as const;
          }),
          startWith<'ready' | 'loading' | 'not-found' | 'error'>('loading'),
          catchError(() => of('error' as const)),
        );
      }),
    ),
    { initialValue: this.editOrderId() ? 'loading' : 'ready' },
  );

  protected readonly loading = computed(() => this.loadState() === 'loading');
  protected readonly loadError = computed(() => this.loadState() === 'error');
  protected readonly notEditable = computed(() => this.loadState() === 'not-found');

  // ── Blocco alla riapertura (meccanismo condiviso di domain/documents) ──────
  //
  // Un ordine già registrato si riapre in sola lettura: per modificarlo si
  // sblocca, e lo sblocco vale per la sessione di lavoro. Era l'unico documento
  // del gestionale che si riapriva direttamente in scrittura — e la ragione per
  // portarcelo non è il rischio contabile, che qui è basso, ma la prevedibilità:
  // quattro documenti che si comportano allo stesso modo.
  protected readonly formReadOnly = computed(
    () => this.isEditMode() && this.loadState() === 'ready' && !this.editLock.unlocked(),
  );
  protected readonly unlockDialogOpen = signal(false);

  protected requestUnlockEdit(): void {
    this.unlockDialogOpen.set(true);
  }

  protected confirmUnlockEdit(): void {
    this.unlockDialogOpen.set(false);
    this.editLock.unlock(this.editOrderId());
  }

  protected cancelUnlockEdit(): void {
    this.unlockDialogOpen.set(false);
  }

  private readonly suppliersReload = signal(0);
  private readonly suppliers = toSignal(
    toObservable(this.suppliersReload).pipe(switchMap(() => this.supplierService.getSuppliers())),
    { initialValue: [] },
  );
  protected readonly hasSuppliers = computed(() => this.suppliers().length > 0);
  protected readonly supplierOptions = computed<readonly SelectMenuOption[]>(() =>
    this.suppliers().map((supplier) => ({ value: supplier.id, label: supplier.name })),
  );

  // Codici IVA: tendina riga (solo codici acquisto attivi) e form fornitore.
  protected readonly vatCodes = toSignal(
    this.vatCodeService.list().pipe(catchError(() => of([] as readonly VatCode[]))),
    { initialValue: [] as readonly VatCode[] },
  );
  private readonly purchaseVatCodes = computed(() =>
    this.vatCodes().filter((vatCode) => vatCode.isActive && isPurchaseVatCode(vatCode)),
  );
  /**
   * Le voci della cella IVA, composte come nelle altre tre maschere: **il codice
   * è l'etichetta**, aliquota e descrizione stanno nel dettaglio.
   *
   * Qui l'etichetta era la riga intera («22 · 22% · Imponibile 22%»), che sulla
   * cella a ricerca-e-selezione toglie senso al filtro: la precedenza è sul
   * codice, e un codice che comincia con «22 · 22%…» non comincia con niente.
   *
   * ⚠️ **Niente voce vuota in testa**, e non è una svista. C'era — un `—` in
   * cima all'elenco — da quando la colonna era un `select-menu`, dove una
   * tendina senza scelta è normale. Sulla cella a ricerca-e-selezione quella
   * voce è la **prima evidenziata**: aprire e battere Invio senza guardare
   * azzerava il Codice IVA della riga, e il salvataggio poi la rifiutava. È il
   * vicolo cieco che `document-line-select-cell` descrive su
   * `includeEmptyOption`: nelle righe documento il vuoto non è una scelta,
   * perché una riga senza Codice IVA non si salva. Ordine cliente, Arrivo merce
   * e Corrispettivo manuale non l'hanno mai avuta: questa maschera era l'unica.
   */
  private readonly vatCodeOptionsBase = computed<readonly SelectMenuOption[]>(() =>
    this.purchaseVatCodes().map(vatCodeSelectOption),
  );
  private readonly vatCodesById = computed(
    () => new Map(this.vatCodes().map((vatCode) => [vatCode.id, vatCode])),
  );

  /** Voci pagamento del tenant per il form nuovo fornitore inline. */
  protected readonly paymentOptions = toSignal(
    this.paymentOptionsService.list().pipe(catchError(() => of([] as readonly PaymentOption[]))),
    { initialValue: [] as readonly PaymentOption[] },
  );

  // Switch costi netto/ivato di testata (stesso pattern dell'Arrivo merce).
  protected readonly costEntryMode = signal<PurchaseCostEntryMode>('vat_excluded');
  protected readonly costModeMenuOpen = signal(false);
  // Marcato appena l'utente sceglie a mano: blocca l'inizializzazione dalla preferenza.
  private costEntryModeTouched = false;
  protected readonly costModeLabel = computed(() =>
    this.costEntryMode() === 'vat_included' ? 'Costo ivato' : 'Costo netto',
  );
  /** Opzioni per il selettore modalità costo in testata mobile. */
  protected readonly costModeOptions: readonly SelectMenuOption[] = [
    { value: 'vat_excluded', label: 'Netto' },
    { value: 'vat_included', label: 'Ivato' },
  ];

  protected readonly variantSearchDraft = signal('');

  /**
   * Scelta fra più corrispondenze esatte di un codice. Lo stato vive in
   * `domain/`, identico nelle tre maschere; qui resta solo cosa farne.
   *
   * Qui il caso che la apre più spesso è il **codice fornitore**, che non è
   * unico: fornitori diversi possono usare lo stesso codice per articoli
   * diversi, e la scelta è «quale articolo», non «quale taglia».
   */
  protected readonly codeLookup = new DocumentCodeLookupStore();
  protected readonly productSuggest = new DocumentProductSuggestStore();

  /**
   * Riordino righe e avviso: stato e regole in `domain/`. Qui resta solo COME
   * si legge il valore di una colonna e con che modo si confronta.
   */
  protected readonly lineSort = new DocumentLineSortStore<SupplierOrderLineSortColumn>();

  private readonly lineSortKinds: Readonly<Record<SupplierOrderLineSortColumn, SortValueKind>> = {
    articleCode: 'text',
    sku: 'text',
    barcode: 'text',
    supplierCode: 'text',
    product: 'text',
    unitOfMeasure: 'text',
    quantity: 'number',
    unitCost: 'money',
    discount: 'percent',
  };

  protected isLineColumnSortable(columnId: string): boolean {
    return (SUPPLIER_ORDER_SORTABLE_LINE_COLUMNS as readonly string[]).includes(columnId);
  }

  protected toggleLineSort(columnId: SupplierOrderLineSortColumn): void {
    if (this.formReadOnly() || !this.isLineColumnVisible(columnId)) {
      return;
    }
    // Il primo riordino del documento apre l'avviso e si ferma qui.
    if (this.lineSort.request(columnId)) {
      this.applyLineSort();
    }
  }

  protected confirmLineSort(): void {
    if (this.lineSort.confirm() !== null) {
      this.applyLineSort();
    }
  }

  protected lineSortAriaLabel(columnId: SupplierOrderLineSortColumn, label: string): string {
    if (this.lineSort.column() !== columnId) {
      return `Ordina per ${label}`;
    }
    return this.lineSort.direction() === 'asc'
      ? `${label}: ordinamento crescente`
      : `${label}: ordinamento decrescente`;
  }

  private lineSortValue(
    raw: ReturnType<ReturnType<SupplierOrderFormComponent['createLine']>['getRawValue']>,
    column: SupplierOrderLineSortColumn,
  ): string | number {
    switch (column) {
      case 'articleCode':
        return raw.articleCode;
      case 'sku':
        return raw.sku;
      case 'barcode':
        return raw.barcode;
      case 'supplierCode':
        return raw.supplierCode;
      case 'product':
        return raw.productName;
      case 'unitOfMeasure':
        return raw.unitOfMeasure;
      case 'quantity':
        return Number(raw.quantity) || 0;
      case 'unitCost':
        return raw.unitCost;
      case 'discount':
        return raw.discount;
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
    // L'indice della card aperta indicherebbe un'altra riga: si chiude.
    this.cardAperte.closeAll();
    this.markFormDirty();
  }

  // Pannello di ricerca articolo aperto dalla lente della cella nome.
  /**
   * Stato del pannello di ricerca aperto da una riga: E-5, estratto in
   * `domain/documents/state/` perche' era scritto identico in tre maschere.
   */
  protected readonly lineSearchPanel = new DocumentLineSearchPanelStore();

  private readonly searchedVariants = toSignal(
    toObservable(this.variantSearchDraft).pipe(
      debounceTime(VARIANT_SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
      switchMap((search) => {
        const term = search.trim();
        if (term.length < VARIANT_SEARCH_MIN_CHARS) {
          return of([] as readonly VariantSummary[]);
        }
        return this.productService.searchVariantSummaries({
          search: term,
          pageSize: VARIANT_SEARCH_PAGE_SIZE,
        });
      }),
    ),
    { initialValue: [] as readonly VariantSummary[] },
  );

  // ── Numerazione ───────────────────────────────────────────────────────────
  //
  // Il meccanismo vive in `domain/` (`DocumentNumberingStore`): proposta,
  // scelta della serie, numero imposto. Qui restano solo le voci che
  // differiscono — dove sta il numero, dove sta la serie, e quando il documento
  // è in modifica.

  protected readonly documentType = DocumentType.SupplierOrder;
  protected readonly seriesDialogOpen = signal(false);

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
      documentType: () => DocumentType.SupplierOrder,
      locationId: () => this.form.controls.locationId.value || null,
      documentDate: () => this.form.controls.orderDate.value,
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

  /** Conflitto numero restituito dal server: avviso di presa d'atto. */
  /**
   * Avviso cronologico (§4): la serie contiene documenti fuori posto. Avviso
   * e non blocco — da lì si salva comunque — e il meccanismo vive in
   * `domain/`, come quello del conflitto sul numero.
   */
  protected readonly chronology = new DocumentChronologyGuard({
    documentType: () => DocumentType.SupplierOrder,
    series: () => this.form.controls.series.value,
    number: () => this.form.controls.documentNumber.value,
    documentDate: () => this.form.controls.orderDate.value,
    // In modifica il documento non deve risultare fuori ordine con la
    // propria riga vecchia: cambiare numero E data basterebbe.
    excludeId: () => this.editOrderId(),
  });
  private readonly numberConflictDialog = new DocumentNumberConflictStore();
  protected readonly conflictDialogOpen = this.numberConflictDialog.isOpen;
  protected readonly conflictMessage = this.numberConflictDialog.message;

  protected acknowledgeConflictNumber(): void {
    this.numbering.acknowledgeConflict(this.numberConflictDialog);
  }

  /**
   * Chiusura del pannello numerazioni: ricarica l'elenco serie SENZA riproporre
   * serie e numero — la selezione resta quella che era.
   */
  protected onSeriesManagerClosed(): void {
    this.seriesDialogOpen.set(false);
    this.numbering.reloadCounters();
  }

  /** Sedi su cui l'operatore può scrivere, con la sua predefinita in cima. */
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

  readonly form = this.fb.group({
    supplierId: this.fb.control('', { validators: [Validators.required] }),
    orderDate: this.fb.control(todayIsoDate(), { validators: [Validators.required] }),
    // Numerazione propria (specifica numerazione §5, Categoria A). Fino al
    // 12/08/2026 l'Ordine fornitore era l'unico documento della categoria
    // senza: il server lo numerava d'ufficio e l'operatore non vedeva né
    // sceglieva niente.
    documentNumber: this.fb.control<number | null>(null),
    series: this.fb.control(''),
    /**
     * Sede di destinazione della merce ordinata (§1-bis). Viaggia nella colonna
     * `supplier_orders.destination_location_id`, che esisteva già — nullable,
     * con la sua chiave esterna — e non aveva alcun percorso di scrittura:
     * nessuna migration, solo un dato che finalmente arriva.
     */
    locationId: this.fb.control(''),
    expectedAt: this.fb.control(''),
    /**
     * ⭐ Stato del ciclo commerciale (`17` §2.1), lo stesso dell’Ordine cliente.
     *
     * ⚠️ Nasce **Confermato**: chi crea normalmente un ordine non deve fare un
     * passaggio in più perché è stato introdotto un quarto stato — «Da
     * confermare» è una scelta esplicita (`17` OF-001).
     */
    status: this.fb.control<OrderState>(OrderState.Confirmed),
    supplierReference: this.fb.control(''),
    // Tipo, numero e data della conferma d'ordine del fornitore. Il rendering
    // è del componente condiviso: qui vive solo il dato.
    /** Data in formato ISO `AAAA-MM-GG` (solo giorno), come `orderDate`. */
    /**
     * Sconto extra di chiusura sull'intero ordine. Campo SEMPRE visibile che
     * mostra 0% quando non c'è, non un pulsante che lo riveli: un pulsante
     * nasconde uno stato, e guardando il riepilogo non si saprebbe se lo sconto
     * è zero o se il campo è chiuso (decisione 08/2026, regole-stile-ui §7).
     */
    documentDiscountPercent: this.fb.control(''),
    lines: this.fb.array([this.createLine()]),
  });

  /**
   * Etichetta del tipo fotografata sull'ordine. Va passata SEMPRE al
   * componente condiviso: se il tipo è stato eliminato dall'elenco, è l'unica
   * cosa che tiene in piedi l'opzione nella tendina — senza, la dicitura
   * apparirebbe vuota e il salvataggio successivo la cancellerebbe davvero.
   */

  /**
   * Lo stato SALVATO dell’ordine; su un ordine nuovo, il default di creazione.
   *
   * ⚠️ `SupplierOrderStatus` e `OrderState` hanno gli stessi quattro valori:
   *    la lettura è diretta, senza tradurre. Se un giorno divergessero, qui
   *    servirebbe un adattatore — come quello che l’API ha in
   *    `supplierOrderState()`.
   */
  /**
   * Lo stato con cui l’ordine è stato letto dal server.
   *
   * ⚠️ Si aggiorna anche DOPO un salvataggio, ed è voluto: se l’Arrivo merce
   *    collegato ha portato l’ordine a Concluso, il campo si deve bloccare
   *    senza che l’operatore debba riaprire la maschera.
   */
  private readonly _savedStatus = signal<SupplierOrderStatus | null>(null);
  protected readonly orderState = computed<OrderState>(
    () => this._savedStatus() ?? OrderState.Confirmed,
  );
  /**
   * ⛔ **Concluso: il campo Stato è bloccato, il resto del documento no**
   * (`17` §2.5, §5.3). Da Concluso si esce annullando o eliminando l’Arrivo
   * merce collegato, non col selettore.
   */
  protected readonly isStateLocked = computed(() => isOrderStateLocked(this.orderState()));

  /** Le stesse tre voci dell’Ordine cliente, dallo stesso elenco. */
  protected readonly stateOptions: readonly SelectMenuOption[] = ORDER_STATE_OPTIONS;

  protected stateBadgeLabel(): string {
    return orderStateLabel(this.orderState());
  }

  protected onStateSelect(value: string | null): void {
    // ⛔ Solo i tre scegliibili: «concluded» è derivato e l’API lo rifiuta.
    if (value !== null && isSelectableOrderState(value)) {
      this.form.controls.status.setValue(value);
      this.markFormDirty();
    }
  }

  protected get lines(): FormArray<ReturnType<SupplierOrderFormComponent['createLine']>> {
    return this.form.controls.lines;
  }

  /**
   * Gli articoli agganciati alle righe, senza ripetizioni.
   *
   * ⛔ **`distinctUntilChanged` non è un'ottimizzazione: toglie un difetto
   * misurato.** `lines.valueChanges` emette a ogni carattere digitato in
   * QUALUNQUE campo di riga — quantità, sconto, costo — e `map` produce ogni
   * volta un array nuovo, quindi diverso per `Object.is`. Senza il confronto,
   * `pinnedVariants` qui sotto rileggeva dal catalogo **una variante per riga
   * del documento a ogni battuta**: su un ordine da trenta righe, trenta
   * richieste per digitare «5».
   *
   * ⭐ Il confronto è sui CONTENUTI, non sull'identità dell'array: è l'insieme
   * degli articoli a dover cambiare perché ci sia qualcosa da rileggere.
   */
  private readonly selectedVariantIds = toSignal(
    this.form.controls.lines.valueChanges.pipe(
      startWith(this.form.getRawValue().lines),
      map((lines) => [...new Set(lines.map((line) => line.variantId).filter(Boolean))]),
      distinctUntilChanged(
        (prima, dopo) => prima.length === dopo.length && prima.every((id, i) => id === dopo[i]),
      ),
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
        ).pipe(map((rows) => rows.filter((row): row is VariantSummary => row !== null)));
      }),
    ),
    { initialValue: [] as readonly VariantSummary[] },
  );

  /**
   * Costo d'acquisto nel selettore articolo (dato sensibile §permessi): senza
   * "Visualizza costi d'acquisto" non viene mostrato.
   */
  private readonly canSeeCosts = computed(() =>
    canViewPurchaseCosts(this.authService.currentUser()),
  );

  // Snapshot reattivo del form per totali e celle derivate.
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

  // ── Netto memorizzato, netto o ivato a schermo ─────────────────────────────
  //
  // La riga porta sempre il costo NETTO canonico (`unitCostNetMinor`), con la
  // coda dello scorporo. Il campo è solo una vista: `costFieldValue` rende,
  // `netFromDisplayed` memorizza, e il selettore cambia SOLO la vista.
  //
  // Il modello è la sezione Listini della scheda articolo, non il selettore del
  // DDT vendita: quello converte il valore MOSTRATO, già arrotondato a due
  // decimali, e su un costo digitato ivato perde il centesimo nel 18% dei casi
  // al 22%. Qui il canonico non viene mai ricostruito da ciò che si vede,
  // quindi si può passare avanti e indietro quante volte si vuole.

  /** Aliquota effettiva di una riga: solo l'IVA esposta si scorpora. */
  private lineRate(index: number): number {
    const vatCode = this.vatCodesById().get(this.lines.at(index)?.controls.vatCodeId.value ?? '');
    const exposed =
      vatCode?.calculationMode === 'standard' || vatCode?.calculationMode === 'split_payment';
    if (!vatCode || !exposed) {
      return 0;
    }
    return Math.max(0, vatCode.ratePercent);
  }

  /** Il selettore mostra l'ivato su questa riga? */
  private showsGross(index: number): boolean {
    return this.costEntryMode() === 'vat_included' && this.lineRate(index) > 0;
  }

  /**
   * Valore digitato nella modalità corrente → netto da MEMORIZZARE, quindi
   * scorporato ESATTAMENTE: 5,02 ivati al 22% non hanno un netto intero, e
   * arrotondarlo qui li farebbe tornare 5,01 al ritorno (§sei decimali).
   */
  private netFromDisplayed(displayedMinor: number, index: number): number {
    return this.showsGross(index)
      ? toStorableMinor(netFromGrossExact(displayedMinor, this.lineRate(index)))
      : toStorableMinor(displayedMinor);
  }

  /**
   * Netto canonico → stringa per il campo, nella modalità corrente. È il punto
   * di USCITA: due decimali, sempre — anche in modalità netta, dove non c'è
   * conversione da fare ma il netto può portare la coda di uno scorporo.
   */
  private costFieldValue(netMinor: number, index: number): string {
    const displayed = this.showsGross(index)
      ? grossFromNetMinor(netMinor, this.lineRate(index))
      : roundToMinor(netMinor);
    return moneyToDecimalString({ amountMinor: displayed, currencyCode: this.currency }).replace(
      '.',
      ',',
    );
  }

  /** Costo netto canonico della riga, qualunque cosa mostri il campo. */
  private lineUnitNetMinor(index: number): number {
    return this.lines.at(index)?.controls.unitCostNetMinor.value ?? 0;
  }

  /**
   * Il campo è stato digitato: il canonico si aggiorna da lì. È l'UNICO punto in
   * cui il netto nasce da ciò che si vede, ed è giusto che sia così — qui il
   * valore mostrato è il valore che l'operatore ha appena deciso.
   */
  protected onUnitCostInput(index: number, value: string): void {
    const line = this.lines.at(index);
    if (!line) {
      return;
    }
    const parsed = parseMoneyInput(value, this.currency);
    line.controls.unitCostNetMinor.setValue(
      parsed ? this.netFromDisplayed(parsed.amountMinor, index) : null,
      { emitEvent: false },
    );
  }

  /**
   * Riscrive i campi costo dal netto canonico. `emitEvent: false` di proposito:
   * cambiare unità di misura della vista non è una modifica dell'ordine e non
   * deve rimbalzare sul canonico.
   */
  private redrawCostFields(): void {
    this.lines.controls.forEach((line, index) => {
      const net = line.controls.unitCostNetMinor.value;
      if (net == null) {
        return;
      }
      line.controls.unitCost.setValue(this.costFieldValue(net, index), { emitEvent: false });
    });
  }

  /**
   * Importi riga client-side. Partono dal costo NETTO canonico — che è quello
   * che viene salvato, anche quando a schermo si legge l'ivato — e applicano lo
   * sconto a cascata. L'imponibile si arrotonda una volta sola, alla fine, e
   * l'imposta nasce dal valore esatto: è così che il totale torna al costo
   * ivato digitato quando il netto porta una coda decimale.
   */
  private lineAmounts(index: number): {
    readonly net: number;
    readonly vat: number;
    readonly affects: boolean;
  } {
    const line = this.lines.at(index);
    if (!line) {
      return { net: 0, vat: 0, affects: false };
    }
    const qty = Number(line.controls.quantity.value);
    const unitNet = this.lineUnitNetMinor(index);
    if (!Number.isFinite(qty) || unitNet <= 0) {
      return { net: 0, vat: 0, affects: false };
    }
    const vatCode = this.vatCodesById().get(line.controls.vatCodeId.value);
    const affects = vatCode?.vatAffectsSupplierTotal ?? false;
    const rate = this.lineRate(index);

    const netExact = qty * unitNet * cascadeDiscountMultiplier(line.controls.discount.value);
    return { net: Math.round(netExact), vat: lineVatFromNetExact(netExact, rate), affects };
  }

  /** Costo unitario scontato, nella modalità in cui si guardano i costi. */
  protected lineDiscountedCost(index: number): string {
    this.formValue();
    const line = this.lines.at(index);
    const unitNet = this.lineUnitNetMinor(index);
    if (!line || unitNet <= 0) {
      return '—';
    }
    const discountedNet = applyCascadeDiscountMinor(unitNet, line.controls.discount.value);
    return formatMoney({
      amountMinor: this.showsGross(index)
        ? grossFromNetMinor(discountedNet, this.lineRate(index))
        : discountedNet,
      currencyCode: this.currency,
    });
  }

  /**
   * I totali passano dalla stessa funzione degli altri documenti: lo sconto
   * documento si applica dopo quelli di riga, e l'IVA si ricalcola ripartendo
   * lo sconto fra le aliquote in proporzione. Prima qui c'erano tre somme
   * scritte a mano — corrette finché lo sconto non esisteva, e destinate a
   * divergere dagli altri il giorno in cui fosse arrivato. È arrivato.
   */
  /**
   * **Le voci del riepilogo, dichiarate dal documento.**
   *
   * ⛔ Qui c'erano quarantatre' righe di markup che differivano da quelle
   * dell'Ordine cliente per tre righe di commento e per il nome di tre
   * accessor — `orderSubtotal`, `orderTax`, `orderTotal` — che sono alias puri
   * di `documentTotals()`. Tre nomi diversi per lo stesso valore: e' cosi' che
   * una duplicazione si traveste da differenza.
   *
   * ⚠️ Il calcolo non si e' spostato: `documentTotals()` resta dov'era.
   */
  protected readonly totalsRows = computed<readonly DocumentTotalRow[]>(() => {
    const t = this.documentTotals();
    return [
      { key: 'linesTotal', label: 'Imponibile righe', value: t.linesTotal },
      {
        key: 'documentDiscountPercent',
        label: 'Sconto extra',
        kind: 'field' as const,
        control: this.form.controls.documentDiscountPercent,
        inputId: 'po-doc-discount',
        placeholder: '0%',
        ariaLabel: 'Sconto extra documento',
      },
      ...(t.documentDiscount.amountMinor > 0
        ? [
            {
              key: 'documentDiscount',
              label: 'Sconto documento',
              value: t.documentDiscount,
              negative: true,
            },
          ]
        : []),
      { key: 'subtotal', label: 'Imponibile', value: t.subtotal },
      { key: 'tax', label: 'IVA', value: t.tax },
      { key: 'total', label: 'Totale documento', value: t.total, kind: 'total' as const },
    ];
  });

  protected readonly documentTotals = computed(() => {
    this.formValue();
    this.costEntryMode();
    this.vatCodesById();
    const lines = this.lines.controls.map((_line, index) => {
      const amounts = this.lineAmounts(index);
      return {
        netMinor: amounts.net,
        vatMinor: amounts.vat,
        vatRate: this.lineRate(index),
        countsVatInTotal: amounts.affects,
      };
    });
    return computeDocumentTotals(
      lines,
      parseEffectiveDiscountPercent(this.form.controls.documentDiscountPercent.value),
      this.currency,
    );
  });

  protected readonly orderSubtotal = computed<Money>(() => this.documentTotals().subtotal);
  protected readonly orderTax = computed<Money>(() => this.documentTotals().tax);
  protected readonly orderTotal = computed<Money>(() => this.documentTotals().total);

  protected readonly formatMoney = formatMoney;

  // Creazione fornitore inline.
  protected readonly showSupplierForm = signal(false);
  readonly supplierForm = createSupplierFormGroup(this.fb);
  private readonly _savingSupplier = signal(false);
  protected readonly savingSupplier = this._savingSupplier.asReadonly();

  // Pannello "Crea nuovo articolo" (stesso pattern del form Arrivo merce).
  protected readonly productPanelOpen = signal(false);
  protected readonly productPanelLineIndex = signal<number | null>(null);
  protected readonly productPanelPrefill = signal<ProductEmbeddedCreatePrefill | null>(null);
  /** Valorizzato quando il pannello apre la scheda di un articolo esistente. */
  protected readonly productPanelEditProductId = signal<string | null>(null);

  // takeUntilDestroyed() gestisce l'unsubscribe; i campi evitano subscription "ignorate".
  private supplierSubscription: Subscription | null = null;
  private submitSubscription: Subscription | null = null;
  private variantCostSubscription: Subscription | null = null;

  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
  protected readonly saving = computed(() => this._submitState().status === 'saving');
  protected readonly submitError = computed(() => {
    const state = this._submitState();
    return state.status === 'error' ? state.error : null;
  });

  // ── Uscita con modifiche non salvate (pattern Arrivo merce / Ordine cliente) ──
  protected readonly dirtySinceLastSave = signal(false);
  protected readonly exitDialogOpen = signal(false);
  private pendingDeactivate: ((allow: boolean) => void) | null = null;
  /** True durante il patch programmatico del form (caricamento in modifica). */
  private suppressDirtyMarking = false;

  constructor() {
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

    // Cambio sede: la tendina Serie cambia con lei — un contatore legato a una
    // sede è disponibile SOLO lì, e quelli senza sede ovunque (§1-bis).
    this.form.controls.locationId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.numbering.refreshProposal());

    // Cambio data: il numero proposto dipende dalla data (§2), quindi la
    // testata deve rifare l'anteprima — o mostrerebbe il primo libero di OGGI
    // mentre il salvataggio assegna quello della data scelta.
    this.form.controls.orderDate.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.numbering.refreshProposal());

    this.columnPreferences.registerView(
      SUPPLIER_ORDER_LINES_VIEW,
      SUPPLIER_ORDER_LINE_COLUMNS,
      SUPPLIER_ORDER_LINE_PRESETS,
    );

    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.markFormDirty();
    });

    // Numero e serie proposti all'apertura. Su un documento in modifica non
    // fa nulla: lì il numero è assegnato, non proposto.
    this.numbering.refreshProposal();

    // Sola lettura = form disabilitato. Un solo punto invece di una guardia in
    // ogni gestore: lasciare i campi scrivibili e bloccare solo il salvataggio
    // farebbe digitare a vuoto, che è il modo peggiore di dire «non si può».
    effect(() => {
      const locked = this.formReadOnly();
      if (locked && this.form.enabled) {
        this.form.disable({ emitEvent: false });
      } else if (!locked && this.form.disabled) {
        this.form.enable({ emitEvent: false });
      }
    });

    // Nuovo ordine: la modalità costi iniziale viene dalla preferenza operatore
    // per tipo (non da un default fisso). In modifica la sovrascrive l'ordine.
    this.initCostModeForNewOrder();

    this.applyPrefill();
  }

  /**
   * ⭐ **Un ordine nuovo può arrivare già compilato** — oggi dalla Situazione
   * magazzino, che manda fornitore e articoli selezionati (`14` §0.2).
   *
   * ⚠️ **Passa dallo STESSO richiamo articolo del percorso manuale**
   * (`onVariantSelect` → risolutore comune `03c`): descrizione, costo, codice
   * fornitore, IVA e unità di misura non si scrivono qui. Una seconda strada
   * per riempire una riga sarebbe libera di divergere dalla prima, e a
   * divergere comincerebbe il giorno in cui il risolutore cambia.
   *
   * ⚠️ Il form resta **sporco**: è lavoro non salvato, e la guardia
   * «modifiche non salvate» deve proteggerlo come qualunque altro.
   */
  private applyPrefill(): void {
    if (this.isEditMode()) {
      return;
    }
    const prefill = readSupplierOrderPrefill(this.router.getCurrentNavigation()?.extras.state);
    if (!prefill) {
      return;
    }

    this.form.controls.supplierId.setValue(prefill.supplierId);

    // La prima riga esiste già: un ordine nuovo nasce con una riga vuota.
    prefill.variantIds.forEach((variantId, indice) => {
      if (indice > 0) {
        this.addLine();
      }
      this.onVariantSelect(indice, variantId);
    });
  }

  /**
   * ⚠️ Qui la modalità costo partiva dalla preferenza ricordata
   * dell'operatore. Rimosso il 16/08/2026: **i costi partono sempre netti**.
   *
   * Per un'azienda che detrae l'IVA il costo *è* il netto, e l'inserimento
   * ivato resta una comodità del singolo documento — il selettore in testata
   * non è cambiato. Non essendo una convenzione aziendale non ha un default
   * nelle Impostazioni, e non essendo una preferenza non se la ricorda
   * nessuno: un ordine fornitore nuovo riapre sempre in netto.
   *
   * La memoria che c’era finiva per giunta nella tabella dei PREZZI, tradotta
   * da un ponte costo↔prezzo: reggeva solo perché i tipi di acquisto e quelli
   * di vendita non si sovrappongono.
   */
  private initCostModeForNewOrder(): void {
    // Il segnale nasce già `vat_excluded`: non c’è niente da chiedere.
  }

  private markFormDirty(): void {
    if (!this.suppressDirtyMarking) {
      this.dirtySinceLastSave.set(true);
    }
  }

  canDeactivate(): boolean | Promise<boolean> {
    if (!this.dirtySinceLastSave()) {
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

  protected isLineColumnVisible(columnId: string): boolean {
    // ⛔ **Una colonna è visibile solo se QUESTO documento la dichiara.**
    //
    // Le preferenze utente, da sole, su un id che il config non contiene
    // rispondono «visibile»: la riga comune conosce venticinque colonne, un
    // ordine fornitore ne dichiara diciotto, e le altre comparivano accese —
    // col template che cercava `formControlName="unitPrice"` su un gruppo che
    // ha `unitCost`, non `unitPrice`.
    //
    // ⚠️ Non poteva comparire prima: il markup locale rendeva solo le colonne
    // che sapeva di avere. Il config diventa la fonte di verità nel momento in
    // cui la riga è condivisa.
    if (!SUPPLIER_ORDER_LINE_COLUMNS.some((column) => column.id === columnId)) {
      return false;
    }
    return this.columnPreferences.isColumnVisible(
      SUPPLIER_ORDER_LINES_VIEW,
      normalizeSupplierOrderColumnId(columnId),
    );
  }

  /**
   * ⭐ **Le larghezze vengono dal PUNTO COMUNE.** Qui c'erano le quote senza
   * la ridistribuzione: mezzo sistema. La maniglia dell'intestazione comune
   * e' montata `[live]`, quindi la direttiva non disegna niente da sola e
   * aspetta che qualcuno ascolti `resizing` — nessuno ascoltava. Si
   * trascinava senza vedere nulla, e al rilascio la colonna saltava
   * riscalando tutte le altre.
   *
   * Questo documento dichiara solo il proprio catalogo e la propria vista.
   */
  private readonly lineWidths = createLineColumnWidths({
    defs: SUPPLIER_ORDER_LINE_COLUMNS,
    viewId: SUPPLIER_ORDER_LINES_VIEW,
    preferences: this.columnPreferences,
    // ⚠️ **Lo STESSO predicato che passa alla testata e alla riga.** Il banco
    // ne aveva due — uno per il template, uno per le larghezze — e le quote si
    // calcolavano su un insieme di colonne diverso da quello reso: sommavano
    // 116,84%. Se qui e nel template le domande divergono, la geometria
    // sbaglia in silenzio.
    isVisible: (id) => this.isLineColumnVisibleFn(id as DocumentLineColumnId),
    host: this.host,
    normalizeId: normalizeSupplierOrderColumnId,
  });

  protected lineColumnWidth(columnId: string): string {
    return this.lineWidths.width(columnId);
  }

  protected lineIndexColumnWidth(): string {
    return this.lineWidths.indexWidth();
  }

  protected onLineColumnResizing(columnId: string, renderedWidthPx: number): void {
    this.lineWidths.onResizing(columnId, renderedWidthPx);
  }

  protected onLineColumnResize(columnId: string, renderedWidthPx: number): void {
    this.lineWidths.onResize(columnId, renderedWidthPx);
  }

  protected toggleCostModeMenu(): void {
    this.costModeMenuOpen.update((open) => !open);
  }

  /**
   * Cambio netto/ivato: cambia SOLO come si guardano i costi, mai quanto
   * valgono. I campi si ridisegnano dal netto canonico, che non viene toccato.
   *
   * Prima non faceva né l'una né l'altra cosa: cambiava il significato del
   * numero senza cambiare il numero. Lo stesso «5,02» a schermo passava da
   * lordo a netto, e l'ordine al fornitore valeva d'improvviso il 22% in meno
   * senza che nulla si muovesse sotto gli occhi di chi stava compilando.
   */
  protected selectCostMode(mode: PurchaseCostEntryMode): void {
    this.costModeMenuOpen.set(false);
    if (mode === this.costEntryMode()) {
      return;
    }
    // Lo switch netto/ivato non vive nel form: va marcato a mano.
    this.markFormDirty();
    // Scelta manuale: la preferenza non deve più sovrascrivere.
    this.costEntryModeTouched = true;
    this.costEntryMode.set(mode);
    this.redrawCostFields();
  }

  /** Vista denormalizzata della variante di riga per le colonne display. */
  protected lineSummary(index: number): VariantSummary | null {
    const variantId = this.lines.at(index)?.controls.variantId.value;
    if (!variantId) {
      return null;
    }
    return findVariantSummaryById(variantId, this.pinnedVariants(), this.searchedVariants());
  }

  // ── Celle codice: quattro chiavi di ricerca, un solo comportamento ─────────
  //
  // Cod. articolo, SKU, EAN e Cod. fornitore si digitano per CERCARE l'articolo.
  // Alla conferma si prova il richiamo esatto; se non c'è riscontro il testo
  // resta lì — è il dato che finirà in anagrafica se l'articolo va creato.

  /** La riga è agganciata a un articolo di anagrafica? */
  protected lineHasLinkedProduct(index: number): boolean {
    return Boolean(this.lines.at(index)?.controls.variantId.value);
  }

  protected onLineCodeChange(index: number, field: LineCodeField, value: string): void {
    this.lines.at(index)?.controls[field].setValue(value);
    // Ogni carattere digitato invalida una scelta rimasta aperta: si riferiva
    // al valore di prima.
    this.codeLookup.clear();
    this.markFormDirty();
  }

  protected onLineCodeFocus(index: number, field: LineCodeField): void {
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

  /** Esc chiude la scelta aperta da un codice, senza toccare i dati di riga. */
  protected onLineSearchEscape(_index: number): void {
    this.codeLookup.clear();
  }

  /**
   * Conferma di un codice (Tab/Invio): si confronta col catalogo per
   * corrispondenza esatta, e gli esiti sono TRE — una aggancia, più d'una apre
   * la scelta, nessuna lascia il valore scritto e la riga prosegue (quello che
   * si è digitato resta la bozza dell'articolo da creare).
   *
   * Fino a 08/2026 si passava da `resolveVariantIdByCode`, che restituisce
   * `string | null` e **non può esprimere «eccone tre»**: scarta i candidati al
   * proprio interno, quindi un codice giusto ma condiviso tornava `null` e
   * finiva in silenzio, indistinguibile da un codice inesistente. È il caso più
   * frequente proprio qui, dove si digitano i codici del fornitore.
   *
   * ⚠️ Non si filtra più per il fornitore della testata: era ciò che faceva
   * riconoscere lo stesso codice in un documento e ignorarlo in un altro, ed è
   * anche il motivo per cui il caso ambiguo non si presentava mai. Il dettaglio
   * sta in `DocumentCodeLookupService`.
   *
   * Se la riga è già agganciata non si cerca: si passa al campo successivo. Un
   * richiamo qui resetterebbe la riga, e non è quello che chiede chi sta solo
   * attraversando i campi.
   */
  protected commitCodeLookup(index: number, field: LineCodeField, advance = true): void {
    const line = this.lines.at(index);
    if (!line || line.controls.variantId.value) {
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
    this.codeLookupService
      .resolve(code, field)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((outcome) => {
        if (outcome.kind === 'one') {
          // Agganciando da Cod. fornitore, il codice digitato È quello con cui
          // si aggancia: va tenuto nella riga, non sostituito.
          this.onVariantSelect(
            index,
            outcome.variantId,
            field === 'supplierCode' ? code : undefined,
          );
          this.codeLookup.clear();
          this.focusLineField(index, 'quantity');
          return;
        }
        if (outcome.kind === 'many') {
          this.codeLookup.open(index, field, outcome.matches);
          return;
        }
        // Col Tab si prosegue; con Invio si resta (§4.5): qui la cella è
        // ancora un campo, quindi «restare» è possibile.
        this.codeLookup.clear();
        if (advance) {
          this.focusNextLineField(index, field);
        }
      });
  }

  /** La scelta aperta da un codice: la voce presa aggancia la riga. */
  protected onCodeSuggestionPick(index: number, variantId: string): void {
    // Da leggere PRIMA di chiudere: dopo, il campo d'origine non c'è più.
    const linkedWith =
      this.codeLookup.field() === 'supplierCode'
        ? this.lines.at(index)?.controls.supplierCode.value.trim()
        : undefined;
    this.onVariantSelect(index, variantId, linkedWith);
    this.codeLookup.clear();
    this.focusLineField(index, 'quantity');
  }

  /** Scollega l'articolo lasciando i codici digitati: la riga torna bozza. */
  /**
   * Prezzi di vendita dell'articolo, in sola lettura.
   *
   * Vengono dall'ANAGRAFICA, non dalla riga: su un ordine al fornitore non c'è
   * un prezzo di vendita da decidere, si guarda al più quello che l'articolo ha
   * già. Per questo la colonna è spenta di default e la cella non è editabile —
   * affiancare al costo un altro numero monetario modificabile sarebbe un
   * invito a scrivere il valore sbagliato nella colonna sbagliata.
   */
  protected lineCatalogPrice(index: number, field: 'sellingPrice' | 'compareAtPrice'): string {
    const money = this.lineSummary(index)?.[field];
    return money ? formatMoney(money) : '—';
  }

  protected lineStock(index: number, field: 'stockOnHand' | 'stockAvailable'): string {
    const summary = this.lineSummary(index);
    const value = summary?.[field];
    return value == null ? '—' : String(value);
  }

  protected lineMoney(index: number): Money {
    this.formValue();
    return { amountMinor: this.lineAmounts(index).net, currencyCode: this.currency };
  }

  /**
   * Apre la scheda del fornitore intestatario. Mancava del tutto in questa
   * maschera mentre c'era in Arrivo merce e, per il cliente, in Ordine cliente:
   * divergenza rimasta lì, non differenza di documento — un ordine fornitore ha
   * un fornitore come gli altri hanno la loro controparte.
   */
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

  protected onSupplierSelect(value: string | null): void {
    this.form.controls.supplierId.setValue(value ?? '');
    this.form.controls.supplierId.markAsTouched();
  }

  //
  /** "Mostra avviso" (anagrafica fornitore): banner alla selezione. */
  protected readonly supplierDocumentAlert = computed(() => {
    const supplierId = this.formValue()?.supplierId;
    if (!supplierId) {
      return '';
    }
    const supplier = this.suppliers().find((entry) => entry.id === supplierId);
    return supplier?.documentCreationAlert?.trim() ?? '';
  });

  // ── Testata mobile (doc-form--m-ref): computed SOLO display ──────────────
  /** Titolo del pannello: nome del fornitore scelto, o invito alla scelta. */
  protected readonly supplierPanelTitle = computed(() => {
    this.formValue();
    const supplierId = this.form.controls.supplierId.value;
    return (
      this.supplierOptions().find((option) => option.value === supplierId)?.label ??
      'Fornitore e date'
    );
  });

  /** Riepilogo sotto il titolo: data · consegna prevista · riferimento. */
  protected readonly supplierPanelSummaryParts = computed<readonly string[]>(() => {
    this.formValue();
    const orderDate = this.form.controls.orderDate.value;
    const expectedAt = this.form.controls.expectedAt.value;
    const reference = this.form.controls.supplierReference.value.trim();
    const parts: string[] = [orderDate ? formatItalianInputDate(orderDate) : 'Data non indicata'];
    if (expectedAt) {
      parts.push(`Consegna ${formatItalianInputDate(expectedAt)}`);
    }
    if (reference) {
      parts.push(`Rif. ${reference}`);
    }
    return parts;
  });

  /** Dot verde quando il fornitore (unico obbligatorio di testata) c'è. */
  protected readonly supplierPanelReady = computed(() => {
    this.formValue();
    return Boolean(this.form.controls.supplierId.value);
  });

  /**
   * Prima la testata, come nell'Ordine cliente e nell'Arrivo merce: finché il
   * fornitore manca le righe non si mostrano.
   *
   * Qui la ragione non è tecnica — un ordine fornitore non muove giacenze e non
   * ha una location, quindi le righe si potrebbero calcolare lo stesso. È una
   * ragione di documento: fra le colonne c'è **«Cod. fornitore»**, cioè «il
   * codice con cui QUEL fornitore chiama questo articolo». Poterlo scrivere
   * prima di aver detto chi è il fornitore è la scritta senza il suo soggetto.
   *
   * Il cancello sul documento risolve la cosa meglio di un cancello sulla sola
   * colonna: una regola per tutte e tre le maschere invece di un'eccezione da
   * ricordare.
   */
  protected readonly headerGateActive = computed(() => !this.supplierPanelReady());

  /** Titolo dello stato vuoto: dice cosa manca, non che manca qualcosa. */
  protected readonly linesEmptyTitle = computed(() =>
    this.headerGateActive() ? 'Scegli il fornitore' : 'Nessuna riga inserita',
  );

  protected readonly linesEmptyDescription = computed(() =>
    this.headerGateActive()
      ? "Le righe si aggiungono dopo: fra le colonne c'è il codice con cui il fornitore chiama l'articolo, e prima va detto quale fornitore."
      : 'Cerca un articolo o aggiungi una riga.',
  );

  /** Riga di stato dentro il pannello: dice cosa manca. */
  protected readonly supplierPanelStatus = computed(() =>
    this.supplierPanelReady() ? 'Dati principali completi.' : 'Il fornitore è obbligatorio.',
  );

  // ── Cella nome prodotto: ricerca, non tendina ─────────────────────────────
  //
  // Fino a oggi qui c'era un `app-select-menu`: una tendina da cui scegliere un
  // articolo. L'Ordine cliente e l'Arrivo merce hanno invece la cella condivisa
  // — si digita il nome, si sceglie da un elenco che si apre sotto, e se
  // l'articolo non esiste il testo digitato resta lì e diventa il nome del
  // prodotto da creare. Il documento funzionale dice che la riga dell'ordine
  // fornitore è quella dell'Ordine cliente: la tendina era la divergenza.

  protected lineSuggestions(index: number): readonly VariantSummary[] {
    return this.productSuggest.suggestionsFor(index, this.suggestInputs(index));
  }

  protected lineSuggestionsOpen(index: number): boolean {
    return this.productSuggest.isOpenOn(index, this.suggestInputs(index));
  }

  private suggestInputs(index: number) {
    return { hasLinked: this.lineHasLinkedProduct(index), searched: this.searchedVariants() };
  }

  /** Testo mostrato al posto del campo quando la riga è agganciata. */
  /**
   * L'etichetta della variante di una riga, per la colonna che la mostra.
   *
   * ⛔ Non si ricava dal titolo per differenza dal nome: arriva dal risolutore
   * quando l'articolo entra, e dall'ORDINE quando la riga si ricarica — cioe'
   * fotografata, non ricostruita.
   */
  protected variantLabelOf(index: number): string {
    return this.lines.at(index)?.controls.variantLabel.value ?? '';
  }

  protected linkedProductLabel(index: number): string {
    const line = this.lines.at(index);
    if (!line) {
      return '';
    }
    // ⛔ Nessun ripiego su `title`: il titolo del catalogo CONTIENE la
    // variante, quindi ripiegarci sopra la rimette dentro il nome — a schermo,
    // dove sembra giusto. Se il nome è vuoto la cella resta vuota, ed è
    // corretto: vuol dire che la riga non ha ancora un articolo.
    return line.controls.productName.value.trim();
  }

  protected onLineProductNameChange(index: number, value: string): void {
    this.lines.at(index)?.controls.productName.setValue(value);
    this.productSuggest.focusLine(index);
    this.variantSearchDraft.set(value);
    // Ogni carattere invalida una scelta di codici rimasta aperta: si riferiva
    // al valore di prima.
    this.codeLookup.clear();
    this.markFormDirty();
  }

  protected onLineProductFocus(index: number): void {
    this.productSuggest.focusLine(index);
    this.variantSearchDraft.set(this.lines.at(index)?.controls.productName.value ?? '');
  }

  protected onLineProductBlur(index: number): void {
    this.productSuggest.blurLine(index);
  }

  protected onProductSuggestionPick(index: number, variantId: string): void {
    this.productSuggest.clear();
    this.onVariantSelect(index, variantId);
    this.focusLineField(index, 'quantity');
  }

  protected onProductSuggestionNavigate(direction: 'next' | 'prev'): void {
    const index = this.productSuggest.lineIndex();
    if (index === null) {
      return;
    }
    this.productSuggest.navigate(direction, this.lineSuggestions(index).length);
  }

  protected openLineProductSearch(index: number): void {
    const line = this.lines.at(index);
    const term = line?.controls.productName.value.trim() ?? '';
    const summary = this.lineSummary(index);
    this.lineSearchPanel.openForLine(
      index,
      documentSearchLaunchTerm({
        linked: this.lineHasLinkedProduct(index),
        name: term,
        // L'ordine fornitore non tiene i codici sulla riga: li ha il riepilogo
        // dell'articolo agganciato.
        sku: summary?.sku,
        articleCode: summary?.articleCode,
        barcode: summary?.barcode,
      }),
    );
  }

  protected closeLineProductSearch(): void {
    this.lineSearchPanel.close();
  }

  /**
   * «Crea articolo» dal pannello di ricerca. La riga che ha aperto il pannello
   * porta già i dati digitati: la scheda nuova nasce precompilata con quelli.
   *
   * Il pannello si chiude e l'anagrafica si apre **sopra** il documento, che
   * resta dov'è con quel che si è scritto finora: nessuna via porta fuori
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
      this.openProductCreate(index);
    }
  }

  /** Apri la scheda di un articolo trovato, senza aggiungerlo alla riga. */
  protected onProductSearchDetail(productId: string): void {
    const index = this.lineSearchPanel.lineIndex();
    this.closeLineProductSearch();
    if (index !== null) {
      this.productPanelPrefill.set(null);
      this.productPanelEditProductId.set(productId);
      this.productPanelLineIndex.set(index);
      this.productPanelOpen.set(true);
    }
  }

  protected onLineProductSearchPick(variantId: string): void {
    const index = this.lineSearchPanel.lineIndex();
    if (index !== null) {
      this.onVariantSelect(index, variantId);
      this.focusLineField(index, 'quantity');
    }
    this.closeLineProductSearch();
  }

  /** «Apri anagrafica» su riga agganciata: la scheda dell'articolo collegato. */
  /** Tornati dalla scheda: la riga rilegge l'articolo, che può essere cambiato. */
  protected onProductUpdatedFromPanel(): void {
    const index = this.productPanelLineIndex();
    const variantId = index !== null ? this.lines.at(index)?.controls.variantId.value : null;
    if (index !== null && variantId) {
      this.applyVariantToLine(index, variantId);
    }
    this.closeProductPanel();
  }

  /**
   * `linkedWith` è il codice fornitore digitato con cui l'articolo si è
   * agganciato. Passarlo è l'unico modo perché arrivi fin qui: l'aggancio
   * riceve l'id della variante, e «con quale codice» si perderebbe per strada.
   */
  protected onVariantSelect(index: number, value: string | null, linkedWith?: string): void {
    // Il precedente si legge PRIMA: dopo il setValue sarebbe uguale a quello
    // richiesto, e «stesso articolo» e «articolo cambiato» diventerebbero
    // indistinguibili a valle.
    const precedente = this.lines.at(index)?.controls.variantId.value || null;
    const control = this.lines.at(index).controls.variantId;
    control.setValue(value ?? '');
    control.markAsTouched();
    if (value) {
      this.applyVariantToLine(index, value, linkedWith, precedente);
    }
  }

  /**
   * Le voci per una riga: quelle attive più, se serve, il codice già scelto su
   * questa riga anche se nel frattempo è stato disattivato. Senza, riaprendo un
   * ordine di mesi fa la cella IVA risulterebbe vuota — e al salvataggio
   * successivo il codice sparirebbe davvero. È la stessa protezione che le altre
   * due maschere avevano già.
   */
  protected lineVatOptions(index: number): readonly SelectMenuOption[] {
    return vatOptionsIncludingSelected(
      this.vatCodeOptionsBase(),
      this.lines.at(index)?.controls.vatCodeId.value,
      this.vatCodesById(),
    );
  }

  /** Sulla cella si legge il codice; il resto sta qui, come nelle altre due. */
  protected lineVatTooltip(index: number): string {
    const vatCode = this.vatCodesById().get(this.lines.at(index)?.controls.vatCodeId.value ?? '');
    return vatCode ? vatCodeOptionLabel(vatCode) : 'Nessun Codice IVA';
  }

  protected onLineVatSelect(index: number, value: string | null): void {
    this.lines.at(index).controls.vatCodeId.setValue(value ?? '');
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

  // ── Il ponte verso la RIGA COMUNE ────────────────────────────────────────
  //
  // ⭐ L'Ordine fornitore non ha più un proprio `<tr>`: 20 `<th>` e 19 `<td>`
  // scritti a mano sono diventati due componenti condivise, e le sei colonne
  // che gli mancavano sono entrate nel CATALOGO comune con la loro identità.

  protected readonly isLineColumnVisibleFn = (column: DocumentLineColumnId): boolean =>
    this.isLineColumnVisible(column);

  protected readonly lineColumnWidthFn = (column: DocumentLineColumnId): string =>
    this.lineColumnWidth(column);

  protected readonly lineColumnMinWidthFn = (column: DocumentLineColumnId): number =>
    this.lineWidths.minWidth(column);

  protected lineGroup(index: number): FormGroup {
    return this.lines.at(index);
  }

  /**
   * Quale card di riga è aperta: **una sola**, e lo stato è del DOCUMENTO.
   *
   * ⛔ Stava dentro l'involucro locale, che quindi non poteva chiudere le
   * sorelle: su un ordine da venti righe si arrivava a venti corpi aperti
   * insieme, e la card chiusa smetteva di essere la vista compatta che è il suo
   * unico motivo di esistere. Se ne è andato con lui.
   */
  private readonly cardAperte = new DocumentLineCardOpenStore();

  protected isLineCardOpen(index: number): boolean {
    return this.cardAperte.isOpen(index);
  }

  protected toggleLineCard(index: number): void {
    this.cardAperte.toggle(index);
  }

  /** Quello che la testata della card mostra: il calcolo è comune. */
  protected lineCardHead(index: number): DocumentLineCardHead {
    return documentLineCardHead(this.lineRowView(index), this.lineGroup(index));
  }

  /**
   * La quantità è cambiata col passo della striscia.
   *
   * ⚠️ Il valore l'ha già scritto la striscia, rispettando il minimo: qui resta
   * solo ciò che la maschera sa e lei no — che il documento è cambiato.
   */
  protected onLineQuantityStep(): void {
    this.markFormDirty();
  }

  protected onRowSortToggled(column: DocumentLineColumnId): void {
    if (this.isLineColumnSortable(column)) {
      this.toggleLineSort(column as SupplierOrderLineSortColumn);
    }
  }

  /**
   * Ciò che la riga comune deve MOSTRARE, già calcolato da chi lo possiede.
   *
   * ⭐ Il costo con la sua modalità netto/ivato, i canonici, la catena IVA
   * dell'acquisto restano qui: il markup non ne sa nulla e non deve saperne.
   */
  protected lineRowView(index: number): DocumentLineRowView {
    return {
      ...DOCUMENT_LINE_ROW_VIEW_VUOTA,
      complete: this.lineRowComplete(index),
      linked: Boolean(this.lines.at(index)?.controls.variantId.value),
      linkedArticleCode: this.lines.at(index)?.controls.articleCode.value ?? '',
      quantityInvalid: this.lineFieldInvalid(index, 'quantity'),
      productInvalid: this.lineFieldInvalid(index, 'variantId'),
      stockOnHand: this.lineStock(index, 'stockOnHand'),
      stockAvailable: this.lineStock(index, 'stockAvailable'),
      discountedCost: this.lineDiscountedCost(index),
      // ⭐ I prezzi d'anagrafica in SOLA LETTURA: questa maschera li mostra per
      // far vedere a quanto si vende cio' che si sta comprando, ma non li
      // scrive — quella facolta' e' dell'Arrivo merce.
      sellingPrice: this.lineCatalogPrice(index, 'sellingPrice'),
      compareAtPrice: this.lineCatalogPrice(index, 'compareAtPrice'),
      lineTotal: this.formatMoney(this.lineMoney(index)),
      vatOptions: this.lineVatOptions(index),
      vatValue: this.lines.at(index)?.controls.vatCodeId.value ?? '',
      vatTooltip: this.lineVatTooltip(index),
      unitValue: this.lines.at(index)?.controls.unitOfMeasure.value ?? '',
      articleCodeSuggest: {
        items: this.codeLookup.matchesFor(index, 'articleCode'),
        open: this.codeLookup.isOpenOn(index, 'articleCode'),
        activeIndex: this.codeLookup.activeIndex(),
      },
      skuSuggest: {
        items: this.codeLookup.matchesFor(index, 'sku'),
        open: this.codeLookup.isOpenOn(index, 'sku'),
        activeIndex: this.codeLookup.activeIndex(),
      },
      barcodeSuggest: {
        items: this.codeLookup.matchesFor(index, 'barcode'),
        open: this.codeLookup.isOpenOn(index, 'barcode'),
        activeIndex: this.codeLookup.activeIndex(),
      },
      supplierCodeSuggest: {
        items: this.codeLookup.matchesFor(index, 'supplierCode'),
        open: this.codeLookup.isOpenOn(index, 'supplierCode'),
        activeIndex: this.codeLookup.activeIndex(),
      },
      productSuggest: {
        items: this.lineSuggestions(index),
        open: this.lineSuggestionsOpen(index),
        activeIndex: this.productSuggest.activeIndex(),
      },
    };
  }

  /** Riga completa: quella incompleta prende la classe che la segna. */
  protected lineRowComplete(index: number): boolean {
    const line = this.lines.at(index);
    if (!line) {
      return true;
    }
    const raw = line.getRawValue();
    const vuota =
      !raw.variantId.trim() &&
      !raw.articleCode.trim() &&
      !raw.sku.trim() &&
      !raw.barcode.trim() &&
      !raw.productName.trim();
    return vuota || (Boolean(raw.variantId.trim()) && Number(raw.quantity) > 0);
  }

  /** Il campo dice quale codice è cambiato: la riga non conosce i gestori. */
  protected onRowCodeChanged(index: number, event: DocumentLineFieldEvent<string>): void {
    if (
      event.field === 'articleCode' ||
      event.field === 'sku' ||
      event.field === 'barcode' ||
      event.field === 'supplierCode'
    ) {
      this.onLineCodeChange(index, event.field, event.value);
    }
  }

  protected onRowSuggestionPicked(index: number, event: DocumentLineSuggestionPick): void {
    if (event.field === 'product') {
      this.onProductSuggestionPick(index, event.variantId);
      return;
    }
    this.onCodeSuggestionPick(index, event.variantId);
  }

  protected onRowSuggestionNavigated(
    event: DocumentLineFieldEvent<DocumentLineSuggestionDirection>,
  ): void {
    if (event.field === 'product') {
      this.onProductSuggestionNavigate(event.value);
      return;
    }
    this.codeLookup.navigate(event.value);
  }

  protected addLine(): void {
    this.lines.push(this.createLine());
  }

  // ── Tab e Invio deterministici fra i campi della riga ─────────────────────
  //
  // L'ordine segue le COLONNE VISIBILI, non i campi esistenti: nascondere una
  // colonna dal tasto Colonne deve toglierla anche dal giro del Tab, altrimenti
  // il fuoco sparisce in una cella che non si vede.

  /**
   * Il giro del fuoco. Il meccanismo vive in `domain/`; qui restano le nove cose
   * che differiscono.
   *
   * ⚠️ **«Nome prodotto» NON è nel giro, ed è una correzione.** Era elencato e
   * puntava a `po-product-{i}`, **identificativo che non esiste in nessun
   * template**: quella cella è un `app-select-menu`, che non ha `inputId` né
   * fuoco pubblico. Il risultato era che da «Cod. fornitore» il fuoco si
   * perdeva a metà giro. Torna quando la cella verrà sostituita (specifica
   * §4.3-bis) — finché non c'è un campo su cui atterrare, elencarlo significa
   * solo far morire il fuoco.
   */
  protected readonly lineFocus = new DocumentLineFocusStore<LineFocusField>({
    fields: SUPPLIER_ORDER_LINE_FOCUS_FIELDS,
    elementId: (index, field) =>
      ({
        articleCode: `po-code-${index}`,
        sku: `po-sku-${index}`,
        barcode: `po-barcode-${index}`,
        supplierCode: `po-suppcode-${index}`,
        product: `po-product-${index}`,
        quantity: `po-qty-${index}`,
        unitOfMeasure: `po-uom-${index}`,
        unitCost: `po-cost-${index}`,
        discount: `po-discount-${index}`,
        vat: `po-vat-${index}`,
      })[field],
    isFieldEnabled: (index, field) => {
      // Su riga agganciata i codici sono bloccati: restano i dati.
      if (this.lineHasLinkedProduct(index) && CODE_FOCUS_FIELDS.includes(field as LineCodeField)) {
        return false;
      }
      return this.isLineColumnVisible(field);
    },
    // Difetto chiuso: `advanceToNextLine` non guardava la sola-lettura, e questa
    // maschera non ha nemmeno il `<fieldset [disabled]>` che protegge le altre
    // due — su documento bloccato il Tab AGGIUNGEVA righe.
    isReadOnly: () => this.formReadOnly(),
    lineCount: () => this.lines.length,
    createLine: () => {
      this.addLine();
      this.markFormDirty();
    },
    onRowChange: (_index, then) => {
      setTimeout(then);
    },
    // Voce 9, che qui NON esisteva e andava scritta: «riga vuota» in Ordine
    // fornitore significa nessun articolo selezionato. È ciò che impedisce a ↓
    // e al Tab di impilare righe vuote in fondo.
    isLineEmpty: (index) => !this.lines.at(index)?.controls.variantId.value,
    removeLine: (index) => this.removeLine(index),
  });

  protected focusLineField(index: number, field: LineFocusField): void {
    this.lineFocus.focusField(index, field);
  }

  protected focusNextLineField(index: number, current: LineFocusField): void {
    this.lineFocus.next(index, current);
  }

  /**
   * Apre il pannello anagrafica prodotto per la riga, precompilato con quello
   * che l'operatore ha già digitato. È l'unica eccezione alla regola «il costo
   * di riga è solo informazione»: qui l'articolo non esiste ancora, e il valore
   * digitato DIVENTA il costo d'acquisto in anagrafica.
   *
   * Proprio per questo il prefill prende il NETTO canonico, non il valore
   * mostrato: il prezzo d'acquisto della scheda articolo è netto e non ha un
   * selettore netto/ivato, quindi passargli il valore letto con «Costo ivato»
   * attivo salverebbe in anagrafica un costo gonfiato dell'IVA.
   *
   * Snapshot al click, così il pannello resta stabile mentre lo si compila.
   */
  protected openProductCreate(index: number): void {
    const line = this.lines.at(index);
    if (!line) {
      return;
    }
    // ⛔ Riga già agganciata: si parte PULITI.
    //
    // I campi della riga sono quelli dell'articolo che c'è già — nome, SKU, EAN.
    // Copiarli in una scheda nuova produce un doppione vestito coi codici di un
    // altro: al salvataggio o sbatte contro l'unicità dello SKU, o nasce un
    // gemello. «Crea» non eredita mai l'identità di un articolo esistente.
    if (line.controls.variantId.value) {
      this.productPanelPrefill.set(null);
      this.productPanelEditProductId.set(null);
      this.productPanelLineIndex.set(index);
      this.productPanelOpen.set(true);
      return;
    }
    const netMinor = this.lineUnitNetMinor(index);
    const typedName = line.controls.productName.value.trim() || this.variantSearchDraft().trim();
    this.productPanelPrefill.set({
      name: typedName || undefined,
      articleCode: line.controls.articleCode.value.trim() || undefined,
      sku: line.controls.sku.value.trim() || undefined,
      barcode: line.controls.barcode.value.trim() || undefined,
      unitOfMeasure: line.controls.unitOfMeasure.value.trim() || undefined,
      defaultVatCodeId: line.controls.vatCodeId.value.trim() || null,
      // Punto di uscita verso l'anagrafica: due decimali, come ogni importo che
      // smette di essere calcolato e diventa qualcosa che qualcuno legge.
      // ⛔ Qui `netMinor > 0 ? … : null` trattava un costo ZERO come «nessun
      // costo». Zero è un costo (`regole-gestionale`), e va scritto.
      purchasePriceMajor: roundToMinor(netMinor) / 100,
    });
    this.productPanelEditProductId.set(null);
    this.productPanelLineIndex.set(index);
    this.productPanelOpen.set(true);
  }

  protected closeProductPanel(): void {
    this.productPanelOpen.set(false);
    this.productPanelLineIndex.set(null);
    this.productPanelPrefill.set(null);
    this.productPanelEditProductId.set(null);
  }

  /** Variante appena creata dal pannello: la collega alla riga di origine. */
  protected onProductCreatedFromPanel(event: { readonly variantId: string }): void {
    const lineIndex = this.productPanelLineIndex();
    if (lineIndex != null) {
      this.onVariantSelect(lineIndex, event.variantId);
    }
    this.closeProductPanel();
  }

  /** "Salva senza aggiungere": prodotto creato ma non collegato alla riga. */
  protected onProductSavedWithoutAttach(_event: { readonly variantId: string }): void {
    this.closeProductPanel();
  }

  /**
   * Richiamo di un articolo su una riga: la riga si RESETTA e prende i dati
   * dell'articolo. Dove l'articolo non ha un valore, il campo torna vuoto.
   *
   * Non è un riempimento dei buchi: il richiamo dell'articolo è la fonte, e
   * quello che c'era prima era una bozza. Riempire solo i campi vuoti lascerebbe
   * sulla riga i resti di un articolo diverso — il costo di prima accanto al
   * nome di adesso — e nessuno se ne accorgerebbe.
   *
   * La quantità torna a 1: si sta ordinando quell'articolo, e almeno un pezzo lo
   * si vuole. L'unica eccezione al reset è il Codice IVA: se l'articolo ne ha
   * uno si prende quello, e SOLO se non ce l'ha si ripiega sul predefinito —
   * lasciare una riga senza IVA le farebbe calcolare imposta zero in silenzio.
   */
  private applyVariantToLine(
    index: number,
    variantId: string,
    linkedWith?: string,
    precedente: string | null = null,
  ): void {
    const line = this.lines.at(index);
    if (!line) {
      return;
    }
    // Il variantId PRECEDENTE, letto prima che `onVariantSelect` lo abbia
    // sovrascritto: è ciò che distingue «stesso articolo, richiamato di nuovo»
    // da «articolo sostituito». Arriva da chi chiama, perché qui il controllo
    // porta già quello nuovo.
    const applyFromSummary = (summary: VariantSummary | null): void => {
      if (!summary || line.controls.variantId.value !== variantId) {
        return;
      }
      const quiet = { emitEvent: false } as const;

      // ⭐ Il richiamo articolo passa dal RISOLUTORE COMUNE (`03c`): le
      // assegnazioni non si scrivono più a mano, una maschera alla volta.
      const esito = this.lineArticles.resolveWithSummary({
        articolo: summary,
        policy: this.policyRichiamo(),
        contesto: this.contestoRichiamo(linkedWith),
        riga: {
          variantIdPrecedente: precedente,
          rigaPersistita: Boolean(line.controls.id.value),
          // Lo sconto DIGITATO: passandolo, il risolutore non ci scrive sopra.
          // Ometterlo lo farebbe considerare vuoto, e al posto di «lo sconto si
          // azzera» avremmo «lo sconto diventa un altro» — più difficile da
          // notare.
          scontoCorrente: line.controls.discount.value,
        },
      });
      if (esito.esito !== 'risolto') {
        return;
      }
      const valori = esito.valori;
      // ⛔ Chiave ASSENTE significa «non toccare», mai «svuota». È la
      // differenza che tiene in piedi il costo mascherato dai permessi: a chi
      // non vede i costi il risolutore non produce la chiave, e il valore già
      // sulla riga resta dov'è invece di essere azzerato da chi non poteva
      // nemmeno leggerlo.
      const scrivi = (
        controllo: { setValue(v: string, o: typeof quiet): void },
        valore: string | undefined,
      ): void => {
        if (valore !== undefined) {
          controllo.setValue(valore, quiet);
        }
      };

      scrivi(line.controls.articleCode, valori.articleCode);
      scrivi(line.controls.sku, valori.sku);
      scrivi(line.controls.barcode, valori.barcode);
      // ⚠️ La seconda fonte del codice fornitore MANCA ancora: questa maschera
      // non carica i collegamenti articolo↔fornitore di testata, quindi il
      // contesto porta `codiceFornitoreDiTestata: null` e agganciando per
      // nome/SKU/EAN il campo resta vuoto. Vuoto è corretto, non ottimale —
      // adottare il risolutore non chiude da solo quella lacuna.
      scrivi(line.controls.supplierCode, valori.codiceFornitore);
      // ⛔ `nomeProdotto`, MAI un ripiego su `title`: il titolo è il display
      // completo e contiene la variante, quindi ripiegarci sopra la rimette
      // dentro il nome proprio nel caso in cui nessuno se ne accorge.
      scrivi(line.controls.productName, valori.nomeProdotto);
      scrivi(line.controls.variantLabel, valori.variantLabel);
      scrivi(line.controls.unitOfMeasure, valori.unitaDiMisura);

      // ⛔ Quantità e sconto NON si toccano, ed è un cambiamento voluto.
      //
      // Qui c'erano `orderedQuantity.setValue(1)` e `discountPercent.setValue('')`,
      // senza condizioni: si eseguivano a OGNI chiamata. Il caso che faceva
      // perdere dati era il rientro dal pannello anagrafica
      // (`onProductUpdatedFromPanel`), che richiama lo STESSO articolo: la
      // quantità digitata tornava a 1 e lo sconto spariva su un articolo che
      // non era cambiato.
      //
      // La quantità non compare nell'uscita del risolutore per contratto: la
      // scrive il livello di acquisizione, l'unico a sapere se si sta
      // aggiungendo una riga o sommando a una esistente. Lo sconto proposto
      // arriva solo su campo vuoto (qui mai: il fornitore non ne porta uno).
      scrivi(line.controls.discount, valori.sconto);

      // ⚠️ Il Codice IVA PRIMA del costo, e l'ordine è portante: con «Costo
      // ivato» `costFieldValue` legge l'aliquota DELLA RIGA per rendere il
      // netto d'anagrafica. Scrivendo il costo prima, si mostrerebbe un valore
      // calcolato sull'aliquota di prima.
      if (valori.codiceIva !== undefined) {
        line.controls.vatCodeId.setValue(valori.codiceIva ?? '', quiet);
      }

      // Il costo d'anagrafica è NETTO: diventa il canonico della riga, e il
      // campo lo mostra netto o ivato secondo il selettore.
      //
      // ⚠️ Il risolutore dà un NUMERO, zero compreso; la maschera distingue
      // «costo zero» da «costo assente» perché l'avviso «salvata senza costo»
      // si decide sul campo vuoto. La traduzione 0 → vuoto è del consumer, non
      // del contratto.
      if (valori.costoUnitarioNettoMinor !== undefined) {
        const purchaseNet = valori.costoUnitarioNettoMinor;
        line.controls.unitCostNetMinor.setValue(purchaseNet > 0 ? purchaseNet : null, quiet);
        line.controls.unitCost.setValue(
          purchaseNet > 0 ? this.costFieldValue(purchaseNet, index) : '',
          quiet,
        );
      }

      // Un solo giro esplicito dopo le scritture: i setValue silenziosi non
      // rimbalzerebbero su totali e celle derivate. Un giro per campo, su una
      // tabella che può avere decine di righe, costerebbe caro.
      this.lines.updateValueAndValidity();
    };

    const known = findVariantSummaryById(variantId, this.pinnedVariants(), this.searchedVariants());
    if (known) {
      applyFromSummary(known);
      return;
    }
    this.variantCostSubscription = this.productService
      .searchVariantSummaries({ variantId })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // Nessun pin a mano: `pinnedVariants` si ricarica da solo quando cambia
        // l'elenco delle varianti di riga, che è cambiato assegnando variantId.
        next: (rows) => applyFromSummary(rows[0] ?? null),
      });
  }

  /**
   * Le capacità del richiamo articolo su questa maschera.
   *
   * ⚠️ `costiVisibili` si legge dal PERMESSO reale, non si cabla: con `false`
   * la chiave `costoUnitarioNettoMinor` non viene prodotta, e il costo
   * dell'articolo smetterebbe di arrivare sulla riga — senza errore, solo un
   * campo che resta vuoto. Con `true` a chi non vede i costi, il risolutore
   * proporrebbe un costo mascherato.
   *
   * `shopifyAttivo: false` invece è corretto cablato: il profilo
   * `acquisto-ordine` non porta il prezzo Shopify, quindi non c'è nulla da
   * togliere.
   */
  private policyRichiamo(): PolicyRichiamoArticolo {
    return {
      famigliaIva: PROFILI_RIGA_DOCUMENTO['acquisto-ordine'].famigliaIva,
      campi: campiEffettivi('acquisto-ordine', {
        shopifyAttivo: false,
        costiVisibili: this.canSeeCosts(),
      }),
    };
  }

  /**
   * Il contesto del richiamo: quello che la TESTATA sa e la riga no.
   *
   * ⛔ Due valori restano `null` di proposito, e non sono dimenticanze:
   *
   * - `codiceIvaControparte` — il fornitore di questa maschera non porta un
   *   Codice IVA d'anagrafica. Passarne uno inventato cambierebbe l'aliquota
   *   di ogni riga senza che nessuno l'abbia chiesto;
   * - `codiceFornitoreDiTestata` — la maschera non carica i collegamenti
   *   articolo↔fornitore (lacuna già dichiarata). Riempirlo con
   *   `summary.supplierSku` reintrodurrebbe il codice di **un fornitore
   *   qualsiasi** su un documento indirizzato a un fornitore preciso.
   *
   * Lo sconto della controparte è `null` per la stessa ragione del primo: non
   * esiste uno sconto di fornitore in anagrafica da proporre.
   */
  private contestoRichiamo(linkedWith?: string): ContestoRichiamoArticolo {
    return {
      // Nessun selettore di listino: comprando non esiste un listino del
      // fornitore da applicare alla riga.
      listino: 'article',
      codiciIvaPerId: new Map(this.purchaseVatCodes().map((vatCode) => [vatCode.id, vatCode])),
      codiceIvaControparte: null,
      codiceIvaPredefinito: this.defaultPurchaseVatCodeId() || null,
      scontoControparte: null,
      codiceFornitoreDigitato: linkedWith ?? null,
      codiceFornitoreDiTestata: null,
    };
  }

  /**
   * Codice IVA predefinito per gli acquisti, usato quando l'articolo non ne
   * porta uno proprio. Se il tenant non ne ha marcato nessuno resta vuoto: è
   * meglio una tendina da compilare che un'aliquota scelta a caso.
   */
  private defaultPurchaseVatCodeId(): string {
    return this.purchaseVatCodes().find((vatCode) => vatCode.isDefault)?.id ?? '';
  }

  protected removeLine(index: number): void {
    if (this.lines.length > 1) {
      this.lines.removeAt(index);
      // Da qui in giù ogni indice scala di uno: l'apertura non lo segue.
      this.cardAperte.closeAll();
    }
  }

  /**
   * Trascinamento riga (§7.2). Non chiede conferma, a differenza del riordino
   * per colonna: e' un movimento singolo e visibile, e chi lo fa sa cosa sta
   * facendo. L'avviso serve a chi ribalta tutto in un colpo.
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
    this.cardAperte.closeAll();
    this.markFormDirty();
    this.lines.updateValueAndValidity();
  }

  protected fieldInvalid(name: 'supplierId' | 'orderDate'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  /**
   * Il campo tiene ferme le righe: obbligatorio, ancora vuoto, e finché resta
   * così il documento non ha righe da compilare. Distinto da `fieldInvalid`,
   * che dice «hai provato a salvare e questo è sbagliato»: aprire un documento
   * nuovo non è un errore, è l'inizio del lavoro.
   */
  protected fieldWaiting(): boolean {
    this.formValue();
    return this.headerGateActive();
  }

  protected lineFieldInvalid(index: number, name: 'variantId' | 'quantity'): boolean {
    const control = this.lines.at(index).controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  /**
   * Costo ERRATO: illeggibile o negativo. Rosso e messaggio, perché blocca.
   *
   * Il campo **vuoto** non è più un errore da quando il costo non è
   * obbligatorio (11/08/2026): `parseMoneyInput('')` torna `null`, e questa
   * regola lo leggeva come «importo non valido» — un rosso da errore su un
   * documento che si salva benissimo. Il vuoto ha la sua tinta, sotto.
   */
  protected unitCostInvalid(index: number): boolean {
    const control = this.lines.at(index).controls.unitCost;
    if (!control.touched && !control.dirty) {
      return false;
    }
    if (!control.value.trim()) {
      return false;
    }
    const parsed = parseMoneyInput(control.value, this.currency);
    return control.invalid || parsed === null || parsed.amountMinor < 0;
  }

  /**
   * Costo che MANCA su una riga con un articolo: si segna in ambra, la tinta
   * del campo in attesa (`--color-field-waiting`, regole-stile-ui §5) — non in
   * rosso. Il rosso vuol dire «hai sbagliato»; qui non è sbagliato niente, il
   * documento si salva e al salvataggio l'avviso lo dice.
   *
   * Solo su righe con articolo: su una riga vuota non manca niente.
   */
  protected unitCostMissing(index: number): boolean {
    const line = this.lines.at(index);
    if (!line?.controls.variantId.value) {
      return false;
    }
    return !line.controls.unitCost.value.trim();
  }

  /**
   * Sconto di riga a cascata, come sull'Arrivo merce: «4+10%» è 4%, poi 10% su
   * quel che resta, cioè 13,6% — non 14. Sugli acquisti gli sconti a cascata
   * dei fornitori sono la norma, non un caso limite.
   *
   * Invalido solo se il testo non contiene NESSUNO sconto leggibile: il parser
   * scarta le parti che non sa leggere, quindi un moltiplicatore pieno a fronte
   * di un campo non vuoto significa che l'operatore ha scritto qualcosa che il
   * documento non applicherebbe.
   */
  protected discountInvalid(index: number): boolean {
    const control = this.lines.at(index).controls.discount;
    if (!control.touched && !control.dirty) {
      return false;
    }
    return this.discountValueInvalid(control.value);
  }

  /**
   * La regola dello sconto vive qui e basta: la cella rossa e il messaggio che
   * blocca il salvataggio devono dire la stessa cosa, e due copie della stessa
   * condizione prima o poi divergono.
   */
  private discountValueInvalid(value: string): boolean {
    const raw = value.trim();
    if (!raw) {
      return false;
    }
    return cascadeDiscountMultiplier(raw) >= 1 && parseEffectiveDiscountPercent(raw) === 0;
  }

  protected toggleSupplierForm(): void {
    this.showSupplierForm.update((open) => !open);
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
          this.suppliersReload.update((tick) => tick + 1);
          this.form.controls.supplierId.setValue(supplier.id);
        },
        error: (err: unknown) => {
          // Numero già preso: avviso di presa d'atto, non una scelta. Il
          // messaggio nomina il numero rifiutato e il primo libero.
          const conflict = documentNumberConflictOf(err);
          if (conflict) {
            this._submitState.set({ status: 'idle' });
            this.numberConflictDialog.open(conflict);
            return;
          }
          this._savingSupplier.set(false);
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  /** Avvisi non bloccanti mostrati dopo il salvataggio. */
  protected readonly saveWarnings = signal<readonly string[]>([]);

  /**
   * Righe salvate senza costo: si AVVISA, non si blocca. Stesse parole
   * dell'Arrivo merce — è lo stesso avviso sullo stesso dato, e due formulazioni
   * diverse per la stessa cosa sono la divergenza di domani.
   */
  private missingCostWarnings(): readonly string[] {
    const righe: string[] = [];
    for (let index = 0; index < this.lines.length; index += 1) {
      const line = this.lines.at(index);
      if (!line?.controls.variantId.value) {
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

  /**
   * Controllo cronologico (§4) davanti a ogni salvataggio: il pulsante, il
   * dialogo di uscita e la conclusione ordine passano tutti da `submit`.
   */
  /**
   * ⛔ Qui c'era un parametro `onSaved`, e lo passava UN solo chiamante:
   * «Salva e chiudi» del dialogo d'uscita. Tolto quel pulsante (decisione del
   * proprietario, 24/08/2026), il parametro non aveva piu' chiamanti e il suo
   * ramo dentro `subscribe` era codice morto che scavalcava la navigazione
   * normale dopo il salvataggio.
   */
  protected submit(): void {
    this.chronology.run(() => this.submitNow());
  }

  /**
   * ⭐ **Un documento aperto ha sempre una riga su cui scrivere.**
   *
   * ⛔ Difetto visto a schermo dal proprietario il 25/08/2026: premuto Ctrl+S su
   * un ordine appena aperto, la riga spariva e compariva un errore — restando
   * senza righe e senza un modo per aggiungerne, se non il pulsante in cima.
   *
   * ⚠️ La causa non e' il salvataggio: e' che `dropTrailingEmptyLines()` toglie
   * le righe vuote PRIMA di validare — e deve farlo, altrimenti la riga seminata
   * all'apertura impedirebbe di salvare un documento vuoto. Quando poi il
   * salvataggio non parte, la maschera resta spoglia.
   *
   * ⭐ Il payload non cambia: quando questa gira, e' gia' stato costruito.
   */
  private ensureAtLeastOneLine(): void {
    if (this.formReadOnly() || this.lines.length > 0) {
      return;
    }
    this.addLine();
  }

  private submitNow(): void {
    if (this.saving()) {
      return;
    }
    this.dropTrailingEmptyLines();
    const problem = this.validationProblem();
    if (problem) {
      this.form.markAllAsTouched();
      // L'errore si mostra SEMPRE, non solo quando il salvataggio arriva dal
      // dialogo di uscita. Prima il pulsante «Salva ordine» marcava i campi e
      // usciva zitto: con le colonne che scorrono in orizzontale il campo
      // incriminato può stare fuori schermo, quindi all'operatore non succedeva
      // letteralmente nulla e non c'era modo di capire perché.
      this._submitState.set({
        status: 'error',
        error: { kind: AppErrorKind.Validation, message: problem },
      });
      this.ensureAtLeastOneLine();
      return;
    }
    const raw = this.form.getRawValue();
    const lines = raw.lines.map((line, index) => {
      // ⛔ Qui si leggeva anche `this.lineSummary(index)`, e serviva SOLO al
      // ripiego `description: … || summary?.title`. Tolto quello, il catalogo
      // non ha più voce in capitolo su cosa si salva: la riga porta i suoi
      // valori, fotografati quando l'articolo è entrato.
      // Al server va il valore ESATTO nella modalità corrente, non quello
      // arrotondato che si legge nel campo: il netto canonico può portare la
      // coda di uno scorporo, e mandare i due decimali che si vedono la
      // butterebbe via proprio nel passaggio che deve conservarla. Il server
      // rifà lo scorporo esatto e ottiene lo stesso netto (§sei decimali).
      const net = line.unitCostNetMinor ?? 0;
      const enteredUnitCostMinor = this.showsGross(index)
        ? toStorableMinor(grossFromNetExact(net, this.lineRate(index)))
        : toStorableMinor(net);
      return {
        // L’identità della riga viaggia col payload: assente su una riga
        // nuova, presente su una già salvata. È ciò che permette al server di
        // aggiornarla invece di ricrearla — e sostituire l’articolo NON la
        // cambia, resta la stessa riga.
        id: line.id ?? undefined,
        variantId: line.variantId,
        // Il nome scritto sulla RIGA, non il titolo del catalogo (11/08/2026).
        // Da quando la cella è modificabile anche ad articolo agganciato, quel
        // testo è la descrizione di questa riga — mandare il titolo del
        // catalogo la butterebbe via nell'unico passaggio che doveva
        // conservarla, e in silenzio: il documento si sarebbe riaperto col nome
        // di prima.
        //
        // ⛔ Qui c'era `|| summary?.title`, ed era il ripiego che PERSISTEVA:
        // il titolo contiene la variante, quindi una riga senza nome proprio
        // scriveva «Maglia — M / Rosso» nella colonna `description`. Gli altri
        // due ripieghi su `title` si vedevano a schermo; questo finiva nel
        // database, dove nessuno lo guardava più.
        description: line.productName.trim() || undefined,
        // L'etichetta della variante viaggia nel payload: qui il server non
        // può conservarla per id, perché il salvataggio ricrea le righe.
        variantLabel: line.variantLabel.trim() || undefined,
        orderedQuantity: Number(line.quantity),
        enteredUnitCostMinor,
        // La cascata si risolve QUI, una volta: al documento va la percentuale
        // effettiva, che è quella che i totali hanno mostrato all'operatore.
        discountPercent: line.discount.trim()
          ? parseEffectiveDiscountPercent(line.discount)
          : undefined,
        vatCodeId: line.vatCodeId || undefined,
        // La colonna esisteva in maschera e non nel database: si modificava, si
        // salvava, si riapriva e la modifica era sparita. Ora il valore parte.
        unitOfMeasure: line.unitOfMeasure.trim() || undefined,
      };
    });

    const body = {
      supplierId: raw.supplierId,
      series: this.numbering.chosenSeries(),
      // Vedi `DocumentNumberingStore`: la proposta NON torna indietro come
      // imposizione. Viaggia solo il numero che l'operatore ha digitato.
      number: this.numbering.imposedNumber(),
      orderDate: raw.orderDate ? new Date(raw.orderDate).toISOString() : undefined,
      expectedAt: raw.expectedAt ? new Date(raw.expectedAt).toISOString() : undefined,
      // ⛔ **Su un ordine Concluso lo stato NON viaggia.** Il campo è bloccato,
      //    quindi il controllo porta un valore che l’operatore non ha scelto:
      //    mandarlo farebbe rifiutare il salvataggio dalla macchina comune, e
      //    l’ordine non sarebbe più modificabile in nulla (`17` §5.3).
      //
      // ⚠️ Il confronto con `Concluded` non è ridondante rispetto a
      //    `isStateLocked()`: è ciò che RESTRINGE il tipo, e senza il
      //    compilatore accetterebbe di mandare uno stato che l’API rifiuta.
      status: this.isStateLocked() || raw.status === OrderState.Concluded ? undefined : raw.status,
      // Sede di destinazione della merce (§1-bis). `null` — non `undefined` —
      // per la stessa ragione dei campi qui sotto: in modifica l'assenza vuol
      // dire «lascialo com'è», e togliere la sede non la toglierebbe davvero.
      destinationLocationId: raw.locationId || null,
      supplierReference: raw.supplierReference.trim() || undefined,
      // `null` — non `undefined`. In modifica l'assenza significa «lascialo
      // com'è», quindi svuotare un campo e salvare non lo cancellerebbe.
      documentDiscountPercent: parseEffectiveDiscountPercent(raw.documentDiscountPercent),
      costEntryMode: this.costEntryMode(),
      currency: this.currency,
      lines,
    };

    const editId = this.editOrderId();
    this._submitState.set({ status: 'saving' });

    // Raccolti PRIMA dell'invio: dopo, le righe possono essere state riadottate
    // dal server e il confronto non direbbe più cosa aveva scritto l'operatore.
    const avvisi = this.missingCostWarnings();
    const request$ = editId
      ? this.orderService.updateOrder(editId, body)
      : this.orderService.createOrder(body);

    this.submitSubscription = request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (order) => {
        // Ordine salvato: il guard di uscita non deve più fermare la navigazione.
        this.dirtySinceLastSave.set(false);
        this._submitState.set({ status: 'idle' });
        this.saveWarnings.set(avvisi);
        if (editId) {
          // Salvato: il documento torna PROTETTO. Lo sblocco valeva per la
          // modifica appena conclusa, non per tutta la sessione — chi vuole
          // rimetterci mano lo sblocca di nuovo.
          //
          // Niente ricostruzione del form dal documento salvato: `lines.clear()`
          // e i FormGroup rifatti facevano vedere ad Angular una collezione
          // tutta nuova (`track line` è per identità), che rispondeva con
          // NG0956 distruggendo e ricreando l'intera tabella. I valori a schermo
          // sono già quelli che abbiamo appena inviato, quindi non c'era niente
          // da riprendere: solo un giro di DOM buttato via.
          this.editLock.relock(editId);
          return;
        }
        // Primo salvataggio: si RESTA nel documento appena creato. Salvare non
        // è uscire — l'operatore in genere continua a lavorarci. Cambia solo
        // l'URL, da /new a /:id/edit, così un ricaricamento non perde il
        // documento e un secondo salvataggio aggiorna invece di crearne un
        // altro. `replaceUrl` toglie /new dalla cronologia: il tasto Indietro
        // deve tornare alla lista, non a una maschera vuota.
        //
        // E si BLOCCA, come dopo ogni salvataggio: la regola è una sola, e non
        // cambia fra creazione e modifica. L'ordine appena creato non viene
        // sbloccato, quindi la rotta nuova lo carica protetto — chi vuole
        // rimetterci mano lo sblocca, con lo stesso gesto di sempre.
        void this.router.navigate([this.listPath, order.id, 'edit'], { replaceUrl: true });
      },
      error: (err: unknown) => {
        this._submitState.set({ status: 'error', error: this.toAppError(err) });
        this.ensureAtLeastOneLine();
      },
    });
  }

  protected reload(): void {
    this.loadTick.update((tick) => tick + 1);
  }

  private patchFormFromOrder(order: SupplierOrder): void {
    // Patch programmatico: non è una modifica dell'utente.
    this.suppressDirtyMarking = true;
    try {
      this.applyOrderToForm(order);
    } finally {
      this.suppressDirtyMarking = false;
    }
  }

  private applyOrderToForm(order: SupplierOrder): void {
    this._savedStatus.set(order.status);
    this.form.patchValue({
      supplierId: order.supplierId,
      documentNumber: order.number ?? null,
      series: order.series ?? '',
      orderDate: order.orderDate ? order.orderDate.slice(0, 10) : todayIsoDate(),
      expectedAt: order.expectedAt ? order.expectedAt.slice(0, 10) : '',
      // ⚠️ Un ordine Concluso non entra nel controllo (accetta i tre
      //    scegliibili) e non deve: il campo è in sola lettura, e il
      //    salvataggio non manda uno stato che l’operatore non ha scelto.
      status:
        order.status === SupplierOrderStatus.Concluded
          ? OrderState.Confirmed
          : (order.status ?? OrderState.Confirmed),
      locationId: order.destinationLocationId ?? '',
      supplierReference: order.supplierReference ?? '',
      // Il campo lavora sul solo giorno: la colonna è una `date`, ma in JSON
      // arriva come istante (`…T00:00:00.000Z`).
      documentDiscountPercent: order.documentDiscountPercent
        ? String(order.documentDiscountPercent).replace('.', ',')
        : '',
    });
    // Prima che la tendina si ridisegni: se il tipo è stato eliminato, è
    // questa etichetta a ricostruirne l'opzione.
    this.costEntryMode.set(order.costEntryMode);
    this.cardAperte.closeAll();
    this.lines.clear();
    for (const line of order.lines) {
      // La riga riparte dal costo NETTO canonico, non da quello digitato: il
      // netto porta la coda dello scorporo, il digitato è già passato per i due
      // decimali. Ricostruire da lì significherebbe perdere il centesimo esatto
      // nel momento in cui l'ordine si riapre — cioè dove il difetto si vedeva.
      const group = this.createLine();
      group.patchValue(
        {
          // L'id della riga salvata: serve a distinguere, in questa sessione
          // di modifica, le righe dell'ordine da quelle appena aggiunte.
          id: line.id,
          variantId: line.variantId,
          productName: line.description ?? '',
          // L'etichetta FOTOGRAFATA sull'ordine, non quella dell'anagrafica di
          // adesso. Vuota sulle righe salvate prima della colonna: lì la
          // variante è impastata nella descrizione, e riscriverla
          // significherebbe riscrivere un ordine già emesso.
          variantLabel: line.variantLabel ?? '',
          sku: line.sku ?? '',
          // Il CONTROLLO si chiama `quantity`, come in ogni altra maschera; il
          // campo del DTO resta `orderedQuantity`, che è il nome nel modello.
          quantity: line.orderedQuantity,
          unitCostNetMinor: line.unitCost.amountMinor,
          discount:
            line.discountPercent > 0 ? formatDiscountPercentValue(line.discountPercent) : '',
          vatCodeId: line.vatCodeId ?? '',
          // La fotografia salvata sulla riga, non l'unità dell'anagrafica di
          // adesso: è il punto in cui l'ordine riaperto dice quello che diceva.
          unitOfMeasure: line.unitOfMeasure ?? '',
        },
        { emitEvent: false },
      );
      this.lines.push(group);
    }
    // I campi costo si scrivono dopo il push: `costFieldValue` legge l'aliquota
    // dalla riga, che deve già stare nel FormArray al suo indice.
    this.redrawCostFields();
    if (this.lines.length === 0) {
      this.lines.push(this.createLine());
    }
  }

  /**
   * Ritorno alla lista (chip «← Ordini Fornitori» e pulsante Annulla): con
   * modifiche non salvate la conferma appare SEMPRE, direttamente dal
   * pulsante — il guard di route resta attivo per back del browser e
   * navigazioni esterne (sidebar, ricerca globale).
   */
  protected cancel(): void {
    if (this.dirtySinceLastSave()) {
      this.exitDialogOpen.set(true);
      this.pendingDeactivate = (allow) => {
        if (allow) {
          this.navHistory.backOr(this.listPath);
        }
      };
      return;
    }
    this.navHistory.backOr(this.listPath);
  }

  /**
   * Cosa impedisce il salvataggio, detto all'operatore nei suoi termini: quale
   * riga e quale campo. Un «controlla i campi obbligatori» generico costringe a
   * cercare, e su una tabella che scorre in orizzontale il campo può non essere
   * nemmeno visibile.
   *
   * Ritorna `null` quando si può salvare.
   */
  private validationProblem(): string | null {
    if (this.form.controls.supplierId.invalid) {
      return 'Manca il fornitore: sceglilo in testata.';
    }
    if (this.form.controls.orderDate.invalid) {
      return 'Manca la data del documento.';
    }
    for (let index = 0; index < this.lines.length; index++) {
      const line = this.lines.at(index);
      const riga = `Riga ${index + 1}`;
      if (line.controls.variantId.invalid) {
        return `${riga}: manca l'articolo. Cercalo per codice, SKU, EAN o codice fornitore, oppure crealo dalla riga.`;
      }
      const quantity = Number(line.controls.quantity.value);
      if (!Number.isInteger(quantity) || quantity < 1) {
        return `${riga}: la quantità deve essere un numero intero maggiore di zero.`;
      }
      // ⛔ Il costo MANCANTE non blocca più (11/08/2026, decisione del
      // proprietario). Un ordine si fa spesso al volo, senza il listino del
      // fornitore sotto mano, e un costo assente non rompe niente: la riga vale
      // zero finché non lo si scrive. Al salvataggio si avvisa, e basta.
      //
      // Era anche un blocco che qualcuno non poteva superare: chi non ha il
      // permesso «Visualizza costi d'acquisto» riceve dal server le varianti
      // senza costo, quindi il campo gli resta vuoto — e gli si chiedeva di
      // scrivere un numero che non gli è dato vedere.
      const cost = parseMoneyInput(line.controls.unitCost.value, this.currency);
      if (cost !== null && cost.amountMinor < 0) {
        return `${riga}: il costo non può essere negativo.`;
      }
      if (this.discountValueInvalid(line.controls.discount.value)) {
        return `${riga}: lo sconto non è leggibile. Usa «10» oppure «4+10» per gli sconti a cascata.`;
      }
    }
    return null;
  }

  private createLine() {
    return this.fb.group({
      /**
       * L'id della riga già salvata.
       *
       * ⚠️ **Non sopravvive al salvataggio**: l'update è `deleteMany` +
       * `create`, quindi ogni salvataggio ricrea le righe con id nuovi. Serve
       * a sapere, DENTRO una sessione di modifica, se una riga viene
       * dall'ordine o l'ha appena aggiunta l'operatore — è ciò che il
       * risolutore chiede come `rigaPersistita`.
       *
       * ⛔ Non si deriva da `isEditMode()`: in modifica anche le righe appena
       * aggiunte risulterebbero persistite, e la segnalazione
       * «articolo sostituito su riga salvata» scatterebbe a vuoto.
       */
      id: this.fb.control<string | null>(null),
      variantId: this.fb.control('', { validators: [Validators.required] }),
      // Le quattro chiavi di identità dell'articolo. Non sono campi
      // informativi: si digitano per CERCARE l'articolo, e quando l'articolo non
      // esiste ancora sono il dato che finisce in anagrafica.
      articleCode: this.fb.control(''),
      sku: this.fb.control(''),
      barcode: this.fb.control(''),
      supplierCode: this.fb.control(''),
      productName: this.fb.control(''),
      /**
       * L'etichetta della VARIANTE: «M / Rosso». Colonna sua, non impastata
       * dentro il nome.
       *
       * ⚠️ Viaggia NEL PAYLOAD: qui il server non può conservare l'etichetta
       * persistita confrontando l'id, perché il salvataggio è `deleteMany` +
       * `create` e le righe l'id lo perdono. La fotografa la maschera quando
       * l'articolo entra nella riga, come `unitOfMeasure` qui sotto.
       */
      variantLabel: this.fb.control(''),
      unitOfMeasure: this.fb.control(''),
      quantity: this.fb.control(1, {
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      /**
       * Il campo del costo è una VISTA: contiene il netto o l'ivato secondo il
       * selettore di testata, ed è quello che l'operatore legge e digita.
       */
      // Senza `required`: il costo mancante è un avviso, non un blocco (§sopra).
      unitCost: this.fb.control(''),
      /**
       * Il costo NETTO canonico in unità minori, con la coda dello scorporo.
       * È il valore vero della riga: `unitCost` si ridisegna da qui, mai il
       * contrario. Vive nel gruppo e non in un signal per indice perché così
       * segue la riga quando la si aggiunge o elimina — un indice separato
       * si disallineerebbe al primo riordino.
       */
      unitCostNetMinor: this.fb.control<number | null>(null),
      discount: this.fb.control(''),
      vatCodeId: this.fb.control(''),
    });
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
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
    const indices = trailingEmptyLineIndices(
      this.lines.length,
      (index) => !this.lines.at(index)?.controls.variantId.value,
    );
    if (indices.length === 0) {
      return;
    }
    for (const index of indices) {
      this.lines.removeAt(index, { emitEvent: false });
    }
    this.lines.updateValueAndValidity();
  }
}
