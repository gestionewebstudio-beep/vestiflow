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
  throwError,
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
import { DocumentStatus, DocumentType, SupplierRefType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { isConfirmedEditableDocumentStatus } from '@core/models/document.model';
import { ProductStatus } from '@core/models/product.model';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  moneyFromMajor,
  moneyToDecimalString,
  parseMoneyInput,
} from '@core/utils/money.util';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import { mapHttpErrorToAppError } from '@core/interceptors/http-error.mapper';
import {
  applyDiscountMinor,
  parseEffectiveDiscountPercent,
} from '@core/utils/discount-percent.util';
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
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { TableViewId } from '@shared/table-columns/table-column.model';
import { TableColumnResizeDirective } from '@shared/directives/table-column-resize.directive';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';

import { TenantFeatureSettingsService } from '@features/settings/services/tenant-feature-settings.service';
import type { TenantFeatureSettings } from '@features/settings/models/tenant-feature-settings.model';
import { ProductFormComponent } from '@features/products/product-form.component';

import type { VariantSummary } from '@features/products/models/variant-summary.model';
import type { VariantByCodeDto } from '@features/products/models/product.dto';
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
import type { GoodsReceiptCausal } from './models/goods-receipt-causal.model';
import { DocumentService } from './services/document.service';
import { GoodsReceiptCausalService } from './services/goods-receipt-causal.service';
import type { SaveGoodsReceiptBody } from './services/document-api.mapper';
import { parseSerialNumbersText } from './utils/serial-numbers-input.util';
import {
  GoodsReceiptCsvParseError,
  parseGoodsReceiptLinesCsv,
  type GoodsReceiptCsvLine,
} from './utils/goods-receipt-lines-csv.util';
import { parseBarcodeScanInput } from './utils/parse-barcode-scan-input.util';
import {
  GOODS_RECEIPT_SORTABLE_LINE_COLUMNS,
  compareGoodsReceiptLines,
  type GoodsReceiptLineSortColumn,
} from './utils/goods-receipt-line-sort.util';

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

const VARIANT_SEARCH_DEBOUNCE_MS = 300;
const VARIANT_SEARCH_MIN_CHARS = 3;
const AUTO_SAVE_DEBOUNCE_MS = 800;

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
    GoodsReceiptLineCodeCellComponent,
    GoodsReceiptLineProductCellComponent,
    GoodsReceiptProductSearchPanelComponent,
    SlidePanelComponent,
    ProductFormComponent,
    SupplierFormFieldsComponent,
  ],
  templateUrl: './goods-receipt-form.component.html',
  styleUrl: './goods-receipt-form.component.scss',
})
export class GoodsReceiptFormComponent implements CanComponentDeactivate {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly documentService = inject(DocumentService);
  private readonly causalService = inject(GoodsReceiptCausalService);
  private readonly supplierService = inject(SupplierService);
  private readonly supplierOrderService = inject(SupplierOrderService);
  private readonly labelPrintService = inject(ProductLabelPrintService);
  private readonly productService = inject(ProductService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly locationContext = inject(LocationContextService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly listPath = '/app/documents/arrivi-merce';
  protected readonly currency = DEFAULT_CURRENCY;
  protected readonly formatMoney = formatMoney;
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
  protected readonly productPanelOpen = signal(false);
  protected readonly productPanelLineIndex = signal<number | null>(null);
  protected readonly productPanelMode = signal<'create' | 'edit'>('create');
  protected readonly productPanelEditProductId = signal<string | null>(null);
  protected readonly attachTargetLineIndex = signal<number | null>(null);
  protected readonly registerDialogOpen = signal(false);
  protected readonly lifecycleActionSaving = signal(false);
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

  private readonly tenantSettings = toSignal(
    this.tenantFeatureSettingsService.getSettings().pipe(catchError(() => of(null))),
    { initialValue: null as TenantFeatureSettings | null },
  );

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

  protected readonly canPrintDocument = computed(() => {
    const doc = this.loadedDocument();
    if (!doc) {
      return false;
    }
    return (
      doc.status === DocumentStatus.Confirmed ||
      doc.status === DocumentStatus.Sent ||
      doc.status === DocumentStatus.ExternallyRegistered
    );
  });

  protected readonly canSendDocument = computed(() => {
    const doc = this.loadedDocument();
    if (!doc) {
      return false;
    }
    return doc.status === DocumentStatus.Confirmed || doc.status === DocumentStatus.Printed;
  });

  protected readonly canRegisterExternalDocument = computed(() => {
    const doc = this.loadedDocument();
    if (!doc) {
      return false;
    }
    return (
      doc.status === DocumentStatus.Confirmed ||
      doc.status === DocumentStatus.Printed ||
      doc.status === DocumentStatus.Sent
    );
  });

  protected readonly formReadOnly = computed(() => this.isConfirmedEdit() && !this.editUnlocked());

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
        return this.documentService.getDocumentById(id).pipe(
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
    this.operationalLocations.writeLocations().map((loc) => ({
      value: loc.id,
      label: loc.name,
    })),
  );

  // ── Causale di carico (prompt §1.2, §9.3) ──────────────────────────────────
  protected readonly supplierRefTypeOptions: readonly SelectMenuOption[] = [
    { value: '', label: '—' },
    { value: SupplierRefType.Ddt, label: 'DDT' },
    { value: SupplierRefType.Invoice, label: 'Fattura' },
    { value: SupplierRefType.Return, label: 'Reso' },
    { value: SupplierRefType.Other, label: 'Altro' },
  ];

  private readonly causalsReload = signal(0);
  protected readonly causals = toSignal(
    toObservable(this.causalsReload).pipe(
      switchMap(() =>
        this.causalService.list().pipe(catchError(() => of([] as readonly GoodsReceiptCausal[]))),
      ),
    ),
    { initialValue: [] as readonly GoodsReceiptCausal[] },
  );
  protected readonly activeCausals = computed(() =>
    this.causals().filter((causal) => causal.isActive),
  );
  protected readonly causalDropdownOpen = signal(false);
  protected readonly causalPanelOpen = signal(false);
  protected readonly causalPanelBusy = signal(false);
  protected readonly causalPanelError = signal<string | null>(null);
  protected readonly newCausalLabel = signal('');
  protected readonly editingCausalId = signal<string | null>(null);
  protected readonly editingCausalLabel = signal('');
  /** true dopo una modifica manuale: blocca la rigenerazione automatica. */
  private causalManuallyEdited = false;

  readonly form = this.fb.group({
    type: this.fb.control<DocumentType>(DocumentType.GoodsReceipt, {
      validators: [Validators.required],
    }),
    supplierId: this.fb.control('', { validators: [Validators.required] }),
    locationId: this.fb.control('', { validators: [Validators.required] }),
    documentDate: this.fb.control(new Date().toISOString().slice(0, 10), {
      validators: [Validators.required],
    }),
    supplierRefType: this.fb.control<SupplierRefType | ''>(''),
    externalDocNumber: this.fb.control(''),
    externalDocDate: this.fb.control(''),
    causalText: this.fb.control(''),
    notes: this.fb.control(''),
    internalComment: this.fb.control(''),
    billingCause: this.fb.control(''),
    externalRef: this.fb.control(''),
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
    this.form.controls.supplierRefType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.regenerateCausalFromRefs());
    this.form.controls.externalDocNumber.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.regenerateCausalFromRefs());
    this.form.controls.externalDocDate.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.regenerateCausalFromRefs());
    this.refreshNumberPreview();
    this.setupAutoSave();
    this.form.controls.supplierId.valueChanges
      .pipe(startWith(this.form.controls.supplierId.value), takeUntilDestroyed(this.destroyRef))
      .subscribe((supplierId) => this.reloadSupplierVariantLinks(supplierId));
    effect(() => {
      this.pinnedVariants();
      this.syncLineCodesFromVariants();
    });
  }

  private setupAutoSave(): void {
    this.form.valueChanges
      .pipe(debounceTime(AUTO_SAVE_DEBOUNCE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.triggerAutoSave());
  }

  private triggerAutoSave(): void {
    if (this.formReadOnly() || this.saving()) {
      return;
    }
    if (!this.canPersistAutoSaveDocument()) {
      return;
    }
    this.dirtySinceLastSave.set(true);
    this.autoSavePending.set(true);
    this.persistAutoSave({ stayOnPage: true });
  }

  private validateForAutoSave(): boolean {
    return (
      !this.form.controls.supplierId.invalid &&
      !this.form.controls.locationId.invalid &&
      !this.form.controls.documentDate.invalid &&
      !this.form.controls.type.invalid
    );
  }

  protected lineHasLinkedProduct(index: number): boolean {
    return Boolean(this.lines.at(index)?.controls.variantId.value);
  }

  protected lineSuggestions(index: number): readonly VariantSummary[] {
    if (this.autocompleteLineIndex() !== index || this.lineHasLinkedProduct(index)) {
      return [];
    }
    return mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants());
  }

  protected lineSuggestionsOpen(index: number): boolean {
    return this.autocompleteLineIndex() === index && this.lineSuggestions(index).length > 0;
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

  protected onLineSkuChange(index: number, value: string): void {
    this.lines.at(index).controls.sku.setValue(value);
    this.clearCodeLookup();
    this.triggerAutoSave();
  }

  protected onLineBarcodeChange(index: number, value: string): void {
    this.lines.at(index).controls.barcode.setValue(value);
    this.clearCodeLookup();
    this.triggerAutoSave();
  }

  protected onLineProductNameChange(index: number, value: string): void {
    const line = this.lines.at(index);
    line.controls.productName.setValue(value);
    this.autocompleteLineIndex.set(index);
    this.activeSuggestionIndex.set(0);
    this.variantSearchDraft.set(value);
    this.clearCodeLookup();
    this.triggerAutoSave();
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
      this.commitLineAndSave(index);
      return;
    }
    this.triggerAutoSave();
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
    this.triggerAutoSave();
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
    this.triggerAutoSave();
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
    if (event.key !== 'Tab' || event.shiftKey) {
      return;
    }
    const order = this.visibleLineFocusFields(index);
    const pos = order.indexOf(field);
    if (pos < order.length - 1) {
      return;
    }
    event.preventDefault();
    this.advanceToNextLine(index);
  }

  protected onLineSupplierSkuChange(index: number, value: string): void {
    this.lines.at(index).controls.supplierSku.setValue(value);
    this.triggerAutoSave();
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
      if (linked) {
        if (
          field === 'quantity' ||
          field === 'unitCost' ||
          field === 'discount' ||
          field === 'vat'
        ) {
          return this.isLineColumnVisible(
            field === 'quantity'
              ? 'quantity'
              : field === 'unitCost'
                ? 'unitCost'
                : field === 'discount'
                  ? 'discount'
                  : 'vat',
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
      if (field === 'vat') {
        return this.isLineColumnVisible('vat');
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

  private clearCodeLookup(): void {
    this.codeLookupLineIndex.set(null);
    this.codeLookupField.set(null);
    this.codeLookupSuggestions.set([]);
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
      this.lines.push(this.createLine());
    }
  }

  private trimDuplicateTrailingEmptyRows(): void {
    while (this.lines.length > 1) {
      const lastIdx = this.lines.length - 1;
      const last = this.lines.at(lastIdx);
      const prev = this.lines.at(lastIdx - 1);
      if (this.lineIsEmpty(last) && this.lineIsEmpty(prev)) {
        this.lines.removeAt(lastIdx);
      } else {
        break;
      }
    }
  }

  private syncLineFieldAccess(): void {
    if (this.formReadOnly()) {
      return;
    }
    for (const line of this.lines.controls) {
      const linked = Boolean(line.controls.variantId.value);
      const lockedWhenLinked = [
        line.controls.sku,
        line.controls.barcode,
        line.controls.supplierSku,
        line.controls.productName,
        line.controls.unitCost,
        line.controls.vatRatePercent,
        line.controls.sellingPrice,
        line.controls.compareAtPrice,
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
    }
  }

  private lineIsEmpty(line: ReturnType<GoodsReceiptFormComponent['createLine']>): boolean {
    return (
      !line.controls.variantId.value &&
      !line.controls.sku.value.trim() &&
      !line.controls.barcode.value.trim() &&
      !line.controls.productName.value.trim() &&
      !line.controls.unitCost.value.trim() &&
      !line.controls.sellingPrice.value.trim() &&
      !line.controls.compareAtPrice.value.trim()
    );
  }

  private lineHasSignificantProductData(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
  ): boolean {
    return Boolean(
      line.controls.sku.value.trim() ||
      line.controls.barcode.value.trim() ||
      line.controls.productName.value.trim() ||
      line.controls.unitCost.value.trim() ||
      line.controls.sellingPrice.value.trim() ||
      line.controls.compareAtPrice.value.trim() ||
      line.controls.vatRatePercent.value.trim(),
    );
  }

  private lineHasPersistableData(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
  ): boolean {
    const qty = Number(line.controls.quantity.value);
    if (line.controls.variantId.value) {
      return qty > 0;
    }
    if (qty <= 0) {
      return false;
    }
    return this.lineHasSignificantProductData(line);
  }

  private lineNeedsProductCreation(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
  ): boolean {
    if (line.controls.variantId.value) {
      return false;
    }
    if (Number(line.controls.quantity.value) <= 0) {
      return false;
    }
    const sku = line.controls.sku.value.trim();
    const name = line.controls.productName.value.trim();
    return sku.length > 0 && name.length >= 2;
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

  private validateStockLinesForFinalSave(): AppError | null {
    for (let index = 0; index < this.lines.length; index++) {
      const line = this.lines.at(index);
      if (!line.controls.loadsStock.value || Number(line.controls.quantity.value) <= 0) {
        continue;
      }
      if (line.controls.variantId.value) {
        continue;
      }
      if (!line.controls.sku.value.trim()) {
        return {
          kind: AppErrorKind.Validation,
          message: `Riga ${index + 1}: per creare questo articolo devi inserire anche lo SKU.`,
        };
      }
      return {
        kind: AppErrorKind.Validation,
        message:
          'Non è stato possibile salvare alcune righe. Controlla i dati evidenziati e riprova.',
      };
    }
    return null;
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

  protected readonly selectedSupplier = computed((): Supplier | null => {
    const supplierId = this.formValue()?.supplierId;
    if (!supplierId) {
      return null;
    }
    return this.suppliers().find((supplier) => supplier.id === supplierId) ?? null;
  });

  protected readonly supplierDocumentNote = computed(() => {
    const note = this.selectedSupplier()?.documentCreationNote?.trim();
    return note ?? '';
  });

  protected readonly documentTotals = computed(() => {
    this.formValue();
    const currency = this.currency;
    let lineSumMinor = 0;
    const lineTaxParts: { readonly netMinor: number; readonly vatRate: number }[] = [];

    for (const line of this.lines.controls) {
      const netMinor = this.lineNetMinor(line);
      lineSumMinor += netMinor;
      const vatRaw = line.controls.vatRatePercent.value.trim();
      const vatRate = vatRaw ? Number(vatRaw) : 0;
      if (vatRate > 0 && netMinor > 0) {
        lineTaxParts.push({ netMinor, vatRate });
      }
    }

    const docDiscountPercent = parseEffectiveDiscountPercent(
      this.form.controls.documentDiscountPercent.value,
    );
    const docDiscountAmount = Math.round((lineSumMinor * docDiscountPercent) / 100);
    const discountedLineSum = lineSumMinor - docDiscountAmount;

    const taxMinor =
      lineSumMinor === 0
        ? 0
        : lineTaxParts.reduce((sum, part) => {
            const share = part.netMinor / lineSumMinor;
            const discountedNet = Math.round(discountedLineSum * share);
            return sum + Math.round((discountedNet * part.vatRate) / 100);
          }, 0);

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

  protected readonly documentTotal = computed<Money>(() => this.documentTotals().total);

  protected readonly showSupplierForm = signal(false);
  readonly supplierForm = createSupplierFormGroup(this.fb);
  private readonly _savingSupplier = signal(false);
  protected readonly savingSupplier = this._savingSupplier.asReadonly();

  private autoSavePending = signal(false);
  private supplierSubscription: Subscription | null = null;
  private submitSubscription: Subscription | null = null;
  private readonly dirtySinceLastSave = signal(false);
  private pendingAutoSaveCallbacks: (() => void)[] = [];

  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
  protected readonly autoSaveStatus = computed(() => {
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

  protected lineStockAvailable(index: number): string {
    const summary = this.lineVariantSummary(index);
    if (!summary || summary.stockOnHand == null) {
      return '—';
    }
    return String(summary.stockOnHand);
  }

  protected lineUnitOfMeasure(index: number): string {
    const summary = this.lineVariantSummary(index);
    return summary?.unitOfMeasure?.trim() || 'pz';
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

  private lineGrossMinor(line: ReturnType<GoodsReceiptFormComponent['createLine']>): number {
    const cost = parseMoneyInput(line.controls.unitCost.value, this.currency);
    const qty = Number(line.controls.quantity.value);
    return cost && Number.isFinite(qty) ? cost.amountMinor * qty : 0;
  }

  private lineNetMinor(line: ReturnType<GoodsReceiptFormComponent['createLine']>): number {
    return applyDiscountMinor(this.lineGrossMinor(line), line.controls.discountPercent.value);
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
    if (!line.controls.vatRatePercent.value.trim() && supplier.defaultVatRatePercent != null) {
      line.controls.vatRatePercent.setValue(String(supplier.defaultVatRatePercent), {
        emitEvent: false,
      });
    }
  }

  protected onTypeSelect(value: string | null): void {
    if (value && isGoodsReceiptDocumentType(value as DocumentType)) {
      this.form.controls.type.setValue(value as DocumentType);
    }
  }

  protected onSupplierSelect(value: string | null): void {
    this.form.controls.supplierId.setValue(value ?? '');
    this.form.controls.supplierId.markAsTouched();
    this.reloadSupplierVariantLinks(value ?? '');

    const supplier = this.suppliers().find((item) => item.id === value);
    if (supplier) {
      for (const line of this.lines.controls) {
        if (!line.controls.discountPercent.value.trim() && supplier.supplierDiscount?.trim()) {
          line.controls.discountPercent.setValue(supplier.supplierDiscount.trim(), {
            emitEvent: false,
          });
        }
        if (!line.controls.vatRatePercent.value.trim() && supplier.defaultVatRatePercent != null) {
          line.controls.vatRatePercent.setValue(String(supplier.defaultVatRatePercent), {
            emitEvent: false,
          });
        }
      }
    }
    this.triggerAutoSave();
  }

  protected onLocationSelect(value: string | null): void {
    this.form.controls.locationId.setValue(value ?? '');
    this.form.controls.locationId.markAsTouched();
  }

  // ── Causale di carico ──────────────────────────────────────────────────────

  protected onSupplierRefTypeSelect(value: string | null): void {
    this.form.controls.supplierRefType.setValue((value ?? '') as SupplierRefType | '');
  }

  protected onCausalInput(value: string): void {
    this.causalManuallyEdited = value.trim().length > 0;
    this.form.controls.causalText.setValue(value);
    this.causalDropdownOpen.set(false);
  }

  protected toggleCausalDropdown(): void {
    if (this.formReadOnly()) {
      return;
    }
    this.causalDropdownOpen.update((open) => !open);
  }

  protected closeCausalDropdown(): void {
    this.causalDropdownOpen.set(false);
  }

  protected pickCausal(label: string): void {
    this.causalManuallyEdited = true;
    this.form.controls.causalText.setValue(label);
    this.causalDropdownOpen.set(false);
  }

  /**
   * Rigenera la causale da tipo riferimento + numero + data documento fornitore
   * (prompt §9.3), finché l'utente non la modifica manualmente.
   */
  private regenerateCausalFromRefs(): void {
    if (this.causalManuallyEdited || this.formReadOnly()) {
      return;
    }
    const generated = this.buildGeneratedCausal();
    if (generated !== null) {
      this.form.controls.causalText.setValue(generated, { emitEvent: false });
    }
  }

  private buildGeneratedCausal(): string | null {
    const refType = this.form.controls.supplierRefType.value;
    if (!refType || refType === SupplierRefType.Other) {
      return null;
    }
    const prefix =
      refType === SupplierRefType.Ddt
        ? 'DDT'
        : refType === SupplierRefType.Invoice
          ? 'Fatt.'
          : 'Reso';
    const number = this.form.controls.externalDocNumber.value.trim();
    const dateRaw = this.form.controls.externalDocDate.value;
    const date = dateRaw ? this.formatItalianDate(dateRaw) : '';
    let causal = prefix;
    if (number) {
      causal += ` ${number}`;
    }
    if (date) {
      causal += ` del ${date}`;
    }
    return causal;
  }

  private formatItalianDate(isoDate: string): string {
    const [year, month, day] = isoDate.slice(0, 10).split('-');
    if (!year || !month || !day) {
      return isoDate;
    }
    return `${day}/${month}/${year}`;
  }

  // ── Gestione causali (finestra dedicata, prompt §1.2) ─────────────────────

  protected openCausalPanel(): void {
    this.causalPanelError.set(null);
    this.causalPanelOpen.set(true);
  }

  protected closeCausalPanel(): void {
    this.causalPanelOpen.set(false);
    this.editingCausalId.set(null);
    this.newCausalLabel.set('');
  }

  protected createCausal(): void {
    const label = this.newCausalLabel().trim();
    if (!label || this.causalPanelBusy()) {
      return;
    }
    this.runCausalAction(this.causalService.create({ label }), () => this.newCausalLabel.set(''));
  }

  protected startEditCausal(causal: GoodsReceiptCausal): void {
    this.editingCausalId.set(causal.id);
    this.editingCausalLabel.set(causal.label);
  }

  protected cancelEditCausal(): void {
    this.editingCausalId.set(null);
  }

  protected saveEditCausal(): void {
    const id = this.editingCausalId();
    const label = this.editingCausalLabel().trim();
    if (!id || !label || this.causalPanelBusy()) {
      return;
    }
    this.runCausalAction(this.causalService.update(id, { label }), () =>
      this.editingCausalId.set(null),
    );
  }

  protected setDefaultCausal(causal: GoodsReceiptCausal): void {
    if (this.causalPanelBusy()) {
      return;
    }
    this.runCausalAction(this.causalService.update(causal.id, { isDefault: !causal.isDefault }));
  }

  protected deleteCausal(causal: GoodsReceiptCausal): void {
    if (this.causalPanelBusy()) {
      return;
    }
    this.runCausalAction(this.causalService.delete(causal.id));
  }

  protected moveCausal(causal: GoodsReceiptCausal, direction: -1 | 1): void {
    if (this.causalPanelBusy()) {
      return;
    }
    const ordered = [...this.causals()].map((item) => item.id);
    const index = ordered.indexOf(causal.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) {
      return;
    }
    const swapped = ordered[target];
    if (swapped === undefined) {
      return;
    }
    ordered[target] = causal.id;
    ordered[index] = swapped;
    this.runCausalAction(this.causalService.reorder(ordered));
  }

  private runCausalAction(action$: Observable<unknown>, onSuccess?: () => void): void {
    this.causalPanelBusy.set(true);
    this.causalPanelError.set(null);
    action$.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.causalPanelBusy.set(false);
        onSuccess?.();
        this.causalsReload.update((tick) => tick + 1);
      },
      error: (err: unknown) => {
        this.causalPanelBusy.set(false);
        this.causalPanelError.set(this.toAppError(err).message);
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
        if (!line.controls.vatRatePercent.value.trim()) {
          const supplierVat = this.selectedSupplier()?.defaultVatRatePercent;
          if (supplierVat != null) {
            line.controls.vatRatePercent.setValue(String(supplierVat), { emitEvent: false });
          }
        }
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
    this.triggerAutoSave();
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
    const vatRaw = line.controls.vatRatePercent.value.trim();
    return {
      name,
      description: line.controls.description.value.trim() || undefined,
      sku: line.controls.sku.value.trim() || undefined,
      barcode: line.controls.barcode.value.trim() || undefined,
      purchasePriceMajor: cost ? cost.amountMinor / 100 : null,
      sellingPriceMajor: selling ? selling.amountMinor / 100 : null,
      compareAtPriceMajor: compareAt ? compareAt.amountMinor / 100 : null,
      defaultVatRatePercent: vatRaw ? Number(vatRaw) : null,
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
    this.flushAutoSaveBeforeAction(() => this.openFullProductCreate(index));
  }

  protected openNewProduct(): void {
    this.flushAutoSaveBeforeAction(() => {
      this.attachTargetLineIndex.set(null);
      this.productPanelLineIndex.set(null);
      this.productPanelEditProductId.set(null);
      this.productPanelMode.set('create');
      this.productPanelOpen.set(true);
    });
  }

  protected openProductDetail(index: number): void {
    const variantId = this.lines.at(index)?.controls.variantId.value;
    if (!variantId) {
      return;
    }
    this.flushAutoSaveBeforeAction(() => {
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
        this.flushAutoSaveBeforeAction(() => this.applyImportedCsvLines(parsed));
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
    this.triggerAutoSave();
  }

  protected addLine(): void {
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
    if (this.formReadOnly() || this.barcodeScanBusy()) {
      return;
    }
    const raw = this.barcodeScanDraft().trim();
    if (!raw) {
      return;
    }
    const { quantity, code } = parseBarcodeScanInput(raw);
    if (!code) {
      return;
    }
    this.barcodeScanDraft.set('');
    this.barcodeScanBusy.set(true);

    const supplierId = this.form.controls.supplierId.value || undefined;
    const locationId = this.form.controls.locationId.value || undefined;

    this.productService
      .findVariantByCode(code)
      .pipe(
        take(1),
        catchError(() => of(null)),
        switchMap((variant) => {
          if (variant) {
            return of(variant.variantId);
          }
          const supplierVariantId = this.variantIdBySupplierSku().get(normalizeSku(code));
          if (supplierVariantId) {
            return of(supplierVariantId);
          }
          return this.productService
            .searchVariantSummaries({ search: code, pageSize: 5, supplierId, locationId })
            .pipe(
              map((rows) => {
                const exactBarcode = rows.find((row) => row.barcode?.trim() === code);
                if (exactBarcode) {
                  return exactBarcode.variantId;
                }
                const exactSku = rows.find((row) => normalizeSku(row.sku) === normalizeSku(code));
                return exactSku?.variantId ?? null;
              }),
              catchError(() => of(null)),
            );
        }),
      )
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
    this.triggerAutoSave();
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
    this.barcodeScanInputRef()?.nativeElement.focus();
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
    this.triggerAutoSave();
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
    const hasLineData = this.lines.controls.some((line) =>
      this.lineHasSignificantProductData(line),
    );
    if (!hasLineData) {
      if (this.dirtySinceLastSave() || this.autoSavePending()) {
        return globalThis.confirm(
          'Ci sono modifiche non ancora salvate. Uscire comunque dal documento?',
        );
      }
      return true;
    }
    if (!this.dirtySinceLastSave() && !this.autoSavePending()) {
      return true;
    }
    this.exitDialogOpen.set(true);
    return new Promise<boolean>((resolve) => {
      this.pendingDeactivate = resolve;
    });
  }

  protected confirmExitSaveDocument(): void {
    this.syncActiveFieldBeforeSave();
    if (!this.validateForAutoSave()) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: 'Compila fornitore, magazzino e data documento prima di salvare.',
        },
      });
      return;
    }
    if (!this.lines.controls.some((line) => this.lineHasPersistableData(line))) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: 'Aggiungi almeno una riga prodotto prima di salvare.',
        },
      });
      return;
    }
    const stockValidation = this.validateStockLinesForFinalSave();
    if (stockValidation) {
      this._submitState.set({ status: 'error', error: stockValidation });
      return;
    }
    this.exitDialogOpen.set(false);
    this._submitState.set({ status: 'saving' });
    this.commitAllLineProducts$()
      .pipe(
        switchMap(() => {
          const afterCommit = this.validateStockLinesForFinalSave();
          if (afterCommit) {
            return throwError(() => afterCommit);
          }
          return this.saveDocument$();
        }),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (doc) => {
          this._submitState.set({ status: 'idle' });
          this.autoSavePending.set(false);
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

  protected confirmExitDeleteDocument(): void {
    this.exitDialogOpen.set(false);
    const id = this.persistedDocumentId();
    if (!id) {
      this.resolveExit(true);
      return;
    }
    this._submitState.set({ status: 'saving' });
    this.documentService
      .deleteDocument(id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this._submitState.set({ status: 'idle' });
          this.resolveExit(true);
        },
        error: (err: unknown) => {
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
          this.resolveExit(false);
        },
      });
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
    if (this.dirtySinceLastSave() || this.autoSavePending() || this.saving()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  private flushAutoSaveBeforeAction(action: () => void): void {
    if (!this.validateForAutoSave() || this.formReadOnly()) {
      action();
      return;
    }
    if (!this.dirtySinceLastSave() && !this.autoSavePending()) {
      action();
      return;
    }
    this.dirtySinceLastSave.set(true);
    this.autoSavePending.set(true);
    this.persistAutoSave({
      stayOnPage: true,
      onComplete: () => action(),
    });
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
          this.triggerAutoSave();
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
          this.syncLineFieldAccess();
          this.triggerAutoSave();
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

  protected printDocumentLifecycle(): void {
    const id = this.editDocumentId();
    if (!id || this.lifecycleActionSaving()) {
      return;
    }
    this.lifecycleActionSaving.set(true);
    this.documentService
      .markPrinted(id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.lifecycleActionSaving.set(false);
          this.reload();
        },
        error: () => this.lifecycleActionSaving.set(false),
      });
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

  protected sendDocumentLifecycle(): void {
    const id = this.editDocumentId();
    if (!id || this.lifecycleActionSaving()) {
      return;
    }
    this.lifecycleActionSaving.set(true);
    this.documentService
      .markSent(id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.lifecycleActionSaving.set(false);
          this.reload();
        },
        error: () => this.lifecycleActionSaving.set(false),
      });
  }

  protected registerDocumentExternal(): void {
    const id = this.editDocumentId();
    if (!id || this.lifecycleActionSaving()) {
      return;
    }
    this.lifecycleActionSaving.set(true);
    this.documentService
      .registerExternal(id, {})
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.lifecycleActionSaving.set(false);
          this.registerDialogOpen.set(false);
          this.reload();
        },
        error: () => this.lifecycleActionSaving.set(false),
      });
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
    const active = this.locationContext.activeLocationId();
    const writable = this.operationalLocations.writeLocations();
    const defaultLoc =
      active && writable.some((l) => l.id === active) ? active : (writable[0]?.id ?? '');
    if (defaultLoc && !this.form.controls.locationId.value) {
      this.form.controls.locationId.setValue(defaultLoc);
    }
    this.ensureMinimumOneRow();
    this.scheduleInitialLineFocus();
  }

  private persistAutoSave(options?: {
    readonly stayOnPage?: boolean;
    readonly onComplete?: () => void;
    readonly onCompleteOnError?: boolean;
  }): void {
    if (this.saving()) {
      if (options?.onComplete) {
        this.pendingAutoSaveCallbacks.push(options.onComplete);
      }
      return;
    }
    if (!this.canPersistAutoSaveDocument()) {
      this.autoSavePending.set(false);
      options?.onComplete?.();
      return;
    }
    this._submitState.set({ status: 'saving' });

    const hadRouteEditId = Boolean(this.editDocumentId());
    this.commitAllLineProducts$()
      .pipe(
        switchMap(() => this.saveDocument$()),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (doc) => {
          this._submitState.set({ status: 'idle' });
          this.autoSavePending.set(false);
          this.dirtySinceLastSave.set(false);
          this.loadedDocument.set(doc);
          this.syncSupplierOrderLineMapFromDocument(doc);
          if (doc.status === DocumentStatus.Draft || options?.stayOnPage) {
            this.editUnlocked.set(true);
          }
          if (options?.stayOnPage) {
            if (!hadRouteEditId) {
              this.preserveEditSession.set(true);
              void this.router.navigate(['/app/documents', doc.id, 'edit'], { replaceUrl: true });
            }
            this.syncLineFieldAccess();
            this.ensureMinimumOneRow();
            this.trimDuplicateTrailingEmptyRows();
            this.flushAutoSaveCallbacks(options);
            return;
          }
          this.flushAutoSaveCallbacks(options);
          void this.router.navigate([this.listPath, doc.id]);
        },
        error: (err: unknown) => {
          this.autoSavePending.set(false);
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
          this.flushAutoSaveCallbacks({
            ...options,
            fromError: true,
          });
        },
      });
  }

  private flushAutoSaveCallbacks(options?: {
    readonly onComplete?: () => void;
    readonly onCompleteOnError?: boolean;
    readonly fromError?: boolean;
  }): void {
    const runComplete = !options?.fromError || options.onCompleteOnError;
    if (runComplete) {
      options?.onComplete?.();
      const queued = [...this.pendingAutoSaveCallbacks];
      this.pendingAutoSaveCallbacks = [];
      for (const callback of queued) {
        callback();
      }
      return;
    }
    this.pendingAutoSaveCallbacks = [];
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
    this.triggerAutoSave();
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
      loadsStock: this.fb.control(true),
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
          this.triggerAutoSave();
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
      loadsStock: this.fb.control(true),
      supplierOrderLineId: this.fb.control(''),
      lotCode: this.fb.control(''),
      lotExpiryDate: this.fb.control(''),
      serialNumbersText: this.fb.control(''),
    });
    this.applySupplierDefaultsToLine(row);
    return row;
  }

  private validateForFinalSave(): AppError | null {
    if (!this.validateForAutoSave()) {
      return {
        kind: AppErrorKind.Validation,
        message: 'Compila fornitore, magazzino e data documento prima di salvare.',
      };
    }
    if (!this.lines.controls.some((line) => this.lineHasPersistableData(line))) {
      return {
        kind: AppErrorKind.Validation,
        message: 'Aggiungi almeno una riga prodotto prima di salvare.',
      };
    }
    if (this.hasInvalidCost()) {
      this.form.markAllAsTouched();
      return {
        kind: AppErrorKind.Validation,
        message: 'Controlla i costi delle righe prima di salvare.',
      };
    }
    return this.validateStockLinesForFinalSave();
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
    this.submitSubscription = this.commitAllLineProducts$()
      .pipe(
        switchMap(() => {
          const afterCommit = this.validateStockLinesForFinalSave();
          if (afterCommit) {
            return throwError(() => afterCommit);
          }
          return this.saveDocument$({ applySupplierPriceUpdates });
        }),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (doc) => {
          this._submitState.set({ status: 'idle' });
          this.autoSavePending.set(false);
          this.dirtySinceLastSave.set(false);
          this.loadedDocument.set(doc);
          this.pendingSupplierOrderId.set(null);
          this.pendingLinkedSupplierOrderRef.set(null);
          void this.router.navigate([this.listPath, doc.id]);
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

  /** Autosave: header valido + almeno una riga persistibile prima del primo create. */
  private canPersistAutoSaveDocument(): boolean {
    if (!this.validateForAutoSave()) {
      return false;
    }
    if (this.editDocumentId()) {
      return true;
    }
    return this.lines.controls.some((line) => this.lineHasPersistableData(line));
  }

  /** Righe inviate nell'ultimo salvataggio, per riadottare gli id dal server. */
  private lastSavedLineControls: ReturnType<GoodsReceiptFormComponent['createLine']>[] = [];

  private buildSaveGoodsReceiptBody(): SaveGoodsReceiptBody {
    const raw = this.form.getRawValue();
    const supplierOrderId = this.resolveSupplierOrderId();
    const persistableControls = this.lines.controls.filter((line) =>
      this.lineHasPersistableDataFromRaw(line.getRawValue()),
    );
    this.lastSavedLineControls = persistableControls;
    return {
      id: this.persistedDocumentId() ?? undefined,
      type: raw.type,
      documentDate: new Date(raw.documentDate).toISOString(),
      supplierId: raw.supplierId || undefined,
      locationId: raw.locationId || undefined,
      currency: this.currency,
      causalText: raw.causalText.trim() || undefined,
      supplierRefType: raw.supplierRefType || undefined,
      notes: raw.notes.trim() || undefined,
      internalComment: raw.internalComment.trim() || undefined,
      billingCause: raw.invoicePending ? 'In attesa fattura' : raw.billingCause.trim() || undefined,
      externalRef: raw.externalRef.trim() || undefined,
      externalDocNumber: raw.externalDocNumber.trim() || undefined,
      externalDocDate: raw.externalDocDate
        ? new Date(raw.externalDocDate).toISOString()
        : undefined,
      ...(supplierOrderId ? { supplierOrderId } : {}),
      documentDiscountPercent: parseEffectiveDiscountPercent(raw.documentDiscountPercent),
      lines: persistableControls.map((control) => {
        const line = control.getRawValue();
        const cost = parseMoneyInput(line.unitCost, this.currency);
        const name = line.productName.trim() || line.description.trim();
        return {
          id: line.id || undefined,
          variantId: line.variantId || undefined,
          sku: line.sku.trim() || undefined,
          description: name || line.description.trim() || 'Riga documento',
          quantity: Number(line.quantity),
          unitPriceMinor: cost?.amountMinor ?? 0,
          discountPercent: parseEffectiveDiscountPercent(line.discountPercent ?? ''),
          vatRatePercent: line.vatRatePercent ? Number(line.vatRatePercent) : undefined,
          // Le righe senza articolo collegato non caricano ancora il magazzino:
          // il movimento nasce al salvataggio successivo, quando la riga è valida.
          loadsStock: line.loadsStock && Boolean(line.variantId),
          supplierOrderLineId: line.supplierOrderLineId || undefined,
          lotCode: line.lotCode.trim() || undefined,
          lotExpiryDate: line.lotExpiryDate
            ? new Date(line.lotExpiryDate).toISOString()
            : undefined,
          serialNumbers: parseSerialNumbersText(line.serialNumbersText),
        };
      }),
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
      map((doc) => {
        this.adoptSavedLineIds(doc);
        return doc;
      }),
    );
  }

  /**
   * Riassegna gli id riga dal documento salvato ai form group inviati: le
   * righe tornano nello stesso ordine (lineNumber progressivo sul payload).
   */
  private adoptSavedLineIds(doc: DocumentRecord): void {
    const savedLines = doc.lines ?? [];
    for (let index = 0; index < this.lastSavedLineControls.length; index += 1) {
      const control = this.lastSavedLineControls[index];
      const saved = savedLines[index];
      if (control && saved && this.lines.controls.includes(control)) {
        control.controls.id.setValue(saved.id, { emitEvent: false });
      }
    }
    this.lastSavedLineControls = [];
  }

  private syncActiveFieldBeforeSave(): void {
    const active = globalThis.document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  }

  private lineHasPersistableDataFromRaw(line: {
    readonly variantId: string;
    readonly sku?: string;
    readonly barcode?: string;
    readonly productName: string;
    readonly description: string;
    readonly quantity: number;
    readonly unitCost?: string;
    readonly sellingPrice?: string;
    readonly compareAtPrice?: string;
    readonly discountPercent?: string;
    readonly vatRatePercent?: string;
  }): boolean {
    const qty = Number(line.quantity);
    if (line.variantId) {
      return qty > 0;
    }
    if (qty <= 0) {
      return false;
    }
    return Boolean(
      line.sku?.trim() ||
      line.barcode?.trim() ||
      line.productName.trim() ||
      line.unitCost?.trim() ||
      line.sellingPrice?.trim() ||
      line.compareAtPrice?.trim() ||
      line.vatRatePercent?.trim(),
    );
  }

  private commitLineAndSave(index: number, after?: () => void): void {
    if (this.formReadOnly()) {
      after?.();
      return;
    }
    this.commitLineProducts$([index])
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.persistAutoSave({ stayOnPage: true, onComplete: after, onCompleteOnError: true });
        },
        error: (err: unknown) => {
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
          after?.();
        },
      });
  }

  private commitAllLineProducts$() {
    const indices = this.lines.controls
      .map((_, lineIndex) => lineIndex)
      .filter((lineIndex) => {
        const line = this.lines.at(lineIndex);
        return this.lineNeedsProductCreation(line) || this.lineNeedsVariantLink(line);
      });
    return this.commitLineProducts$(indices);
  }

  private commitLineProducts$(lineIndices: readonly number[]) {
    const pending = lineIndices
      .map((index) => ({ line: this.lines.at(index), index }))
      .filter(
        ({ line }) =>
          line != null && (this.lineNeedsProductCreation(line) || this.lineNeedsVariantLink(line)),
      );
    if (pending.length === 0) {
      return of(undefined);
    }
    return from(pending).pipe(
      concatMap(({ line, index }) => {
        if (this.lineNeedsProductCreation(line)) {
          return this.createProductForLine(line, index);
        }
        return this.linkLineByCode(line, index);
      }),
      defaultIfEmpty(undefined),
      last(),
    );
  }

  private linkLineByCode(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
    index: number,
  ): Observable<void> {
    const code = line.controls.sku.value.trim() || line.controls.barcode.value.trim();
    if (!code) {
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
      catchError(() => of(undefined)),
    );
  }

  private createProductForLine(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
    _index: number,
  ) {
    const name = line.controls.productName.value.trim();
    const sku = line.controls.sku.value.trim();
    if (!sku) {
      return throwError(() => ({
        kind: AppErrorKind.Validation,
        message: 'Per creare questo articolo devi inserire anche lo SKU.',
      }));
    }
    if (name.length < 2) {
      return throwError(() => ({
        kind: AppErrorKind.Validation,
        message: 'Per creare questo articolo inserisci il nome prodotto.',
      }));
    }
    const purchase = parseMoneyInput(line.controls.unitCost.value, this.currency);
    const selling =
      parseMoneyInput(line.controls.sellingPrice.value, this.currency) ??
      moneyFromMajor(0, this.currency);
    const compareAt = parseMoneyInput(line.controls.compareAtPrice.value, this.currency);
    const barcode = line.controls.barcode.value.trim() || undefined;
    const vatRaw = line.controls.vatRatePercent.value.trim();
    const defaultVat = vatRaw ? Number(vatRaw) : undefined;

    return this.productService
      .createProduct({
        name,
        status: ProductStatus.Active,
        defaultVatRatePercent:
          defaultVat != null && Number.isFinite(defaultVat) ? defaultVat : undefined,
        options: [],
        variants: [
          {
            sku,
            optionValues: [],
            sellingPrice: selling,
            purchasePrice: purchase?.amountMinor ? purchase : undefined,
            compareAtPrice: compareAt?.amountMinor ? compareAt : undefined,
            barcode,
          },
        ],
      })
      .pipe(
        switchMap(() => this.productService.findVariantByCode(sku)),
        map((variant) => {
          line.controls.variantId.setValue(variant.variantId, { emitEvent: false });
          line.controls.sku.setValue(variant.sku, { emitEvent: false });
          line.controls.barcode.setValue(variant.barcode ?? '', { emitEvent: false });
          line.controls.productName.setValue(variant.productName, { emitEvent: false });
          this.syncLineFieldAccess();
          return undefined;
        }),
        catchError((err: unknown) => throwError(() => err)),
      );
  }

  private patchFormFromDocument(doc: DocumentRecord): void {
    if (this.preserveEditSession()) {
      this.preserveEditSession.set(false);
      this.editUnlocked.set(true);
      return;
    }
    if (doc.status === DocumentStatus.Draft) {
      this.editUnlocked.set(true);
    } else {
      this.editUnlocked.set(false);
    }
    const poMap = new Map<string, LinkedSupplierOrderLineContext>();
    for (const line of doc.linkedSupplierOrderLines ?? []) {
      poMap.set(line.id, line);
    }
    this.supplierOrderLineMap.set(poMap);

    this.causalManuallyEdited = Boolean(doc.causalText?.trim());
    this.form.patchValue({
      type: doc.type,
      supplierId: doc.supplierId ?? '',
      locationId: doc.locationId ?? '',
      documentDate: doc.documentDate.slice(0, 10),
      supplierRefType: doc.supplierRefType ?? '',
      externalDocNumber: doc.externalDocNumber ?? '',
      externalDocDate: doc.externalDocDate ? doc.externalDocDate.slice(0, 10) : '',
      causalText: doc.causalText ?? '',
      notes: doc.notes ?? '',
      internalComment: doc.internalComment ?? '',
      billingCause: doc.billingCause === 'In attesa fattura' ? '' : (doc.billingCause ?? ''),
      externalRef: doc.externalRef ?? '',
      invoicePending: doc.billingCause === 'In attesa fattura',
      documentDiscountPercent:
        doc.documentDiscountPercent != null && doc.documentDiscountPercent > 0
          ? String(doc.documentDiscountPercent)
          : '',
    });
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
          unitCost: this.fb.control(moneyToDecimalString(line.unitPrice).replace('.', ',')),
          sellingPrice: this.fb.control(''),
          compareAtPrice: this.fb.control(''),
          discountPercent: this.fb.control(
            line.discountPercent > 0 ? String(line.discountPercent) : '',
          ),
          vatRatePercent: this.fb.control(line.vatRatePercent?.toString() ?? ''),
          loadsStock: this.fb.control(line.loadsStock),
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
      loadsStock: this.fb.control(true),
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
    const year = new Date(this.form.controls.documentDate.value).getFullYear();
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
