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
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import type { Subscription } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { DocumentStatus, DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { isConfirmedEditableDocumentStatus } from '@core/models/document.model';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  moneyToDecimalString,
  parseMoneyInput,
} from '@core/utils/money.util';
import {
  applyDiscountMinor,
  parseEffectiveDiscountPercent,
} from '@core/utils/discount-percent.util';
import { customerDisplayName, type Customer } from '@core/models/customer.model';
import { isSalesVatCode, vatCodeOptionLabel, type VatCode } from '@core/models/vat-code.model';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { CustomerService } from '@features/customers/services/customer.service';
import type { VariantSummary } from '@features/products/models/variant-summary.model';
import { ProductService } from '@features/products/services/product.service';
import { mergeVariantSummaries } from '@features/products/utils/variant-summary-search.util';
import { toVariantSelectMenuOptions } from '@features/products/utils/variant-select-menu.util';
import type { TenantFeatureSettings } from '@features/settings/models/tenant-feature-settings.model';
import { TenantFeatureSettingsService } from '@features/settings/services/tenant-feature-settings.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { DocumentIncludePanelComponent } from './components/document-include-panel/document-include-panel.component';
import {
  includeSourceKindsForDocumentType,
  type IncludedDocumentPayload,
} from './models/document-include.util';
import { documentTypeLabel } from './models/document-labels.util';
import {
  isInvoiceDraftDocumentType,
  isProformaDocumentType,
  isSalesDdtDocumentType,
  isSalesFormDocumentType,
} from './models/document-sales.util';
import { DocumentService } from './services/document.service';
import { parseSerialNumbersText } from './utils/serial-numbers-input.util';
import { pickVatCodeId, toVatCodeById } from './utils/vat-code-resolution.util';

const PROFORMA_DISCLAIMER = 'Documento non fiscale / Proforma non valida ai fini IVA.';
const VARIANT_SEARCH_DEBOUNCE_MS = 300;
const VARIANT_SEARCH_MIN_CHARS = 2;

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

@Component({
  selector: 'app-sales-document-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    ConfirmDialogComponent,
    DateInputComponent,
    DocumentIncludePanelComponent,
    SelectMenuComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SlidePanelComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './sales-document-form.component.html',
  styleUrl: './goods-receipt-form.component.scss',
})
export class SalesDocumentFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly documentService = inject(DocumentService);
  private readonly customerService = inject(CustomerService);
  private readonly productService = inject(ProductService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly locationContext = inject(LocationContextService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly tenantFeatureSettingsService = inject(TenantFeatureSettingsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly listPath = '/app/documents';
  protected readonly currency = DEFAULT_CURRENCY;
  protected readonly formatMoney = formatMoney;
  protected readonly proformaDisclaimer = PROFORMA_DISCLAIMER;
  protected readonly DocumentType = DocumentType;

  private readonly routeType = this.route.snapshot.data['salesDocumentType'] as
    | DocumentType
    | undefined;

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly editDocumentId = computed(() => this.paramMap().get('id'));
  protected readonly isEditMode = computed(() => Boolean(this.editDocumentId()));

  private readonly loadedDocument = signal<DocumentRecord | null>(null);

  protected readonly documentType = computed(() => {
    const loaded = this.loadedDocument()?.type;
    if (loaded) {
      return loaded;
    }
    return this.routeType ?? DocumentType.Proforma;
  });

  protected readonly isProforma = computed(() => isProformaDocumentType(this.documentType()));
  protected readonly isInvoiceDraft = computed(() =>
    isInvoiceDraftDocumentType(this.documentType()),
  );
  protected readonly isSalesDdt = computed(() => isSalesDdtDocumentType(this.documentType()));

  // ── Includi documento (mappa in document-include.util): il DDT vendita
  //     include da Preventivo e da Ordine cliente; gli altri tipi nessuno. ──
  protected readonly includeSourceKinds = computed(() =>
    includeSourceKindsForDocumentType(this.documentType()),
  );
  protected readonly includePanelOpen = signal(false);
  protected readonly includeLaunchSeq = signal(0);

  protected readonly confirmDialogMessage = computed(() =>
    this.isSalesDdt()
      ? "Alla conferma verranno scaricate le giacenze dalla location selezionata per le righe con variante. L'operazione non è reversibile senza annullare il documento."
      : 'Confermando verrà assegnato il numero progressivo. Il documento non muove il magazzino. Procedere?',
  );

  protected readonly confirmDialogTitle = computed(() =>
    this.isSalesDdt() ? 'Confermare il DDT vendita?' : 'Conferma documento',
  );

  protected readonly confirmButtonLabel = computed(() =>
    this.isSalesDdt() ? 'Conferma DDT' : 'Conferma',
  );

  protected readonly submitConfirmLabel = computed(() =>
    this.isSalesDdt() ? 'Conferma e scarica' : 'Conferma documento',
  );

  protected readonly isConfirmedEdit = computed(() => {
    const doc = this.loadedDocument();
    return doc != null && isConfirmedEditableDocumentStatus(doc.status);
  });

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
    billingCause: this.fb.control(''),
    relatedDdtRef: this.fb.control(''),
    notes: this.fb.control(this.routeType === DocumentType.Proforma ? PROFORMA_DISCLAIMER : ''),
    internalComment: this.fb.control(''),
    documentDiscountPercent: this.fb.control(''),
    lines: this.fb.array([this.createLine()]),
  });

  // Snapshot reattivo del form: i totali stimati (lineTotals) leggono valori dai
  // FormControl, che non sono signal. Senza questa dipendenza il computed
  // resterebbe memoizzato e i totali non si aggiornerebbero digitando quantità,
  // prezzo o sconto (stesso pattern di goods-receipt-form.documentTotals).
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  private readonly selectedCustomer = signal<Customer | null>(null);

  protected readonly confirmDialogOpen = signal(false);
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
          this.initDefaultsForCreate();
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
              doc.status === DocumentStatus.Draft ||
              (isConfirmedEditableDocumentStatus(doc.status) && doc.blockAfterConfirm !== true);
            if (!editable) {
              return 'not-found' as const;
            }
            this.loadedDocument.set(doc);
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

  protected readonly locationOptions = computed<readonly SelectMenuOption[]>(() =>
    this.operationalLocations.writeLocations().map((loc) => ({
      value: loc.id,
      label: loc.name,
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
  protected readonly salesVatOptions = computed<readonly SelectMenuOption[]>(() =>
    this.vatCodes()
      .filter((vatCode) => vatCode.isActive && isSalesVatCode(vatCode))
      .map((vatCode) => ({ value: vatCode.id, label: vatCodeOptionLabel(vatCode) })),
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

  protected readonly variantOptions = computed(() =>
    toVariantSelectMenuOptions(mergeVariantSummaries(this.searchedVariants(), [])),
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
      const price = parseMoneyInput(line.controls.unitPrice.value, this.currency);
      const unitMinor = price?.amountMinor ?? 0;
      const vat = Number(line.controls.vatRatePercent.value) || 0;
      const gross = Math.round(qty * unitMinor);
      const discounted = applyDiscountMinor(gross, line.controls.discountPercent.value);
      subtotalMinor += discounted;
      if (vat > 0) {
        taxMinor += Math.round((discounted * vat) / 100);
      }
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

  constructor() {
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

  protected get lines(): FormArray<ReturnType<SalesDocumentFormComponent['createLine']>> {
    return this.form.controls.lines;
  }

  protected fieldInvalid(name: 'customerId' | 'locationId'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

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

    this.applyCustomerDocumentNote(customer);
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

  protected onVariantSearch(value: string): void {
    this.variantSearchDraft.set(value);
  }

  protected onVariantSelect(index: number, variantId: string | null): void {
    const line = this.lines.at(index);
    line.controls.variantId.setValue(variantId ?? '');
    const match = this.searchedVariants().find((v) => v.variantId === variantId);
    if (match) {
      line.controls.description.setValue(match.productName);
      line.controls.unitPrice.setValue(moneyToDecimalString(match.sellingPrice).replace('.', ','));
      // Precedenza Codice IVA (§Piano IVA fase 3): articolo → aliquota legacy
      // già presente (reverse-match) → predefinito aziendale.
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
    }
  }

  /** Opzioni della riga: codici attivi + eventuale codice storico disattivato. */
  protected lineVatOptions(index: number): readonly SelectMenuOption[] {
    const options = this.salesVatOptions();
    const selectedId = this.lines.at(index)?.controls.vatCodeId.value;
    if (!selectedId || options.some((option) => option.value === selectedId)) {
      return options;
    }
    const selected = this.vatCodeById().get(selectedId);
    if (!selected) {
      return options;
    }
    return [...options, { value: selected.id, label: vatCodeOptionLabel(selected) }];
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
    const line = this.createLine();
    const discount = this.selectedCustomer()?.customerDiscount?.trim();
    if (discount) {
      line.controls.discountPercent.setValue(discount, { emitEvent: false });
    }
    this.ensureLineVatCode(line);
    this.lines.push(line);
  }

  protected removeLine(index: number): void {
    if (this.lines.length <= 1) {
      return;
    }
    this.lines.removeAt(index);
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
      { description: payload.referenceText, quantity: 1, vatRatePercent: '' },
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
          unitPrice:
            line.unitPriceMinor > 0
              ? moneyToDecimalString({
                  amountMinor: line.unitPriceMinor,
                  currencyCode: this.currency,
                }).replace('.', ',')
              : '',
          discountPercent: line.discount,
          vatCodeId: line.vatCodeId ?? '',
          vatRatePercent: '',
        },
        { emitEvent: false },
      );
      if (group.controls.vatCodeId.value) {
        this.syncLegacyVatRate(group);
      } else {
        this.ensureLineVatCode(group);
      }
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

  protected saveDraft(): void {
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

  protected reload(): void {
    this.loadTick.update((t) => t + 1);
  }

  private validateForm(): boolean {
    if (this.isSalesDdt()) {
      const locationControl = this.form.controls.locationId;
      locationControl.setValidators([Validators.required]);
      locationControl.updateValueAndValidity({ emitEvent: false });
    }
    if (this.form.invalid || this.hasInvalidPrice() || !this.hasValidLine()) {
      this.form.markAllAsTouched();
      return false;
    }
    return true;
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

  private persist(confirmAfterSave: boolean): void {
    if (this.saving() || !this.validateForm()) {
      return;
    }
    const raw = this.form.getRawValue();
    const loadsStockLines = this.isSalesDdt();
    const body = {
      type: this.documentType(),
      documentDate: new Date(raw.documentDate).toISOString(),
      customerId: raw.customerId,
      locationId: this.isSalesDdt() ? raw.locationId : undefined,
      currency: this.currency,
      notes: raw.notes.trim() || undefined,
      internalComment: raw.internalComment.trim() || undefined,
      billingCause: raw.billingCause.trim() || undefined,
      externalRef: raw.relatedDdtRef.trim() || undefined,
      documentDiscountPercent: parseEffectiveDiscountPercent(raw.documentDiscountPercent),
      lines: raw.lines
        .filter((line) => line.description.trim() || line.variantId)
        .map((line) => {
          const price = parseMoneyInput(line.unitPrice, this.currency);
          return {
            variantId: line.variantId || undefined,
            description: line.description.trim() || 'Riga documento',
            quantity: Number(line.quantity),
            unitPriceMinor: price?.amountMinor ?? 0,
            vatRatePercent: line.vatRatePercent ? Number(line.vatRatePercent) : undefined,
            vatCodeId: line.vatCodeId || undefined,
            discountPercent: parseEffectiveDiscountPercent(line.discountPercent),
            loadsStock: loadsStockLines && Boolean(line.variantId),
            serialNumbers: loadsStockLines
              ? parseSerialNumbersText(line.serialNumbersText)
              : undefined,
          };
        }),
    };

    const editId = this.editDocumentId();
    this._submitState.set({ status: 'saving' });

    const save$ = editId
      ? this.documentService.updateDocument(editId, body)
      : this.documentService.createDocument(body);

    const request$ =
      confirmAfterSave && !this.isConfirmedEdit()
        ? save$.pipe(switchMap((doc) => this.documentService.confirmDocument(doc.id)))
        : save$;

    this.submitSubscription?.unsubscribe();
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
      customerId: doc.customerId ?? '',
      locationId: doc.locationId ?? '',
      documentDate: doc.documentDate.slice(0, 10),
      billingCause: doc.billingCause ?? '',
      relatedDdtRef: doc.externalRef ?? '',
      notes: doc.notes ?? '',
      internalComment: doc.internalComment ?? '',
      documentDiscountPercent:
        doc.documentDiscountPercent && doc.documentDiscountPercent > 0
          ? String(doc.documentDiscountPercent)
          : '',
    });
    if (doc.customerId) {
      const customer = this.customers().find((c) => c.id === doc.customerId) ?? null;
      this.selectedCustomer.set(customer);
    }
    this.lines.clear();
    for (const line of doc.lines ?? []) {
      this.lines.push(
        this.fb.group({
          variantId: this.fb.control(line.variantId ?? ''),
          description: this.fb.control(line.description, { validators: [Validators.required] }),
          quantity: this.fb.control(line.quantity, {
            validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
          }),
          unitPrice: this.fb.control(moneyToDecimalString(line.unitPrice).replace('.', ',')),
          vatRatePercent: this.fb.control(line.vatSnapshot?.ratePercent?.toString() ?? ''),
          vatCodeId: this.fb.control(line.vatCodeId ?? ''),
          discountPercent: this.fb.control(
            line.discountPercent && line.discountPercent > 0 ? String(line.discountPercent) : '',
          ),
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
      variantId: this.fb.control(''),
      description: this.fb.control('', { validators: [Validators.required] }),
      quantity: this.fb.control(1, {
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      unitPrice: this.fb.control(''),
      vatRatePercent: this.fb.control('22'),
      vatCodeId: this.fb.control(''),
      discountPercent: this.fb.control(''),
      serialNumbersText: this.fb.control(''),
    });
  }

  private initDefaultsForCreate(): void {
    if (!this.isSalesDdt()) {
      return;
    }
    // Mai fallback "prima location disponibile" (specifica «sede predefinita»):
    // restano solo la location attiva scelta in topbar e la mono-location.
    const active = this.locationContext.activeLocationId();
    const writable = this.operationalLocations.writeLocations();
    const defaultLoc =
      active && writable.some((l) => l.id === active)
        ? active
        : writable.length === 1
          ? (writable[0]?.id ?? '')
          : '';
    if (defaultLoc && !this.form.controls.locationId.value) {
      this.form.controls.locationId.setValue(defaultLoc);
    }
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
