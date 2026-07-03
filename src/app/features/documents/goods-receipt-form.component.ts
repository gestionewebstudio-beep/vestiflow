import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  map,
  of,
  startWith,
  switchMap,
  EMPTY,
} from 'rxjs';
import type { Subscription } from 'rxjs';
import { take } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
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
import type { VariantSummary } from '@features/products/models/variant-summary.model';
import { ProductService } from '@features/products/services/product.service';
import { mergeVariantSummaries } from '@features/products/utils/variant-summary-search.util';
import { toVariantSelectMenuOptions } from '@features/products/utils/variant-select-menu.util';
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
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { TableViewId } from '@shared/table-columns/table-column.model';
import { TableColumnResizeDirective } from '@shared/directives/table-column-resize.directive';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';

import { TenantFeatureSettingsService } from '@features/settings/services/tenant-feature-settings.service';
import type { TenantFeatureSettings } from '@features/settings/models/tenant-feature-settings.model';
import { ProductFormComponent } from '@features/products/product-form.component';

import { DocumentAttachmentsPanelComponent } from './components/document-attachments-panel/document-attachments-panel.component';
import {
  GOODS_RECEIPT_LINE_COLUMNS,
  GOODS_RECEIPT_LINE_PRESETS,
  GOODS_RECEIPT_LINES_VIEW,
} from './models/goods-receipt-line-columns.config';
import {
  documentTypeLabel,
  documentStatusLabel,
  documentStatusTone,
} from './models/document-labels.util';
import { isGoodsReceiptDocumentType } from './models/document-goods-receipt.util';
import { DocumentService } from './services/document.service';
import { parseSerialNumbersText } from './utils/serial-numbers-input.util';

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

const VARIANT_SEARCH_DEBOUNCE_MS = 300;
const VARIANT_SEARCH_MIN_CHARS = 1;
const AUTO_SAVE_DEBOUNCE_MS = 2500;

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
    TableColumnResizeDirective,
    DocumentAttachmentsPanelComponent,
    SlidePanelComponent,
    ProductFormComponent,
  ],
  templateUrl: './goods-receipt-form.component.html',
  styleUrl: './goods-receipt-form.component.scss',
})
export class GoodsReceiptFormComponent {
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

  protected readonly listPath = '/app/documents';
  protected readonly currency = DEFAULT_CURRENCY;
  protected readonly formatMoney = formatMoney;
  protected readonly documentTypeLabel = documentTypeLabel;

  private readonly columnPreferences = inject(TableColumnPreferenceService);
  private readonly tenantFeatureSettingsService = inject(TenantFeatureSettingsService);

  protected readonly lineColumnsView = TableViewId.GoodsReceiptLines;
  protected readonly lineColumnDefs = GOODS_RECEIPT_LINE_COLUMNS;

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

  protected readonly documentStatusLabel = documentStatusLabel;
  protected readonly documentStatusTone = documentStatusTone;

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
  protected readonly attachTargetLineIndex = signal<number | null>(null);
  protected readonly registerDialogOpen = signal(false);
  protected readonly lifecycleActionSaving = signal(false);
  protected readonly attachWithoutAddDialogOpen = signal(false);
  protected readonly pendingAttachVariantId = signal<string | null>(null);

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

  protected readonly formReadOnly = computed(() => this.isEditMode() && !this.editUnlocked());

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
    toObservable(
      computed(() => ({
        search: this.variantSearchDraft(),
        supplierId: this.form.controls.supplierId.value,
        locationId: this.form.controls.locationId.value,
      })),
    ).pipe(
      debounceTime(VARIANT_SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(
        (a, b) =>
          a.search === b.search && a.supplierId === b.supplierId && a.locationId === b.locationId,
      ),
      switchMap(({ search, supplierId, locationId }) => {
        const term = search.trim();
        if (term.length < VARIANT_SEARCH_MIN_CHARS) {
          return of([] as readonly VariantSummary[]);
        }
        return this.productService.searchVariantSummaries({
          search: term,
          pageSize: 30,
          supplierId: supplierId || undefined,
          locationId: locationId || undefined,
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
  }

  private setupAutoSave(): void {
    this.form.valueChanges
      .pipe(debounceTime(AUTO_SAVE_DEBOUNCE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.formReadOnly() || this.saving()) {
          return;
        }
        if (!this.canAutoSave()) {
          return;
        }
        this.autoSavePending.set(true);
        this.persist(false, false, { stayOnPage: true });
      });
  }

  private canAutoSave(): boolean {
    return this.validateForAutoSave();
  }

  private validateForAutoSave(): boolean {
    const headerOk =
      !this.form.controls.supplierId.invalid &&
      !this.form.controls.locationId.invalid &&
      !this.form.controls.documentDate.invalid &&
      !this.form.controls.type.invalid;
    if (!headerOk) {
      return false;
    }
    return this.lines.controls.some(
      (line) =>
        line.controls.loadsStock.value &&
        Number(line.controls.quantity.value) > 0 &&
        Boolean(line.controls.variantId.value) &&
        !line.controls.description.invalid &&
        !line.controls.quantity.invalid,
    );
  }

  protected lineHasLinkedProduct(index: number): boolean {
    return Boolean(this.lines.at(index)?.controls.variantId.value);
  }

  private syncLineFieldAccess(): void {
    if (this.formReadOnly()) {
      return;
    }
    for (const line of this.lines.controls) {
      const linked = Boolean(line.controls.variantId.value);
      const productFields = [
        line.controls.variantId,
        line.controls.description,
        line.controls.unitCost,
        line.controls.vatRatePercent,
        line.controls.lotCode,
        line.controls.lotExpiryDate,
        line.controls.serialNumbersText,
      ] as const;
      for (const control of productFields) {
        if (linked) {
          control.disable({ emitEvent: false });
        } else {
          control.enable({ emitEvent: false });
        }
      }
    }
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

  protected readonly variantOptions = computed(() =>
    toVariantSelectMenuOptions(
      mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants()),
    ),
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

  protected readonly quickCreateLineIndex = signal<number | null>(null);
  readonly quickCreateForm = this.fb.group({
    name: this.fb.control('', { validators: [Validators.required] }),
    sku: this.fb.control('', { validators: [Validators.required] }),
    barcode: this.fb.control(''),
    purchasePrice: this.fb.control(''),
    sellingPrice: this.fb.control(''),
  });
  private readonly _savingQuickProduct = signal(false);
  protected readonly savingQuickProduct = this._savingQuickProduct.asReadonly();

  protected readonly confirmDialogOpen = signal(false);
  protected readonly supplierPriceDialogOpen = signal(false);
  private applySupplierPriceUpdates = false;
  private readonly pendingConfirmDocId = signal<string | null>(null);

  private autoSaveSubscription: Subscription | null = null;
  private readonly autoSavePending = signal(false);
  private supplierSubscription: Subscription | null = null;

  protected readonly autoSaveStatus = computed(() => {
    if (this.saving() && this.autoSavePending()) {
      return 'saving' as const;
    }
    return 'idle' as const;
  });
  private quickProductSubscription: Subscription | null = null;
  private submitSubscription: Subscription | null = null;

  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
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

  protected onVariantSearch(value: string): void {
    this.variantSearchDraft.set(value);
  }

  protected onVariantSelect(index: number, value: string | null): void {
    const line = this.lines.at(index);
    line.controls.variantId.setValue(value ?? '');
    line.controls.variantId.markAsTouched();
    if (value) {
      const summary = mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants()).find(
        (v) => v.variantId === value,
      );
      if (summary) {
        if (!line.controls.description.value.trim()) {
          line.controls.description.setValue(`${summary.productName} · ${summary.title}`.trim());
        }
        if (!line.controls.unitCost.value.trim() && summary.purchasePrice?.amountMinor) {
          line.controls.unitCost.setValue(
            moneyToDecimalString(summary.purchasePrice).replace('.', ','),
          );
        }
      }
    }
    this.syncLineFieldAccess();
  }

  protected productPanelPrefill = computed(() => {
    const index = this.productPanelLineIndex();
    if (index == null) {
      return null;
    }
    const line = this.lines.at(index);
    if (!line) {
      return null;
    }
    const desc = line.controls.description.value.trim();
    const namePart = desc.split('·')[0]?.trim() || desc;
    const cost = parseMoneyInput(line.controls.unitCost.value, this.currency);
    const vatRaw = line.controls.vatRatePercent.value.trim();
    return {
      name: namePart,
      description: desc,
      purchasePriceMajor: cost ? cost.amountMinor / 100 : null,
      defaultVatRatePercent: vatRaw ? Number(vatRaw) : null,
    };
  });

  protected openProductAnagraphic(index: number): void {
    this.openFullProductCreate(index);
  }

  protected openNewProduct(): void {
    this.attachTargetLineIndex.set(null);
    this.productPanelLineIndex.set(null);
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
          if (productId) {
            void this.router.navigate(['/app/products', productId]);
          }
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

  protected onLoadsStockChange(index: number): void {
    const line = this.lines.at(index);
    const loads = line.controls.loadsStock.value;
    const variantControl = line.controls.variantId;
    if (loads) {
      variantControl.setValidators([Validators.required]);
    } else {
      variantControl.clearValidators();
    }
    variantControl.updateValueAndValidity();
  }

  protected addLine(): void {
    this.lines.push(this.createLine());
  }

  protected removeLine(index: number): void {
    if (this.lines.length > 1) {
      this.lines.removeAt(index);
      if (this.quickCreateLineIndex() === index) {
        this.quickCreateLineIndex.set(null);
      }
    }
  }

  protected fieldInvalid(name: 'supplierId' | 'locationId' | 'documentDate'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected lineFieldInvalid(
    index: number,
    name: 'variantId' | 'description' | 'quantity',
  ): boolean {
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

  protected openQuickCreate(index: number): void {
    const line = this.lines.at(index);
    const draft = this.variantSearchDraft().trim();
    this.quickCreateForm.reset({
      name: line.controls.description.value.trim() || draft,
      sku: draft.length >= 2 ? draft.toUpperCase() : '',
      barcode: '',
      purchasePrice: line.controls.unitCost.value,
      sellingPrice: line.controls.unitCost.value,
    });
    this.quickCreateLineIndex.set(index);
  }

  protected closeQuickCreate(): void {
    this.quickCreateLineIndex.set(null);
    this.quickCreateForm.reset();
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
        },
        error: (err: unknown) => {
          this._savingSupplier.set(false);
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  protected saveQuickProduct(): void {
    const index = this.quickCreateLineIndex();
    if (index == null || this.quickCreateForm.invalid || this._savingQuickProduct()) {
      this.quickCreateForm.markAllAsTouched();
      return;
    }
    const raw = this.quickCreateForm.getRawValue();
    const purchase = parseMoneyInput(raw.purchasePrice, this.currency) ?? zeroMoney(this.currency);
    const selling =
      parseMoneyInput(raw.sellingPrice, this.currency) ??
      (purchase.amountMinor > 0 ? purchase : moneyFromMajor(0, this.currency));

    this._savingQuickProduct.set(true);
    this.quickProductSubscription = this.productService
      .createProduct({
        name: raw.name.trim(),
        status: ProductStatus.Active,
        options: [],
        variants: [
          {
            sku: raw.sku.trim(),
            optionValues: [],
            sellingPrice: selling,
            purchasePrice: purchase.amountMinor > 0 ? purchase : undefined,
            barcode: raw.barcode.trim() || undefined,
          },
        ],
      })
      .pipe(
        switchMap(() => this.productService.findVariantByCode(raw.sku.trim())),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (variant) => {
          this._savingQuickProduct.set(false);
          this.onVariantSelect(index, variant.variantId);
          const line = this.lines.at(index);
          line.controls.description.setValue(variant.productName);
          if (!line.controls.unitCost.value.trim() && purchase.amountMinor > 0) {
            line.controls.unitCost.setValue(moneyToDecimalString(purchase).replace('.', ','));
          }
          this.closeQuickCreate();
        },
        error: (err: unknown) => {
          this._savingQuickProduct.set(false);
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  protected saveDraft(): void {
    void this.persist(false);
  }

  protected saveConfirmedChanges(): void {
    void this.persist(false);
  }

  protected requestConfirm(): void {
    if (!this.validateForm()) {
      return;
    }
    this.applySupplierPriceUpdates = false;
    this.confirmDialogOpen.set(true);
  }

  protected confirmAndSave(): void {
    this.confirmDialogOpen.set(false);
    void this.persist(true, this.applySupplierPriceUpdates);
  }

  protected confirmSupplierPriceUpdate(apply: boolean): void {
    const docId = this.pendingConfirmDocId();
    this.supplierPriceDialogOpen.set(false);
    if (!docId) {
      return;
    }
    this._submitState.set({ status: 'saving' });
    this.documentService
      .confirmDocument(docId, { applySupplierPriceUpdates: apply })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (doc) => {
          this.pendingConfirmDocId.set(null);
          this._submitState.set({ status: 'idle' });
          void this.router.navigate([this.listPath, doc.id]);
        },
        error: (err: unknown) => {
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  protected isLineColumnVisible(columnId: string): boolean {
    const settings = this.tenantSettings();
    if (columnId === 'lot' || columnId === 'expiry') {
      if (settings && !settings.lotsEnabled) {
        return false;
      }
    }
    if (columnId === 'serials' && settings && !settings.serialsEnabled) {
      return false;
    }
    if (
      (columnId === 'poOrdered' || columnId === 'poReceived' || columnId === 'poRemaining') &&
      !this.hasLinkedSupplierOrder()
    ) {
      return false;
    }
    return this.columnPreferences.isColumnVisible(GOODS_RECEIPT_LINES_VIEW, columnId);
  }

  protected lineColumnWidth(columnId: string): string {
    const def = GOODS_RECEIPT_LINE_COLUMNS.find((col) => col.id === columnId);
    const fallback = def?.defaultWidthPx ?? 96;
    return `${this.columnPreferences.columnWidth(GOODS_RECEIPT_LINES_VIEW, columnId, fallback)}px`;
  }

  protected onLineColumnResize(columnId: string, widthPx: number): void {
    this.columnPreferences.setColumnWidth(GOODS_RECEIPT_LINES_VIEW, columnId, widthPx);
  }

  protected openFullProductCreate(lineIndex: number): void {
    this.attachTargetLineIndex.set(lineIndex);
    this.productPanelLineIndex.set(lineIndex);
    this.productPanelOpen.set(true);
  }

  protected closeProductPanel(): void {
    this.productPanelOpen.set(false);
    this.productPanelLineIndex.set(null);
  }

  protected onProductCreatedFromPanel(event: { readonly variantId: string }): void {
    const lineIndex = this.productPanelLineIndex();
    if (lineIndex != null) {
      this.onVariantSelect(lineIndex, event.variantId);
      this.syncLineFieldAccess();
    }
    this.closeProductPanel();
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
    if (this.saving()) {
      return;
    }
    if (!this.formReadOnly() && this.canAutoSave()) {
      const leave = globalThis.confirm(
        'Hai modifiche non ancora salvate automaticamente. Uscire comunque?',
      );
      if (!leave) {
        return;
      }
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
  }

  private validateForm(): boolean {
    if (this.form.invalid || this.hasInvalidCost() || !this.hasStockLine()) {
      this.form.markAllAsTouched();
      return false;
    }
    return true;
  }

  private hasStockLine(): boolean {
    return this.lines.controls.some(
      (line) => line.controls.loadsStock.value && Number(line.controls.quantity.value) > 0,
    );
  }

  private persist(
    confirmAfterSave: boolean,
    applySupplierPriceUpdates = false,
    options?: { readonly stayOnPage?: boolean },
  ): void {
    if (this.saving()) {
      return;
    }
    if (!(options?.stayOnPage ? this.validateForAutoSave() : this.validateForm())) {
      if (!options?.stayOnPage) {
        this.form.markAllAsTouched();
      }
      this.autoSavePending.set(false);
      return;
    }
    const raw = this.form.getRawValue();
    const body = {
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
        .filter((line) => line.description.trim() || line.variantId)
        .map((line) => {
          const cost = parseMoneyInput(line.unitCost, this.currency);
          return {
            variantId: line.variantId || undefined,
            description: line.description.trim() || 'Riga documento',
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

    const editId = this.editDocumentId();
    const confirmedEdit = this.isConfirmedEdit();
    this._submitState.set({ status: 'saving' });

    const save$ = editId
      ? this.documentService.updateDocument(editId, body)
      : this.documentService.createDocument(body);

    const request$ =
      confirmAfterSave && !confirmedEdit
        ? save$.pipe(
            switchMap((doc) => {
              if (applySupplierPriceUpdates) {
                return this.documentService.confirmDocument(doc.id, {
                  applySupplierPriceUpdates: true,
                });
              }
              return this.documentService.listSupplierPriceDiffs(doc.id).pipe(
                switchMap(({ items, policy }) => {
                  if (policy === 'ask' && items.length > 0) {
                    this.pendingConfirmDocId.set(doc.id);
                    this._submitState.set({ status: 'idle' });
                    this.supplierPriceDialogOpen.set(true);
                    return EMPTY;
                  }
                  return this.documentService.confirmDocument(doc.id, {
                    applySupplierPriceUpdates: policy === 'always' && items.length > 0,
                  });
                }),
              );
            }),
          )
        : save$;

    this.submitSubscription = request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (doc) => {
        this._submitState.set({ status: 'idle' });
        this.autoSavePending.set(false);
        this.loadedDocument.set(doc);
        if (options?.stayOnPage) {
          if (!editId) {
            this.preserveEditSession.set(true);
            void this.router.navigate(['/app/documents', doc.id, 'edit'], { replaceUrl: true });
          }
          this.editUnlocked.set(true);
          this.syncLineFieldAccess();
          return;
        }
        void this.router.navigate([this.listPath, doc.id]);
      },
      error: (err: unknown) => {
        this.autoSavePending.set(false);
        this._submitState.set({ status: 'error', error: this.toAppError(err) });
      },
    });
  }

  private patchFormFromDocument(doc: DocumentRecord): void {
    if (this.preserveEditSession()) {
      this.preserveEditSession.set(false);
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
          variantId: this.fb.control(line.variantId ?? '', {
            validators: line.loadsStock ? [Validators.required] : [],
          }),
          description: this.fb.control(line.description, { validators: [Validators.required] }),
          quantity: this.fb.control(line.quantity, {
            validators: [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)],
          }),
          unitCost: this.fb.control(moneyToDecimalString(line.unitPrice).replace('.', ',')),
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
    this.syncLineFieldAccess();
  }

  private createLine() {
    return this.fb.group({
      variantId: this.fb.control('', { validators: [Validators.required] }),
      description: this.fb.control('', { validators: [Validators.required] }),
      quantity: this.fb.control(1, {
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      unitCost: this.fb.control(''),
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
