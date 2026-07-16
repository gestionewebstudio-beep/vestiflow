import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
  take,
} from 'rxjs';

import type { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import { mapHttpErrorToAppError } from '@core/interceptors/http-error.mapper';
import { AppErrorKind, isAppError, type AppError } from '@core/models/app-error.model';
import type { Money } from '@core/models/common.model';
import { customerDisplayName, type Customer } from '@core/models/customer.model';
import {
  ManualOrderState,
  manualOrderState,
  SalesOrderSource,
  type SalesOrder,
} from '@core/models/sales-order.model';
import {
  formatVatRate,
  isSalesVatCode,
  vatCodeOptionLabel,
  type VatCode,
} from '@core/models/vat-code.model';
import { BarcodeLookupService } from '@core/services/barcode-lookup.service';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { VatCodeService } from '@core/services/vat-code.service';
import {
  applyCascadeDiscountMinor,
  cascadeDiscountMultiplier,
  parseEffectiveDiscountPercent,
} from '@core/utils/discount-percent.util';
import { toLocationSelectOptions } from '@core/utils/location-select-options.util';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  moneyToDecimalString,
  parseMoneyInput,
} from '@core/utils/money.util';
import type { PaymentOption } from '@core/models/payment-option.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { CustomerFormFieldsComponent } from '@features/customers/components/customer-form-fields/customer-form-fields.component';
import { CustomerService } from '@features/customers/services/customer.service';
import {
  createCustomerFormGroup,
  mapCustomerFormToInput,
} from '@features/customers/utils/customer-form.util';
import { GoodsReceiptLineCodeCellComponent } from '@features/documents/components/goods-receipt-line-code-cell/goods-receipt-line-code-cell.component';
import { GoodsReceiptLineProductCellComponent } from '@features/documents/components/goods-receipt-line-product-cell/goods-receipt-line-product-cell.component';
import { GoodsReceiptProductSearchPanelComponent } from '@features/documents/components/goods-receipt-product-search-panel/goods-receipt-product-search-panel.component';
import { documentTypeLabel } from '@features/documents/models/document-labels.util';
import { documentEditPath } from '@features/documents/models/document-routing.util';
import type { DocumentType } from '@core/models/document.model';
import type { ProductEmbeddedCreatePrefill } from '@features/products/models/product-form.mapper';
import type { VariantSummary } from '@features/products/models/variant-summary.model';
import { ProductFormComponent } from '@features/products/product-form.component';
import { ProductService } from '@features/products/services/product.service';
import { mergeVariantSummaries } from '@features/products/utils/variant-summary-search.util';
import { TenantFeatureSettingsService } from '@features/settings/services/tenant-feature-settings.service';
import type { TenantFeatureSettings } from '@features/settings/models/tenant-feature-settings.model';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { HoverTooltipComponent } from '@shared/components/hover-tooltip/hover-tooltip.component';
import { TableColumnResizeDirective } from '@shared/directives/table-column-resize.directive';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { toIsoDateLocal } from '@shared/utils/calendar.util';

import {
  CUSTOMER_ORDER_LINE_COLUMNS,
  CUSTOMER_ORDER_LINE_PRESETS,
  CUSTOMER_ORDER_LINES_VIEW,
} from './models/customer-order-line-columns.config';
import {
  SalesOrderService,
  type SaveManualOrderInput,
  type SaveManualOrderLineInput,
} from './services/sales-order.service';

const VARIANT_SEARCH_DEBOUNCE_MS = 300;
const VARIANT_SEARCH_MIN_CHARS = 2;
type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

/** Riga oltre disponibilità per il dialogo di riepilogo (§CONTROLLI). */
interface AvailabilityIssue {
  readonly lineNumber: number;
  readonly label: string;
  readonly requested: number;
  readonly available: number;
}

/**
 * Maschera Ordine cliente manuale (§/app/sales): stessa impostazione visiva e
 * di persistenza dell'Arrivo merce (testata compatta, righe con colonne
 * ridimensionabili, scan `quantità*codice`, totale sticky, celle calcolate
 * distinte). Cambia il senso del documento — uscita anziché ingresso: gli
 * impegni di magazzino al posto dei carichi. Genera SOLO ordini con origine
 * "Manuale"; gli ordini Shopify restano dei rispettivi connettori.
 */
@Component({
  selector: 'app-customer-order-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    BadgeComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    DateInputComponent,
    ProductFormComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SelectMenuComponent,
    SlidePanelComponent,
    TableColumnPickerComponent,
    TableColumnResizeDirective,
    TableSkeletonComponent,
    HoverTooltipComponent,
    CustomerFormFieldsComponent,
    GoodsReceiptLineCodeCellComponent,
    GoodsReceiptLineProductCellComponent,
    GoodsReceiptProductSearchPanelComponent,
  ],
  templateUrl: './customer-order-form.component.html',
  // Stile riusato dall'Arrivo merce (stesse classi gr-form__*), più la banda
  // footer condivisa e le aggiunte specifiche (riga rapida, cella ambra).
  styleUrls: [
    '../documents/goods-receipt-form.component.scss',
    '../documents/document-form-footer.shared.scss',
    './customer-order-form.component.scss',
  ],
})
export class CustomerOrderFormComponent implements CanComponentDeactivate {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly salesOrderService = inject(SalesOrderService);
  private readonly customerService = inject(CustomerService);
  private readonly productService = inject(ProductService);
  private readonly barcodeLookup = inject(BarcodeLookupService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly paymentOptionsService = inject(PaymentOptionsService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly tenantFeatureSettingsService = inject(TenantFeatureSettingsService);
  private readonly columnPreferences = inject(TableColumnPreferenceService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly listPath = '/app/sales';
  protected readonly currency = DEFAULT_CURRENCY;
  protected readonly formatMoney = formatMoney;
  protected readonly formatVatRate = formatVatRate;
  protected readonly lineColumnsView = CUSTOMER_ORDER_LINES_VIEW;
  protected readonly commitsStockTooltip =
    'Se attiva, la quantità della riga impegna la disponibilità di magazzino (Disponibile = Giacenza − Impegnata). ' +
    'Default dal Tipo prodotto: Articolo ON, Servizio OFF. Sempre modificabile per eccezioni.';

  // ── Routing / stato pagina ──────────────────────────────────────────────
  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly editOrderId = computed(() => this.paramMap().get('id'));
  protected readonly isEditMode = computed(() => Boolean(this.editOrderId()));

  protected readonly loadedOrder = signal<SalesOrder | null>(null);
  protected readonly saveWarnings = signal<readonly string[]>([]);
  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
  protected readonly saving = computed(() => this._submitState().status === 'saving');
  protected readonly submitError = computed(() => {
    const state = this._submitState();
    return state.status === 'error' ? state.error : null;
  });

  protected readonly orderState = computed(() => {
    const order = this.loadedOrder();
    return order ? manualOrderState(order) : ManualOrderState.Confirmed;
  });
  protected readonly isConcluded = computed(() => this.orderState() === ManualOrderState.Concluded);

  protected readonly pageTitle = computed(() =>
    this.isEditMode() ? 'Modifica ordine cliente' : 'Nuovo ordine cliente',
  );

  protected readonly stateOptions: readonly SelectMenuOption[] = [
    { value: ManualOrderState.Confirmed, label: 'Confermato' },
    { value: ManualOrderState.Cancelled, label: 'Annullato' },
  ];

  protected stateBadgeLabel(): string {
    switch (this.orderState()) {
      case ManualOrderState.Cancelled:
        return 'Annullato';
      case ManualOrderState.Concluded:
        return 'Concluso';
      default:
        return 'Confermato';
    }
  }

  protected stateBadgeTone(): 'success' | 'error' | 'info' {
    switch (this.orderState()) {
      case ManualOrderState.Cancelled:
        return 'error';
      case ManualOrderState.Concluded:
        return 'info';
      default:
        return 'success';
    }
  }

  // ── Form ────────────────────────────────────────────────────────────────
  readonly form = this.fb.group({
    customerId: this.fb.control('', { validators: [Validators.required] }),
    // Obbligatoria: la testata (cliente + location) è il minimo salvabile.
    locationId: this.fb.control('', { validators: [Validators.required] }),
    documentDate: this.fb.control(toIsoDateLocal(new Date()), {
      validators: [Validators.required],
    }),
    externalRef: this.fb.control(''),
    expectedDeliveryDate: this.fb.control(''),
    status: this.fb.control<'confirmed' | 'cancelled'>('confirmed'),
    paymentTerms: this.fb.control(''),
    notes: this.fb.control(''),
    // Sconto extra % sull'intero documento (stesso pattern Arrivo merce).
    documentDiscountPercent: this.fb.control(''),
    lines: this.fb.array([this.createLine()]),
  });

  get lines(): FormArray<ReturnType<CustomerOrderFormComponent['createLine']>> {
    return this.form.controls.lines;
  }

  /** Trigger reattivo su ogni modifica del form (stesso pattern Arrivo merce). */
  private readonly formValue = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  protected readonly dirtySinceLastSave = signal(false);
  private suppressDirtyMarking = false;

  // ── Dati di contorno ────────────────────────────────────────────────────
  // Elenco completo clienti attivi via endpoint dedicato /customers/all
  // (stesso pattern del Fornitore in Arrivo merce: la lista paginata ha
  // pageSize massimo 100 e non va usata per la combo). Il reload scatta
  // dopo la creazione inline di un nuovo cliente.
  private readonly customersReload = signal(0);
  private readonly customers = toSignal(
    toObservable(this.customersReload).pipe(
      switchMap(() =>
        this.customerService
          .getAllCustomers()
          .pipe(catchError(() => of([] as readonly Customer[]))),
      ),
    ),
    { initialValue: [] as readonly Customer[] },
  );

  protected readonly customerOptions = computed<readonly SelectMenuOption[]>(() =>
    this.customers().map((customer) => ({
      value: customer.id,
      label: customerDisplayName(customer),
    })),
  );

  protected readonly selectedCustomer = computed<Customer | null>(() => {
    this.formValue();
    const id = this.form.controls.customerId.value;
    return id ? (this.customers().find((customer) => customer.id === id) ?? null) : null;
  });

  // ── Nuovo cliente inline (stesso pattern del Nuovo fornitore in GR) ─────
  protected readonly showCustomerForm = signal(false);
  readonly customerForm = createCustomerFormGroup(this.fb);
  protected readonly savingCustomer = signal(false);
  protected readonly customerFormError = signal<string | null>(null);

  /** Voci pagamento del tenant per il form nuovo cliente inline. */
  protected readonly paymentOptions = toSignal(
    this.paymentOptionsService.list().pipe(catchError(() => of([] as readonly PaymentOption[]))),
    { initialValue: [] as readonly PaymentOption[] },
  );

  protected toggleCustomerForm(): void {
    this.showCustomerForm.update((open) => !open);
    this.customerFormError.set(null);
  }

  /** Crea il cliente manuale riusando la logica di /app/customers. */
  protected saveCustomer(): void {
    if (this.savingCustomer()) {
      return;
    }
    this.customerForm.markAllAsTouched();
    if (this.customerForm.hasError('identityRequired')) {
      this.customerFormError.set('Indica la ragione sociale oppure nome e cognome del cliente.');
      return;
    }
    if (this.customerForm.invalid) {
      return;
    }
    this.savingCustomer.set(true);
    this.customerFormError.set(null);
    this.customerService
      .createCustomer(mapCustomerFormToInput(this.customerForm.getRawValue()))
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (customer) => {
          this.savingCustomer.set(false);
          this.showCustomerForm.set(false);
          this.customerForm.reset();
          this.customersReload.update((tick) => tick + 1);
          this.form.controls.customerId.setValue(customer.id);
          this.markFormDirty();
        },
        error: (err: unknown) => {
          this.savingCustomer.set(false);
          this.customerFormError.set(this.toAppError(err).message);
        },
      });
  }

  protected readonly locationOptions = computed<readonly SelectMenuOption[]>(() =>
    toLocationSelectOptions(
      this.operationalLocations.writeLocations(),
      this.operationalLocations.defaultLocation()?.id ?? null,
    ),
  );

  private readonly tenantSettings = toSignal(
    this.tenantFeatureSettingsService.getSettings().pipe(catchError(() => of(null))),
    { initialValue: null as TenantFeatureSettings | null },
  );

  protected readonly vatCodes = toSignal(
    this.vatCodeService.list().pipe(catchError(() => of([] as readonly VatCode[]))),
    { initialValue: [] as readonly VatCode[] },
  );
  private readonly vatCodeById = computed(
    () => new Map(this.vatCodes().map((vatCode) => [vatCode.id, vatCode])),
  );
  /** Codici attivi utilizzabili in VENDITA, ordinati come in Impostazioni. */
  private readonly salesVatCodes = computed(() =>
    this.vatCodes().filter((vatCode) => vatCode.isActive && isSalesVatCode(vatCode)),
  );
  protected readonly salesVatOptions = computed<readonly SelectMenuOption[]>(() =>
    this.salesVatCodes().map((vatCode) => this.vatOptionFromCode(vatCode)),
  );
  /** Codice IVA predefinito aziendale (default = predefinito globale, §coerenza). */
  private readonly defaultVatCodeId = computed(() => {
    const codes = this.salesVatCodes();
    const settingsId = this.tenantSettings()?.defaultVatCodeId;
    const fromSettings = settingsId
      ? codes.find((vatCode) => vatCode.id === settingsId)
      : undefined;
    const fallback = codes.find((vatCode) => vatCode.isDefault);
    return (fromSettings ?? fallback)?.id ?? '';
  });

  private readonly meta = toSignal(
    this.salesOrderService.getManualOrderMeta().pipe(catchError(() => of(null))),
    { initialValue: null },
  );
  protected readonly previewReference = computed(() => this.meta()?.nextReferencePreview ?? null);
  protected readonly internalReferenceLabel = computed(
    () => this.loadedOrder()?.orderNumber ?? this.previewReference(),
  );
  protected readonly unloadTypeOptions = computed<readonly SelectMenuOption[]>(() =>
    (this.meta()?.unloadDocumentTypes ?? []).map((type) => ({
      value: type,
      label: documentTypeLabel(type as DocumentType) ?? type,
    })),
  );

  /** Impegni attivi di QUESTO ordine per variante (Q.tà disponibile onesta in modifica). */
  private readonly ownReservedByVariant = signal<ReadonlyMap<string, number>>(new Map());

  // ── Varianti: summary fissate (righe caricate) + ricerca live ───────────
  private readonly pinnedVariants = signal<readonly VariantSummary[]>([]);
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
        return this.productService
          .searchVariantSummaries({ search: term, pageSize: 30, locationId })
          .pipe(catchError(() => of([] as readonly VariantSummary[])));
      }),
    ),
    { initialValue: [] as readonly VariantSummary[] },
  );

  // ── Gate: righe disabilitate finché mancano cliente E location (P5) ─────
  protected readonly headerGateActive = computed(() => {
    if (this.formReadOnly()) {
      return false;
    }
    this.formValue();
    return !this.form.controls.customerId.value || !this.form.controls.locationId.value;
  });

  protected readonly formReadOnly = computed(() => this.isConcluded());

  // ── Caricamento ordine in modifica ──────────────────────────────────────
  private readonly loadTick = signal(0);
  private readonly loadState = toSignal(
    toObservable(computed(() => ({ id: this.editOrderId(), tick: this.loadTick() }))).pipe(
      switchMap(({ id }) => {
        if (!id) {
          return of<'ready' | 'loading' | 'not-editable' | 'error'>('ready');
        }
        return this.salesOrderService.getSalesOrderById(id).pipe(
          map((order) => {
            if (order.source !== SalesOrderSource.Manual) {
              this.loadedOrder.set(null);
              return 'not-editable' as const;
            }
            this.loadedOrder.set(order);
            this.patchFormFromOrder(order);
            this.reloadOwnReservations(order.id);
            return 'ready' as const;
          }),
          startWith<'ready' | 'loading' | 'not-editable' | 'error'>('loading'),
          catchError(() => of('error' as const)),
        );
      }),
    ),
    { initialValue: this.editOrderId() ? 'loading' : 'ready' },
  );
  protected readonly loading = computed(() => this.loadState() === 'loading');
  protected readonly loadError = computed(() => this.loadState() === 'error');
  protected readonly notEditable = computed(() => this.loadState() === 'not-editable');

  // ── Autocomplete prodotto per riga ──────────────────────────────────────
  protected readonly autocompleteLineIndex = signal<number | null>(null);
  protected readonly activeSuggestionIndex = signal(0);
  protected readonly productSearchPanelOpen = signal(false);
  protected readonly productSearchLineIndex = signal<number | null>(null);
  protected readonly productSearchLaunchTerm = signal('');
  protected readonly productSearchLaunchSeq = signal(0);

  // ── Scan / riga di inserimento rapido ───────────────────────────────────
  protected readonly quickScanDraft = signal('');
  protected readonly quickScanBusy = signal(false);
  protected readonly quickScanError = signal<string | null>(null);
  private readonly quickScanInputRef = viewChild<ElementRef<HTMLInputElement>>('quickScanInput');

  // ── Pannello anagrafica prodotto (creazione/modifica al volo, come GR) ──
  protected readonly productPanelOpen = signal(false);
  protected readonly productPanelLineIndex = signal<number | null>(null);
  protected readonly productPanelMode = signal<'create' | 'edit'>('create');
  protected readonly productPanelEditProductId = signal<string | null>(null);
  protected readonly attachTargetLineIndex = signal<number | null>(null);
  protected readonly pendingAttachVariantId = signal<string | null>(null);
  protected readonly attachWithoutAddDialogOpen = signal(false);

  // ── Dialoghi ────────────────────────────────────────────────────────────
  protected readonly exitDialogOpen = signal(false);
  private pendingDeactivate: ((allow: boolean) => void) | null = null;
  protected readonly availabilityDialogOpen = signal(false);
  protected readonly availabilityIssues = signal<readonly AvailabilityIssue[]>([]);
  private pendingSaveAfterAvailability = false;
  protected readonly concludeMenuOpen = signal(false);
  protected readonly concluding = signal(false);

  constructor() {
    this.columnPreferences.registerView(
      CUSTOMER_ORDER_LINES_VIEW,
      CUSTOMER_ORDER_LINE_COLUMNS,
      CUSTOMER_ORDER_LINE_PRESETS,
    );

    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.suppressDirtyMarking && !this.formReadOnly()) {
        this.dirtySinceLastSave.set(true);
      }
    });

    // Cambio location: le disponibilità per sede vanno ricaricate.
    this.form.controls.locationId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshAllLineSummaries());

    // Cliente scelto: propone sconto anagrafica sulle righe già compilate
    // senza sconto e condizioni di pagamento in testata (proposte, non vincoli).
    this.form.controls.customerId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyCustomerDefaults());

    effect(() => {
      if (this.formReadOnly()) {
        this.form.disable({ emitEvent: false });
      }
    });
  }

  private readonly lineTableColumnState = computed(() =>
    this.columnPreferences.state(CUSTOMER_ORDER_LINES_VIEW)(),
  );

  // ── Colonne ─────────────────────────────────────────────────────────────
  protected isLineColumnVisible(columnId: string): boolean {
    this.lineTableColumnState();
    return this.columnPreferences.isColumnVisible(CUSTOMER_ORDER_LINES_VIEW, columnId);
  }

  protected lineColumnWidth(columnId: string): string {
    this.lineTableColumnState();
    const def = CUSTOMER_ORDER_LINE_COLUMNS.find((col) => col.id === columnId);
    const fallback = def?.defaultWidthPx ?? 96;
    return `${this.columnPreferences.columnWidth(CUSTOMER_ORDER_LINES_VIEW, columnId, fallback)}px`;
  }

  protected lineColumnMinWidth(columnId: string): number {
    const def = CUSTOMER_ORDER_LINE_COLUMNS.find((col) => col.id === columnId);
    return def?.minWidthPx ?? 48;
  }

  protected onLineColumnResize(columnId: string, widthPx: number): void {
    this.columnPreferences.setColumnWidth(CUSTOMER_ORDER_LINES_VIEW, columnId, widthPx);
  }

  // ── Righe: creazione, selezione variante, difaults ──────────────────────
  private createLine() {
    return this.fb.group({
      id: this.fb.control(''),
      variantId: this.fb.control(''),
      sku: this.fb.control(''),
      barcode: this.fb.control(''),
      productName: this.fb.control(''),
      quantity: this.fb.control(1, {
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      unitPrice: this.fb.control(''),
      discount: this.fb.control(''),
      vatCodeId: this.fb.control(''),
      commitsStock: this.fb.control(true),
      unitOfMeasure: this.fb.control(''),
    });
  }

  protected addLine(): void {
    this.lines.push(this.createLine());
    this.markFormDirty();
  }

  protected removeLine(index: number): void {
    this.lines.removeAt(index);
    if (this.lines.length === 0) {
      this.lines.push(this.createLine());
    }
    this.markFormDirty();
  }

  protected duplicateLine(index: number): void {
    const source = this.lines.at(index);
    const copy = this.createLine();
    copy.setValue({ ...source.getRawValue(), id: '' });
    this.lines.insert(index + 1, copy);
    this.markFormDirty();
  }

  protected lineIsEmpty(line: ReturnType<CustomerOrderFormComponent['createLine']>): boolean {
    const value = line.getRawValue();
    return (
      !value.variantId && !value.productName.trim() && !value.sku.trim() && !value.barcode.trim()
    );
  }

  protected lineHasLinkedProduct(index: number): boolean {
    this.formValue();
    return Boolean(this.lines.at(index)?.controls.variantId.value);
  }

  protected linkedProductLabel(index: number): string {
    const summary = this.lineVariantSummary(index);
    return summary?.title || this.lines.at(index)?.controls.productName.value || '';
  }

  protected lineVariantSummary(index: number): VariantSummary | null {
    const variantId = this.lines.at(index)?.controls.variantId.value;
    if (!variantId) {
      return null;
    }
    return (
      mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants()).find(
        (summary) => summary.variantId === variantId,
      ) ?? null
    );
  }

  /** Selezione variante su una riga: snapshot codici + default operativi. */
  protected onVariantSelect(index: number, variantId: string | null): void {
    const line = this.lines.at(index);
    line.controls.variantId.setValue(variantId ?? '');
    if (variantId) {
      const summary = mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants()).find(
        (entry) => entry.variantId === variantId,
      );
      if (summary) {
        this.applySummaryToLine(line, summary);
      } else {
        this.pinVariantSummary(index, variantId);
      }
    }
    this.clearProductAutocomplete();
    this.markFormDirty();
  }

  private applySummaryToLine(
    line: ReturnType<CustomerOrderFormComponent['createLine']>,
    summary: VariantSummary,
  ): void {
    line.controls.sku.setValue(summary.sku, { emitEvent: false });
    line.controls.barcode.setValue(summary.barcode ?? '', { emitEvent: false });
    line.controls.productName.setValue(summary.productName || summary.title, { emitEvent: false });
    line.controls.unitOfMeasure.setValue(summary.unitOfMeasure ?? 'pz', { emitEvent: false });
    if (!line.controls.unitPrice.value.trim() && summary.sellingPrice.amountMinor > 0) {
      line.controls.unitPrice.setValue(
        moneyToDecimalString(summary.sellingPrice).replace('.', ','),
        { emitEvent: false },
      );
    }
    // Spunta "Impegna magazzino": default dal Tipo prodotto (Articolo ON,
    // Servizio OFF); prodotti non gestiti a magazzino mai impegnati di default.
    const isService = summary.kind === 'service' || summary.managesStock === false;
    line.controls.commitsStock.setValue(!isService, { emitEvent: false });
    // Codice IVA: predefinito articolo (se attivo/vendita) → predefinito globale.
    if (!line.controls.vatCodeId.value) {
      const productVat = summary.defaultVatCodeId
        ? this.vatCodeById().get(summary.defaultVatCodeId)
        : undefined;
      if (productVat?.isActive && isSalesVatCode(productVat)) {
        line.controls.vatCodeId.setValue(productVat.id, { emitEvent: false });
      } else if (this.defaultVatCodeId()) {
        line.controls.vatCodeId.setValue(this.defaultVatCodeId(), { emitEvent: false });
      }
    }
    // Sconto anagrafica cliente proposto come default (mai sovrascrive).
    if (!line.controls.discount.value.trim()) {
      const customerDiscount = this.selectedCustomer()?.customerDiscount?.trim();
      if (customerDiscount) {
        line.controls.discount.setValue(customerDiscount, { emitEvent: false });
      }
    }
  }

  /** Carica e fissa la summary di una variante (righe da ordine esistente/scan). */
  private pinVariantSummary(index: number, variantId: string, quantityToAdd = 0): void {
    const locationId = this.form.controls.locationId.value || undefined;
    this.productService
      .searchVariantSummaries({ variantId, locationId })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => {
        const summary = rows[0];
        if (!summary) {
          return;
        }
        this.pinnedVariants.update((current) => mergeVariantSummaries([summary], current));
        const line = this.lines.at(index);
        if (line && line.controls.variantId.value === summary.variantId) {
          this.applySummaryToLine(line, summary);
          if (quantityToAdd > 0) {
            const current = Number(line.controls.quantity.value) || 0;
            line.controls.quantity.setValue(current + quantityToAdd);
          }
        }
      });
  }

  /** Ricarica le summary per la location corrente (disponibilità per sede). */
  private refreshAllLineSummaries(): void {
    const locationId = this.form.controls.locationId.value || undefined;
    const variantIds = [
      ...new Set(
        this.lines.controls
          .map((line) => line.controls.variantId.value)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    this.pinnedVariants.set([]);
    for (const variantId of variantIds) {
      this.productService
        .searchVariantSummaries({ variantId, locationId })
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe((rows) => {
          const summary = rows[0];
          if (summary) {
            this.pinnedVariants.update((current) => mergeVariantSummaries([summary], current));
          }
        });
    }
  }

  private reloadOwnReservations(orderId: string): void {
    this.salesOrderService
      .getManualOrderReservations(orderId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          const byVariant = new Map<string, number>();
          for (const row of rows) {
            byVariant.set(
              row.variantId,
              (byVariant.get(row.variantId) ?? 0) + row.remainingQuantity,
            );
          }
          this.ownReservedByVariant.set(byVariant);
        },
        error: () => this.ownReservedByVariant.set(new Map()),
      });
  }

  // ── Disponibilità (§DISPONIBILITÀ / §CONTROLLI) ─────────────────────────

  /**
   * Disponibile effettiva vista da QUESTA riga: la Disponibile server include
   * già gli impegni di quest'ordine, che qui vanno riaggiunti (altrimenti un
   * ordine appena salvato vedrebbe la propria merce come mancante).
   */
  protected lineEffectiveAvailable(index: number): number | null {
    const summary = this.lineVariantSummary(index);
    if (!summary || summary.kind === 'service' || summary.managesStock === false) {
      return null;
    }
    if (summary.stockAvailable == null) {
      return 0;
    }
    const ownReserved = this.ownReservedByVariant().get(summary.variantId) ?? 0;
    return summary.stockAvailable + ownReserved;
  }

  /** Testo colonna "Q.tà disponibile": — per i Servizi (nessun controllo). */
  protected lineStockAvailable(index: number): string {
    this.formValue();
    const available = this.lineEffectiveAvailable(index);
    return available == null ? '—' : String(available);
  }

  /** Avviso ambra sulla cella quantità: la Q.tà digitata supera la disponibile. */
  protected lineExceedsAvailability(index: number): boolean {
    this.formValue();
    const line = this.lines.at(index);
    if (!line || !line.controls.commitsStock.value) {
      return false;
    }
    const available = this.lineEffectiveAvailable(index);
    if (available == null) {
      return false;
    }
    const qty = Number(line.controls.quantity.value) || 0;
    return qty > available;
  }

  protected lineAvailabilityHint(index: number): string | null {
    if (!this.lineExceedsAvailability(index)) {
      return null;
    }
    const available = this.lineEffectiveAvailable(index) ?? 0;
    return `disponibili solo ${Math.max(0, available)}`;
  }

  // ── Calcoli riga e totali ────────────────────────────────────────────────
  private lineUnitPriceMinor(line: ReturnType<CustomerOrderFormComponent['createLine']>): number {
    const parsed = parseMoneyInput(line.controls.unitPrice.value, this.currency);
    return parsed?.amountMinor ?? 0;
  }

  /** Prezzo unitario scontato con cascata ESATTA (es. "4+10%" ≠ 14%). */
  protected lineDiscountedUnitMoney(index: number): Money {
    this.formValue();
    const line = this.lines.at(index);
    const unit = this.lineUnitPriceMinor(line);
    return {
      amountMinor: applyCascadeDiscountMinor(unit, line.controls.discount.value),
      currencyCode: this.currency,
    };
  }

  protected lineHasDiscount(index: number): boolean {
    this.formValue();
    const line = this.lines.at(index);
    return cascadeDiscountMultiplier(line.controls.discount.value) < 1;
  }

  /** Totale riga = quantità × prezzo scontato (senza IVA). */
  protected lineTotalMoney(index: number): Money {
    this.formValue();
    const line = this.lines.at(index);
    const qty = Number(line.controls.quantity.value) || 0;
    const unitDiscounted = this.lineDiscountedUnitMoney(index).amountMinor;
    return { amountMinor: qty * unitDiscounted, currencyCode: this.currency };
  }

  /** Valore riga pre-sconto (barrato in colonna Totale, come Arrivo merce). */
  protected lineGrossMoney(index: number): Money {
    this.formValue();
    const line = this.lines.at(index);
    const qty = Number(line.controls.quantity.value) || 0;
    return { amountMinor: qty * this.lineUnitPriceMinor(line), currencyCode: this.currency };
  }

  /**
   * Totali documento con Sconto extra (P3): applicato DOPO gli sconti riga
   * sull'imponibile complessivo; l'IVA viene ricalcolata sulla ripartizione
   * proporzionale (stessa logica dell'Arrivo merce, client e server).
   */
  protected readonly documentTotals = computed(() => {
    this.formValue();
    let lineSum = 0;
    const taxParts: { readonly netMinor: number; readonly vatRate: number }[] = [];
    this.lines.controls.forEach((line, index) => {
      if (this.lineIsEmpty(line)) {
        return;
      }
      const netMinor = this.lineTotalMoney(index).amountMinor;
      lineSum += netMinor;
      taxParts.push({ netMinor, vatRate: this.lineVatRate(index) });
    });

    const docDiscountPercent = parseEffectiveDiscountPercent(
      this.form.controls.documentDiscountPercent.value,
    );
    const docDiscountAmount = Math.round((lineSum * docDiscountPercent) / 100);
    const discountedLineSum = lineSum - docDiscountAmount;

    let tax: number;
    if (docDiscountPercent === 0 || lineSum === 0) {
      tax = taxParts.reduce(
        (sum, part) => sum + Math.round((part.netMinor * part.vatRate) / 100),
        0,
      );
    } else {
      tax = taxParts.reduce((sum, part) => {
        if (part.vatRate <= 0) {
          return sum;
        }
        const share = part.netMinor / lineSum;
        const discountedNet = Math.round(discountedLineSum * share);
        return sum + Math.round((discountedNet * part.vatRate) / 100);
      }, 0);
    }

    return {
      linesTotal: { amountMinor: lineSum, currencyCode: this.currency } satisfies Money,
      documentDiscount: {
        amountMinor: docDiscountAmount,
        currencyCode: this.currency,
      } satisfies Money,
      subtotal: { amountMinor: discountedLineSum, currencyCode: this.currency } satisfies Money,
      tax: { amountMinor: tax, currencyCode: this.currency } satisfies Money,
      total: {
        amountMinor: discountedLineSum + tax,
        currencyCode: this.currency,
      } satisfies Money,
    };
  });

  /** Aliquota effettiva della riga (solo modalità standard, 0 altrimenti). */
  private lineVatRate(index: number): number {
    const vatCode = this.vatCodeById().get(this.lines.at(index).controls.vatCodeId.value);
    if (!vatCode || vatCode.calculationMode !== 'standard') {
      return 0;
    }
    const rate = Number(vatCode.ratePercent);
    return Number.isFinite(rate) && rate > 0 ? rate : 0;
  }

  protected lineUnitOfMeasure(index: number): string {
    const summary = this.lineVariantSummary(index);
    return (
      summary?.unitOfMeasure?.trim() ||
      this.lines.at(index)?.controls.unitOfMeasure.value.trim() ||
      'pz'
    );
  }

  protected validLinesCount(): number {
    this.formValue();
    return this.lines.controls.reduce((count, line, index) => {
      if (this.lineIsEmpty(line)) {
        return count;
      }
      return count + (this.lineRowComplete(index) ? 1 : 0);
    }, 0);
  }

  protected totalPiecesCount(): number {
    this.formValue();
    return this.lines.controls.reduce((sum, line) => {
      if (this.lineIsEmpty(line)) {
        return sum;
      }
      const qty = Number(line.controls.quantity.value);
      return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
    }, 0);
  }

  /** Riga completa: prodotto identificato e quantità > 0 (regola Arrivo merce). */
  protected lineRowComplete(index: number): boolean {
    const line = this.lines.at(index);
    if (this.lineIsEmpty(line)) {
      return true;
    }
    const hasProduct =
      Boolean(line.controls.variantId.value.trim()) ||
      Boolean(line.controls.productName.value.trim());
    const qty = Number(line.controls.quantity.value);
    return hasProduct && Number.isFinite(qty) && qty > 0;
  }

  protected lineFieldInvalid(index: number, field: 'productName' | 'quantity'): boolean {
    this.formValue();
    const line = this.lines.at(index);
    if (this.lineIsEmpty(line)) {
      return false;
    }
    if (field === 'quantity') {
      const qty = Number(line.controls.quantity.value);
      return !Number.isFinite(qty) || qty <= 0;
    }
    return !line.controls.variantId.value.trim() && !line.controls.productName.value.trim();
  }

  // ── Colonna IVA ─────────────────────────────────────────────────────────
  private vatOptionFromCode(vatCode: VatCode): SelectMenuOption {
    const rate = formatVatRate(vatCode.ratePercent);
    const description = vatCode.description.trim();
    const detail = description.toLowerCase().includes(rate.toLowerCase())
      ? description
      : `${rate} · ${description}`;
    return { value: vatCode.id, label: vatCode.code, detail };
  }

  protected lineVatOptions(index: number): readonly SelectMenuOption[] {
    const options = this.salesVatOptions();
    const selectedId = this.lines.at(index)?.controls.vatCodeId.value;
    if (!selectedId || options.some((option) => option.value === selectedId)) {
      return options;
    }
    const selected = this.vatCodeById().get(selectedId);
    return selected ? [...options, this.vatOptionFromCode(selected)] : options;
  }

  protected lineVatValue(index: number): string {
    this.formValue();
    return this.lines.at(index)?.controls.vatCodeId.value ?? '';
  }

  protected lineVatTooltip(index: number): string {
    const vatCode = this.vatCodeById().get(this.lines.at(index).controls.vatCodeId.value);
    return vatCode ? vatCodeOptionLabel(vatCode) : 'Nessun Codice IVA';
  }

  protected onLineVatSelect(index: number, value: string | null): void {
    if (this.formReadOnly()) {
      return;
    }
    this.lines.at(index).controls.vatCodeId.setValue(value ?? '');
    this.markFormDirty();
  }

  // ── Autocomplete nome prodotto ──────────────────────────────────────────
  protected lineSuggestions(index: number): readonly VariantSummary[] {
    return this.autocompleteLineIndex() === index ? this.searchedVariants() : [];
  }

  protected lineSuggestionsOpen(index: number): boolean {
    return this.autocompleteLineIndex() === index && this.searchedVariants().length > 0;
  }

  protected onLineProductNameChange(index: number, value: string): void {
    const line = this.lines.at(index);
    line.controls.productName.setValue(value);
    this.autocompleteLineIndex.set(index);
    this.activeSuggestionIndex.set(0);
    this.variantSearchDraft.set(value);
    this.markFormDirty();
  }

  protected onLineProductFocus(index: number): void {
    this.autocompleteLineIndex.set(index);
    this.activeSuggestionIndex.set(0);
    this.variantSearchDraft.set(this.lines.at(index).controls.productName.value);
  }

  protected onLineProductBlur(_index: number): void {
    // Ritardo per lasciar arrivare il click sulla voce del dropdown.
    setTimeout(() => this.clearProductAutocomplete(), 200);
  }

  protected onProductSuggestionPick(lineIndex: number, variantId: string): void {
    this.onVariantSelect(lineIndex, variantId);
  }

  protected onProductSuggestionNavigate(direction: 'next' | 'prev'): void {
    const count = this.searchedVariants().length;
    if (count === 0) {
      return;
    }
    this.activeSuggestionIndex.update((current) =>
      direction === 'next' ? (current + 1) % count : (current - 1 + count) % count,
    );
  }

  protected onLineSearchEscape(_index: number): void {
    this.clearProductAutocomplete();
  }

  private clearProductAutocomplete(): void {
    this.autocompleteLineIndex.set(null);
    this.activeSuggestionIndex.set(0);
    this.variantSearchDraft.set('');
  }

  protected onLineUnlink(index: number): void {
    const line = this.lines.at(index);
    line.patchValue({
      variantId: '',
      sku: '',
      barcode: '',
      productName: '',
      unitOfMeasure: '',
    });
    this.markFormDirty();
  }

  // ── Celle codice (SKU / EAN): lookup esatto alla conferma ───────────────
  protected onLineSkuChange(index: number, value: string): void {
    this.lines.at(index).controls.sku.setValue(value);
    this.markFormDirty();
  }

  protected onLineBarcodeChange(index: number, value: string): void {
    this.lines.at(index).controls.barcode.setValue(value);
    this.markFormDirty();
  }

  protected commitCodeLookup(index: number, field: 'sku' | 'barcode'): void {
    const line = this.lines.at(index);
    if (line.controls.variantId.value) {
      return;
    }
    const code = line.controls[field].value.trim();
    if (!code) {
      return;
    }
    const locationId = this.form.controls.locationId.value || undefined;
    this.barcodeLookup
      .resolveVariantIdByCode(code, { locationId })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((variantId) => {
        if (variantId) {
          this.onVariantSelect(index, variantId);
          this.pinVariantSummary(index, variantId);
        }
      });
  }

  protected openLineProductSearch(index: number): void {
    this.productSearchLineIndex.set(index);
    this.productSearchLaunchTerm.set(this.lines.at(index).controls.productName.value.trim());
    this.productSearchLaunchSeq.update((seq) => seq + 1);
    this.productSearchPanelOpen.set(true);
  }

  protected closeLineProductSearch(): void {
    this.productSearchPanelOpen.set(false);
    this.productSearchLineIndex.set(null);
  }

  protected onLineProductSearchPick(variantId: string): void {
    const index = this.productSearchLineIndex();
    this.closeLineProductSearch();
    if (index != null) {
      this.onVariantSelect(index, variantId);
      this.pinVariantSummary(index, variantId);
    }
  }

  // ── Anagrafica prodotto dalla riga (stesso pannello dell'Arrivo merce) ──

  /** Prefill del nuovo articolo dai dati già digitati sulla riga. */
  protected readonly productPanelPrefill = computed<ProductEmbeddedCreatePrefill | null>(() => {
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
    // Nell'ordine cliente il prezzo digitato è il prezzo di VENDITA.
    const selling = parseMoneyInput(line.controls.unitPrice.value, this.currency);
    return {
      name: line.controls.productName.value.trim(),
      sku: line.controls.sku.value.trim() || undefined,
      barcode: line.controls.barcode.value.trim() || undefined,
      sellingPriceMajor: selling ? selling.amountMinor / 100 : null,
      defaultVatCodeId: line.controls.vatCodeId.value.trim() || null,
    };
  });

  protected readonly productPanelTitle = computed(() => {
    if (this.productPanelMode() === 'edit') {
      return 'Anagrafica prodotto';
    }
    return this.productPanelLineIndex() != null ? 'Completa anagrafica' : 'Nuovo prodotto';
  });

  protected openNewProduct(): void {
    this.attachTargetLineIndex.set(null);
    this.productPanelLineIndex.set(null);
    this.productPanelEditProductId.set(null);
    this.productPanelMode.set('create');
    this.productPanelOpen.set(true);
  }

  /** Completa anagrafica dalla riga: serve almeno un dato digitato. */
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
    this.attachTargetLineIndex.set(index);
    this.productPanelLineIndex.set(index);
    this.productPanelEditProductId.set(null);
    this.productPanelMode.set('create');
    this.productPanelOpen.set(true);
  }

  /** Riga già collegata: apre la scheda del prodotto in modifica nel pannello. */
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
              error: { kind: AppErrorKind.NotFound, message: 'Prodotto collegato non trovato.' },
            });
            return;
          }
          this.attachTargetLineIndex.set(index);
          this.productPanelLineIndex.set(index);
          this.productPanelEditProductId.set(productId);
          this.productPanelMode.set('edit');
          this.productPanelOpen.set(true);
        },
        error: (err: unknown) => {
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
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
      this.pinVariantSummary(lineIndex, event.variantId);
    }
    this.closeProductPanel();
  }

  protected onProductUpdatedFromPanel(_event: { readonly productId: string }): void {
    const lineIndex = this.productPanelLineIndex();
    const variantId =
      lineIndex != null ? (this.lines.at(lineIndex)?.controls.variantId.value ?? null) : null;
    if (lineIndex != null && variantId) {
      this.pinVariantSummary(lineIndex, variantId);
    }
    this.closeProductPanel();
  }

  /** Articolo creato senza aggiungerlo: si propone l'aggancio alla riga. */
  protected onProductSavedWithoutAttach(event: { readonly variantId: string }): void {
    this.pendingAttachVariantId.set(event.variantId);
    this.attachWithoutAddDialogOpen.set(true);
    this.closeProductPanel();
  }

  protected attachPendingVariantToLine(): void {
    const variantId = this.pendingAttachVariantId();
    let lineIndex = this.attachTargetLineIndex();
    if (variantId != null) {
      if (lineIndex == null) {
        // "Nuovo prodotto" dalla barra strumenti: si aggancia a una riga
        // vuota esistente o a una riga nuova in fondo.
        lineIndex = this.lines.controls.findIndex((line) => this.lineIsEmpty(line));
        if (lineIndex < 0) {
          this.lines.push(this.createLine());
          lineIndex = this.lines.length - 1;
        }
      }
      this.onVariantSelect(lineIndex, variantId);
      this.pinVariantSummary(lineIndex, variantId);
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

  // ── Riga di inserimento rapido: scan/cerca con sintassi qta*codice ──────
  protected onQuickScanInput(value: string): void {
    this.quickScanDraft.set(value);
    this.quickScanError.set(null);
  }

  protected commitQuickScan(): void {
    if (this.formReadOnly() || this.quickScanBusy() || this.headerGateActive()) {
      return;
    }
    const raw = this.quickScanDraft().trim();
    if (!raw) {
      return;
    }
    const { quantity, code } = this.barcodeLookup.parseScanInput(raw);
    if (!code) {
      return;
    }
    this.quickScanDraft.set('');
    this.quickScanBusy.set(true);
    const locationId = this.form.controls.locationId.value || undefined;
    this.barcodeLookup
      .resolveVariantIdByCode(code, { locationId })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (variantId) => {
          this.quickScanBusy.set(false);
          if (variantId) {
            this.applyScannedVariant(variantId, quantity);
          } else {
            this.quickScanError.set(`Nessun articolo trovato per «${code}».`);
          }
          this.focusQuickScan();
        },
        error: () => {
          this.quickScanBusy.set(false);
          this.quickScanError.set(`Nessun articolo trovato per «${code}».`);
          this.focusQuickScan();
        },
      });
  }

  private applyScannedVariant(variantId: string, quantity: number): void {
    let targetIndex = this.lines.controls.findIndex(
      (line) => line.controls.variantId.value === variantId,
    );
    if (targetIndex >= 0) {
      const line = this.lines.at(targetIndex);
      const current = Number(line.controls.quantity.value) || 0;
      line.controls.quantity.setValue(current + quantity);
      this.markFormDirty();
      return;
    }
    targetIndex = this.lines.controls.findIndex((line) => this.lineIsEmpty(line));
    if (targetIndex < 0) {
      this.lines.push(this.createLine());
      targetIndex = this.lines.length - 1;
    }
    const line = this.lines.at(targetIndex);
    line.controls.variantId.setValue(variantId);
    line.controls.quantity.setValue(quantity);
    this.pinVariantSummary(targetIndex, variantId);
    this.markFormDirty();
  }

  private focusQuickScan(): void {
    setTimeout(() => this.quickScanInputRef()?.nativeElement.focus(), 0);
  }

  // ── Testata: select handlers ────────────────────────────────────────────
  protected onCustomerSelect(value: string | null): void {
    this.form.controls.customerId.setValue(value ?? '');
    this.form.controls.customerId.markAsTouched();
  }

  protected onLocationSelect(value: string | null): void {
    this.form.controls.locationId.setValue(value ?? '');
  }

  protected onStateSelect(value: string | null): void {
    if (value === 'confirmed' || value === 'cancelled') {
      this.form.controls.status.setValue(value);
      this.markFormDirty();
    }
  }

  protected fieldInvalid(field: 'customerId' | 'locationId'): boolean {
    this.formValue();
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }

  protected openCustomerDetail(): void {
    const id = this.form.controls.customerId.value;
    if (id) {
      void this.router.navigate(['/app/customers', id]);
    }
  }

  /** "Mostra avviso" dell'anagrafica cliente (proposta alla creazione documenti). */
  protected readonly customerAlert = computed(
    () => this.selectedCustomer()?.documentCreationAlert?.trim() || null,
  );

  private applyCustomerDefaults(): void {
    const customer = this.selectedCustomer();
    if (!customer || this.formReadOnly()) {
      return;
    }
    // Condizioni pagamento in testata: proposta, non vincolo.
    if (!this.form.controls.paymentTerms.value.trim() && customer.paymentTerms?.trim()) {
      this.form.controls.paymentTerms.setValue(customer.paymentTerms.trim());
    }
    // Sconto anagrafica sulle righe già compilate senza sconto.
    const discount = customer.customerDiscount?.trim();
    if (discount) {
      for (const line of this.lines.controls) {
        if (!this.lineIsEmpty(line) && !line.controls.discount.value.trim()) {
          line.controls.discount.setValue(discount, { emitEvent: false });
        }
      }
    }
  }

  // ── Caricamento ordine esistente nel form ───────────────────────────────
  private patchFormFromOrder(order: SalesOrder): void {
    this.suppressDirtyMarking = true;
    try {
      this.form.patchValue({
        customerId: order.customerId ?? '',
        locationId: order.locationId ?? '',
        documentDate: order.placedAt ? toIsoDateLocal(new Date(order.placedAt)) : '',
        externalRef: order.externalRef ?? '',
        expectedDeliveryDate: order.expectedDeliveryDate
          ? toIsoDateLocal(new Date(order.expectedDeliveryDate))
          : '',
        status: order.cancelledAt ? 'cancelled' : 'confirmed',
        paymentTerms: order.paymentTerms ?? '',
        notes: order.notes ?? '',
        documentDiscountPercent: order.documentDiscountPercent
          ? String(order.documentDiscountPercent)
          : '',
      });
      this.lines.clear({ emitEvent: false });
      for (const line of order.lines) {
        const group = this.createLine();
        group.setValue(
          {
            id: line.id,
            variantId: line.variantId ?? '',
            sku: line.sku,
            barcode: line.barcode ?? '',
            productName: line.title,
            quantity: line.quantity,
            unitPrice: moneyToDecimalString(line.unitPrice).replace('.', ','),
            discount: line.discount ?? '',
            vatCodeId: line.vatCodeId ?? '',
            commitsStock: line.commitsStock ?? true,
            unitOfMeasure: line.unitOfMeasure ?? '',
          },
          { emitEvent: false },
        );
        this.lines.push(group, { emitEvent: false });
      }
      if (this.lines.length === 0) {
        this.lines.push(this.createLine(), { emitEvent: false });
      }
      this.refreshAllLineSummaries();
      this.dirtySinceLastSave.set(false);
    } finally {
      this.suppressDirtyMarking = false;
    }
  }

  // ── Salvataggio (§CONTROLLI: avvisi, mai blocchi) ───────────────────────
  protected requestSaveDocument(): void {
    if (this.saving() || this.formReadOnly()) {
      return;
    }
    // Testata minima salvabile: cliente + location (righe opzionali, P6).
    this.form.controls.customerId.markAsTouched();
    this.form.controls.locationId.markAsTouched();
    if (!this.form.controls.customerId.value || !this.form.controls.locationId.value) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: "Seleziona cliente e location di origine per salvare l'ordine.",
        },
      });
      return;
    }
    // Controllo disponibilità pre-salvataggio: riepilogo righe critiche,
    // l'operatore decide (correggi subito / salva comunque) — mai blocco.
    if (this.form.controls.status.value === 'confirmed') {
      const issues = this.collectAvailabilityIssues();
      if (issues.length > 0) {
        this.availabilityIssues.set(issues);
        this.pendingSaveAfterAvailability = true;
        this.availabilityDialogOpen.set(true);
        return;
      }
    }
    this.saveDocument();
  }

  private collectAvailabilityIssues(): readonly AvailabilityIssue[] {
    const issues: AvailabilityIssue[] = [];
    this.lines.controls.forEach((line, index) => {
      if (this.lineIsEmpty(line)) {
        return;
      }
      if (this.lineExceedsAvailability(index)) {
        issues.push({
          lineNumber: index + 1,
          label:
            line.controls.sku.value.trim() ||
            line.controls.productName.value.trim() ||
            `Riga ${index + 1}`,
          requested: Number(line.controls.quantity.value) || 0,
          available: Math.max(0, this.lineEffectiveAvailable(index) ?? 0),
        });
      }
    });
    return issues;
  }

  protected confirmAvailabilityDialog(): void {
    this.availabilityDialogOpen.set(false);
    if (this.pendingSaveAfterAvailability) {
      this.pendingSaveAfterAvailability = false;
      this.saveDocument();
    }
  }

  protected dismissAvailabilityDialog(): void {
    this.availabilityDialogOpen.set(false);
    this.pendingSaveAfterAvailability = false;
  }

  private buildSavePayload(): SaveManualOrderInput {
    const value = this.form.getRawValue();
    const lines: SaveManualOrderLineInput[] = [];
    for (const line of this.lines.controls) {
      const raw = line.getRawValue();
      if (this.lineIsEmpty(line)) {
        continue;
      }
      const unitPrice = parseMoneyInput(raw.unitPrice, this.currency);
      lines.push({
        id: raw.id || undefined,
        variantId: raw.variantId || undefined,
        sku: raw.sku.trim() || undefined,
        barcode: raw.barcode.trim() || undefined,
        title: raw.productName.trim() || raw.sku.trim() || 'Articolo',
        quantity: Number(raw.quantity) || 0,
        unitPriceMinor: unitPrice?.amountMinor ?? 0,
        discount: raw.discount.trim() || undefined,
        vatCodeId: raw.vatCodeId || undefined,
        commitsStock: raw.commitsStock,
        unitOfMeasure: this.lineUnitOfMeasureRaw(raw.unitOfMeasure),
      });
    }
    return {
      id: this.editOrderId() ?? undefined,
      customerId: value.customerId,
      locationId: value.locationId || undefined,
      documentDate: value.documentDate,
      externalRef: value.externalRef.trim() || undefined,
      expectedDeliveryDate: value.expectedDeliveryDate || undefined,
      status: value.status,
      notes: value.notes.trim() || undefined,
      paymentTerms: value.paymentTerms.trim() || undefined,
      documentDiscountPercent: parseEffectiveDiscountPercent(value.documentDiscountPercent),
      lines,
    };
  }

  private lineUnitOfMeasureRaw(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  private saveDocument(onSaved?: () => void): void {
    // Righe opzionali (P6): l'ordine si salva anche con la sola testata;
    // gli impegni scatteranno al salvataggio successivo con righe.
    const payload = this.buildSavePayload();
    this._submitState.set({ status: 'saving' });
    this.salesOrderService
      .saveManualOrder(payload)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this._submitState.set({ status: 'idle' });
          this.saveWarnings.set(result.warnings);
          this.loadedOrder.set(result.order);
          const byVariant = new Map<string, number>();
          for (const row of result.reservations) {
            byVariant.set(
              row.variantId,
              (byVariant.get(row.variantId) ?? 0) + row.remainingQuantity,
            );
          }
          this.ownReservedByVariant.set(byVariant);
          this.dirtySinceLastSave.set(false);
          if (!this.editOrderId()) {
            void this.router.navigate([this.listPath, result.order.id, 'edit'], {
              replaceUrl: true,
            });
          } else {
            this.patchFormFromOrder(result.order);
            this.refreshAllLineSummaries();
          }
          onSaved?.();
        },
        error: (err: unknown) => {
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  // ── Concludi ordine (§CONCLUDI ORDINE) ──────────────────────────────────
  protected readonly canConclude = computed(
    () =>
      this.isEditMode() &&
      this.orderState() === ManualOrderState.Confirmed &&
      !this.dirtySinceLastSave() &&
      this.unloadTypeOptions().length > 0,
  );

  protected toggleConcludeMenu(): void {
    this.concludeMenuOpen.update((open) => !open);
  }

  protected concludeWith(documentType: string): void {
    const orderId = this.editOrderId();
    if (!orderId || this.concluding()) {
      return;
    }
    this.concludeMenuOpen.set(false);
    this.concluding.set(true);
    this.salesOrderService
      .concludeManualOrder(orderId, documentType)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.concluding.set(false);
          void this.router.navigateByUrl(
            documentEditPath({
              id: result.documentId,
              type: result.documentType as DocumentType,
            }),
          );
        },
        error: (err: unknown) => {
          this.concluding.set(false);
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  // ── Uscita con modifiche non salvate ────────────────────────────────────
  canDeactivate(): boolean | Promise<boolean> {
    if (!this.dirtySinceLastSave() || this.formReadOnly()) {
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

  protected confirmExitSaveDocument(): void {
    this.saveDocument(() => {
      this.exitDialogOpen.set(false);
      this.pendingDeactivate?.(true);
      this.pendingDeactivate = null;
    });
  }

  /**
   * "Chiudi" (P7): con modifiche non salvate la conferma appare SEMPRE,
   * direttamente dal pulsante — senza affidarsi solo al guard di route
   * (che resta attivo per back del browser e navigazioni esterne).
   */
  protected cancel(): void {
    if (this.dirtySinceLastSave() && !this.formReadOnly()) {
      this.exitDialogOpen.set(true);
      this.pendingDeactivate = (allow) => {
        if (allow) {
          void this.router.navigate([this.listPath]);
        }
      };
      return;
    }
    void this.router.navigate([this.listPath]);
  }

  protected reload(): void {
    this.loadTick.update((tick) => tick + 1);
  }

  protected openOrderDetail(): void {
    const id = this.editOrderId();
    if (id) {
      void this.router.navigate([this.listPath, id]);
    }
  }

  private markFormDirty(): void {
    if (!this.suppressDirtyMarking && !this.formReadOnly()) {
      this.dirtySinceLastSave.set(true);
    }
  }

  private toAppError(err: unknown): AppError {
    return isAppError(err) ? err : mapHttpErrorToAppError(err);
  }
}
