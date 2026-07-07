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
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { CustomerService } from '@features/customers/services/customer.service';
import type { VariantSummary } from '@features/products/models/variant-summary.model';
import { ProductService } from '@features/products/services/product.service';
import { mergeVariantSummaries } from '@features/products/utils/variant-summary-search.util';
import { toVariantSelectMenuOptions } from '@features/products/utils/variant-select-menu.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { documentTypeLabel } from './models/document-labels.util';
import {
  isInvoiceDraftDocumentType,
  isProformaDocumentType,
  isSalesDdtDocumentType,
  isSalesFormDocumentType,
} from './models/document-sales.util';
import { DocumentService } from './services/document.service';
import { parseSerialNumbersText } from './utils/serial-numbers-input.util';

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
    SelectMenuComponent,
    EmptyStateComponent,
    ErrorStateComponent,
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
    lines: this.fb.array([this.createLine()]),
  });

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
      switchMap(() => this.customerService.getCustomers({ page: 1, pageSize: 100 })),
      map((response) => response.data),
    ),
    { initialValue: [] },
  );

  protected readonly customerOptions = computed<readonly SelectMenuOption[]>(() =>
    this.customers().map((c) => ({
      value: c.id,
      label: `${c.firstName} ${c.lastName}`.trim() || c.email || c.id,
    })),
  );

  protected readonly locationOptions = computed<readonly SelectMenuOption[]>(() =>
    this.operationalLocations.writeLocations().map((loc) => ({
      value: loc.id,
      label: loc.name,
    })),
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

  protected readonly variantOptions = computed(() =>
    toVariantSelectMenuOptions(mergeVariantSummaries(this.searchedVariants(), [])),
  );

  protected readonly lineTotals = computed(() => {
    let subtotalMinor = 0;
    let taxMinor = 0;
    for (const line of this.lines.controls) {
      const qty = Number(line.controls.quantity.value) || 0;
      const price = parseMoneyInput(line.controls.unitPrice.value, this.currency);
      const unitMinor = price?.amountMinor ?? 0;
      const vat = Number(line.controls.vatRatePercent.value) || 0;
      const lineTotal = Math.round((qty * unitMinor * (100 - 0)) / 100);
      subtotalMinor += lineTotal;
      if (vat > 0) {
        taxMinor += Math.round((lineTotal * vat) / 100);
      }
    }
    return {
      subtotal: { amountMinor: subtotalMinor, currencyCode: this.currency },
      tax: { amountMinor: taxMinor, currencyCode: this.currency },
      total: { amountMinor: subtotalMinor + taxMinor, currencyCode: this.currency },
    };
  });

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
    }
  }

  protected addLine(): void {
    this.lines.push(this.createLine());
  }

  protected removeLine(index: number): void {
    if (this.lines.length <= 1) {
      return;
    }
    this.lines.removeAt(index);
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
    });
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
          vatRatePercent: this.fb.control(line.vatRatePercent?.toString() ?? '22'),
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
      serialNumbersText: this.fb.control(''),
    });
  }

  private initDefaultsForCreate(): void {
    if (!this.isSalesDdt()) {
      return;
    }
    const active = this.locationContext.activeLocationId();
    const writable = this.operationalLocations.writeLocations();
    const defaultLoc =
      active && writable.some((l) => l.id === active) ? active : (writable[0]?.id ?? '');
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
