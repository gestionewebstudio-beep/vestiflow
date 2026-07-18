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

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Money } from '@core/models/common.model';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import type { SupplierOrder } from '@core/models/supplier-order.model';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  moneyToDecimalString,
  parseMoneyInput,
} from '@core/utils/money.util';
import type { PaymentOption } from '@core/models/payment-option.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { isPurchaseVatCode, vatCodeOptionLabel } from '@core/models/vat-code.model';
import type { PurchaseCostEntryMode, VatCode } from '@core/models/vat-code.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { TableViewId } from '@shared/table-columns/table-column.model';
import { TableColumnResizeDirective } from '@shared/directives/table-column-resize.directive';

import {
  SUPPLIER_ORDER_LINE_COLUMNS,
  SUPPLIER_ORDER_LINE_PRESETS,
  SUPPLIER_ORDER_LINES_VIEW,
  normalizeSupplierOrderColumnId,
} from './models/supplier-order-line-columns.config';

import type { ProductEmbeddedCreatePrefill } from '@features/products/models/product-form.mapper';
import type { VariantSummary } from '@features/products/models/variant-summary.model';
import { ProductFormComponent } from '@features/products/product-form.component';
import { ProductService } from '@features/products/services/product.service';
import { mergeVariantSummaries } from '@features/products/utils/variant-summary-search.util';
import { toVariantSelectMenuOptions } from '@features/products/utils/variant-select-menu.util';

import { SupplierOrderService } from './services/supplier-order.service';
import { SupplierService } from '@features/suppliers/services/supplier.service';
import { SupplierFormFieldsComponent } from '@features/suppliers/components/supplier-form-fields/supplier-form-fields.component';
import {
  createSupplierFormGroup,
  mapSupplierFormToInput,
  resetSupplierFormGroup,
} from '@features/suppliers/utils/supplier-form.util';

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

const VARIANT_SEARCH_DEBOUNCE_MS = 300;
const VARIANT_SEARCH_MIN_CHARS = 2;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Maschera Ordine fornitore (prompt 2026-07). Testata: Fornitore, Data,
 * Consegna prevista, Rif. ordine fornitore; numerazione dal numeratore
 * supplier_order (Numeratori). Righe con Sconto, IVA e switch costi
 * netto/ivato come l'Arrivo merce. L'ordine nasce Confermato e NON incide
 * su giacenze o disponibilità. Owner: gestionale (CRUD locale).
 */
@Component({
  selector: 'app-supplier-order-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
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
  ],
  templateUrl: './supplier-order-form.component.html',
  styleUrl: './supplier-order-form.component.scss',
})
export class SupplierOrderFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly orderService = inject(SupplierOrderService);
  private readonly supplierService = inject(SupplierService);
  private readonly productService = inject(ProductService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly paymentOptionsService = inject(PaymentOptionsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly columnPreferences = inject(TableColumnPreferenceService);

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
            this.patchFormFromOrder(order);
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
  protected readonly costModeLabel = computed(() =>
    this.costEntryMode() === 'vat_included' ? 'Costo ivato' : 'Costo netto',
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

  protected readonly variantOptions = computed(() =>
    toVariantSelectMenuOptions(
      mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants()),
    ),
  );

  // Snapshot reattivo del form per totali e celle derivate.
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /**
   * Importi riga client-side allineati al motore server (vat-line-calculation):
   * costi ivati → scorporo dal totale riga; costi netti → IVA derivata.
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
    const cost = parseMoneyInput(line.controls.unitCost.value, this.currency);
    const qty = Number(line.controls.orderedQuantity.value);
    if (!cost || !Number.isFinite(qty)) {
      return { net: 0, vat: 0, affects: false };
    }
    const discountRaw = Number(line.controls.discountPercent.value);
    const discount = Number.isFinite(discountRaw) ? Math.min(100, Math.max(0, discountRaw)) : 0;
    const vatCode = this.vatCodesById().get(line.controls.vatCodeId.value);
    const rate = vatCode ? Math.max(0, vatCode.ratePercent) : 0;
    const exposed =
      vatCode?.calculationMode === 'standard' || vatCode?.calculationMode === 'split_payment';
    const affects = vatCode?.vatAffectsSupplierTotal ?? false;

    if (this.costEntryMode() === 'vat_included' && exposed && rate > 0) {
      const gross = Math.round((qty * cost.amountMinor * (100 - discount)) / 100);
      const net = Math.round((gross * 100) / (100 + rate));
      return { net, vat: gross - net, affects };
    }
    const net = Math.round((qty * cost.amountMinor * (100 - discount)) / 100);
    const vat = rate > 0 ? Math.round((net * rate) / 100) : 0;
    return { net, vat, affects };
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

  constructor() {
    this.columnPreferences.registerView(
      SUPPLIER_ORDER_LINES_VIEW,
      SUPPLIER_ORDER_LINE_COLUMNS,
      SUPPLIER_ORDER_LINE_PRESETS,
    );
  }

  protected isLineColumnVisible(columnId: string): boolean {
    return this.columnPreferences.isColumnVisible(
      SUPPLIER_ORDER_LINES_VIEW,
      normalizeSupplierOrderColumnId(columnId),
    );
  }

  protected lineColumnWidth(columnId: string): string {
    const normalizedId = normalizeSupplierOrderColumnId(columnId);
    const def = SUPPLIER_ORDER_LINE_COLUMNS.find((col) => col.id === normalizedId);
    const fallback = def?.defaultWidthPx ?? 96;
    return `${this.columnPreferences.columnWidth(SUPPLIER_ORDER_LINES_VIEW, normalizedId, fallback)}px`;
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

  protected selectCostMode(mode: PurchaseCostEntryMode): void {
    this.costEntryMode.set(mode);
    this.costModeMenuOpen.set(false);
  }

  /** Vista denormalizzata della variante di riga per le colonne display. */
  protected lineSummary(index: number): VariantSummary | null {
    const variantId = this.lines.at(index)?.controls.variantId.value;
    if (!variantId) {
      return null;
    }
    return (
      mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants()).find(
        (row) => row.variantId === variantId,
      ) ?? null
    );
  }

  protected lineDisplay(
    index: number,
    field: 'articleCode' | 'sku' | 'barcode' | 'supplierSku' | 'unitOfMeasure',
  ): string {
    const summary = this.lineSummary(index);
    const value = summary?.[field];
    return value?.trim() ? value : '—';
  }

  protected lineStock(index: number, field: 'stockOnHand' | 'stockAvailable'): string {
    const summary = this.lineSummary(index);
    const value = summary?.[field];
    return value == null ? '—' : String(value);
  }

  protected linePrice(index: number, field: 'sellingPrice' | 'compareAtPrice'): string {
    const summary = this.lineSummary(index);
    const value = summary?.[field];
    return value ? formatMoney(value) : '—';
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

  protected onVariantSearch(value: string): void {
    this.variantSearchDraft.set(value);
  }

  protected onVariantSelect(index: number, value: string | null): void {
    const control = this.lines.at(index).controls.variantId;
    control.setValue(value ?? '');
    control.markAsTouched();
    if (value) {
      this.applyVariantDefaultsToLine(index, value);
    }
  }

  protected onLineVatSelect(index: number, value: string | null): void {
    this.lines.at(index).controls.vatCodeId.setValue(value ?? '');
  }

  protected addLine(): void {
    this.lines.push(this.createLine());
  }

  /**
   * Apre il pannello anagrafica prodotto per la riga: prefill con l'ultimo
   * testo cercato (nome prodotto) e il costo unitario della riga come prezzo
   * d'acquisto. Snapshot al click, così il pannello resta stabile.
   */
  protected openProductCreate(index: number): void {
    const line = this.lines.at(index);
    if (!line) {
      return;
    }
    const searchText = this.variantSearchDraft().trim();
    const cost = parseMoneyInput(line.controls.unitCost.value, this.currency);
    this.productPanelPrefill.set({
      name: searchText || undefined,
      purchasePriceMajor: cost && cost.amountMinor > 0 ? cost.amountMinor / 100 : null,
    });
    this.productPanelLineIndex.set(index);
    this.productPanelOpen.set(true);
  }

  protected closeProductPanel(): void {
    this.productPanelOpen.set(false);
    this.productPanelLineIndex.set(null);
    this.productPanelPrefill.set(null);
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
   * Default di riga dalla variante selezionata: costo d'acquisto se la riga
   * non ha costo, Codice IVA predefinito del prodotto se non impostato.
   */
  private applyVariantDefaultsToLine(index: number, variantId: string): void {
    const line = this.lines.at(index);
    if (!line) {
      return;
    }
    const applyFromSummary = (summary: VariantSummary | null): void => {
      if (!summary) {
        return;
      }
      const purchase = summary.purchasePrice;
      if (purchase && purchase.amountMinor > 0 && !line.controls.unitCost.value.trim()) {
        line.controls.unitCost.setValue(moneyToDecimalString(purchase).replace('.', ','));
      }
      const defaultVatCodeId = summary.defaultVatCodeId;
      if (
        defaultVatCodeId &&
        !line.controls.vatCodeId.value &&
        this.purchaseVatCodes().some((vatCode) => vatCode.id === defaultVatCodeId)
      ) {
        line.controls.vatCodeId.setValue(defaultVatCodeId);
      }
    };

    const known = mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants()).find(
      (row) => row.variantId === variantId,
    );
    if (known) {
      applyFromSummary(known);
      return;
    }
    this.variantCostSubscription = this.productService
      .searchVariantSummaries({ variantId })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => applyFromSummary(rows[0] ?? null),
      });
  }

  protected removeLine(index: number): void {
    if (this.lines.length > 1) {
      this.lines.removeAt(index);
    }
  }

  protected fieldInvalid(name: 'supplierId' | 'orderDate'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
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

  protected discountInvalid(index: number): boolean {
    const control = this.lines.at(index).controls.discountPercent;
    const touched = control.touched || control.dirty;
    if (!touched || !control.value.trim()) {
      return false;
    }
    const parsed = Number(control.value);
    return !Number.isInteger(parsed) || parsed < 0 || parsed > 100;
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

  protected submit(): void {
    if (this.saving()) {
      return;
    }
    if (this.form.invalid || this.hasInvalidCost() || this.hasInvalidDiscount()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const lines = raw.lines.map((line, index) => {
      const cost = parseMoneyInput(line.unitCost, this.currency);
      const discount = Number(line.discountPercent);
      const summary = this.lineSummary(index);
      return {
        variantId: line.variantId,
        description: summary?.title || undefined,
        orderedQuantity: Number(line.orderedQuantity),
        enteredUnitCostMinor: cost?.amountMinor ?? 0,
        discountPercent:
          line.discountPercent.trim() && Number.isInteger(discount) ? discount : undefined,
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
        void this.router.navigate([this.listPath, order.id]);
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
    this.form.patchValue({
      supplierId: order.supplierId,
      orderDate: order.orderDate ? order.orderDate.slice(0, 10) : todayIsoDate(),
      expectedAt: order.expectedAt ? order.expectedAt.slice(0, 10) : '',
      supplierReference: order.supplierReference ?? '',
    });
    this.costEntryMode.set(order.costEntryMode);
    this.lines.clear();
    for (const line of order.lines) {
      this.lines.push(
        this.fb.group({
          variantId: this.fb.control(line.variantId, { validators: [Validators.required] }),
          orderedQuantity: this.fb.control(line.orderedQuantity, {
            validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
          }),
          unitCost: this.fb.control(moneyToDecimalString(line.enteredUnitCost).replace('.', ','), {
            validators: [Validators.required],
          }),
          discountPercent: this.fb.control(
            line.discountPercent > 0 ? String(line.discountPercent) : '',
          ),
          vatCodeId: this.fb.control(line.vatCodeId ?? ''),
        }),
      );
    }
    if (this.lines.length === 0) {
      this.lines.push(this.createLine());
    }
  }

  protected cancel(): void {
    void this.router.navigateByUrl(this.listPath);
  }

  private hasInvalidCost(): boolean {
    return this.lines.controls.some((line) => {
      const parsed = parseMoneyInput(line.controls.unitCost.value, this.currency);
      return parsed === null || parsed.amountMinor < 0;
    });
  }

  private hasInvalidDiscount(): boolean {
    return this.lines.controls.some((line) => {
      const value = line.controls.discountPercent.value.trim();
      if (!value) {
        return false;
      }
      const parsed = Number(value);
      return !Number.isInteger(parsed) || parsed < 0 || parsed > 100;
    });
  }

  private createLine() {
    return this.fb.group({
      variantId: this.fb.control('', { validators: [Validators.required] }),
      orderedQuantity: this.fb.control(1, {
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      unitCost: this.fb.control('', { validators: [Validators.required] }),
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
