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

import { AuthService } from '@core/auth';
import type { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import { mapHttpErrorToAppError } from '@core/interceptors/http-error.mapper';
import {
  canManageDocuments,
  canViewPurchaseCosts,
} from '@core/permissions/tenant-permissions.util';
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
import { BreadcrumbLabelService } from '@core/services/breadcrumb-label.service';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { VatCodeService } from '@core/services/vat-code.service';
import {
  applyCascadeDiscountMinor,
  applyDiscountMinor,
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
import { DocumentIncludePanelComponent } from '@features/documents/components/document-include-panel/document-include-panel.component';
import { GoodsReceiptLineCodeCellComponent } from '@features/documents/components/goods-receipt-line-code-cell/goods-receipt-line-code-cell.component';
import { GoodsReceiptLineProductCellComponent } from '@features/documents/components/goods-receipt-line-product-cell/goods-receipt-line-product-cell.component';
import { GoodsReceiptProductSearchPanelComponent } from '@features/documents/components/goods-receipt-product-search-panel/goods-receipt-product-search-panel.component';
import {
  CUSTOMER_ORDER_INCLUDE_SOURCES,
  IncludeSourceKind,
  includeSourceKindsForDocumentType,
  type IncludedDocumentPayload,
} from '@features/documents/models/document-include.util';
import { documentTypeLabel } from '@features/documents/models/document-labels.util';
import { documentEditPath } from '@features/documents/models/document-routing.util';
import { transportDataIncomplete } from '@features/documents/models/document-transport.util';
import { parseSerialNumbersText } from '@features/documents/utils/serial-numbers-input.util';
import { DocumentService } from '@features/documents/services/document.service';
import type {
  CreateDocumentBody,
  DocumentLineInputBody,
  UpdateDocumentBody,
} from '@features/documents/services/document-api.mapper';
import {
  DocumentStatus,
  DocumentType,
  TransportPort,
  isConfirmedEditableDocumentStatus,
} from '@core/models/document.model';
import type { DocumentAddress, DocumentRecord } from '@core/models/document.model';
import type { ProductEmbeddedCreatePrefill } from '@features/products/models/product-form.mapper';
import type { VariantSummary } from '@features/products/models/variant-summary.model';
import { ProductFormComponent } from '@features/products/product-form.component';
import { ProductService } from '@features/products/services/product.service';
import { mergeVariantSummaries } from '@features/products/utils/variant-summary-search.util';
import { TenantFeatureSettingsService } from '@features/settings/services/tenant-feature-settings.service';
import type { TenantFeatureSettings } from '@features/settings/models/tenant-feature-settings.model';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { AttachmentsPanelComponent } from '@shared/components/attachments-panel/attachments-panel.component';
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
import { formatItalianInputDate, toIsoDateLocal } from '@shared/utils/calendar.util';

import {
  CUSTOMER_ORDER_LINE_COLUMNS,
  CUSTOMER_ORDER_LINE_PRESETS,
  CUSTOMER_ORDER_LINES_VIEW,
  MANUAL_UNLOAD_LINE_COLUMNS,
  MANUAL_UNLOAD_LINE_PRESETS,
  MANUAL_UNLOAD_LINES_VIEW,
  QUOTE_LINE_COLUMNS,
  QUOTE_LINE_PRESETS,
  QUOTE_LINES_VIEW,
  SALES_DDT_LINE_COLUMNS,
  SALES_DDT_LINE_PRESETS,
  SALES_DDT_LINES_VIEW,
} from './models/customer-order-line-columns.config';
import { redistributeColumnWidths } from './models/column-width-distribution.util';
import { sourceLabel } from './models/sales-order-labels.util';
import {
  SalesOrderService,
  type SaveManualOrderInput,
  type SaveManualOrderLineInput,
} from './services/sales-order.service';

const VARIANT_SEARCH_DEBOUNCE_MS = 300;
const VARIANT_SEARCH_MIN_CHARS = 2;

/**
 * Id degli ordini sbloccati nella sessione di lavoro corrente (come Arrivi
 * merce): sopravvive al passaggio nuovo→/:id/edit dopo il primo salvataggio e
 * ad altre navigazioni tra istanze del form; ogni istanza rilascia alla
 * distruzione i soli id che ha sbloccato (riblocco alla riapertura).
 */
const SESSION_UNLOCKED_ORDER_IDS = new Set<string>();

/** Campi riga nel giro Tab/Invio deterministico (stesso pattern Arrivo merce). */
type CustomerOrderLineFocusField =
  | 'articleCode'
  | 'sku'
  | 'barcode'
  | 'product'
  | 'quantity'
  | 'unitPrice'
  | 'discount'
  | 'serials';
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
    BackButtonComponent,
    BadgeComponent,
    AttachmentsPanelComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    DateInputComponent,
    DocumentIncludePanelComponent,
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
  // footer condivisa e le aggiunte specifiche di questa maschera. La vista
  // mobile sta in un foglio a parte: insieme sforerebbero il budget CSS
  // per-componente. L'ordine conta — questi due vengono dopo i condivisi e
  // ne sovrascrivono le regole a parità di specificità.
  styleUrls: [
    '../documents/goods-receipt-form.component.scss',
    '../documents/document-form-footer.shared.scss',
    './customer-order-form.component.scss',
    './customer-order-form.mobile.scss',
  ],
})
export class CustomerOrderFormComponent implements CanComponentDeactivate {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly salesOrderService = inject(SalesOrderService);
  private readonly documentService = inject(DocumentService);
  private readonly customerService = inject(CustomerService);
  private readonly productService = inject(ProductService);
  private readonly barcodeLookup = inject(BarcodeLookupService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly paymentOptionsService = inject(PaymentOptionsService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly tenantFeatureSettingsService = inject(TenantFeatureSettingsService);
  private readonly columnPreferences = inject(TableColumnPreferenceService);
  // Serve solo a leggere la larghezza resa della tabella durante il resize
  // colonne: la ridistribuzione ragiona in pixel veri, non in quote.
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly breadcrumbLabels = inject(BreadcrumbLabelService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Modalità della maschera (route data `customerDocumentKind`): 'order' =
   * Ordine cliente manuale (default), 'quote' = Preventivo, 'sales-ddt' =
   * DDT vendita, 'manual-unload' = Scarico manuale. Le modalità documento
   * usano la STESSA schermata e lo stesso funzionamento delle righe,
   * persistendo nel registro documenti coi rispettivi numeratori
   * (PRE / DDT / SCA). Differenze chiave:
   * - Preventivo: nessuno stato, mai effetti magazzino.
   * - DDT vendita: nessuno stato documento, la colonna «Imp.» diventa
   *   «Scarica mag.» e le giacenze vengono SCARICATE al salvataggio; in più
   *   testata con Pagamento (modalità normativa fatt. elettronica), «Seguirà
   *   doc. di vendita», sezione Trasporto e sezione Indirizzi (prompt DDT).
   * - Scarico manuale (prompt Scarico manuale): come il DDT per righe, prezzi
   *   e totali, ma cliente FACOLTATIVO (anagrafica o testo libero solo per la
   *   stampa), niente trasporto/indirizzi; la giacenza viene sottratta
   *   direttamente al salvataggio SENZA movimenti di magazzino (deroga
   *   documentata) e l'eliminazione del documento non la ripristina.
   */
  private readonly formKind =
    (this.route.snapshot.data['customerDocumentKind'] as
      | 'order'
      | 'quote'
      | 'sales-ddt'
      | 'manual-unload'
      | undefined) ?? 'order';
  protected readonly isQuote = this.formKind === 'quote';
  protected readonly isSalesDdt = this.formKind === 'sales-ddt';
  protected readonly isManualUnload = this.formKind === 'manual-unload';
  /** Ordine cliente manuale (persistenza in SalesOrder, stati e impegni). */
  protected readonly isOrder = this.formKind === 'order';
  /** Modalità che persistono nel registro documenti (quote / sales_ddt / manual_unload). */
  private readonly isRegistryDocument = !this.isOrder;
  /** Tipo documento del registro per la modalità corrente. */
  private readonly registryDocumentType = this.isSalesDdt
    ? DocumentType.SalesDdt
    : this.isManualUnload
      ? DocumentType.ManualUnload
      : DocumentType.Quote;

  protected readonly listPath = '/app/sales';
  /** Elenco dedicato del tipo (mai il registro generico filtrato). */
  private readonly registryListPath = this.isSalesDdt
    ? '/app/documents/sales-ddt'
    : this.isManualUnload
      ? '/app/documents/manual-unload'
      : '/app/documents/quote';
  protected readonly currency = DEFAULT_CURRENCY;
  protected readonly formatMoney = formatMoney;
  protected readonly formatVatRate = formatVatRate;
  protected readonly sourceLabel = sourceLabel;
  protected readonly TransportPort = TransportPort;
  protected readonly lineColumnsView = this.isQuote
    ? QUOTE_LINES_VIEW
    : this.isSalesDdt
      ? SALES_DDT_LINES_VIEW
      : this.isManualUnload
        ? MANUAL_UNLOAD_LINES_VIEW
        : CUSTOMER_ORDER_LINES_VIEW;
  private readonly lineColumnDefs = this.isQuote
    ? QUOTE_LINE_COLUMNS
    : this.isSalesDdt
      ? SALES_DDT_LINE_COLUMNS
      : this.isManualUnload
        ? MANUAL_UNLOAD_LINE_COLUMNS
        : CUSTOMER_ORDER_LINE_COLUMNS;
  /** Colonna spunta magazzino: «Imp.» (ordine) o «Scarica mag.» (DDT/Scarico). */
  protected readonly commitsColumnLabel =
    this.isSalesDdt || this.isManualUnload ? 'Scarica mag.' : 'Imp.';
  protected readonly commitsStockTooltip =
    this.isSalesDdt || this.isManualUnload
      ? 'Se attiva, la quantità della riga SCARICA la giacenza di magazzino al salvataggio del documento. ' +
        'Default dal Tipo prodotto: Articolo ON, Servizio OFF. Sempre modificabile per eccezioni.'
      : 'Se attiva, la quantità della riga impegna la disponibilità di magazzino (Disponibile = Giacenza − Impegnata). ' +
        'Default dal Tipo prodotto: Articolo ON, Servizio OFF. Sempre modificabile per eccezioni.';

  // ── Routing / stato pagina ──────────────────────────────────────────────
  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly editOrderId = computed(() => this.paramMap().get('id'));
  protected readonly isEditMode = computed(() => Boolean(this.editOrderId()));

  protected readonly loadedOrder = signal<SalesOrder | null>(null);
  /** Documento caricato in modifica (modalità quote/sales-ddt: registro documenti). */
  protected readonly loadedQuoteDoc = signal<DocumentRecord | null>(null);
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
  protected readonly isPartiallyConcluded = computed(
    () => this.orderState() === ManualOrderState.PartiallyConcluded,
  );
  /**
   * Ordine evaso (anche parzialmente) da un documento di scarico: la modifica
   * resta consentita (prompt DDT), ma alla chiusura con modifiche compare
   * l'avviso «collegato a un DDT».
   */
  protected readonly isSettledOrder = computed(
    () => this.isConcluded() || this.isPartiallyConcluded(),
  );

  protected readonly pageTitle = computed(() => {
    if (this.isQuote) {
      return this.isEditMode() ? 'Modifica preventivo' : 'Nuovo preventivo';
    }
    if (this.isSalesDdt) {
      return this.isEditMode() ? 'Modifica DDT vendita' : 'Nuovo DDT vendita';
    }
    if (this.isManualUnload) {
      return this.isEditMode() ? 'Modifica scarico manuale' : 'Nuovo scarico manuale';
    }
    return this.isEditMode() ? 'Modifica ordine cliente' : 'Nuovo ordine cliente';
  });

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
      case ManualOrderState.PartiallyConcluded:
        return 'Parzialmente concluso';
      default:
        return 'Confermato';
    }
  }

  protected stateBadgeTone(): 'success' | 'error' | 'info' | 'warning' {
    switch (this.orderState()) {
      case ManualOrderState.Cancelled:
        return 'error';
      case ManualOrderState.Concluded:
        return 'info';
      case ManualOrderState.PartiallyConcluded:
        return 'warning';
      default:
        return 'success';
    }
  }

  // ── Form ────────────────────────────────────────────────────────────────
  readonly form = this.fb.group({
    // Scarico manuale: cliente FACOLTATIVO (prompt Scarico manuale) — dalla
    // anagrafica oppure digitato liberamente (customerFreeText, solo stampa).
    customerId: this.fb.control('', {
      validators: this.isManualUnload ? [] : [Validators.required],
    }),
    /** Cliente a testo libero (solo scarico manuale): mai salvato in anagrafica. */
    customerFreeText: this.fb.control(''),
    // Obbligatoria: la testata (cliente + location) è il minimo salvabile.
    locationId: this.fb.control('', { validators: [Validators.required] }),
    documentDate: this.fb.control(toIsoDateLocal(new Date()), {
      validators: [Validators.required],
    }),
    externalRef: this.fb.control(''),
    expectedDeliveryDate: this.fb.control(''),
    status: this.fb.control<'confirmed' | 'cancelled'>('confirmed'),
    paymentTerms: this.fb.control(''),
    // DDT vendita: modalità di pagamento normativa (dropdown, prompt DDT).
    paymentMethod: this.fb.control(''),
    // DDT vendita: «Seguirà doc. di vendita» (prompt DDT §TESTATA).
    followedBySalesDoc: this.fb.control(false),
    notes: this.fb.control(''),
    // Sconto extra % sull'intero documento (stesso pattern Arrivo merce).
    documentDiscountPercent: this.fb.control(''),
    // DDT vendita: sezione Trasporto (prompt DDT §TRASPORTO).
    transport: this.fb.group({
      causal: this.fb.control(''),
      startDate: this.fb.control(''),
      startTime: this.fb.control(''),
      port: this.fb.control<'' | TransportPort>(''),
      carrier: this.fb.control(''),
      packagesCount: this.fb.control(''),
      weight: this.fb.control(''),
      goodsAspect: this.fb.control(''),
      shippingCode: this.fb.control(''),
      trackingCode: this.fb.control(''),
    }),
    // DDT vendita: sezione Indirizzi (prompt DDT §INDIRIZZI).
    recipientAddress: this.createAddressGroup(),
    destinationAddress: this.createAddressGroup(),
    lines: this.fb.array([this.createLine()]),
  });

  private createAddressGroup() {
    return this.fb.group({
      name: this.fb.control(''),
      address: this.fb.control(''),
      zip: this.fb.control(''),
      city: this.fb.control(''),
      province: this.fb.control(''),
      country: this.fb.control(''),
      fiscalCode: this.fb.control(''),
      vatNumber: this.fb.control(''),
    });
  }

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

  /**
   * Modalità di pagamento per la testata DDT (prompt DDT §TESTATA): voci
   * normative fatturazione elettronica gestibili in Impostazioni → Pagamenti.
   * La voce salvata sul documento resta selezionabile anche se disattivata.
   */
  protected readonly paymentMethodOptions = computed<readonly SelectMenuOption[]>(() => {
    this.formValue();
    const options = this.paymentOptions()
      .filter((option) => option.kind === 'method' && option.isActive)
      .map((option) => ({ value: option.name, label: option.name }));
    const current = this.form.controls.paymentMethod.value.trim();
    if (current && !options.some((option) => option.value === current)) {
      return [...options, { value: current, label: current }];
    }
    return options;
  });

  protected onPaymentMethodSelect(value: string | null): void {
    this.form.controls.paymentMethod.setValue(value ?? '');
    this.markFormDirty();
  }

  // ── DDT vendita: trasporto, indirizzi, ordini inclusi (prompt DDT) ──────

  /** Sezione Trasporto collassabile: aperta se contiene già dei dati. */
  protected readonly transportOpen = signal(false);

  protected toggleTransportSection(): void {
    this.transportOpen.update((open) => !open);
  }

  /** "Cambia destinazione": abilita un indirizzo diverso dall'intestatario. */
  protected readonly destinationDiffers = signal(false);

  /** Intestatario auto-compilato dall'anagrafica: true finché non editato a mano. */
  private recipientAutoFilled = true;

  /**
   * Ordini cliente inclusi nel DDT («Includi documento»): id agganciati al
   * salvataggio + righe per il controllo di copertura (stato Parzialmente
   * concluso, prompt DDT §LOGICA MAGAZZINO).
   */
  protected readonly includedOrders = signal<
    readonly {
      readonly id: string;
      readonly orderNumber: string;
      readonly lines: readonly { readonly variantId?: string; readonly quantity: number }[];
    }[]
  >([]);

  protected removeIncludedOrder(orderId: string): void {
    this.includedOrders.update((orders) => orders.filter((order) => order.id !== orderId));
    this.markFormDirty();
  }

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
    this.isOrder
      ? this.salesOrderService.getManualOrderMeta().pipe(catchError(() => of(null)))
      : of(null),
    { initialValue: null },
  );
  /** Anteprima prossimo numero documento (numeratore quote/sales_ddt). */
  private readonly registryPreviewReference = toSignal(
    this.isRegistryDocument
      ? this.documentService.previewDocumentNumber(this.registryDocumentType).pipe(
          map((preview) => preview.reference),
          catchError(() => of(null)),
        )
      : of(null),
    { initialValue: null as string | null },
  );
  protected readonly previewReference = computed(() =>
    this.isRegistryDocument
      ? this.registryPreviewReference()
      : (this.meta()?.nextReferencePreview ?? null),
  );
  protected readonly internalReferenceLabel = computed(() => {
    const saved = this.isRegistryDocument
      ? this.loadedQuoteDoc()?.reference
      : this.loadedOrder()?.orderNumber;
    return saved ?? this.previewReference();
  });

  /**
   * Etichetta della tappa id nel breadcrumb: il numero del documento aperto
   * (es. «OC-2026-0001»), così il percorso mostra quello invece del generico
   * «Dettaglio». Solo in modifica (l'id è nell'URL) e con documento caricato.
   */
  private readonly breadcrumbEntity = computed(() => {
    const id = this.editOrderId();
    if (!id) {
      return null;
    }
    const label = this.isRegistryDocument
      ? this.loadedQuoteDoc()?.reference
      : this.loadedOrder()?.orderNumber;
    return label ? { id, label } : null;
  });
  /** Id attualmente registrato nel breadcrumb (per pulizia mirata). */
  private breadcrumbLabelId: string | null = null;
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
  // Scarico manuale: il cliente è facoltativo, basta la location di scarico.
  protected readonly headerGateActive = computed(() => {
    if (this.formReadOnly()) {
      return false;
    }
    this.formValue();
    if (this.isManualUnload) {
      return !this.form.controls.locationId.value;
    }
    return !this.form.controls.customerId.value || !this.form.controls.locationId.value;
  });

  // ── Apertura in sola lettura (come Arrivi merce) ─────────────────────────
  // Un Ordine cliente già salvato si apre BLOCCATO: va sbloccato con «Sblocca
  // modifica» per essere modificato. Vale SOLO per gli Ordini (isOrder) con un
  // ordine caricato; i nuovi ordini e gli altri tipi documento
  // (preventivo/DDT/scarico) non si bloccano.
  protected readonly editUnlocked = signal(false);
  protected readonly unlockDialogOpen = signal(false);
  private readonly unlockedByThisInstance = new Set<string>();

  private markSessionUnlocked(orderId: string | null | undefined): void {
    if (orderId) {
      SESSION_UNLOCKED_ORDER_IDS.add(orderId);
      this.unlockedByThisInstance.add(orderId);
    }
  }

  /** Ordine caricato da un canale esterno (Shopify/POS): resta in sola lettura. */
  protected readonly isExternalOrder = computed(() => {
    const order = this.loadedOrder();
    return order != null && order.source !== SalesOrderSource.Manual;
  });

  protected readonly canManageOrders = computed(() =>
    canManageDocuments(this.authService.currentUser()),
  );

  /**
   * Sbloccabile se l'utente gestisce i documenti e il documento è modificabile
   * a mano: gli Ordini manuali (i non manuali restano in sola lettura, Fase 1)
   * e i Preventivi (aperti bloccati dall'elenco, come gli Arrivi merce).
   */
  protected readonly canUnlockOrder = computed(
    () => this.canManageOrders() && ((this.isOrder && !this.isExternalOrder()) || this.isQuote),
  );

  /**
   * Sola lettura all'apertura: un Ordine manuale già caricato oppure un
   * Preventivo già caricato restano bloccati finché non si preme «Sblocca
   * modifica» (stesso pattern degli Arrivi merce). I nuovi documenti (nessun
   * id) e gli altri tipi (DDT/Scarico) non si bloccano.
   */
  protected readonly formReadOnly = computed(
    () =>
      (this.isOrder && this.loadedOrder() != null && !this.editUnlocked()) ||
      (this.isQuote && this.loadedQuoteDoc() != null && !this.editUnlocked()),
  );

  /** Testo del banner di sola lettura, per tipo documento. */
  protected readonly lockedBannerText = computed(() =>
    this.isQuote
      ? 'Preventivo protetto da modifica. Sblocca per continuare a lavorare.'
      : 'Ordine protetto da modifica. Sblocca per continuare a lavorare.',
  );

  /** Titolo/messaggio del dialogo di sblocco, per tipo documento. */
  protected readonly unlockDialogTitle = computed(() =>
    this.isQuote ? 'Sblocca modifica preventivo' : 'Sblocca modifica ordine',
  );
  protected readonly unlockDialogMessage = computed(() =>
    this.isQuote
      ? 'Sblocca il preventivo per modificarne righe e testata e salvarlo di nuovo.'
      : "Modificando l'ordine, VestiFlow aggiornerà gli impegni di magazzino collegati al salvataggio.",
  );

  protected requestUnlockEdit(): void {
    if (!this.canUnlockOrder()) {
      return;
    }
    this.unlockDialogOpen.set(true);
  }

  protected confirmUnlockEdit(): void {
    this.unlockDialogOpen.set(false);
    this.markSessionUnlocked(this.loadedOrder()?.id ?? this.loadedQuoteDoc()?.id);
    this.editUnlocked.set(true);
  }

  // ── Caricamento ordine in modifica ──────────────────────────────────────
  private readonly loadTick = signal(0);
  private readonly loadState = toSignal(
    toObservable(computed(() => ({ id: this.editOrderId(), tick: this.loadTick() }))).pipe(
      switchMap(({ id }) => {
        if (!id) {
          return of<'ready' | 'loading' | 'not-editable' | 'error'>('ready');
        }
        if (this.isRegistryDocument) {
          return this.documentService.getDocumentById(id).pipe(
            map((doc) => {
              const editable =
                doc.type === this.registryDocumentType &&
                (doc.status === DocumentStatus.Draft ||
                  (isConfirmedEditableDocumentStatus(doc.status) &&
                    doc.blockAfterConfirm !== true));
              if (!editable) {
                this.loadedQuoteDoc.set(null);
                return 'not-editable' as const;
              }
              // Preventivo: un CONFERMATO si apre BLOCCATO (come Arrivi merce),
              // una bozza (es. duplicato) resta subito modificabile; sblocco di
              // sessione sempre rispettato. Gli altri tipi registro (DDT/Scarico)
              // non si bloccano: editUnlocked = true.
              this.editUnlocked.set(
                this.isQuote
                  ? SESSION_UNLOCKED_ORDER_IDS.has(doc.id) || doc.status === DocumentStatus.Draft
                  : true,
              );
              this.loadedQuoteDoc.set(doc);
              this.patchFormFromRegistryDocument(doc);
              return 'ready' as const;
            }),
            startWith<'ready' | 'loading' | 'not-editable' | 'error'>('loading'),
            catchError(() => of('error' as const)),
          );
        }
        return this.salesOrderService.getSalesOrderById(id).pipe(
          map((order) => {
            // Anche gli ordini NON manuali (Shopify/canali esterni) si aprono
            // nel form, ma in SOLA LETTURA: aprirli qui sostituisce la vecchia
            // schermata Dettaglio. La modifica locale resta ai soli manuali
            // (gli impegni si ricaricano solo per questi).
            this.editUnlocked.set(
              order.source === SalesOrderSource.Manual && SESSION_UNLOCKED_ORDER_IDS.has(order.id),
            );
            this.loadedOrder.set(order);
            this.patchFormFromOrder(order);
            if (order.source === SalesOrderSource.Manual) {
              this.reloadOwnReservations(order.id);
            }
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

  // ── Includi documento (logica trasversale, mappa in document-include.util:
  //     l'Ordine cliente include da Preventivo; il DDT vendita da Preventivo
  //     e Ordine cliente; il Preventivo non include da nessun documento) ────
  protected readonly includeSourceKinds: readonly IncludeSourceKind[] =
    this.isQuote || this.isManualUnload
      ? []
      : this.isSalesDdt
        ? includeSourceKindsForDocumentType(DocumentType.SalesDdt)
        : CUSTOMER_ORDER_INCLUDE_SOURCES;
  protected readonly includePanelOpen = signal(false);
  protected readonly includeLaunchSeq = signal(0);

  // ── Dialoghi ────────────────────────────────────────────────────────────
  protected readonly exitDialogOpen = signal(false);
  private pendingDeactivate: ((allow: boolean) => void) | null = null;
  protected readonly availabilityDialogOpen = signal(false);
  protected readonly availabilityIssues = signal<readonly AvailabilityIssue[]>([]);
  private pendingSaveAfterAvailability = false;
  protected readonly concludeMenuOpen = signal(false);
  protected readonly concluding = signal(false);

  // ── DDT vendita: dialoghi avvisi e generazione documenti (prompt DDT) ───
  /** «Dati trasporto/indirizzi incompleti. Procedere lo stesso?» */
  protected readonly incompleteDataDialogOpen = signal(false);
  /** «Non sono stati evasi tutti i prodotti previsti. Forzare a Concluso?» */
  protected readonly partialOrdersDialogOpen = signal(false);
  protected readonly partialOrderNumbers = signal<readonly string[]>([]);
  private pendingPartialOrderIds: readonly string[] = [];
  /** Menu «Genera documento» (Bozza fattura / Proforma, §GENERAZIONE). */
  protected readonly generateMenuOpen = signal(false);
  protected readonly generating = signal(false);

  constructor() {
    // Colonna "Costo" (dato sensibile §permessi): senza il permesso
    // "Visualizza costi d'acquisto" la definizione non viene registrata,
    // quindi non compare nemmeno tra le opzioni del selettore colonne.
    const canSeeCosts = canViewPurchaseCosts(this.authService.currentUser());
    this.columnPreferences.registerView(
      this.lineColumnsView,
      canSeeCosts
        ? this.lineColumnDefs
        : this.lineColumnDefs.filter((column) => column.id !== 'purchaseCost'),
      this.isQuote
        ? QUOTE_LINE_PRESETS
        : this.isSalesDdt
          ? SALES_DDT_LINE_PRESETS
          : this.isManualUnload
            ? MANUAL_UNLOAD_LINE_PRESETS
            : CUSTOMER_ORDER_LINE_PRESETS,
    );

    // Sblocco per-sessione: alla distruzione dell'istanza rilascio i soli id
    // che ho sbloccato io, così riaprendo l'ordine torna bloccato (come AM).
    this.destroyRef.onDestroy(() => {
      for (const id of this.unlockedByThisInstance) {
        SESSION_UNLOCKED_ORDER_IDS.delete(id);
      }
      if (this.breadcrumbLabelId) {
        this.breadcrumbLabels.clear(this.breadcrumbLabelId);
      }
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

    // Intestatario editato a mano: stop all'auto-compilazione dall'anagrafica.
    this.form.controls.recipientAddress.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.suppressRecipientAutofillTracking) {
          this.recipientAutoFilled = false;
        }
      });
  }

  /** Alza il flag durante le patch programmatiche dell'intestatario. */
  private suppressRecipientAutofillTracking = false;

  private readonly lineTableColumnState = computed(() =>
    this.columnPreferences.state(this.lineColumnsView)(),
  );

  // ── Colonne ─────────────────────────────────────────────────────────────
  protected isLineColumnVisible(columnId: string): boolean {
    this.lineTableColumnState();
    // Colonna Seriali (solo DDT): nascosta se il tracciamento seriali non è
    // attivo nelle impostazioni tenant (stesso gate dell'Arrivo merce).
    if (columnId === 'serials') {
      const settings = this.tenantSettings();
      if (settings && !settings.serialsEnabled) {
        return false;
      }
    }
    return this.columnPreferences.isColumnVisible(this.lineColumnsView, columnId);
  }

  // Larghezza nominale della colonna numero riga (--space-12): entra nel
  // totale perché con quote percentuali TUTTE le colonne devono sommare 100%
  // — una colonna px residua farebbe traboccare la tabella di quei px.
  private static readonly LINE_INDEX_COLUMN_PX = 48;

  /**
   * Larghezze in corso di trascinamento: vivono qui e non nelle preferenze
   * finché il mouse non si alza, altrimenti ogni pixel di movimento
   * scriverebbe su localStorage e sul server.
   */
  private readonly lineColumnDraft = signal<ReadonlyMap<string, number> | null>(null);

  /** Px salvati (o default) di una colonna: restano l'unità persistita. */
  private lineColumnPx(columnId: string): number {
    const draft = this.lineColumnDraft();
    const drafted = draft?.get(columnId);
    if (drafted !== undefined) {
      return drafted;
    }
    const def = this.lineColumnDefs.find((col) => col.id === columnId);
    const fallback = def?.defaultWidthPx ?? 96;
    // Il minimo vale anche sulle larghezze già salvate: senza, una colonna
    // stretta da un vecchio ridimensionamento resterebbe tale anche dopo aver
    // alzato il minimo (e il contenuto continuerebbe a stare stretto).
    return Math.max(
      this.columnPreferences.columnWidth(this.lineColumnsView, columnId, fallback),
      this.lineColumnMinWidth(columnId),
    );
  }

  /** Somma dei px delle colonne visibili + colonna indice. */
  private lineColumnsTotalPx(): number {
    return this.lineColumnDefs.reduce(
      (total, def) =>
        this.isLineColumnVisible(def.id) ? total + this.lineColumnPx(def.id) : total,
      CustomerOrderFormComponent.LINE_INDEX_COLUMN_PX,
    );
  }

  /**
   * Larghezza colonna come QUOTA percentuale del totale: la tabella occupa
   * sempre esattamente il 100% del contenitore — coi px assoluti e
   * table-layout fixed, quando la somma superava il wrapper la tabella
   * restava larga quanto la somma e scorreva invece di adattarsi. I px
   * salvati dal resize fanno da pesi relativi.
   */
  protected lineColumnWidth(columnId: string): string {
    this.lineTableColumnState();
    return `${((this.lineColumnPx(columnId) / this.lineColumnsTotalPx()) * 100).toFixed(4)}%`;
  }

  /** Quota percentuale della colonna numero riga (vedi lineColumnWidth). */
  protected lineIndexColumnWidth(): string {
    this.lineTableColumnState();
    return `${((CustomerOrderFormComponent.LINE_INDEX_COLUMN_PX / this.lineColumnsTotalPx()) * 100).toFixed(4)}%`;
  }

  protected lineColumnMinWidth(columnId: string): number {
    const def = this.lineColumnDefs.find((col) => col.id === columnId);
    return def?.minWidthPx ?? 48;
  }

  /**
   * Trascinamento in corso: la colonna presa segue il cursore e le ALTRE
   * cedono (o riprendono) spazio in proporzione, da entrambi i lati. La somma
   * resta quella di partenza, così la tabella continua a stare esattamente
   * nel contenitore e non compare la barra di scorrimento orizzontale.
   */
  protected onLineColumnResizing(columnId: string, renderedWidthPx: number): void {
    const next = this.redistributeLineColumns(columnId, renderedWidthPx);
    if (next) {
      this.lineColumnDraft.set(next);
    }
  }

  protected onLineColumnResize(columnId: string, renderedWidthPx: number): void {
    const draft = this.lineColumnDraft();
    if (!draft) {
      // Solo un clic sull'impugnatura: niente da salvare.
      return;
    }
    const next = this.redistributeLineColumns(columnId, renderedWidthPx) ?? draft;
    this.lineColumnDraft.set(null);
    const widths: Record<string, number> = {};
    for (const [id, px] of next) {
      widths[id] = Math.round(px);
    }
    this.columnPreferences.setColumnWidths(this.lineColumnsView, widths);
  }

  /**
   * Nuove larghezze di TUTTE le colonne visibili con `columnId` portata a
   * `renderedWidthPx`. Il conto si fa in PIXEL RESI, non nei pesi salvati: è
   * l'unica scala in cui i minimi per colonna significano qualcosa. Erano
   * proprio i minimi ignorati a far comparire la barra orizzontale — allargando
   * molto una colonna, le altre finivano sotto la larghezza del loro contenuto,
   * che traboccava dalla cella. Le larghezze così ottenute sommano alla
   * larghezza della tabella e diventano i nuovi pesi (contano solo i rapporti).
   */
  private redistributeLineColumns(
    columnId: string,
    renderedWidthPx: number,
  ): ReadonlyMap<string, number> | null {
    const tableWidth =
      this.host.nativeElement.querySelector('.gr-form__table-wrap')?.clientWidth ?? 0;
    const visible = this.lineColumnDefs.filter((def) => this.isLineColumnVisible(def.id));
    if (tableWidth <= 0 || visible.length < 2) {
      return null;
    }

    // A trascinamento avviato le larghezze in bozza sono già pixel resi: la
    // conversione va fatta una volta sola, all'inizio, o si accumula deriva.
    const scale = this.lineColumnDraft() ? 1 : tableWidth / this.lineColumnsTotalPx();
    const base = visible.map((def) => ({
      id: def.id,
      px: this.lineColumnPx(def.id) * scale,
      minPx: this.lineColumnMinWidth(def.id),
    }));
    return redistributeColumnWidths(base, columnId, renderedWidthPx);
  }

  // ── Righe: creazione, selezione variante, difaults ──────────────────────
  private createLine() {
    return this.fb.group({
      id: this.fb.control(''),
      variantId: this.fb.control(''),
      // Codice articolo: terzo criterio di ricerca accanto a SKU/EAN (§6).
      articleCode: this.fb.control(''),
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
      // Seriali consumati dallo scarico (solo DDT, testo "SN001, SN002").
      serialNumbersText: this.fb.control(''),
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
    // I seriali identificano il singolo pezzo: mai copiati sulla riga duplicata.
    copy.setValue({ ...source.getRawValue(), id: '', serialNumbersText: '' });
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

  /** Codice articolo del prodotto collegato alla riga (colonna §Codice articolo). */
  protected lineArticleCode(index: number): string {
    return (
      this.lineVariantSummary(index)?.articleCode ||
      this.lines.at(index)?.controls.articleCode.value ||
      ''
    );
  }

  /**
   * Costo d'acquisto dell'articolo (colonna "Costo", §8): ultimo costo
   * registrato in anagrafica (stesso dato scritto dall'Arrivo merce, netto).
   * Visibile solo con permesso "Visualizza costi d'acquisto".
   */
  protected linePurchaseCost(index: number): string {
    this.formValue();
    const purchase = this.lineVariantSummary(index)?.purchasePrice;
    return purchase && purchase.amountMinor > 0 ? formatMoney(purchase) : '—';
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
        // FISSA la summary trovata nei risultati di ricerca: quando la query
        // si svuota (debounce) i searched tornano [], e senza pin la riga
        // perdeva disponibilità/codici dopo ~1s (Q.tà disp. che "sparisce").
        this.pinnedVariants.update((current) => mergeVariantSummaries([summary], current));
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
    line.controls.articleCode.setValue(summary.articleCode, { emitEvent: false });
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
            // Codice articolo sulle righe collegate (righe caricate da ordine
            // esistente: il documento non lo persiste, arriva dall'anagrafica).
            for (const line of this.lines.controls) {
              if (line.controls.variantId.value === summary.variantId) {
                line.controls.articleCode.setValue(summary.articleCode, { emitEvent: false });
              }
            }
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

  /** Testo colonna "Q.tà disp.": — per i Servizi (nessun controllo). */
  protected lineStockAvailable(index: number): string {
    this.formValue();
    const available = this.lineEffectiveAvailable(index);
    return available == null ? '—' : String(available);
  }

  /** Avviso ambra sulla cella quantità: la Q.tà digitata supera la disponibile. */
  protected lineExceedsAvailability(index: number): boolean {
    // Il Preventivo non impegna e non blocca disponibilità: nessun avviso.
    if (this.isQuote) {
      return false;
    }
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

  /**
   * Prezzo unitario scontato con cascata ESATTA (es. "4+10%" ≠ 14%).
   * In modalità Preventivo lo sconto è la percentuale effettiva ARROTONDATA:
   * le righe documento persistono uno sconto intero (discountPercent), quindi
   * l'anteprima usa lo stesso arrotondamento per combaciare col server.
   */
  protected lineDiscountedUnitMoney(index: number): Money {
    this.formValue();
    const line = this.lines.at(index);
    const unit = this.lineUnitPriceMinor(line);
    const discounted = this.isQuote
      ? applyDiscountMinor(unit, line.controls.discount.value)
      : applyCascadeDiscountMinor(unit, line.controls.discount.value);
    return { amountMinor: discounted, currencyCode: this.currency };
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

  // ── Vista mobile (mockup responsive v3) ───────────────────────────────────
  // Sotto lg la tabella lascia il posto a una lista di card: la testata si
  // riassume in una riga apribile e ogni riga documento diventa una card che
  // si espande sui campi. Lo stato di apertura vive qui perché è vista, non
  // dato: nessun controllo del form ne dipende.

  /** Testata compressa nel riepilogo cliente · location · data · stato. */
  protected readonly mobileHeaderOpen = signal(false);

  protected toggleMobileHeader(): void {
    this.mobileHeaderOpen.update((open) => !open);
  }

  /** Card riga aperta: una sola alla volta, come nel mockup. */
  protected readonly openLineCard = signal<number | null>(null);

  protected isLineCardOpen(index: number): boolean {
    return this.openLineCard() === index;
  }

  protected toggleLineCard(index: number): void {
    this.openLineCard.update((current) => (current === index ? null : index));
  }

  protected readonly mobileHeaderTitle = computed(() => {
    this.formValue();
    const customerId = this.form.controls.customerId.value;
    const selected = this.customerOptions().find((option) => option.value === customerId);
    return (
      selected?.label ||
      this.form.controls.customerFreeText.value.trim() ||
      (this.isManualUnload ? 'Nessun cliente' : 'Seleziona cliente')
    );
  });

  protected readonly mobileHeaderMeta = computed(() => {
    this.formValue();
    const locationId = this.form.controls.locationId.value;
    const location = this.locationOptions().find((option) => option.value === locationId)?.label;
    const documentDate = this.form.controls.documentDate.value;
    return [
      location,
      documentDate ? formatItalianInputDate(documentDate) : null,
      this.isOrder ? this.stateBadgeLabel() : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · ');
  });

  /** «Impegna magazzino» come Sì/No: sulla card è una scelta, non una spunta. */
  protected onLineCommitsSelect(index: number, value: string): void {
    this.lines.at(index).controls.commitsStock.setValue(value === 'yes');
    this.markFormDirty();
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
      articleCode: '',
      sku: '',
      barcode: '',
      productName: '',
      unitOfMeasure: '',
    });
    this.markFormDirty();
  }

  // ── Celle codice (Cod. articolo / SKU / EAN): lookup esatto alla conferma ──
  protected onLineSkuChange(index: number, value: string): void {
    this.lines.at(index).controls.sku.setValue(value);
    this.markFormDirty();
  }

  protected onLineBarcodeChange(index: number, value: string): void {
    this.lines.at(index).controls.barcode.setValue(value);
    this.markFormDirty();
  }

  protected onLineArticleCodeChange(index: number, value: string): void {
    this.lines.at(index).controls.articleCode.setValue(value);
    this.markFormDirty();
  }

  protected commitCodeLookup(index: number, field: 'articleCode' | 'sku' | 'barcode'): void {
    const line = this.lines.at(index);
    if (line.controls.variantId.value) {
      this.focusNextLineField(index, field);
      return;
    }
    const code = line.controls[field].value.trim();
    if (!code) {
      this.focusNextLineField(index, field);
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
          this.focusLineField(index, 'quantity');
          return;
        }
        // Nessun match esatto (§6c): l'operatore prosegue con gli altri campi.
        this.focusNextLineField(index, field);
      });
  }

  // ── Tab deterministico tra i campi riga (§10, stesso pattern Arrivo merce) ──

  /** Campi editabili visibili della riga, nell'ordine delle colonne. */
  private visibleLineFocusFields(index: number): readonly CustomerOrderLineFocusField[] {
    const all: readonly CustomerOrderLineFocusField[] = [
      'articleCode',
      'sku',
      'barcode',
      'product',
      'quantity',
      'unitPrice',
      'discount',
      'serials',
    ];
    const linked = this.lineHasLinkedProduct(index);
    return all.filter((field) => {
      // Su riga collegata i codici/nome sono bloccati: restano i campi dati.
      if (
        linked &&
        (field === 'articleCode' || field === 'sku' || field === 'barcode' || field === 'product')
      ) {
        return false;
      }
      const columnId = field === 'product' ? 'product' : field;
      return this.isLineColumnVisible(columnId);
    });
  }

  protected focusLineField(index: number, field: CustomerOrderLineFocusField): void {
    const idMap: Record<CustomerOrderLineFocusField, string> = {
      articleCode: `co-code-${index}`,
      sku: `co-sku-${index}`,
      barcode: `co-barcode-${index}`,
      product: `co-product-${index}`,
      quantity: `co-qty-${index}`,
      unitPrice: `co-price-${index}`,
      discount: `co-discount-${index}`,
      serials: `co-serials-${index}`,
    };
    globalThis.document.getElementById(idMap[field])?.focus();
  }

  private focusFirstLineField(index: number): void {
    const order = this.visibleLineFocusFields(index);
    if (order[0]) {
      this.focusLineField(index, order[0]);
    }
  }

  private focusLastLineField(index: number): void {
    const order = this.visibleLineFocusFields(index);
    const last = order[order.length - 1];
    if (last) {
      this.focusLineField(index, last);
    }
  }

  protected focusNextLineField(index: number, current: CustomerOrderLineFocusField): void {
    const order = this.visibleLineFocusFields(index);
    const pos = order.indexOf(current);
    if (pos >= 0 && pos < order.length - 1) {
      this.focusLineField(index, order[pos + 1]!);
      return;
    }
    this.advanceToNextLine(index);
  }

  protected focusPreviousLineField(index: number, current: CustomerOrderLineFocusField): void {
    const order = this.visibleLineFocusFields(index);
    const pos = order.indexOf(current);
    if (pos > 0) {
      this.focusLineField(index, order[pos - 1]!);
      return;
    }
    if (index > 0) {
      this.focusLastLineField(index - 1);
    }
  }

  /** Ultima cella della riga → prima cella della successiva; sull'ultima riga crea la nuova. */
  protected advanceToNextLine(index: number): void {
    if (this.formReadOnly()) {
      return;
    }
    const nextIndex = index + 1;
    if (nextIndex >= this.lines.length) {
      this.lines.push(this.createLine());
      this.markFormDirty();
    }
    // Focus dopo il render della riga appena creata.
    setTimeout(() => this.focusFirstLineField(nextIndex));
  }

  /**
   * Tab/Shift+Tab deterministici sui campi dati della riga: mai su icone o
   * pulsanti di servizio; dall'ultimo campo si passa alla riga successiva.
   */
  protected onLineFieldKeydown(
    index: number,
    field: CustomerOrderLineFocusField,
    event: KeyboardEvent,
  ): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.focusNextLineField(index, field);
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    if (event.shiftKey) {
      const order = this.visibleLineFocusFields(index);
      if (order.indexOf(field) <= 0 && index === 0) {
        // Prima cella della prima riga: lascia al browser l'uscita dalla tabella.
        return;
      }
      event.preventDefault();
      this.focusPreviousLineField(index, field);
      return;
    }
    event.preventDefault();
    this.focusNextLineField(index, field);
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

  // ── Includi documento: inserimento righe dal documento di origine ───────
  protected openIncludePanel(): void {
    this.includeLaunchSeq.update((seq) => seq + 1);
    this.includePanelOpen.set(true);
  }

  protected closeIncludePanel(): void {
    this.includePanelOpen.set(false);
  }

  /**
   * Documento incluso: inserisce la riga di testo descrittiva col riferimento
   * all'origine (es. «Rif. Preventivo PRE-2026-0001 del 17/07/2026») seguita
   * dalle righe articolo copiate. I dati di testata restano quelli del
   * documento corrente.
   */
  protected onDocumentIncluded(payload: IncludedDocumentPayload): void {
    this.closeIncludePanel();

    // DDT vendita: l'Ordine cliente incluso viene AGGANCIATO al documento
    // (prompt DDT §LOGICA MAGAZZINO) — al salvataggio l'impegno dell'OC viene
    // rilasciato, il DDT scarica al suo posto e lo stato dell'OC si aggiorna.
    if (this.isSalesDdt && payload.kind === IncludeSourceKind.CustomerOrder) {
      const alreadyIncluded = this.includedOrders().some((order) => order.id === payload.sourceId);
      if (alreadyIncluded) {
        this._submitState.set({
          status: 'error',
          error: {
            kind: AppErrorKind.Validation,
            message:
              `L'ordine ${payload.sourceReference ?? ''} è già incluso in questo DDT.`.trim(),
          },
        });
        return;
      }
      this.includedOrders.update((orders) => [
        ...orders,
        {
          id: payload.sourceId,
          orderNumber: payload.sourceReference ?? 'Ordine cliente',
          lines: payload.lines.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
          })),
        },
      ]);
    }

    // DDT vendita: i dati di testata del documento incluso vengono riportati
    // se presenti; altrimenti restano quelli del DDT corrente (prompt DDT
    // §INCLUDI DOCUMENTO). Il cliente propaga anche pagamento e intestatario.
    if (this.isSalesDdt) {
      if (payload.sourceCustomerId) {
        this.form.controls.customerId.setValue(payload.sourceCustomerId);
      }
      if (payload.sourcePaymentTerms?.trim()) {
        this.form.controls.paymentTerms.setValue(payload.sourcePaymentTerms.trim());
      }
    }

    const groups: ReturnType<CustomerOrderFormComponent['createLine']>[] = [];

    const referenceLine = this.createLine();
    referenceLine.patchValue(
      { productName: payload.referenceText, quantity: 1, commitsStock: false },
      { emitEvent: false },
    );
    groups.push(referenceLine);

    for (const line of payload.lines) {
      const group = this.createLine();
      group.patchValue(
        {
          variantId: line.variantId ?? '',
          sku: line.sku ?? '',
          barcode: line.barcode ?? '',
          productName: line.description,
          quantity: line.quantity,
          unitPrice:
            line.unitPriceMinor > 0
              ? moneyToDecimalString({
                  amountMinor: line.unitPriceMinor,
                  currencyCode: this.currency,
                }).replace('.', ',')
              : '',
          discount: line.discount,
          vatCodeId: line.vatCodeId ?? '',
          commitsStock: Boolean(line.variantId),
        },
        { emitEvent: false },
      );
      groups.push(group);
    }

    // Le righe incluse entrano prima delle eventuali righe vuote in coda.
    let insertAt = this.lines.length;
    while (insertAt > 0 && this.lineIsEmpty(this.lines.at(insertAt - 1))) {
      insertAt -= 1;
    }
    groups.forEach((group, offset) => {
      this.lines.insert(insertAt + offset, group, { emitEvent: false });
    });
    // Summary anagrafiche per le righe collegate: codici, U.m., disponibilità.
    this.refreshAllLineSummaries();
    this.markFormDirty();
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
    if (this.isSalesDdt) {
      // Pagamento DDT: auto-compilato dal tipo di pagamento dell'anagrafica;
      // senza pagamento in anagrafica resta il dropdown a scelta libera.
      if (!this.form.controls.paymentMethod.value.trim() && customer.paymentMethod?.trim()) {
        this.form.controls.paymentMethod.setValue(customer.paymentMethod.trim());
      }
      // Incaricato trasporto proposto dall'anagrafica (campo dedicato cliente).
      const transportControls = this.form.controls.transport.controls;
      if (!transportControls.carrier.value.trim() && customer.transportResponsible?.trim()) {
        transportControls.carrier.setValue(customer.transportResponsible.trim());
      }
      this.applyRecipientFromCustomer(customer);
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

  /**
   * Intestatario auto-compilato dall'anagrafica del cliente selezionato in
   * testata (prompt DDT §INDIRIZZI). Non sovrascrive un indirizzo editato a
   * mano; finché la destinazione coincide, segue l'intestatario.
   */
  private applyRecipientFromCustomer(customer: Customer): void {
    if (!this.recipientAutoFilled) {
      return;
    }
    const address = customer.address;
    const snapshot = {
      name: customerDisplayName(customer),
      address: [address?.line1, address?.line2].filter(Boolean).join(', '),
      zip: address?.postalCode ?? '',
      city: address?.city ?? '',
      province: address?.province ?? '',
      country: address?.country ?? '',
      fiscalCode: customer.taxCode ?? '',
      vatNumber: customer.vatNumber ?? '',
    };
    this.suppressRecipientAutofillTracking = true;
    try {
      this.form.controls.recipientAddress.patchValue(snapshot);
      if (!this.destinationDiffers()) {
        this.form.controls.destinationAddress.patchValue(snapshot, { emitEvent: false });
      }
    } finally {
      this.suppressRecipientAutofillTracking = false;
    }
  }

  /** «Cambia destinazione»: parte dall'intestatario e diventa editabile. */
  protected enableDifferentDestination(): void {
    if (!this.destinationDiffers()) {
      this.form.controls.destinationAddress.patchValue(
        this.form.controls.recipientAddress.getRawValue(),
        { emitEvent: false },
      );
      this.destinationDiffers.set(true);
      this.markFormDirty();
    }
  }

  /** Torna alla destinazione coincidente con l'intestatario. */
  protected resetDestinationToRecipient(): void {
    this.destinationDiffers.set(false);
    this.form.controls.destinationAddress.patchValue(
      this.form.controls.recipientAddress.getRawValue(),
      { emitEvent: false },
    );
    this.markFormDirty();
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
            // Popolato dalle summary appena caricate (refreshAllLineSummaries).
            articleCode: '',
            sku: line.sku,
            barcode: line.barcode ?? '',
            productName: line.title,
            quantity: line.quantity,
            unitPrice: moneyToDecimalString(line.unitPrice).replace('.', ','),
            discount: line.discount ?? '',
            vatCodeId: line.vatCodeId ?? '',
            commitsStock: line.commitsStock ?? true,
            unitOfMeasure: line.unitOfMeasure ?? '',
            serialNumbersText: '',
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
    // Scarico manuale: basta la location — il cliente è facoltativo.
    this.form.controls.customerId.markAsTouched();
    this.form.controls.locationId.markAsTouched();
    const missingCustomer = !this.isManualUnload && !this.form.controls.customerId.value;
    if (missingCustomer || !this.form.controls.locationId.value) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: this.isQuote
            ? 'Seleziona cliente e location per salvare il preventivo.'
            : this.isSalesDdt
              ? 'Seleziona cliente e location per salvare il DDT vendita.'
              : this.isManualUnload
                ? 'Seleziona la location di scarico per salvare lo scarico manuale.'
                : "Seleziona cliente e location di origine per salvare l'ordine.",
        },
      });
      return;
    }
    if (this.isRegistryDocument) {
      // Il documento riceve il numero (PRE/DDT/SCA) al salvataggio: serve
      // almeno una riga valida (un documento di sola testata non è numerabile).
      if (this.validLinesCount() === 0) {
        this._submitState.set({
          status: 'error',
          error: {
            kind: AppErrorKind.Validation,
            message: this.isSalesDdt
              ? 'Aggiungi almeno una riga valida per salvare il DDT vendita.'
              : this.isManualUnload
                ? 'Aggiungi almeno una riga valida per salvare lo scarico manuale.'
                : 'Aggiungi almeno una riga valida per salvare il preventivo.',
          },
        });
        return;
      }
      if (this.isQuote) {
        // Nessun controllo disponibilità: il preventivo non impegna magazzino.
        this.saveDocument();
        return;
      }
      // DDT vendita e Scarico manuale: avviso disponibilità non bloccante
      // («Stai scaricando più di quanto disponibile. Continuare?»). Per il
      // DDT la catena prosegue con dati trasporto/indirizzi e copertura
      // ordini (prompt DDT §AVVISI); lo scarico salva direttamente.
      const unloadIssues = this.collectAvailabilityIssues();
      if (unloadIssues.length > 0) {
        this.availabilityIssues.set(unloadIssues);
        this.pendingSaveAfterAvailability = true;
        this.availabilityDialogOpen.set(true);
        return;
      }
      if (this.isManualUnload) {
        this.saveDocument();
        return;
      }
      this.checkIncompleteDataThenSave();
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
      if (this.isSalesDdt) {
        // La catena avvisi DDT prosegue: dati incompleti → copertura ordini.
        this.checkIncompleteDataThenSave();
        return;
      }
      this.saveDocument();
    }
  }

  protected dismissAvailabilityDialog(): void {
    this.availabilityDialogOpen.set(false);
    this.pendingSaveAfterAvailability = false;
  }

  // ── DDT vendita: avvisi pre-salvataggio (prompt DDT §AVVISI) ────────────

  /**
   * Dati trasporto/indirizzi «non compilati» (per l'avviso pre-salvataggio).
   * La regola è condivisa con la stampa e con la Fattura accompagnatoria
   * (document-transport.util): qui si passano solo i valori correnti del form.
   */
  private ddtDataIncomplete(): boolean {
    const transport = this.form.controls.transport.getRawValue();
    const recipient = this.form.controls.recipientAddress.getRawValue();
    const destination = this.destinationDiffers()
      ? this.form.controls.destinationAddress.getRawValue()
      : recipient;
    return transportDataIncomplete(DocumentType.SalesDdt, {
      transportCausal: transport.causal,
      transportPort: transport.port,
      transportCarrier: transport.carrier,
      transportPackagesCount: transport.packagesCount,
      transportGoodsAspect: transport.goodsAspect,
      recipientAddress: recipient,
      destinationAddress: destination,
    });
  }

  private checkIncompleteDataThenSave(): void {
    if (this.ddtDataIncomplete()) {
      this.incompleteDataDialogOpen.set(true);
      return;
    }
    this.checkPartialCoverageThenSave();
  }

  /** «Sì»: procedere lo stesso con dati incompleti. */
  protected confirmIncompleteDataDialog(): void {
    this.incompleteDataDialogOpen.set(false);
    this.checkPartialCoverageThenSave();
  }

  /** «No» / «Annulla»: si resta in maschera per completare i dati. */
  protected dismissIncompleteDataDialog(): void {
    this.incompleteDataDialogOpen.set(false);
  }

  /**
   * Copertura degli ordini inclusi: quantità per variante delle righe DDT,
   * allocate in sequenza sugli ordini (stessa regola del backend). Gli ordini
   * non coperti del tutto diventeranno «Parzialmente concluso».
   */
  private computePartialOrders(): readonly { id: string; orderNumber: string }[] {
    const included = this.includedOrders();
    if (included.length === 0) {
      return [];
    }
    const remainingByVariant = new Map<string, number>();
    for (const line of this.lines.controls) {
      const variantId = line.controls.variantId.value;
      const quantity = Number(line.controls.quantity.value) || 0;
      if (variantId && quantity > 0 && !this.lineIsEmpty(line)) {
        remainingByVariant.set(variantId, (remainingByVariant.get(variantId) ?? 0) + quantity);
      }
    }
    const partials: { id: string; orderNumber: string }[] = [];
    for (const order of included) {
      let fullyCovered = true;
      for (const line of order.lines) {
        if (!line.variantId || line.quantity <= 0) {
          continue;
        }
        const remaining = remainingByVariant.get(line.variantId) ?? 0;
        const allocated = Math.min(remaining, line.quantity);
        remainingByVariant.set(line.variantId, remaining - allocated);
        if (allocated < line.quantity) {
          fullyCovered = false;
        }
      }
      if (!fullyCovered) {
        partials.push({ id: order.id, orderNumber: order.orderNumber });
      }
    }
    return partials;
  }

  private checkPartialCoverageThenSave(): void {
    const partials = this.computePartialOrders();
    if (partials.length > 0) {
      this.partialOrderNumbers.set(partials.map((order) => order.orderNumber));
      this.pendingPartialOrderIds = partials.map((order) => order.id);
      this.partialOrdersDialogOpen.set(true);
      return;
    }
    this.saveDocument();
  }

  /** «Sì»: salva e forza a Concluso gli ordini parzialmente evasi. */
  protected confirmPartialOrdersDialog(): void {
    this.partialOrdersDialogOpen.set(false);
    const orderIds = this.pendingPartialOrderIds;
    this.pendingPartialOrderIds = [];
    this.saveDocument(() => this.forceConcludeOrders(orderIds));
  }

  /** «No»: salva lasciando gli ordini in «Parzialmente concluso». */
  protected declinePartialOrdersDialog(): void {
    this.partialOrdersDialogOpen.set(false);
    this.pendingPartialOrderIds = [];
    this.saveDocument();
  }

  /** «Annulla»: nessun salvataggio, si resta in maschera. */
  protected dismissPartialOrdersDialog(): void {
    this.partialOrdersDialogOpen.set(false);
    this.pendingPartialOrderIds = [];
  }

  private forceConcludeOrders(orderIds: readonly string[]): void {
    for (const orderId of orderIds) {
      this.salesOrderService
        .forceConcludeManualOrder(orderId)
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          error: () => {
            this._submitState.set({
              status: 'error',
              error: {
                kind: AppErrorKind.Unknown,
                message:
                  'DDT salvato, ma non è stato possibile forzare a Concluso un ordine incluso.',
              },
            });
          },
        });
    }
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
    if (this.isRegistryDocument) {
      this.saveRegistryDocument(onSaved);
      return;
    }
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
            // Primo salvataggio: l'ordine appena creato resta sbloccato dopo il
            // passaggio a /:id/edit (altrimenti si ribloccherebbe subito).
            this.markSessionUnlocked(result.order.id);
            this.editUnlocked.set(true);
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

  // ── Preventivo / DDT vendita: persistenza nel registro documenti ────────

  /** Righe documento dal form (stessa griglia dell'Ordine cliente). */
  private buildRegistryLines(): DocumentLineInputBody[] {
    const lines: DocumentLineInputBody[] = [];
    for (const line of this.lines.controls) {
      const raw = line.getRawValue();
      if (this.lineIsEmpty(line)) {
        continue;
      }
      const unitPrice = parseMoneyInput(raw.unitPrice, this.currency);
      lines.push({
        variantId: raw.variantId || undefined,
        sku: raw.sku.trim() || undefined,
        description: raw.productName.trim() || raw.sku.trim() || 'Riga documento',
        quantity: Number(raw.quantity) || 0,
        unitPriceMinor: unitPrice?.amountMinor ?? 0,
        // Le righe documento persistono la percentuale effettiva intera
        // (cascata "4+10%" → 14): stessa resa dei totali in anteprima.
        discountPercent: parseEffectiveDiscountPercent(raw.discount),
        vatCodeId: raw.vatCodeId || undefined,
        // Preventivo: mai effetti magazzino. DDT vendita e Scarico manuale:
        // la spunta «Scarica mag.» decide se la riga scarica la giacenza.
        loadsStock:
          this.isSalesDdt || this.isManualUnload
            ? raw.commitsStock && Boolean(raw.variantId)
            : false,
        // Seriali consumati dallo scarico (solo DDT, prodotti tracciati):
        // lo scarico manuale diretto non gestisce i numeri di serie.
        serialNumbers: this.isSalesDdt ? parseSerialNumbersText(raw.serialNumbersText) : undefined,
      });
    }
    return lines;
  }

  /** Data+ora inizio trasporto in ISO (solo se la data è compilata). */
  private transportStartAtIso(): string | null {
    const transport = this.form.controls.transport.getRawValue();
    if (!transport.startDate) {
      return null;
    }
    const time = transport.startTime.trim() || '00:00';
    return `${transport.startDate}T${time}`;
  }

  /** Snapshot indirizzo dal gruppo form (null se completamente vuoto). */
  private addressFromGroup(
    group: ReturnType<CustomerOrderFormComponent['createAddressGroup']>,
  ): DocumentAddress | null {
    const raw = group.getRawValue();
    const entries = Object.entries(raw)
      .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
      .map(([key, value]) => [key, value.trim()]);
    return entries.length > 0 ? (Object.fromEntries(entries) as DocumentAddress) : null;
  }

  /** Campi testata specifici del DDT vendita (prompt DDT). */
  private buildSalesDdtHeaderFields() {
    const value = this.form.getRawValue();
    const transport = value.transport;
    const recipient = this.addressFromGroup(this.form.controls.recipientAddress);
    const destination = this.destinationDiffers()
      ? this.addressFromGroup(this.form.controls.destinationAddress)
      : recipient;
    const packagesCount = Number.parseInt(transport.packagesCount, 10);
    return {
      paymentMethod: value.paymentMethod.trim() || null,
      followedBySalesDoc: value.followedBySalesDoc,
      transportCausal: transport.causal.trim() || null,
      transportStartAt: this.transportStartAtIso(),
      transportPort: transport.port || null,
      transportCarrier: transport.carrier.trim() || null,
      transportPackagesCount: Number.isFinite(packagesCount) ? packagesCount : null,
      transportWeight: transport.weight.trim() || null,
      transportGoodsAspect: transport.goodsAspect.trim() || null,
      transportShippingCode: transport.shippingCode.trim() || null,
      transportTrackingCode: transport.trackingCode.trim() || null,
      recipientAddress: recipient,
      destinationAddress: destination,
      includedSalesOrderIds: this.includedOrders().map((order) => order.id),
    };
  }

  /**
   * Salvataggio Preventivo/DDT vendita: crea (o aggiorna) il documento e lo
   * conferma subito — il numero (PRE/DDT) arriva dal numeratore dedicato alla
   * prima conferma e il documento resta senza stato visibile in maschera.
   * Per il DDT la conferma esegue anche lo scarico giacenze e l'evasione
   * degli ordini agganciati (prompt DDT §LOGICA MAGAZZINO).
   */
  private saveRegistryDocument(onSaved?: () => void): void {
    const value = this.form.getRawValue();
    const editId = this.editOrderId();
    const lines = this.buildRegistryLines();
    this._submitState.set({ status: 'saving' });

    const ddtCreateFields = this.isSalesDdt ? this.buildSalesDdtHeaderFields() : null;

    // Scarico manuale: cliente facoltativo — anagrafica (customerId) oppure
    // testo libero solo-stampa (customerName, mai salvato in anagrafica).
    const freeTextCustomer =
      this.isManualUnload && !value.customerId ? value.customerFreeText.trim() : '';

    const save$ = editId
      ? this.documentService.updateDocument(editId, {
          documentDate: value.documentDate,
          customerId: this.isManualUnload ? value.customerId || null : value.customerId,
          ...(this.isManualUnload ? { customerName: freeTextCustomer || null } : {}),
          locationId: value.locationId || undefined,
          externalRef: value.externalRef.trim() || null,
          paymentTerms: value.paymentTerms.trim() || null,
          expectedDeliveryDate: value.expectedDeliveryDate || null,
          notes: value.notes.trim(),
          documentDiscountPercent: parseEffectiveDiscountPercent(value.documentDiscountPercent),
          ...(ddtCreateFields ?? {}),
          lines,
        } satisfies UpdateDocumentBody)
      : this.documentService.createDocument({
          type: this.registryDocumentType,
          documentDate: value.documentDate,
          customerId: this.isManualUnload ? value.customerId || undefined : value.customerId,
          ...(freeTextCustomer ? { customerName: freeTextCustomer } : {}),
          locationId: value.locationId || undefined,
          externalRef: value.externalRef.trim() || undefined,
          paymentTerms: value.paymentTerms.trim() || undefined,
          expectedDeliveryDate: value.expectedDeliveryDate || undefined,
          notes: value.notes.trim() || undefined,
          currency: this.currency,
          documentDiscountPercent: parseEffectiveDiscountPercent(value.documentDiscountPercent),
          ...(ddtCreateFields ? this.stripNullFields(ddtCreateFields) : {}),
          lines,
        } satisfies CreateDocumentBody);

    const request$ = save$.pipe(
      switchMap((doc) =>
        doc.status === DocumentStatus.Draft
          ? this.documentService.confirmDocument(doc.id)
          : of(doc),
      ),
    );

    request$.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (doc) => {
        this._submitState.set({ status: 'idle' });
        this.loadedQuoteDoc.set(doc);
        this.dirtySinceLastSave.set(false);
        if (!this.editOrderId()) {
          // Preventivo appena creato: resta sbloccato dopo il passaggio a
          // :id/edit (altrimenti si ribloccherebbe subito, come un ordine).
          if (this.isQuote) {
            this.markSessionUnlocked(doc.id);
            this.editUnlocked.set(true);
          }
          const editPath = this.isSalesDdt
            ? 'sales-ddt'
            : this.isManualUnload
              ? 'manual-unload'
              : 'quote';
          void this.router.navigate(['/app/documents', editPath, doc.id, 'edit'], {
            replaceUrl: true,
          });
        } else {
          this.reload();
        }
        onSaved?.();
      },
      error: (err: unknown) => {
        this._submitState.set({ status: 'error', error: this.toAppError(err) });
      },
    });
  }

  /** POST creazione: i campi vuoti si omettono invece di inviare null. */
  private stripNullFields<T extends Record<string, unknown>>(
    fields: T,
  ): { [K in keyof T]?: Exclude<T[K], null> } {
    return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null)) as {
      [K in keyof T]?: Exclude<T[K], null>;
    };
  }

  /** Carica il documento del registro (quote/sales_ddt) nel form condiviso. */
  private patchFormFromRegistryDocument(doc: DocumentRecord): void {
    this.suppressDirtyMarking = true;
    this.suppressRecipientAutofillTracking = true;
    try {
      this.form.patchValue({
        customerId: doc.customerId ?? '',
        // Scarico manuale: senza anagrafica il nome salvato è il testo libero.
        customerFreeText: doc.customerId ? '' : (doc.customerName ?? ''),
        locationId: doc.locationId ?? '',
        documentDate: doc.documentDate.slice(0, 10),
        externalRef: doc.externalRef ?? '',
        expectedDeliveryDate: doc.expectedDeliveryDate?.slice(0, 10) ?? '',
        status: 'confirmed',
        paymentTerms: doc.paymentTerms ?? '',
        notes: doc.notes ?? '',
        documentDiscountPercent:
          doc.documentDiscountPercent && doc.documentDiscountPercent > 0
            ? String(doc.documentDiscountPercent)
            : '',
      });
      if (this.isSalesDdt) {
        this.patchSalesDdtHeader(doc);
      }
      this.lines.clear({ emitEvent: false });
      for (const line of doc.lines ?? []) {
        const group = this.createLine();
        group.setValue(
          {
            // Le righe documento vengono sostituite integralmente al PATCH:
            // nessun id riga da preservare (a differenza dell'ordine cliente).
            id: '',
            variantId: line.variantId ?? '',
            articleCode: '',
            sku: line.sku ?? '',
            barcode: '',
            productName: line.description,
            quantity: line.quantity,
            unitPrice:
              line.unitPrice.amountMinor > 0
                ? moneyToDecimalString(line.unitPrice).replace('.', ',')
                : '',
            discount:
              line.discountPercent && line.discountPercent > 0 ? `${line.discountPercent}%` : '',
            vatCodeId: line.vatCodeId ?? '',
            commitsStock: this.isSalesDdt || this.isManualUnload ? line.loadsStock : false,
            unitOfMeasure: '',
            serialNumbersText: (line.serialNumbers ?? []).join(', '),
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
      this.suppressRecipientAutofillTracking = false;
    }
  }

  /** Testata DDT dal documento caricato: pagamento, trasporto, indirizzi, OC. */
  private patchSalesDdtHeader(doc: DocumentRecord): void {
    const startAt = doc.transportStartAt ?? '';
    this.form.patchValue({
      paymentMethod: doc.paymentMethod ?? '',
      followedBySalesDoc: doc.followedBySalesDoc ?? false,
      transport: {
        causal: doc.transportCausal ?? '',
        startDate: startAt ? startAt.slice(0, 10) : '',
        startTime: startAt.length >= 16 ? startAt.slice(11, 16) : '',
        port: doc.transportPort ?? '',
        carrier: doc.transportCarrier ?? '',
        packagesCount: doc.transportPackagesCount != null ? String(doc.transportPackagesCount) : '',
        weight: doc.transportWeight ?? '',
        goodsAspect: doc.transportGoodsAspect ?? '',
        shippingCode: doc.transportShippingCode ?? '',
        trackingCode: doc.transportTrackingCode ?? '',
      },
      recipientAddress: { ...this.emptyAddressValue(), ...(doc.recipientAddress ?? {}) },
      destinationAddress: { ...this.emptyAddressValue(), ...(doc.destinationAddress ?? {}) },
    });
    // L'intestatario salvato è uno snapshot: il cambio cliente non lo riscrive.
    this.recipientAutoFilled = !doc.recipientAddress;
    this.destinationDiffers.set(
      JSON.stringify(doc.destinationAddress ?? null) !==
        JSON.stringify(doc.recipientAddress ?? null) && doc.destinationAddress != null,
    );
    const hasTransportData = Boolean(
      doc.transportCausal ||
      doc.transportStartAt ||
      doc.transportPort ||
      doc.transportCarrier ||
      doc.transportPackagesCount != null ||
      doc.transportWeight ||
      doc.transportGoodsAspect ||
      doc.transportShippingCode ||
      doc.transportTrackingCode,
    );
    this.transportOpen.set(hasTransportData);
    // Ordini agganciati: righe ricaricate per il controllo di copertura.
    const linked = (doc.linkedSalesOrders ?? []).filter((order) => !order.cancelledAt);
    this.includedOrders.set(
      linked.map((order) => ({ id: order.id, orderNumber: order.orderNumber, lines: [] })),
    );
    for (const order of linked) {
      this.salesOrderService
        .getSalesOrderById(order.id)
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe((loaded) => {
          this.includedOrders.update((orders) =>
            orders.map((entry) =>
              entry.id === order.id
                ? {
                    ...entry,
                    lines: loaded.lines.map((line) => ({
                      variantId: line.variantId,
                      quantity: line.quantity,
                    })),
                  }
                : entry,
            ),
          );
        });
    }
  }

  private emptyAddressValue() {
    return {
      name: '',
      address: '',
      zip: '',
      city: '',
      province: '',
      country: '',
      fiscalCode: '',
      vatNumber: '',
    };
  }

  // ── Concludi ordine (§CONCLUDI ORDINE) ──────────────────────────────────
  protected readonly canConclude = computed(
    () =>
      this.isOrder &&
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

  // ── DDT vendita: Genera documento (Bozza fattura / Proforma, §GENERAZIONE) ──
  protected readonly canGenerateDocuments = computed(
    () => this.isSalesDdt && this.isEditMode() && !this.dirtySinceLastSave(),
  );

  protected readonly generateTargetOptions: readonly SelectMenuOption[] = [
    { value: DocumentType.InvoiceDraft, label: 'Bozza fattura' },
    { value: DocumentType.Proforma, label: 'Proforma' },
  ];

  protected toggleGenerateMenu(): void {
    this.generateMenuOpen.update((open) => !open);
  }

  protected generateFromDdt(targetType: string): void {
    const documentId = this.editOrderId();
    if (!documentId || this.generating()) {
      return;
    }
    this.generateMenuOpen.set(false);
    this.generating.set(true);
    this.documentService
      .convertDocument(documentId, targetType as DocumentType)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (doc) => {
          this.generating.set(false);
          void this.router.navigateByUrl(documentEditPath(doc));
        },
        error: (err: unknown) => {
          this.generating.set(false);
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  // ── Uscita con modifiche non salvate ────────────────────────────────────

  /**
   * Messaggio del dialogo di uscita: un ordine Concluso/Parzialmente concluso
   * è collegato a un documento di scarico — l'avviso lo segnala e chiede cosa
   * fare (prompt DDT §LOGICA MAGAZZINO).
   */
  protected readonly exitDialogMessage = computed(() => {
    if (this.isOrder && this.isSettledOrder()) {
      const linked = this.loadedOrder()?.linkedDocument;
      const ref = linked?.reference ? ` ${linked.reference}` : '';
      return (
        `Questo ordine è collegato al documento di trasporto${ref}: le modifiche NON aggiornano ` +
        'il documento già emesso. Vuoi salvare comunque le modifiche prima di chiudere?'
      );
    }
    return 'Ci sono modifiche non salvate. Vuoi salvarle prima di chiudere?';
  });

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
          this.navigateToList();
        }
      };
      return;
    }
    this.navigateToList();
  }

  /** Lista di provenienza: elenco dedicato (Preventivi/DDT) o Ordini cliente. */
  private navigateToList(): void {
    if (this.isRegistryDocument) {
      void this.router.navigateByUrl(this.registryListPath);
      return;
    }
    void this.router.navigate([this.listPath]);
  }

  protected reload(): void {
    this.loadTick.update((tick) => tick + 1);
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
