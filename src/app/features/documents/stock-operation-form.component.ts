import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ViewportService } from '@core/services/viewport.service';
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

import { NavigationHistoryService } from '@core/services/navigation-history.service';
import { ToastService } from '@core/services/toast.service';
import type { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import { AuthService } from '@core/auth';
import { canViewPurchaseCosts } from '@core/permissions/tenant-permissions.util';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { documentNumberConflictOf } from '@core/models/document-number-conflict.util';
import { DocumentNumberConflictStore } from '@domain/documents/state/document-number-conflict.store';
import { DocumentPrefillErrorStore } from '@domain/documents/state/document-prefill-error.store';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { AdjustmentDirection, DocumentStatus, DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { isConfirmedEditableDocumentStatus } from '@core/models/document.model';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { toLocationSelectOptions } from '@core/utils/location-select-options.util';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import { ProductService } from '@domain/products/services/product.service';
import {
  findVariantSummaryById,
  mergeVariantSummaries,
} from '@domain/products/utils/variant-summary-search.util';
import { toVariantSelectMenuOptions } from '@domain/products/utils/variant-select-menu.util';
import { bindBreadcrumbEntityLabel } from '@core/services/breadcrumb-label.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { DocumentNumberFieldComponent } from '@shared/components/document-number-field/document-number-field.component';
import { DocumentSeriesManagerDialogComponent } from '@domain/documents/components/document-series-manager-dialog/document-series-manager-dialog.component';
import { DocumentCounterpartyRefComponent } from '@domain/documents/components/document-counterparty-ref/document-counterparty-ref.component';
import { DocumentMobilePanelComponent } from '@domain/documents/components/document-mobile-panel/document-mobile-panel.component';
import { EditLockBannerComponent } from '@shared/components/edit-lock-banner/edit-lock-banner.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import { StockMovementLineCardComponent } from '@domain/documents/components/stock-movement-line-card/stock-movement-line-card.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { DocumentEditLockService } from '@domain/documents/services/document-edit-lock.service';
import { formatItalianInputDate } from '@shared/utils/calendar.util';

import { documentReferenceLabel } from '@domain/documents/models/document-labels.util';
import { isAdjustmentDocumentType } from './models/document-stock-operation.util';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import type { DocumentCounterView } from '@domain/documents/models/document-counter.model';
import { parseSerialNumbersText } from '@domain/documents/utils/serial-numbers-input.util';
import { FirstClickSelectsDirective } from '@shared/directives/first-click-selects.directive';
import { trailingEmptyLineIndices } from '@domain/documents/utils/trailing-empty-lines.util';

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

const VARIANT_SEARCH_DEBOUNCE_MS = 300;
const VARIANT_SEARCH_MIN_CHARS = 2;

@Component({
  selector: 'app-stock-operation-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FirstClickSelectsDirective,
    InlineBannerComponent,
    ReactiveFormsModule,
    BackButtonComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    DateInputComponent,
    DocumentCounterpartyRefComponent,
    DocumentMobilePanelComponent,
    DocumentNumberFieldComponent,
    DocumentSeriesManagerDialogComponent,
    EditLockBannerComponent,
    SelectMenuComponent,
    StockMovementLineCardComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
  ],
  providers: [DocumentEditLockService],
  templateUrl: './stock-operation-form.component.html',
  styleUrl: './stock-operation-form.component.scss',
})
export class StockOperationFormComponent implements CanComponentDeactivate {
  private readonly authService = inject(AuthService);
  private readonly editLock = inject(DocumentEditLockService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly documentService = inject(DocumentService);
  private readonly countersService = inject(DocumentCountersService);
  private readonly productService = inject(ProductService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly router = inject(Router);
  private readonly viewport = inject(ViewportService);

  /**
   * Quale delle due viste di riga è viva: sotto la soglia la card, sopra la
   * tabella, mai entrambe (specifica §4.11).
   */
  protected readonly compactView = this.viewport.compact;

  private readonly toast = inject(ToastService);
  private readonly navHistory = inject(NavigationHistoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Etichetta del documento per il breadcrumb: il numero quando c'è, altrimenti
   * la dicitura di bozza/serie — mai il generico «Dettaglio».
   */
  private readonly breadcrumbLabel = computed(() => {
    const doc = this.loadedDocument();
    return doc ? documentReferenceLabel(doc.type, doc.reference, doc.series) : null;
  });

  constructor() {
    // Breadcrumb: numero del documento al posto del generico «Dettaglio».
    bindBreadcrumbEntityLabel(() => ({
      id: this.editDocumentId() || null,
      label: this.breadcrumbLabel(),
    }));

    // Carica i contatori disponibili (tendina serie) e propone il predefinito.
    afterNextRender(() => {
      this.refreshNumberProposal();
      this.prefillFromDuplicateIfRequested();
    });

    // Ogni modifica utente al form marca il documento come «da salvare».
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.markFormDirty();
    });
  }

  /**
   * «Duplica documento» (Fase 3, no bozze): il param `duplicateFrom` porta la
   * rettifica/scarico originale, copiato in un documento NUOVO. Nessuna copia
   * nasce a monte: si crea (confermato) solo al salvataggio.
   */
  private prefillFromDuplicateIfRequested(): void {
    if (this.isEditMode()) {
      return;
    }
    const duplicateFrom = this.route.snapshot.queryParamMap.get('duplicateFrom');
    if (!duplicateFrom) {
      return;
    }
    this.documentService
      .getDocumentById(duplicateFrom)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (doc) => this.applyDuplicatePrefill(doc),
        error: () => this.prefillError.fail('duplicate'),
      });
  }

  private applyDuplicatePrefill(doc: DocumentRecord): void {
    this.patchFormFromDocument(doc);
    // Prefill programmatico del duplica: non è una modifica dell'utente.
    this.suppressDirtyMarking = true;
    try {
      // Documento nuovo indipendente: azzera numero, serie e data dell'originale.
      this.form.patchValue({
        documentNumber: null,
        series: '',
        documentDate: new Date().toISOString().slice(0, 10),
      });
      // Righe copiate come nuove: nessun id riga dell'originale, così il
      // salvataggio non aggancia i movimenti del documento di partenza.
      for (const line of this.lines.controls) {
        line.get('id')?.setValue(null);
      }
    } finally {
      this.suppressDirtyMarking = false;
    }
    this.refreshNumberProposal();
  }

  protected readonly listPath = '/app/documents';
  protected readonly currency = DEFAULT_CURRENCY;
  protected readonly AdjustmentDirection = AdjustmentDirection;

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  private readonly routeData = toSignal(this.route.data, { requireSync: true });

  protected readonly documentType = computed(
    () => this.routeData()['stockDocumentType'] as DocumentType,
  );
  // Dallo spostamento dello Scarico manuale sulla maschera DDT (prompt
  // Scarico manuale) questo form serve SOLO le Rettifiche di magazzino.
  protected readonly isAdjustment = computed(() => isAdjustmentDocumentType(this.documentType()));

  protected readonly editDocumentId = computed(() => this.paramMap().get('id'));
  protected readonly isEditMode = computed(() => Boolean(this.editDocumentId()));

  private readonly loadedDocument = signal<DocumentRecord | null>(null);
  protected readonly isConfirmedEdit = computed(() => {
    const doc = this.loadedDocument();
    return doc != null && isConfirmedEditableDocumentStatus(doc.status);
  });

  /**
   * Etichetta del tipo controparte fotografata sul documento. Serve alla
   * tendina per ricostruire l'opzione di un tipo eliminato: senza, il campo
   * si riaprirebbe vuoto e il salvataggio successivo cancellerebbe davvero
   * la dicitura.
   */
  protected readonly counterpartyTypeSnapshot = computed(
    () => this.loadedDocument()?.externalDocumentTypeSnapshot,
  );

  /** Un confermato si apre bloccato: sola lettura finché l'operatore non sblocca. */
  protected readonly formReadOnly = computed(
    () => this.isConfirmedEdit() && !this.editLock.unlocked(),
  );
  protected readonly unlockDialogOpen = signal(false);

  protected requestUnlock(): void {
    this.unlockDialogOpen.set(true);
  }

  protected confirmUnlock(): void {
    this.unlockDialogOpen.set(false);
    this.editLock.unlock(this.editDocumentId());
  }

  protected readonly pageTitle = computed(() => {
    const adjustment = this.isAdjustment();
    if (!this.isEditMode()) {
      return adjustment ? 'Nuova rettifica di magazzino' : 'Nuovo scarico manuale';
    }
    if (this.isConfirmedEdit()) {
      return adjustment ? 'Modifica rettifica confermata' : 'Modifica scarico confermato';
    }
    return adjustment ? 'Modifica rettifica' : 'Modifica scarico';
  });

  protected readonly confirmDialogTitle = computed(() =>
    this.isAdjustment() ? 'Confermare la rettifica?' : 'Confermare lo scarico?',
  );
  protected readonly confirmDialogMessage = computed(() =>
    this.isAdjustment()
      ? "Verranno aggiornate le giacenze in base alla direzione e alle quantità indicate. L'operazione non è reversibile senza annullare il documento."
      : "Verranno scaricate le giacenze dalla location selezionata. L'operazione non è reversibile senza annullare il documento.",
  );
  protected readonly confirmButtonLabel = computed(() =>
    this.isAdjustment() ? 'Conferma rettifica' : 'Conferma scarico',
  );
  protected readonly submitConfirmLabel = computed(() =>
    this.isAdjustment() ? 'Salva e rettifica' : 'Salva e scarica',
  );

  readonly form = this.fb.group({
    locationId: this.fb.control('', { validators: [Validators.required] }),
    adjustmentDirection: this.fb.control<AdjustmentDirection>(AdjustmentDirection.Increase, {
      validators: [Validators.required],
    }),
    documentDate: this.fb.control(new Date().toISOString().slice(0, 10), {
      validators: [Validators.required],
    }),
    /** Numero documento: proposto dal progressivo di serie, editabile. */
    documentNumber: this.fb.control<number | null>(null),
    series: this.fb.control(''),
    // ── Documento della controparte (tipo · numero · data) ────────────────
    // Una rettifica nasce da un riscontro interno: la controparte spesso non
    // c'è. Il trio resta quindi facoltativo (nessun validatore) e nessun tipo
    // viene proposto di default.
    externalDocumentTypeId: this.fb.control(''),
    externalDocNumber: this.fb.control(''),
    externalDocDate: this.fb.control(''),
    notes: this.fb.control(''),
    internalComment: this.fb.control('', { validators: [Validators.required] }),
    lines: this.fb.array([this.createLine()]),
  });

  // Snapshot reattivo del form: i testi del pannello mobile leggono valori dai
  // FormControl, che non sono signal — senza questa dipendenza i computed
  // resterebbero memoizzati (stesso schema del gemello transfer-form).
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  // ── Testata mobile (M1, reference «Ordine cliente») ───────────────────────
  // Solo testi di vista per il pannello apribile: concatenano valori già
  // presenti nel form e nelle opzioni della testata — nessuna logica nuova.

  /** Titolo del pannello: la location scelta, o l'invito a completare. */
  protected readonly mobilePanelTitle = computed(() => {
    this.formValue();
    const location = this.operationalLocations
      .writeLocations()
      .find((loc) => loc.id === this.form.controls.locationId.value)?.name;
    return location ?? 'Dati documento';
  });

  /** Riepilogo sotto il titolo: direzione (se rettifica), data, numero/serie. */
  protected readonly mobilePanelSummaryParts = computed<readonly string[]>(() => {
    this.formValue();
    const parts: string[] = [];
    if (this.isAdjustment()) {
      const direction = this.directionOptions.find(
        (option) => option.value === this.form.controls.adjustmentDirection.value,
      )?.label;
      parts.push(direction ?? 'Direzione non indicata');
    }
    const date = this.form.controls.documentDate.value;
    parts.push(date ? formatItalianInputDate(date) : 'Data non indicata');
    const number = this.form.controls.documentNumber.value;
    if (number !== null) {
      const series = this.form.controls.series.value;
      parts.push(`N. ${number}${series ? `/${series}` : ''}`);
    }
    return parts;
  });

  /** Dati principali presenti: location (e direzione, per le rettifiche). */
  protected readonly mobileHeaderReady = computed(() => {
    this.formValue();
    const hasLocation = Boolean(this.form.controls.locationId.value);
    if (!this.isAdjustment()) {
      return hasLocation;
    }
    return hasLocation && Boolean(this.form.controls.adjustmentDirection.value);
  });

  /** Riga di stato dentro il pannello: dice cosa manca. */
  protected readonly mobilePanelStatus = computed(() => {
    if (this.mobileHeaderReady()) {
      return 'Dati principali completi.';
    }
    return this.isAdjustment()
      ? 'Location e direzione sono obbligatorie.'
      : 'La location è obbligatoria.';
  });

  /**
   * Il numero in testata è una PROPOSTA, non un'assegnazione: finché nessuno lo
   * tocca lo prende chi salva per primo, e il campo deve dirlo. Vale solo sul
   * documento NUOVO — su uno già salvato il numero è suo — e cade appena
   * l'operatore lo digita: da lì è una scelta, difesa dal dialogo di conflitto.
   *
   * Dipende da `formValue()` perché `dirty` non è un signal: senza quella
   * lettura il computed resterebbe fermo al primo valore (stesso schema dei
   * testi del pannello mobile qui sopra).
   */
  protected readonly numberIsProposal = computed(() => {
    this.formValue();
    return !this.isEditMode() && !this.form.controls.documentNumber.dirty;
  });

  protected readonly confirmDialogOpen = signal(false);

  /** Conflitto numero restituito dal server: dialogo «Usa N» / «Annulla». */
  // Avviso «numero già assegnato»: la macchina a stati vive in domain, qui
  // resta solo quale controllo della testata riceve il numero aggiornato.
  private readonly numberConflictDialog = new DocumentNumberConflictStore();
  /** Precompilato non arrivato: la maschera e' vuota e va detto perche'. */
  protected readonly prefillError = new DocumentPrefillErrorStore();
  protected readonly conflictDialogOpen = this.numberConflictDialog.isOpen;
  protected readonly conflictMessage = this.numberConflictDialog.message;

  /** Contatori disponibili per la testata (tipo + sede): alimentano la tendina. */
  private readonly _availableCounters = signal<readonly DocumentCounterView[]>([]);
  protected readonly seriesOptions = computed((): readonly SelectMenuOption[] =>
    this._availableCounters().map((counter) => ({
      value: counter.series ?? '',
      label: counter.series ?? 'Senza serie',
    })),
  );

  /** Pannello «gestisci numerazioni» aperto dall'ingranaggio del campo Serie. */
  protected readonly seriesDialogOpen = signal(false);

  /**
   * Chiusura del pannello numerazioni: ricarica l'elenco serie SENZA riproporre
   * serie/numero — la selezione resta quella che era.
   */
  protected onSeriesManagerClosed(): void {
    this.seriesDialogOpen.set(false);
    const locationId = this.form.controls.locationId.value || null;
    this.countersService
      .available(this.documentType(), locationId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ counters }) => this._availableCounters.set(counters),
        error: () => undefined,
      });
  }

  /** Numero digitato in testata: vuoto = «assegnalo tu». */
  protected onDocumentNumberChange(value: number | null): void {
    // `markAsDirty` PRIMA di `setValue`: è `setValue` a emettere `valueChanges`,
    // ed è quell'emissione a far ricalcolare `numberIsProposal()`. Nell'ordine
    // inverso il campo continuerebbe a dichiararsi «proposta» dopo che
    // l'operatore ha già scelto, fino al successivo tocco su un altro campo.
    this.form.controls.documentNumber.markAsDirty();
    this.form.controls.documentNumber.setValue(value);
  }

  /** Serie scelta dall'operatore: il numero passa al progressivo di quel contatore. */
  protected onSeriesChange(value: string): void {
    this.form.controls.series.setValue(value);
    this.form.controls.series.markAsDirty();
    const counter = this._availableCounters().find((entry) => (entry.series ?? '') === value);
    if (counter) {
      // Il numero della nuova serie torna a essere una proposta: `markAsPristine`
      // prima di `setValue`, così l'emissione che aggiorna `numberIsProposal()`
      // vede già lo stato giusto (speculare a onDocumentNumberChange).
      this.form.controls.documentNumber.markAsPristine();
      this.form.controls.documentNumber.setValue(counter.nextNumber);
    }
  }

  /**
   * Carica i contatori disponibili per (tipo, sede) e, su documento nuovo,
   * propone il predefinito: serie + prossimo numero. Un numero digitato a mano
   * non viene toccato.
   */
  private refreshNumberProposal(): void {
    const locationId = this.form.controls.locationId.value || null;
    this.countersService
      .available(this.documentType(), locationId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ counters, proposedCounterId }) => {
          this._availableCounters.set(counters);
          if (this.editDocumentId() || this.form.controls.documentNumber.dirty) {
            return;
          }
          const proposed = counters.find((entry) => entry.id === proposedCounterId);
          if (proposed) {
            // Proposta programmatica di serie/numero: non è una modifica utente.
            // `setValue` non sporca il controllo, e la cosa è voluta: è proprio
            // `documentNumber.dirty` a distinguere poi il numero proposto (che
            // non si rimanda al server) da quello scelto dall'operatore.
            this.suppressDirtyMarking = true;
            try {
              this.form.controls.series.setValue(proposed.series ?? '');
              this.form.controls.documentNumber.setValue(proposed.nextNumber);
            } finally {
              this.suppressDirtyMarking = false;
            }
          }
        },
        error: () => undefined,
      });
  }

  /**
   * Presa d'atto dell'avviso: chiude e basta. Il numero in testata non si
   * tocca — il messaggio nomina il numero rifiutato e il primo libero, la
   * correzione è dell'operatore.
   */
  protected acknowledgeConflictNumber(): void {
    this.numberConflictDialog.acknowledge();
  }

  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
  protected readonly saving = computed(() => this._submitState().status === 'saving');
  protected readonly submitError = computed(() => {
    const state = this._submitState();
    return state.status === 'error' ? state.error : null;
  });

  // ── Uscita con modifiche non salvate (pattern Ordine fornitore) ─────────────
  protected readonly dirtySinceLastSave = signal(false);
  protected readonly exitDialogOpen = signal(false);
  private pendingDeactivate: ((allow: boolean) => void) | null = null;
  /** True durante il patch programmatico del form (caricamento in modifica). */
  private suppressDirtyMarking = false;

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
            const expectedType = this.documentType();
            const draftEditable = doc.status === DocumentStatus.Draft && doc.type === expectedType;
            const confirmedEditable =
              isConfirmedEditableDocumentStatus(doc.status) && doc.type === expectedType;
            if (!draftEditable && !confirmedEditable) {
              this.loadedDocument.set(null);
              return 'not-found' as const;
            }
            this.loadedDocument.set(doc);
            // Confermato → si riapre bloccato (salvo sblocco già dato in sessione).
            this.editLock.syncOnLoad(doc.id);
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

  protected readonly locationOptions = computed<readonly SelectMenuOption[]>(() =>
    toLocationSelectOptions(
      this.operationalLocations.writeLocations(),
      this.operationalLocations.defaultLocation()?.id ?? null,
    ),
  );

  protected readonly directionOptions: readonly SelectMenuOption[] = [
    { value: AdjustmentDirection.Increase, label: 'Aumento giacenza' },
    { value: AdjustmentDirection.Decrease, label: 'Diminuzione giacenza' },
  ];

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

  protected get lines(): FormArray<ReturnType<StockOperationFormComponent['createLine']>> {
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

  protected onLocationSelect(value: string | null): void {
    this.form.controls.locationId.setValue(value ?? '');
    this.form.controls.locationId.markAsTouched();
  }

  protected onDirectionSelect(value: string | null): void {
    if (value === AdjustmentDirection.Increase || value === AdjustmentDirection.Decrease) {
      this.form.controls.adjustmentDirection.setValue(value);
      this.form.controls.adjustmentDirection.markAsTouched();
    }
  }

  protected onVariantSelect(index: number, value: string | null): void {
    const line = this.lines.at(index);
    line.controls.variantId.setValue(value ?? '');
    line.controls.variantId.markAsTouched();
    if (value) {
      const summary = findVariantSummaryById(value, this.pinnedVariants(), this.searchedVariants());
      if (summary) {
        line.controls.description.setValue(`${summary.productName} · ${summary.title}`.trim());
        line.controls.sku.setValue(summary.sku);
      }
    }
  }

  protected addLine(): void {
    if (this.formReadOnly()) {
      return;
    }
    this.lines.push(this.createLine());
  }

  /**
   * Duplica la riga: stessa variante, stessa descrizione, stessa quantità —
   * seriali esclusi, perché un numero di serie identifica **un** pezzo e
   * copiarlo creerebbe due righe che dicono di muovere lo stesso.
   *
   * Non c'era in questa maschera, mentre c'è negli altri tre documenti. È
   * arrivata con la card condivisa, il cui piede porta Duplica ed Elimina:
   * nasconderlo qui avrebbe richiesto un interruttore, e un piede che è forma
   * solo per tre documenti su cinque non è forma.
   */
  protected duplicateLine(index: number): void {
    if (this.formReadOnly()) {
      return;
    }
    const source = this.lines.at(index);
    if (!source) {
      return;
    }
    const copy = this.createLine();
    copy.patchValue({
      variantId: source.controls.variantId.value,
      sku: source.controls.sku.value,
      description: source.controls.description.value,
      quantity: source.controls.quantity.value,
    });
    this.lines.insert(index + 1, copy);
  }

  protected removeLine(index: number): void {
    if (this.formReadOnly()) {
      return;
    }
    if (this.lines.length > 1) {
      this.lines.removeAt(index);
    }
  }

  protected fieldInvalid(
    name: 'locationId' | 'documentDate' | 'internalComment' | 'adjustmentDirection',
  ): boolean {
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

  protected saveDraft(): void {
    void this.persist();
  }

  protected requestConfirm(): void {
    if (!this.validateForm()) {
      return;
    }
    this.confirmDialogOpen.set(true);
  }

  protected confirmAndSave(): void {
    this.confirmDialogOpen.set(false);
    void this.persist();
  }

  protected cancel(): void {
    this.navHistory.backOr(this.listPath);
  }

  // ── Uscita con modifiche non salvate (pattern Ordine fornitore) ─────────────

  private markFormDirty(): void {
    if (!this.suppressDirtyMarking) {
      this.dirtySinceLastSave.set(true);
    }
  }

  canDeactivate(): boolean | Promise<boolean> {
    if (!this.dirtySinceLastSave()) {
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

  // Niente «Salva e chiudi»: il salvataggio passa dal dialogo di conferma
  // (requestConfirm → confirmAndSave) e un dialogo sopra l'altro confonde.
  protected confirmExitWithoutSaving(): void {
    this.exitDialogOpen.set(false);
    this.dirtySinceLastSave.set(false);
    this.pendingDeactivate?.(true);
    this.pendingDeactivate = null;
  }

  protected reload(): void {
    this.loadTick.update((t) => t + 1);
  }

  private initDefaultsForCreate(): void {
    // Nessuna autoselezione: la predefinita è solo suggerita (prima in lista,
    // etichettata). Unica eccezione ammessa: utente mono-location, dove la
    // scelta è obbligata. Mai fallback "prima location disponibile".
    const writable = this.operationalLocations.writeLocations();
    if (writable.length === 1 && !this.form.controls.locationId.value) {
      // Precompilazione programmatica: non è una modifica dell'utente.
      this.suppressDirtyMarking = true;
      try {
        this.form.controls.locationId.setValue(writable[0]?.id ?? '');
      } finally {
        this.suppressDirtyMarking = false;
      }
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

  private persist(): void {
    if (this.formReadOnly() || this.saving()) {
      return;
    }
    this.dropTrailingEmptyLines();
    if (!this.validateForm()) {
      return;
    }
    const raw = this.form.getRawValue();
    const editId = this.editDocumentId();
    const confirmedEdit = this.isConfirmedEdit();
    // Numero mostrato in testata al momento dell'invio, e se era una proposta:
    // servono dopo, per dire all'operatore che quello assegnato è un altro. Si
    // leggono PRIMA della richiesta — al ritorno la maschera naviga via.
    const shownNumber = this.form.controls.documentNumber.value;
    const numberWasProposal = !this.form.controls.documentNumber.dirty;
    this._submitState.set({ status: 'saving' });

    // Rettifica già confermata: la modifica righe deve preservare gli id
    // stabili, così i movimenti per riga si aggiornano invece di duplicarsi
    // (mirror arrivo merce — vedi POST /documents/adjustment/save). Lo
    // scarico manuale NON fa parte di questa migrazione: resta sempre sul
    // flusso generico, anche a documento confermato.
    const request$ =
      confirmedEdit && this.isAdjustment()
        ? this.documentService.saveAdjustment({
            id: editId!,
            documentDate: new Date(raw.documentDate).toISOString(),
            // Numero imposto in testata: non sposta il progressivo della serie.
            // Solo se l'operatore l'ha davvero scelto — vedi il metodo.
            number: this.imposedNumberForSubmit(),
            series: (raw.series ?? '').trim() || undefined,
            locationId: raw.locationId,
            adjustmentDirection: raw.adjustmentDirection,
            // Documento della controparte: l'endpoint dedicato riscrive sempre
            // i tre campi, quindi vanno inviati anche vuoti — `null` sul tipo
            // dice «nessuno», non «non toccare».
            externalDocumentTypeId: raw.externalDocumentTypeId || null,
            externalDocNumber: raw.externalDocNumber.trim() || undefined,
            externalDocDate: raw.externalDocDate || undefined,
            notes: raw.notes.trim() || undefined,
            internalComment: raw.internalComment.trim(),
            lines: raw.lines
              .filter((line) => line.variantId || line.description.trim())
              .map((line) => ({
                id: line.id || undefined,
                variantId: line.variantId || undefined,
                sku: line.sku.trim() || undefined,
                description: line.description.trim() || 'Riga rettifica',
                quantity: Number(line.quantity),
                loadsStock: Boolean(line.variantId),
                serialNumbers: parseSerialNumbersText(line.serialNumbersText),
              })),
          })
        : this.persistNewOrUpdate(editId, raw);

    this.submitSubscription?.unsubscribe();
    this.submitSubscription = request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (doc) => {
        this._submitState.set({ status: 'idle' });
        this.notifyNumberReassigned(shownNumber, numberWasProposal, doc.number ?? null);
        // Documento salvato: il guard di uscita non deve più fermare la navigazione.
        this.dirtySinceLastSave.set(false);
        void this.router.navigate([this.listPath, doc.id]);
      },
      error: (err: unknown) => {
        // Numero già preso: il vincolo del database non ammette duplicati.
        const conflict = documentNumberConflictOf(err);
        if (conflict) {
          this._submitState.set({ status: 'idle' });
          this.numberConflictDialog.open(conflict);
          return;
        }
        this._submitState.set({ status: 'error', error: this.toAppError(err) });
      },
    });
  }

  /**
   * Numero da inviare al salvataggio.
   *
   * Un numero PROPOSTO (controllo pristine) non si manda: è il primo libero
   * letto all'apertura della maschera, e rispedirlo lo trasformerebbe in
   * un'imposizione — con il dialogo di conflitto addosso al secondo operatore
   * per una scelta che non ha mai fatto. Omesso, il numero lo assegna il server
   * dentro la transazione che scrive il documento, e la concorrenza si risolve
   * da sé: chi salva per secondo prende il primo libero, in silenzio.
   *
   * Un numero DIGITATO viaggia sempre: riempire un buco a mano deve continuare
   * a funzionare identico, dialogo di conflitto compreso.
   */
  private imposedNumberForSubmit(): number | undefined {
    // Si omette SOLO la proposta di un documento nuovo: in modifica il numero è
    // del documento, e ometterlo dopo un cambio di serie lo lascerebbe con il
    // numero della serie vecchia — o lo farebbe collidere in quella nuova.
    if (this.numberIsProposal()) {
      return undefined;
    }
    return this.form.controls.documentNumber.value ?? undefined;
  }

  /**
   * Il server ha assegnato un numero diverso da quello che la maschera stava
   * mostrando: lo si dice. Senza avviso l'operatore ritroverebbe nel dettaglio
   * un numero che non riconosce, e chi lo avesse già trascritto su un cartaceo
   * non saprebbe di doverlo correggere.
   *
   * Solo per il numero proposto: se l'aveva imposto lui, il numero occupato ha
   * già il suo dialogo dedicato e l'avviso non va doppiato.
   */
  private notifyNumberReassigned(
    shown: number | null,
    wasProposal: boolean,
    assigned: number | null,
  ): void {
    if (!wasProposal || shown === null || assigned === null || assigned === shown) {
      return;
    }
    this.toast.showInfo(
      `Salvato con il n. ${assigned}: il ${shown} è stato preso da un altro operatore.`,
    );
  }

  /**
   * Documento nuovo o modifica di una bozza residua: passa dal flusso generico
   * create/update, che con la nascita-confermato produce già una rettifica/
   * scarico confermato (il percorso confirmedEdit usa POST /documents/adjustment/save
   * per preservare gli id riga e non duplicare i movimenti).
   */
  private persistNewOrUpdate(
    editId: string | null,
    raw: ReturnType<StockOperationFormComponent['form']['getRawValue']>,
  ) {
    const docType = this.documentType();
    // Il numero viaggia solo se l'operatore l'ha digitato: la proposta la omette
    // `imposedNumberForSubmit()`, e il server assegna il primo libero dentro la
    // transazione, sotto lock. Prima il numero non partiva MAI, nemmeno digitato:
    // la testata lo accettava e il create lo ignorava, quindi chi voleva tappare
    // un buco si ritrovava il buco ancora lì. La serie resta al server, che usa
    // la predefinita: la stessa su cui la maschera ha calcolato la proposta.
    const body = {
      type: docType,
      documentDate: new Date(raw.documentDate).toISOString(),
      number: this.imposedNumberForSubmit(),
      locationId: raw.locationId,
      adjustmentDirection: this.isAdjustment() ? raw.adjustmentDirection : undefined,
      currency: this.currency,
      // Documento della controparte: il tipo viaggia come `null` quando non
      // c'è, così il PATCH di una bozza lo toglie invece di lasciarlo com'era.
      externalDocumentTypeId: raw.externalDocumentTypeId || null,
      externalDocNumber: raw.externalDocNumber.trim() || undefined,
      externalDocDate: raw.externalDocDate || undefined,
      notes: raw.notes.trim() || undefined,
      internalComment: raw.internalComment.trim(),
      lines: raw.lines
        .filter((line) => line.variantId || line.description.trim())
        .map((line) => ({
          variantId: line.variantId || undefined,
          sku: line.sku.trim() || undefined,
          description:
            line.description.trim() || (this.isAdjustment() ? 'Riga rettifica' : 'Riga scarico'),
          quantity: Number(line.quantity),
          unitPriceMinor: 0,
          loadsStock: Boolean(line.variantId),
          serialNumbers: parseSerialNumbersText(line.serialNumbersText),
        })),
    };

    // Nascita-confermato (Fase 3): create e update producono già una rettifica/
    // scarico confermato in transazione — nessun passaggio di conferma.
    return editId
      ? this.documentService.updateDocument(editId, body)
      : this.documentService.createDocument(body);
  }

  private patchFormFromDocument(doc: DocumentRecord): void {
    // Patch programmatico (caricamento/duplica): non è una modifica dell'utente.
    this.suppressDirtyMarking = true;
    try {
      this.form.patchValue({
        locationId: doc.locationId ?? '',
        adjustmentDirection: doc.adjustmentDirection ?? AdjustmentDirection.Increase,
        documentDate: doc.documentDate.slice(0, 10),
        documentNumber: doc.number ?? null,
        series: doc.series ?? '',
        externalDocumentTypeId: doc.externalDocumentTypeId ?? '',
        externalDocNumber: doc.externalDocNumber ?? '',
        externalDocDate: doc.externalDocDate ? doc.externalDocDate.slice(0, 10) : '',
        notes: doc.notes ?? '',
        internalComment: doc.internalComment ?? '',
      });
      this.lines.clear();
      for (const line of doc.lines ?? []) {
        this.lines.push(
          this.fb.group({
            // Id riga esistente: preservato (mai esposto in UI) per consentire
            // al salvataggio dedicato rettifica di aggiornare il movimento
            // collegato invece di duplicarlo (POST /documents/adjustment/save).
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
    } finally {
      this.suppressDirtyMarking = false;
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

  /**
   * Le righe vuote in coda si SCARTANO al salvataggio, non bloccano.
   *
   * Stessa regola delle altre maschere documento (`domain/`, 11/08/2026). Qui
   * la riga vuota non nasce dalla navigazione ma dal pulsante «Aggiungi riga»,
   * e il blocco era anche peggio: ogni riga ha campi obbligatori propri, quindi
   * una riga aggiunta e lasciata lì rendeva invalido l'intero form — e il
   * salvataggio usciva **in silenzio**, senza dire perché.
   *
   * Vuota = nessun articolo e nessuna descrizione. La quantità non conta: nasce
   * a 1 da sola.
   */
  private dropTrailingEmptyLines(): void {
    if (this.formReadOnly()) {
      return;
    }
    const indices = trailingEmptyLineIndices(this.lines.length, (index) => {
      const line = this.lines.at(index);
      if (!line) {
        return true;
      }
      return !line.controls.variantId.value.trim() && !line.controls.description.value.trim();
    });
    if (indices.length === 0) {
      return;
    }
    for (const index of indices) {
      this.lines.removeAt(index, { emitEvent: false });
    }
    this.lines.updateValueAndValidity();
  }
}
