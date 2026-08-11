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

import { NavigationHistoryService } from '@core/services/navigation-history.service';
import type { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import { AuthService } from '@core/auth';
import { canViewPurchaseCosts } from '@core/permissions/tenant-permissions.util';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Money } from '@core/models/common.model';
import { DocumentType } from '@core/models/document.model';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import type { SupplierOrder } from '@core/models/supplier-order.model';
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
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { EditLockBannerComponent } from '@shared/components/edit-lock-banner/edit-lock-banner.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { TableViewId } from '@shared/table-columns/table-column.model';
import { TableColumnResizeDirective } from '@shared/directives/table-column-resize.directive';
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
import { DocumentLineCodeCellComponent } from '@domain/documents/components/document-line-code-cell/document-line-code-cell.component';
import { DocumentLineProductCellComponent } from '@domain/documents/components/document-line-product-cell/document-line-product-cell.component';
import { DocumentProductSearchPanelComponent } from '@domain/documents/components/document-product-search-panel/document-product-search-panel.component';
import { findVariantSummaryById } from '@domain/products/utils/variant-summary-search.util';

import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentEditLockService } from '@domain/documents/services/document-edit-lock.service';
import { DocumentCodeLookupService } from '@domain/documents/services/document-code-lookup.service';
import { DocumentCodeLookupStore } from '@domain/documents/state/document-code-lookup.store';
import { DocumentProductSuggestStore } from '@domain/documents/state/document-product-suggest.store';
import { DocumentLineSortStore } from '@domain/documents/state/document-line-sort.store';
import {
  sortByLineValue,
  type DocumentLineSortKind,
} from '@domain/documents/utils/document-line-sort.util';
import { DocumentLineFocusStore } from '@domain/documents/state/document-line-focus.store';
import {
  supplierCodeForDocumentLine,
  type DocumentLineCodeField,
} from '@domain/documents/utils/document-code-match.util';
import { DocumentMobilePanelComponent } from '@domain/documents/components/document-mobile-panel/document-mobile-panel.component';
import {
  grossFromNetExact,
  grossFromNetMinor,
  lineVatFromNetExact,
  netFromGrossExact,
} from '@domain/documents/utils/document-vat.util';

import { SupplierOrderService } from '@domain/supplier-orders/services/supplier-order.service';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import { SupplierFormFieldsComponent } from '@domain/suppliers/components/supplier-form-fields/supplier-form-fields.component';
import {
  createSupplierFormGroup,
  mapSupplierFormToInput,
  resetSupplierFormGroup,
} from '@domain/suppliers/utils/supplier-form.util';
import { FirstClickSelectsDirective } from '@shared/directives/first-click-selects.directive';
import { CdkDrag, CdkDragHandle, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

const VARIANT_SEARCH_DEBOUNCE_MS = 300;
const VARIANT_SEARCH_MIN_CHARS = 2;

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

type LineFocusField =
  LineCodeField | 'product' | 'quantity' | 'unitOfMeasure' | 'unitCost' | 'discount';

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
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    FirstClickSelectsDirective,
    ReactiveFormsModule,
    BackButtonComponent,
    ButtonComponent,
    DateInputComponent,
    SelectMenuComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    TableColumnPickerComponent,
    TableColumnResizeDirective,
    SupplierFormFieldsComponent,
    SlidePanelComponent,
    ProductFormComponent,
    DocumentMobilePanelComponent,
    DocumentLineCodeCellComponent,
    DocumentLineProductCellComponent,
    DocumentProductSearchPanelComponent,
    ConfirmDialogComponent,
    EditLockBannerComponent,
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
  private readonly supplierService = inject(SupplierService);
  private readonly productService = inject(ProductService);
  private readonly codeLookupService = inject(DocumentCodeLookupService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly paymentOptionsService = inject(PaymentOptionsService);
  private readonly documentService = inject(DocumentService);
  private readonly router = inject(Router);
  private readonly navHistory = inject(NavigationHistoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly columnPreferences = inject(TableColumnPreferenceService);
  // Il lookup da scanner non serve più qui: questa maschera non ha lettore, e
  // la conferma dei codici passa ora da `DocumentCodeLookupService`.
  private readonly editLock = inject(DocumentEditLockService);

  protected readonly lineColumnsView = TableViewId.SupplierOrderLines;

  protected readonly listPath = '/app/orders';
  protected readonly currency = DEFAULT_CURRENCY;

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly editOrderId = computed(() => this.paramMap().get('id'));
  protected readonly isEditMode = computed(() => Boolean(this.editOrderId()));

  private readonly loadTick = signal(0);
  private readonly loadRequest = computed(() => ({
    id: this.editOrderId(),
    tick: this.loadTick(),
  }));

  private readonly loadState = toSignal(
    toObservable(this.loadRequest).pipe(
      switchMap(({ id }) => {
        if (!id) {
          return of<'ready' | 'loading' | 'not-found' | 'error'>('ready');
        }
        return this.orderService.getSupplierOrderById(id).pipe(
          map((order) => {
            if (order.status !== SupplierOrderStatus.Confirmed) {
              return 'not-found' as const;
            }
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

  /** Anteprima numerazione dal numeratore supplier_order (solo creazione). */
  protected readonly nextReferencePreview = toSignal(
    this.orderService.getMeta().pipe(
      map((meta) => meta.nextReferencePreview),
      catchError(() => of('')),
    ),
    { initialValue: '' },
  );

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
  protected readonly vatCodeOptions = computed<readonly SelectMenuOption[]>(() => [
    { value: '', label: '—' },
    ...this.purchaseVatCodes().map((vatCode) => ({
      value: vatCode.id,
      label: vatCodeOptionLabel(vatCode),
    })),
  ]);
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

  private readonly lineSortKinds: Readonly<
    Record<SupplierOrderLineSortColumn, DocumentLineSortKind>
  > = {
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
        return Number(raw.orderedQuantity) || 0;
      case 'unitCost':
        return raw.unitCost;
      case 'discount':
        return raw.discountPercent;
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

  // Pannello di ricerca articolo aperto dalla lente della cella nome.
  protected readonly productSearchPanelOpen = signal(false);
  protected readonly productSearchLineIndex = signal<number | null>(null);
  protected readonly productSearchLaunchTerm = signal('');
  protected readonly productSearchLaunchSeq = signal(0);

  private readonly searchedVariants = toSignal(
    toObservable(this.variantSearchDraft).pipe(
      debounceTime(VARIANT_SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
      switchMap((search) => {
        const term = search.trim();
        if (term.length < VARIANT_SEARCH_MIN_CHARS) {
          return of([] as readonly VariantSummary[]);
        }
        return this.productService.searchVariantSummaries({ search: term, pageSize: 30 });
      }),
    ),
    { initialValue: [] as readonly VariantSummary[] },
  );

  readonly form = this.fb.group({
    supplierId: this.fb.control('', { validators: [Validators.required] }),
    orderDate: this.fb.control(todayIsoDate(), { validators: [Validators.required] }),
    expectedAt: this.fb.control(''),
    supplierReference: this.fb.control(''),
    lines: this.fb.array([this.createLine()]),
  });

  protected get lines(): FormArray<ReturnType<SupplierOrderFormComponent['createLine']>> {
    return this.form.controls.lines;
  }

  private readonly selectedVariantIds = toSignal(
    this.form.controls.lines.valueChanges.pipe(
      startWith(this.form.getRawValue().lines),
      map((lines) => [...new Set(lines.map((line) => line.variantId).filter(Boolean))]),
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
    const qty = Number(line.controls.orderedQuantity.value);
    const unitNet = this.lineUnitNetMinor(index);
    if (!Number.isFinite(qty) || unitNet <= 0) {
      return { net: 0, vat: 0, affects: false };
    }
    const vatCode = this.vatCodesById().get(line.controls.vatCodeId.value);
    const affects = vatCode?.vatAffectsSupplierTotal ?? false;
    const rate = this.lineRate(index);

    const netExact = qty * unitNet * cascadeDiscountMultiplier(line.controls.discountPercent.value);
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
    const discountedNet = applyCascadeDiscountMinor(unitNet, line.controls.discountPercent.value);
    return formatMoney({
      amountMinor: this.showsGross(index)
        ? grossFromNetMinor(discountedNet, this.lineRate(index))
        : discountedNet,
      currencyCode: this.currency,
    });
  }

  protected readonly orderSubtotal = computed<Money>(() => {
    this.formValue();
    this.costEntryMode();
    this.vatCodesById();
    const amount = this.lines.controls.reduce(
      (sum, _line, index) => sum + this.lineAmounts(index).net,
      0,
    );
    return { amountMinor: amount, currencyCode: this.currency };
  });

  protected readonly orderTax = computed<Money>(() => {
    this.formValue();
    this.costEntryMode();
    this.vatCodesById();
    const amount = this.lines.controls.reduce((sum, _line, index) => {
      const amounts = this.lineAmounts(index);
      return sum + (amounts.affects ? amounts.vat : 0);
    }, 0);
    return { amountMinor: amount, currencyCode: this.currency };
  });

  protected readonly orderTotal = computed<Money>(() => ({
    amountMinor: this.orderSubtotal().amountMinor + this.orderTax().amountMinor,
    currencyCode: this.currency,
  }));

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
    this.columnPreferences.registerView(
      SUPPLIER_ORDER_LINES_VIEW,
      SUPPLIER_ORDER_LINE_COLUMNS,
      SUPPLIER_ORDER_LINE_PRESETS,
    );

    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.markFormDirty();
    });

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
  }

  /**
   * Modalità costi iniziale del nuovo ordine fornitore: eredita l'ultima scelta
   * dell'operatore per questo tipo documento (preferenza ricordata lato backend).
   * Non tocca la modifica di un ordine esistente né una scelta manuale già fatta.
   */
  private initCostModeForNewOrder(): void {
    if (this.editOrderId() || this.costEntryModeTouched) {
      return;
    }
    this.documentService
      .getPriceModePreference(DocumentType.SupplierOrder)
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

  /** «Salva e chiudi» dal dialogo: salva l'ordine e prosegue l'uscita. */
  protected confirmExitSaveOrder(): void {
    this.submit(() => {
      this.exitDialogOpen.set(false);
      this.pendingDeactivate?.(true);
      this.pendingDeactivate = null;
    });
  }

  protected isLineColumnVisible(columnId: string): boolean {
    return this.columnPreferences.isColumnVisible(
      SUPPLIER_ORDER_LINES_VIEW,
      normalizeSupplierOrderColumnId(columnId),
    );
  }

  private lineColumnPx(columnId: string): number {
    const normalizedId = normalizeSupplierOrderColumnId(columnId);
    const def = SUPPLIER_ORDER_LINE_COLUMNS.find((col) => col.id === normalizedId);
    const fallback = def?.defaultWidthPx ?? 96;
    return this.columnPreferences.columnWidth(SUPPLIER_ORDER_LINES_VIEW, normalizedId, fallback);
  }

  /** Somma delle sole colonne visibili: è il 100% di cui ciascuna prende una quota. */
  private lineColumnsTotalPx(): number {
    return SUPPLIER_ORDER_LINE_COLUMNS.reduce(
      (total, def) =>
        this.isLineColumnVisible(def.id) ? total + this.lineColumnPx(def.id) : total,
      0,
    );
  }

  /**
   * Larghezza colonna come QUOTA percentuale del totale, come nell'Ordine
   * cliente: la tabella occupa sempre esattamente il 100% del contenitore.
   *
   * Coi pixel assoluti la tabella restava larga quanto la somma delle colonne e
   * SCORREVA invece di adattarsi — misurato: 1410px contro un contenitore da
   * 1398, con la colonna Totale che finiva fuori. I pixel salvati dal
   * ridimensionamento non si perdono: diventano pesi relativi.
   */
  protected lineColumnWidth(columnId: string): string {
    const totale = this.lineColumnsTotalPx();
    if (totale <= 0) {
      return 'auto';
    }
    return `${((this.lineColumnPx(columnId) / totale) * 100).toFixed(4)}%`;
  }

  protected onLineColumnResize(columnId: string, widthPx: number): void {
    this.columnPreferences.setColumnWidth(
      SUPPLIER_ORDER_LINES_VIEW,
      normalizeSupplierOrderColumnId(columnId),
      widthPx,
    );
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

  protected lineDisplay(
    index: number,
    field: 'articleCode' | 'sku' | 'barcode' | 'supplierSku' | 'unitOfMeasure',
  ): string {
    const summary = this.lineSummary(index);
    const value = summary?.[field];
    return value?.trim() ? value : '—';
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

  protected onSupplierSelect(value: string | null): void {
    this.form.controls.supplierId.setValue(value ?? '');
    this.form.controls.supplierId.markAsTouched();
  }

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
  protected linkedProductLabel(index: number): string {
    const line = this.lines.at(index);
    if (!line) {
      return '';
    }
    const name = line.controls.productName.value.trim();
    return name || this.lineSummary(index)?.title || '';
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
    const term = this.lines.at(index)?.controls.productName.value.trim() ?? '';
    this.productSearchLaunchTerm.set(term);
    this.productSearchLaunchSeq.update((seq) => seq + 1);
    this.productSearchLineIndex.set(index);
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
    const index = this.productSearchLineIndex();
    return index === null ? true : !this.lineHasLinkedProduct(index);
  });

  protected onProductSearchCreate(): void {
    const index = this.productSearchLineIndex();
    this.closeLineProductSearch();
    if (index !== null) {
      this.openProductCreate(index);
    }
  }

  /** Apri la scheda di un articolo trovato, senza aggiungerlo alla riga. */
  protected onProductSearchDetail(productId: string): void {
    const index = this.productSearchLineIndex();
    this.closeLineProductSearch();
    if (index !== null) {
      this.productPanelPrefill.set(null);
      this.productPanelEditProductId.set(productId);
      this.productPanelLineIndex.set(index);
      this.productPanelOpen.set(true);
    }
  }

  protected onLineProductSearchPick(variantId: string): void {
    const index = this.productSearchLineIndex();
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
    const control = this.lines.at(index).controls.variantId;
    control.setValue(value ?? '');
    control.markAsTouched();
    if (value) {
      this.applyVariantToLine(index, value, linkedWith);
    }
  }

  protected onLineVatSelect(index: number, value: string | null): void {
    this.lines.at(index).controls.vatCodeId.setValue(value ?? '');
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
    fields: [
      'articleCode',
      'sku',
      'barcode',
      'supplierCode',
      // Rientrata nel giro: `po-product-{i}` era uscito perché la cella nome
      // era una tendina, che non ha un campo con quell'identificativo. Ora è la
      // cella condivisa, con un input vero.
      'product',
      'quantity',
      'unitOfMeasure',
      'unitCost',
      'discount',
    ],
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
      purchasePriceMajor: netMinor > 0 ? roundToMinor(netMinor) / 100 : null,
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
  private applyVariantToLine(index: number, variantId: string, linkedWith?: string): void {
    const line = this.lines.at(index);
    if (!line) {
      return;
    }
    const applyFromSummary = (summary: VariantSummary | null): void => {
      if (!summary || line.controls.variantId.value !== variantId) {
        return;
      }
      const quiet = { emitEvent: false } as const;
      line.controls.articleCode.setValue(summary.articleCode ?? '', quiet);
      line.controls.sku.setValue(summary.sku ?? '', quiet);
      line.controls.barcode.setValue(summary.barcode ?? '', quiet);
      // NON da `summary.supplierSku`: da quando la conferma non filtra per
      // fornitore, quel campo è il primo collegamento in ordine deterministico
      // — il codice di un fornitore qualsiasi, in un documento indirizzato a un
      // fornitore preciso. Vedi `supplierCodeForDocumentLine`.
      //
      // ⚠️ Qui la seconda fonte MANCA: a differenza dell'Arrivo merce, questa
      // maschera non carica i collegamenti del fornitore di testata, quindi
      // agganciando per nome/SKU/EAN il campo resta vuoto e lo compila
      // l'operatore. Vuoto è corretto, non ottimale — il seguito è caricare
      // quei collegamenti anche qui.
      line.controls.supplierCode.setValue(supplierCodeForDocumentLine({ linkedWith }), quiet);
      line.controls.productName.setValue(summary.productName || summary.title || '', quiet);
      line.controls.unitOfMeasure.setValue(summary.unitOfMeasure ?? '', quiet);
      line.controls.orderedQuantity.setValue(1, quiet);
      line.controls.discountPercent.setValue('', quiet);

      // Il Codice IVA prima del costo: con «Costo ivato» serve l'aliquota per
      // mostrare il costo d'anagrafica, che è memorizzato netto.
      const productVat = summary.defaultVatCodeId
        ? this.purchaseVatCodes().find((vatCode) => vatCode.id === summary.defaultVatCodeId)
        : undefined;
      line.controls.vatCodeId.setValue(productVat?.id ?? this.defaultPurchaseVatCodeId(), quiet);

      // Il costo d'anagrafica è NETTO: diventa il canonico della riga, e il
      // campo lo mostra netto o ivato secondo il selettore.
      const purchaseNet = summary.purchasePrice?.amountMinor ?? 0;
      line.controls.unitCostNetMinor.setValue(purchaseNet > 0 ? purchaseNet : null, quiet);
      line.controls.unitCost.setValue(
        purchaseNet > 0 ? this.costFieldValue(purchaseNet, index) : '',
        quiet,
      );

      // Un solo giro esplicito dopo il reset: i setValue silenziosi non
      // rimbalzerebbero su totali e celle derivate.
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

  protected lineFieldInvalid(index: number, name: 'variantId' | 'orderedQuantity'): boolean {
    const control = this.lines.at(index).controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected unitCostInvalid(index: number): boolean {
    const control = this.lines.at(index).controls.unitCost;
    const touched = control.touched || control.dirty;
    if (!touched) {
      return false;
    }
    const parsed = parseMoneyInput(control.value, this.currency);
    return control.invalid || parsed === null || parsed.amountMinor < 0;
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
    const control = this.lines.at(index).controls.discountPercent;
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
          this._savingSupplier.set(false);
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  protected submit(onSaved?: () => void): void {
    if (this.saving()) {
      return;
    }
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
      return;
    }
    const raw = this.form.getRawValue();
    const lines = raw.lines.map((line, index) => {
      const summary = this.lineSummary(index);
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
        variantId: line.variantId,
        // Il nome scritto sulla RIGA, non il titolo del catalogo (11/08/2026).
        // Da quando la cella è modificabile anche ad articolo agganciato, quel
        // testo è la descrizione di questa riga — mandare il titolo del
        // catalogo la butterebbe via nell'unico passaggio che doveva
        // conservarla, e in silenzio: il documento si sarebbe riaperto col nome
        // di prima. Il catalogo resta il ripiego di una riga senza nome proprio.
        description: line.productName.trim() || summary?.title || undefined,
        orderedQuantity: Number(line.orderedQuantity),
        enteredUnitCostMinor,
        // La cascata si risolve QUI, una volta: al documento va la percentuale
        // effettiva, che è quella che i totali hanno mostrato all'operatore.
        discountPercent: line.discountPercent.trim()
          ? parseEffectiveDiscountPercent(line.discountPercent)
          : undefined,
        vatCodeId: line.vatCodeId || undefined,
      };
    });

    const body = {
      supplierId: raw.supplierId,
      orderDate: raw.orderDate ? new Date(raw.orderDate).toISOString() : undefined,
      expectedAt: raw.expectedAt ? new Date(raw.expectedAt).toISOString() : undefined,
      supplierReference: raw.supplierReference.trim() || undefined,
      costEntryMode: this.costEntryMode(),
      currency: this.currency,
      lines,
    };

    const editId = this.editOrderId();
    this._submitState.set({ status: 'saving' });

    const request$ = editId
      ? this.orderService.updateOrder(editId, body)
      : this.orderService.createOrder(body);

    this.submitSubscription = request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (order) => {
        // Ordine salvato: il guard di uscita non deve più fermare la navigazione.
        this.dirtySinceLastSave.set(false);
        this._submitState.set({ status: 'idle' });
        if (onSaved) {
          // «Salva e chiudi» dal dialogo di uscita: l'operatore sta uscendo di
          // proposito, non lo si porta da un'altra parte.
          onSaved();
          return;
        }
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
    this.form.patchValue({
      supplierId: order.supplierId,
      orderDate: order.orderDate ? order.orderDate.slice(0, 10) : todayIsoDate(),
      expectedAt: order.expectedAt ? order.expectedAt.slice(0, 10) : '',
      supplierReference: order.supplierReference ?? '',
    });
    this.costEntryMode.set(order.costEntryMode);
    this.lines.clear();
    for (const line of order.lines) {
      // La riga riparte dal costo NETTO canonico, non da quello digitato: il
      // netto porta la coda dello scorporo, il digitato è già passato per i due
      // decimali. Ricostruire da lì significherebbe perdere il centesimo esatto
      // nel momento in cui l'ordine si riapre — cioè dove il difetto si vedeva.
      const group = this.createLine();
      group.patchValue(
        {
          variantId: line.variantId,
          productName: line.description ?? '',
          sku: line.sku ?? '',
          orderedQuantity: line.orderedQuantity,
          unitCostNetMinor: line.unitCost.amountMinor,
          discountPercent:
            line.discountPercent > 0 ? formatDiscountPercentValue(line.discountPercent) : '',
          vatCodeId: line.vatCodeId ?? '',
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
      const quantity = Number(line.controls.orderedQuantity.value);
      if (!Number.isInteger(quantity) || quantity < 1) {
        return `${riga}: la quantità deve essere un numero intero maggiore di zero.`;
      }
      const cost = parseMoneyInput(line.controls.unitCost.value, this.currency);
      if (cost === null) {
        return `${riga}: manca il costo. Se l'articolo non ne ha uno in anagrafica va scritto qui.`;
      }
      if (cost.amountMinor < 0) {
        return `${riga}: il costo non può essere negativo.`;
      }
      if (this.discountValueInvalid(line.controls.discountPercent.value)) {
        return `${riga}: lo sconto non è leggibile. Usa «10» oppure «4+10» per gli sconti a cascata.`;
      }
    }
    return null;
  }

  private createLine() {
    return this.fb.group({
      variantId: this.fb.control('', { validators: [Validators.required] }),
      // Le quattro chiavi di identità dell'articolo. Non sono campi
      // informativi: si digitano per CERCARE l'articolo, e quando l'articolo non
      // esiste ancora sono il dato che finisce in anagrafica.
      articleCode: this.fb.control(''),
      sku: this.fb.control(''),
      barcode: this.fb.control(''),
      supplierCode: this.fb.control(''),
      productName: this.fb.control(''),
      unitOfMeasure: this.fb.control(''),
      orderedQuantity: this.fb.control(1, {
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      /**
       * Il campo del costo è una VISTA: contiene il netto o l'ivato secondo il
       * selettore di testata, ed è quello che l'operatore legge e digita.
       */
      unitCost: this.fb.control('', { validators: [Validators.required] }),
      /**
       * Il costo NETTO canonico in unità minori, con la coda dello scorporo.
       * È il valore vero della riga: `unitCost` si ridisegna da qui, mai il
       * contrario. Vive nel gruppo e non in un signal per indice perché così
       * segue la riga quando la si aggiunge, duplica o elimina — un indice
       * separato si disallineerebbe al primo riordino.
       */
      unitCostNetMinor: this.fb.control<number | null>(null),
      discountPercent: this.fb.control(''),
      vatCodeId: this.fb.control(''),
    });
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
