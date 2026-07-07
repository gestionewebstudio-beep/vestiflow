import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
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
  type Observable,
} from 'rxjs';
import type { Subscription } from 'rxjs';
import { take } from 'rxjs';

import type { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import type { AppError } from '@core/models/app-error.model';
import type { Money } from '@core/models/common.model';
import type { LinkedSupplierOrderLineContext } from '@core/models/document.model';
import { DocumentStatus, DocumentType } from '@core/models/document.model';
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
  zeroMoney,
} from '@core/utils/money.util';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import { normalizeSku } from '@features/products/models/product-form.validators';
import { ProductService } from '@features/products/services/product.service';
import { mergeVariantSummaries } from '@features/products/utils/variant-summary-search.util';
import { SupplierService } from '@features/suppliers/services/supplier.service';
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
import { DocumentService } from './services/document.service';
import type { CreateDocumentBody, UpdateDocumentBody } from './services/document-api.mapper';
import { parseSerialNumbersText } from './utils/serial-numbers-input.util';

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
  | 'product'
  | 'quantity'
  | 'unitCost'
  | 'sellingPrice'
  | 'compareAtPrice'
  | 'vat';

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
  ],
  templateUrl: './goods-receipt-form.component.html',
  styleUrl: './goods-receipt-form.component.scss',
})
export class GoodsReceiptFormComponent implements CanComponentDeactivate {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly documentService = inject(DocumentService);
  private readonly supplierService = inject(SupplierService);
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

  private pendingDeactivate: ((allow: boolean) => void) | null = null;

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
    toObservable(computed(() => this.variantSearchDraft())).pipe(
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

  readonly form = this.fb.group({
    type: this.fb.control<DocumentType>(DocumentType.GoodsReceipt, {
      validators: [Validators.required],
    }),
    supplierId: this.fb.control('', { validators: [Validators.required] }),
    locationId: this.fb.control('', { validators: [Validators.required] }),
    documentDate: this.fb.control(new Date().toISOString().slice(0, 10), {
      validators: [Validators.required],
    }),
    externalDocNumber: this.fb.control(''),
    externalDocDate: this.fb.control(''),
    notes: this.fb.control(''),
    internalComment: this.fb.control(''),
    billingCause: this.fb.control(''),
    externalRef: this.fb.control(''),
    invoicePending: this.fb.control(false),
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
    this.refreshNumberPreview();
    this.setupAutoSave();
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
    const term = this.variantSearchDraft().trim();
    return (
      this.autocompleteLineIndex() === index &&
      term.length >= VARIANT_SEARCH_MIN_CHARS &&
      !this.lineHasLinkedProduct(index)
    );
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
    this.triggerAutoSave();
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
    if (event.key === 'ArrowDown' && !event.shiftKey) {
      event.preventDefault();
      this.advanceToNextLine(index);
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

  private visibleLineFocusFields(index: number): readonly GoodsReceiptLineFocusField[] {
    const all: GoodsReceiptLineFocusField[] = [
      'sku',
      'barcode',
      'product',
      'quantity',
      'unitCost',
      'sellingPrice',
      'compareAtPrice',
      'vat',
    ];
    const linked = this.lineHasLinkedProduct(index);
    return all.filter((field) => {
      if (linked) {
        return field === 'quantity';
      }
      if (field === 'sku') {
        return this.isLineColumnVisible('sku');
      }
      if (field === 'barcode') {
        return this.isLineColumnVisible('barcode');
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
      if (field === 'sellingPrice') {
        return this.isLineColumnVisible('sellingPrice');
      }
      if (field === 'compareAtPrice') {
        return this.isLineColumnVisible('compareAtPrice');
      }
      if (field === 'vat') {
        return this.isLineColumnVisible('vat');
      }
      return false;
    });
  }

  protected focusLineField(index: number, field: GoodsReceiptLineFocusField): void {
    const idMap: Record<GoodsReceiptLineFocusField, string> = {
      sku: `gr-sku-${index}`,
      barcode: `gr-barcode-${index}`,
      product: `gr-product-${index}`,
      quantity: `gr-qty-${index}`,
      unitCost: `gr-cost-${index}`,
      sellingPrice: `gr-selling-${index}`,
      compareAtPrice: `gr-compare-${index}`,
      vat: `gr-vat-${index}`,
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
    const sku = line.controls.sku.value.trim();
    return (
      !line.controls.variantId.value &&
      sku.length > 0 &&
      line.controls.productName.value.trim().length >= 2 &&
      Number(line.controls.quantity.value) > 0
    );
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

  protected readonly documentTotal = computed<Money>(() => {
    this.formValue();
    return this.lines.controls.reduce<Money>((acc, line) => {
      const cost = parseMoneyInput(line.controls.unitCost.value, this.currency);
      const qty = Number(line.controls.quantity.value);
      const amount = cost && Number.isFinite(qty) ? cost.amountMinor * qty : 0;
      return { amountMinor: acc.amountMinor + amount, currencyCode: this.currency };
    }, zeroMoney(this.currency));
  });

  protected readonly showSupplierForm = signal(false);
  readonly supplierForm = this.fb.group({
    name: this.fb.control('', { validators: [Validators.required] }),
    email: this.fb.control('', { validators: [Validators.email] }),
    phone: this.fb.control(''),
  });
  private readonly _savingSupplier = signal(false);
  protected readonly savingSupplier = this._savingSupplier.asReadonly();

  private autoSavePending = signal(false);
  private supplierSubscription: Subscription | null = null;
  private submitSubscription: Subscription | null = null;
  private readonly dirtySinceLastSave = signal(false);

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

  protected lineMoney(index: number): Money {
    this.formValue();
    const line = this.lines.at(index);
    const cost = parseMoneyInput(line.controls.unitCost.value, this.currency);
    const qty = Number(line.controls.quantity.value);
    const amount = cost && Number.isFinite(qty) ? cost.amountMinor * qty : 0;
    return { amountMinor: amount, currencyCode: this.currency };
  }

  protected onTypeSelect(value: string | null): void {
    if (value && isGoodsReceiptDocumentType(value as DocumentType)) {
      this.form.controls.type.setValue(value as DocumentType);
    }
  }

  protected onSupplierSelect(value: string | null): void {
    this.form.controls.supplierId.setValue(value ?? '');
    this.form.controls.supplierId.markAsTouched();
  }

  protected onLocationSelect(value: string | null): void {
    this.form.controls.locationId.setValue(value ?? '');
    this.form.controls.locationId.markAsTouched();
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

  protected onLoadsStockChange(_index: number): void {
    this.triggerAutoSave();
  }

  protected addLine(): void {
    const lastIndex = Math.max(0, this.lines.length - 1);
    this.commitLineAndSave(lastIndex, () => {
      this.lines.push(this.createLine());
      this.trimDuplicateTrailingEmptyRows();
      this.focusFirstLineField(this.lines.length - 1);
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
    const id = this.editDocumentId();
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
    this.exitDialogOpen.set(true);
    return new Promise<boolean>((resolve) => {
      this.pendingDeactivate = resolve;
    });
  }

  protected confirmExitSaveDocument(): void {
    this.exitDialogOpen.set(false);
    this.syncActiveFieldBeforeSave();
    if (!this.validateForAutoSave()) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: 'Compila fornitore, magazzino e data documento prima di salvare.',
        },
      });
      this.resolveExit(false);
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
      this.resolveExit(false);
      return;
    }
    this._submitState.set({ status: 'saving' });
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
          this.resolveExit(true);
        },
        error: (err: unknown) => {
          this._submitState.set({
            status: 'error',
            error: isAppError(err)
              ? err
              : {
                  kind: AppErrorKind.Unknown,
                  message:
                    'Non è stato possibile salvare il documento. Controlla le righe e riprova.',
                },
          });
          this.resolveExit(false);
        },
      });
  }

  protected confirmExitDeleteDocument(): void {
    this.exitDialogOpen.set(false);
    const id = this.editDocumentId();
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
      .createSupplier({
        name: raw.name.trim(),
        email: raw.email.trim() || undefined,
        phone: raw.phone.trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (supplier) => {
          this._savingSupplier.set(false);
          this.showSupplierForm.set(false);
          this.supplierForm.reset();
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
  }

  private persistAutoSave(options?: {
    readonly stayOnPage?: boolean;
    readonly onComplete?: () => void;
    readonly onCompleteOnError?: boolean;
  }): void {
    if (this.saving()) {
      return;
    }
    if (!this.canPersistAutoSaveDocument()) {
      this.autoSavePending.set(false);
      return;
    }
    this.dirtySinceLastSave.set(true);
    this._submitState.set({ status: 'saving' });

    const editId = this.editDocumentId();
    this.saveDocument$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (doc) => {
          this._submitState.set({ status: 'idle' });
          this.autoSavePending.set(false);
          this.dirtySinceLastSave.set(false);
          this.loadedDocument.set(doc);
          if (doc.status === DocumentStatus.Draft || options?.stayOnPage) {
            this.editUnlocked.set(true);
          }
          if (options?.stayOnPage) {
            if (!editId) {
              this.preserveEditSession.set(true);
              void this.router.navigate(['/app/documents', doc.id, 'edit'], { replaceUrl: true });
            }
            this.syncLineFieldAccess();
            this.ensureMinimumOneRow();
            this.trimDuplicateTrailingEmptyRows();
            options.onComplete?.();
            return;
          }
          void this.router.navigate([this.listPath, doc.id]);
        },
        error: (err: unknown) => {
          this.autoSavePending.set(false);
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
          if (options?.onCompleteOnError) {
            options.onComplete?.();
          }
        },
      });
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

  private buildDocumentSaveBody(): CreateDocumentBody {
    const raw = this.form.getRawValue();
    return {
      type: raw.type,
      documentDate: new Date(raw.documentDate).toISOString(),
      supplierId: raw.supplierId,
      locationId: raw.locationId,
      currency: this.currency,
      notes: raw.notes.trim() || undefined,
      internalComment: raw.internalComment.trim() || undefined,
      billingCause: raw.invoicePending ? 'In attesa fattura' : raw.billingCause.trim() || undefined,
      externalRef: raw.externalRef.trim() || undefined,
      externalDocNumber: raw.externalDocNumber.trim() || undefined,
      externalDocDate: raw.externalDocDate
        ? new Date(raw.externalDocDate).toISOString()
        : undefined,
      lines: raw.lines
        .filter((line) => this.lineHasPersistableDataFromRaw(line))
        .map((line) => {
          const cost = parseMoneyInput(line.unitCost, this.currency);
          const name = line.productName.trim() || line.description.trim();
          return {
            variantId: line.variantId || undefined,
            sku: line.sku.trim() || undefined,
            description: name || line.description.trim() || 'Riga documento',
            quantity: Number(line.quantity),
            unitPriceMinor: cost?.amountMinor ?? 0,
            vatRatePercent: line.vatRatePercent ? Number(line.vatRatePercent) : undefined,
            loadsStock: line.loadsStock,
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

  private buildDocumentUpdateBody(): UpdateDocumentBody {
    const { type: _documentType, ...body } = this.buildDocumentSaveBody();
    return body;
  }

  private saveDocument$(): Observable<DocumentRecord> {
    const editId = this.editDocumentId();
    if (editId) {
      return this.documentService.updateDocument(editId, this.buildDocumentUpdateBody());
    }
    return this.documentService.createDocument(this.buildDocumentSaveBody());
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
      .filter((lineIndex) => this.lineNeedsProductCreation(this.lines.at(lineIndex)));
    return this.commitLineProducts$(indices);
  }

  private commitLineProducts$(lineIndices: readonly number[]) {
    const pending = lineIndices
      .map((index) => ({ line: this.lines.at(index), index }))
      .filter(({ line }) => line != null && this.lineNeedsProductCreation(line));
    if (pending.length === 0) {
      return of(undefined);
    }
    return from(pending).pipe(
      concatMap(({ line, index }) => this.createProductForLine(line, index)),
      defaultIfEmpty(undefined),
      last(),
    );
  }

  private createProductForLine(
    line: ReturnType<GoodsReceiptFormComponent['createLine']>,
    _index: number,
  ) {
    const name = line.controls.productName.value.trim();
    const sku = line.controls.sku.value.trim();
    if (!sku) {
      return of(undefined);
    }
    const purchase = parseMoneyInput(line.controls.unitCost.value, this.currency);
    const selling =
      parseMoneyInput(line.controls.sellingPrice.value, this.currency) ??
      moneyFromMajor(0, this.currency);
    const compareAt = parseMoneyInput(line.controls.compareAtPrice.value, this.currency);
    const barcode = line.controls.barcode.value.trim() || undefined;

    return this.productService
      .createProduct({
        name,
        status: ProductStatus.Active,
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

    this.form.patchValue({
      type: doc.type,
      supplierId: doc.supplierId ?? '',
      locationId: doc.locationId ?? '',
      documentDate: doc.documentDate.slice(0, 10),
      externalDocNumber: doc.externalDocNumber ?? '',
      externalDocDate: doc.externalDocDate ? doc.externalDocDate.slice(0, 10) : '',
      notes: doc.notes ?? '',
      internalComment: doc.internalComment ?? '',
      billingCause: doc.billingCause === 'In attesa fattura' ? '' : (doc.billingCause ?? ''),
      externalRef: doc.externalRef ?? '',
      invoicePending: doc.billingCause === 'In attesa fattura',
    });
    this.lines.clear();
    for (const line of doc.lines ?? []) {
      this.lines.push(
        this.fb.group({
          variantId: this.fb.control(line.variantId ?? ''),
          sku: this.fb.control(line.sku ?? ''),
          barcode: this.fb.control(''),
          productName: this.fb.control(line.description),
          description: this.fb.control(line.description),
          quantity: this.fb.control(line.quantity, {
            validators: [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)],
          }),
          unitCost: this.fb.control(moneyToDecimalString(line.unitPrice).replace('.', ',')),
          sellingPrice: this.fb.control(''),
          compareAtPrice: this.fb.control(''),
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
  }

  private createLine() {
    return this.fb.group({
      variantId: this.fb.control(''),
      sku: this.fb.control(''),
      barcode: this.fb.control(''),
      productName: this.fb.control(''),
      description: this.fb.control(''),
      quantity: this.fb.control(1, {
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      unitCost: this.fb.control(''),
      sellingPrice: this.fb.control(''),
      compareAtPrice: this.fb.control(''),
      vatRatePercent: this.fb.control(''),
      loadsStock: this.fb.control(true),
      supplierOrderLineId: this.fb.control(''),
      lotCode: this.fb.control(''),
      lotExpiryDate: this.fb.control(''),
      serialNumbersText: this.fb.control(''),
    });
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
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
