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
} from 'rxjs';
import type { Subscription } from 'rxjs';
import { take } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Money } from '@core/models/common.model';
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
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { documentTypeLabel } from './models/document-labels.util';
import { isGoodsReceiptDocumentType } from './models/document-goods-receipt.util';
import { DocumentService } from './services/document.service';
import { parseSerialNumbersText } from './utils/serial-numbers-input.util';

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

const VARIANT_SEARCH_DEBOUNCE_MS = 300;
const VARIANT_SEARCH_MIN_CHARS = 2;

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
    ButtonComponent,
    ConfirmDialogComponent,
    DateInputComponent,
    SelectMenuComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
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

  protected readonly typeOptions: readonly SelectMenuOption[] = [
    DocumentType.GoodsReceipt,
    DocumentType.SupplierDdt,
    DocumentType.SupplierInvoiceAccompanying,
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
        return this.productService.searchVariantSummaries({ search: term, pageSize: 30 });
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
    lines: this.fb.array([this.createLine()]),
  });

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

  private supplierSubscription: Subscription | null = null;
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
      if (summary && !line.controls.description.value.trim()) {
        line.controls.description.setValue(`${summary.productName} · ${summary.title}`.trim());
      }
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
    this.confirmDialogOpen.set(true);
  }

  protected confirmAndSave(): void {
    this.confirmDialogOpen.set(false);
    void this.persist(true);
  }

  protected cancel(): void {
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

  private persist(confirmAfterSave: boolean): void {
    if (this.saving() || !this.validateForm()) {
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
        ? save$.pipe(switchMap((doc) => this.documentService.confirmDocument(doc.id)))
        : save$;

    this.submitSubscription = request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (doc) => {
        this._submitState.set({ status: 'idle' });
        void this.router.navigate([this.listPath, doc.id]);
      },
      error: (err: unknown) => {
        this._submitState.set({ status: 'error', error: this.toAppError(err) });
      },
    });
  }

  private patchFormFromDocument(doc: DocumentRecord): void {
    this.form.patchValue({
      type: doc.type,
      supplierId: doc.supplierId ?? '',
      locationId: doc.locationId ?? '',
      documentDate: doc.documentDate.slice(0, 10),
      externalDocNumber: doc.externalDocNumber ?? '',
      externalDocDate: doc.externalDocDate ? doc.externalDocDate.slice(0, 10) : '',
      notes: doc.notes ?? '',
      internalComment: doc.internalComment ?? '',
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

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
