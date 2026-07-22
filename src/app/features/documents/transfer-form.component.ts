import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
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
} from 'rxjs';
import type { Subscription } from 'rxjs';

import { AuthService } from '@core/auth';
import { canViewPurchaseCosts } from '@core/permissions/tenant-permissions.util';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { DocumentStatus, DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { isConfirmedEditableDocumentStatus } from '@core/models/document.model';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { toLocationSelectOptions } from '@core/utils/location-select-options.util';
import type { VariantSummary } from '@features/products/models/variant-summary.model';
import { ProductService } from '@features/products/services/product.service';
import { mergeVariantSummaries } from '@features/products/utils/variant-summary-search.util';
import { toVariantSelectMenuOptions } from '@features/products/utils/variant-select-menu.util';
import { bindBreadcrumbEntityLabel } from '@core/services/breadcrumb-label.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { isTransferDocumentType } from './models/document-transfer.util';
import { DocumentService } from './services/document.service';
import { parseSerialNumbersText } from './utils/serial-numbers-input.util';

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

const VARIANT_SEARCH_DEBOUNCE_MS = 300;
const VARIANT_SEARCH_MIN_CHARS = 2;

function distinctLocations(control: AbstractControl): ValidationErrors | null {
  const origin = control.get('locationId')?.value as string | undefined;
  const target = control.get('targetLocationId')?.value as string | undefined;
  if (origin && target && origin === target) {
    return { sameLocation: true };
  }
  return null;
}

@Component({
  selector: 'app-transfer-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    BackButtonComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    DateInputComponent,
    SelectMenuComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './transfer-form.component.html',
  styleUrl: './goods-receipt-form.component.scss',
})
export class TransferFormComponent {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly documentService = inject(DocumentService);
  private readonly productService = inject(ProductService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Breadcrumb: numero del documento al posto del generico «Dettaglio».
    bindBreadcrumbEntityLabel(() => ({
      id: this.editDocumentId() || null,
      label: this.loadedDocument()?.reference ?? null,
    }));
  }

  protected readonly listPath = '/app/documents';
  protected readonly currency = DEFAULT_CURRENCY;

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
      return 'Nuovo trasferimento interno';
    }
    return this.isConfirmedEdit() ? 'Modifica trasferimento confermato' : 'Modifica trasferimento';
  });

  readonly form = this.fb.group(
    {
      locationId: this.fb.control('', { validators: [Validators.required] }),
      targetLocationId: this.fb.control('', { validators: [Validators.required] }),
      documentDate: this.fb.control(new Date().toISOString().slice(0, 10), {
        validators: [Validators.required],
      }),
      notes: this.fb.control(''),
      internalComment: this.fb.control(''),
      lines: this.fb.array([this.createLine()]),
    },
    { validators: [distinctLocations] },
  );

  // Snapshot reattivo del form: alcuni computed (opzioni destinazione, conflitto
  // location) leggono valori/stato dai FormControl, che non sono signal. Senza
  // questa dipendenza resterebbero memoizzati e non reagirebbero al cambio di
  // origine o allo stato di validazione.
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
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
            const draftEditable =
              doc.status === DocumentStatus.Draft && isTransferDocumentType(doc.type);
            const confirmedEditable =
              isConfirmedEditableDocumentStatus(doc.status) &&
              isTransferDocumentType(doc.type) &&
              doc.blockAfterConfirm !== true;
            if (!draftEditable && !confirmedEditable) {
              this.loadedDocument.set(null);
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

  protected readonly originLocationOptions = computed<readonly SelectMenuOption[]>(() =>
    toLocationSelectOptions(
      this.operationalLocations.writeLocations(),
      this.operationalLocations.defaultLocation()?.id ?? null,
    ),
  );

  protected readonly targetLocationOptions = computed<readonly SelectMenuOption[]>(() => {
    this.formValue();
    const origin = this.form.controls.locationId.value;
    return this.operationalLocations
      .transferTargetLocations()
      .filter((loc) => loc.id !== origin)
      .map((loc) => ({ value: loc.id, label: loc.name }));
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

  protected get lines(): FormArray<ReturnType<TransferFormComponent['createLine']>> {
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

  /**
   * Costo d'acquisto nel selettore articolo (dato sensibile §permessi): senza
   * "Visualizza costi d'acquisto" non viene mostrato.
   */
  private readonly canSeeCosts = computed(() =>
    canViewPurchaseCosts(this.authService.currentUser()),
  );

  protected readonly variantOptions = computed(() =>
    toVariantSelectMenuOptions(
      mergeVariantSummaries(this.pinnedVariants(), this.searchedVariants()),
      { canSeeCosts: this.canSeeCosts() },
    ),
  );

  protected onOriginSelect(value: string | null): void {
    this.form.controls.locationId.setValue(value ?? '');
    this.form.controls.locationId.markAsTouched();
    if (this.form.controls.targetLocationId.value === value) {
      this.form.controls.targetLocationId.setValue('');
    }
    this.form.updateValueAndValidity();
  }

  protected onTargetSelect(value: string | null): void {
    this.form.controls.targetLocationId.setValue(value ?? '');
    this.form.controls.targetLocationId.markAsTouched();
    this.form.updateValueAndValidity();
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
        line.controls.description.setValue(`${summary.productName} · ${summary.title}`.trim());
        line.controls.sku.setValue(summary.sku);
      }
    }
  }

  protected addLine(): void {
    this.lines.push(this.createLine());
  }

  protected removeLine(index: number): void {
    if (this.lines.length > 1) {
      this.lines.removeAt(index);
    }
  }

  protected fieldInvalid(name: 'locationId' | 'targetLocationId' | 'documentDate'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected readonly locationsConflict = computed(() => {
    this.formValue();
    return this.form.hasError('sameLocation') && this.form.touched;
  });

  protected lineFieldInvalid(
    index: number,
    name: 'variantId' | 'description' | 'quantity',
  ): boolean {
    const control = this.lines.at(index).controls[name];
    return control.invalid && (control.touched || control.dirty);
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

  private initDefaultsForCreate(): void {
    // La sede predefinita dell'utente può precompilare SOLO l'origine (se
    // autorizzata); mono-location: preselezionabile l'unica sede scrivibile.
    // Mai fallback "prima location disponibile". La destinazione non viene
    // MAI autocompilata (specifica cliente «sede predefinita»).
    const writable = this.operationalLocations.writeLocations();
    const preferredOrigin =
      this.operationalLocations.defaultLocation()?.id ??
      (writable.length === 1 ? (writable[0]?.id ?? '') : '');
    if (preferredOrigin && !this.form.controls.locationId.value) {
      this.form.controls.locationId.setValue(preferredOrigin);
    }
  }

  private validateForm(): boolean {
    if (this.form.invalid || !this.hasStockLine()) {
      this.form.markAllAsTouched();
      return false;
    }
    return true;
  }

  private hasStockLine(): boolean {
    return this.lines.controls.some(
      (line) => line.controls.variantId.value && Number(line.controls.quantity.value) > 0,
    );
  }

  private persist(confirmAfterSave: boolean): void {
    if (this.saving() || !this.validateForm()) {
      return;
    }
    const raw = this.form.getRawValue();
    const editId = this.editDocumentId();
    const confirmedEdit = this.isConfirmedEdit();
    this._submitState.set({ status: 'saving' });

    // Documento già confermato: la modifica righe deve preservare gli id
    // stabili, così i movimenti per riga si aggiornano invece di duplicarsi
    // (mirror arrivo merce — vedi POST /documents/transfer/save).
    const request$ = confirmedEdit
      ? this.documentService.saveTransfer({
          id: editId!,
          documentDate: new Date(raw.documentDate).toISOString(),
          locationId: raw.locationId,
          targetLocationId: raw.targetLocationId,
          notes: raw.notes.trim() || undefined,
          internalComment: raw.internalComment.trim() || undefined,
          lines: raw.lines
            .filter((line) => line.variantId || line.description.trim())
            .map((line) => ({
              id: line.id || undefined,
              variantId: line.variantId || undefined,
              sku: line.sku.trim() || undefined,
              description: line.description.trim() || 'Riga trasferimento',
              quantity: Number(line.quantity),
              loadsStock: Boolean(line.variantId),
              serialNumbers: parseSerialNumbersText(line.serialNumbersText),
            })),
        })
      : this.persistDraftOrConfirm(editId, raw, confirmAfterSave);

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

  /**
   * Bozza (creazione o modifica pre-conferma): nessun movimento esiste ancora,
   * quindi la stabilità degli id riga non ha conseguenze — resta sul flusso
   * generico create/update (+ confirm se richiesto).
   */
  private persistDraftOrConfirm(
    editId: string | null,
    raw: ReturnType<TransferFormComponent['form']['getRawValue']>,
    confirmAfterSave: boolean,
  ) {
    const body = {
      type: DocumentType.Transfer,
      documentDate: new Date(raw.documentDate).toISOString(),
      locationId: raw.locationId,
      targetLocationId: raw.targetLocationId,
      currency: this.currency,
      notes: raw.notes.trim() || undefined,
      internalComment: raw.internalComment.trim() || undefined,
      lines: raw.lines
        .filter((line) => line.variantId || line.description.trim())
        .map((line) => ({
          variantId: line.variantId || undefined,
          sku: line.sku.trim() || undefined,
          description: line.description.trim() || 'Riga trasferimento',
          quantity: Number(line.quantity),
          unitPriceMinor: 0,
          loadsStock: Boolean(line.variantId),
          serialNumbers: parseSerialNumbersText(line.serialNumbersText),
        })),
    };

    const save$ = editId
      ? this.documentService.updateDocument(editId, body)
      : this.documentService.createDocument(body);

    return confirmAfterSave
      ? save$.pipe(switchMap((doc) => this.documentService.confirmDocument(doc.id)))
      : save$;
  }

  private patchFormFromDocument(doc: DocumentRecord): void {
    this.form.patchValue({
      locationId: doc.locationId ?? '',
      targetLocationId: doc.targetLocationId ?? '',
      documentDate: doc.documentDate.slice(0, 10),
      notes: doc.notes ?? '',
      internalComment: doc.internalComment ?? '',
    });
    this.lines.clear();
    for (const line of doc.lines ?? []) {
      this.lines.push(
        this.fb.group({
          // Id riga esistente: preservato (mai esposto in UI) per consentire
          // al salvataggio dedicato di aggiornare il movimento collegato
          // invece di duplicarlo (POST /documents/transfer/save).
          id: this.fb.control<string | null>(line.id ?? null),
          variantId: this.fb.control(line.variantId ?? '', {
            validators: line.loadsStock ? [Validators.required] : [],
          }),
          sku: this.fb.control(line.sku ?? ''),
          description: this.fb.control(line.description, { validators: [Validators.required] }),
          quantity: this.fb.control(line.quantity, {
            validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
          }),
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
      id: this.fb.control<string | null>(null),
      variantId: this.fb.control('', { validators: [Validators.required] }),
      sku: this.fb.control(''),
      description: this.fb.control('', { validators: [Validators.required] }),
      quantity: this.fb.control(1, {
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      serialNumbersText: this.fb.control(''),
    });
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Operazione non riuscita.' };
  }
}
