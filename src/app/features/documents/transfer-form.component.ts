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
import {
  AbstractControl,
  FormArray,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
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
import { DocumentStatus, DocumentType } from '@core/models/document.model';
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
import { DocumentLineProductCellComponent } from '@domain/documents/components/document-line-product-cell/document-line-product-cell.component';
import { DocumentProductSearchPanelComponent } from '@domain/documents/components/document-product-search-panel/document-product-search-panel.component';
import { DocumentProductSuggestStore } from '@domain/documents/state/document-product-suggest.store';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { DocumentEditLockService } from '@domain/documents/services/document-edit-lock.service';
import { formatItalianInputDate } from '@shared/utils/calendar.util';

import { documentReferenceLabel } from '@domain/documents/models/document-labels.util';
import { isTransferDocumentType } from './models/document-transfer.util';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import type { SaveTransferBody } from '@domain/documents/services/document-api.mapper';
import type { DocumentCounterView } from '@domain/documents/models/document-counter.model';
import { parseSerialNumbersText } from '@domain/documents/utils/serial-numbers-input.util';
import { FirstClickSelectsDirective } from '@shared/directives/first-click-selects.directive';
import { DocumentLineSortStore } from '@domain/documents/state/document-line-sort.store';
import { CdkDrag, CdkDragHandle, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { trailingEmptyLineIndices } from '@domain/documents/utils/trailing-empty-lines.util';
import {
  sortByLineValue,
  type DocumentLineSortKind,
} from '@domain/documents/utils/document-line-sort.util';

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

/** Colonne del Trasferimento su cui si può ordinare le righe (§7.1). */
export type TransferLineSortColumn = 'sku' | 'description' | 'quantity';

const TRANSFER_SORTABLE_LINE_COLUMNS: readonly TransferLineSortColumn[] = [
  'sku',
  'description',
  'quantity',
];

@Component({
  selector: 'app-transfer-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
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
    DocumentLineProductCellComponent,
    DocumentProductSearchPanelComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
  ],
  providers: [DocumentEditLockService],
  templateUrl: './transfer-form.component.html',
  styleUrl: './transfer-form.component.scss',
})
export class TransferFormComponent implements CanComponentDeactivate {
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

  private readonly toasts = inject(ToastService);
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
   * «Duplica documento» (Fase 3, no bozze): il param `duplicateFrom` porta il
   * trasferimento originale, copiato in un documento NUOVO. Nessuna copia nasce
   * a monte: si crea (confermato) solo al salvataggio.
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

  /**
   * Riordino righe e avviso: stato e regole in `domain/`. Qui resta solo quali
   * colonne e come si legge il loro valore.
   *
   * Un trasferimento «e' un documento breve» era la ragione per cui era stato
   * lasciato fuori: e' una previsione sull'uso, non una proprieta' del
   * documento — a fine stagione fra due magazzini le righe sono trenta.
   */
  protected readonly lineSort = new DocumentLineSortStore<TransferLineSortColumn>();

  private readonly lineSortKinds: Readonly<Record<TransferLineSortColumn, DocumentLineSortKind>> = {
    sku: 'text',
    description: 'text',
    quantity: 'number',
  };

  protected isLineColumnSortable(columnId: string): boolean {
    return (TRANSFER_SORTABLE_LINE_COLUMNS as readonly string[]).includes(columnId);
  }

  protected toggleLineSort(columnId: TransferLineSortColumn): void {
    if (this.formReadOnly()) {
      return;
    }
    if (this.lineSort.request(columnId)) {
      this.applyLineSort();
    }
  }

  protected confirmLineSort(): void {
    if (this.lineSort.confirm() !== null) {
      this.applyLineSort();
    }
  }

  protected lineSortAriaLabel(columnId: TransferLineSortColumn, label: string): string {
    if (this.lineSort.column() !== columnId) {
      return `Ordina per ${label}`;
    }
    return this.lineSort.direction() === 'asc'
      ? `${label}: ordinamento crescente`
      : `${label}: ordinamento decrescente`;
  }

  private applyLineSort(): void {
    const column = this.lineSort.column();
    if (!column || this.lines.length <= 1) {
      return;
    }
    const controls = sortByLineValue(
      this.lines.controls,
      (control) => {
        const raw = control.getRawValue();
        return column === 'quantity' ? Number(raw.quantity) || 0 : raw[column];
      },
      this.lineSortKinds[column],
      this.lineSort.direction(),
      this.currency,
    );
    this.lines.clear();
    for (const control of controls) {
      this.lines.push(control);
    }
    this.markFormDirty();
  }

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
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
      /** Numero documento: proposto dal progressivo di serie, editabile. */
      documentNumber: this.fb.control<number | null>(null),
      series: this.fb.control(''),
      // ── Documento della controparte (tipo · numero · data) ──────────────
      // Un trasferimento fra sedi proprie non ha una controparte esterna: il
      // trio c'è per uniformità con le altre maschere, resta facoltativo
      // (nessun validatore) e nessun tipo viene proposto di default.
      externalDocumentTypeId: this.fb.control(''),
      externalDocNumber: this.fb.control(''),
      externalDocDate: this.fb.control(''),
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

  /** Tipo documento fisso di questa maschera (per il pannello numerazioni). */
  protected readonly documentType = DocumentType.Transfer;
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
      .available(DocumentType.Transfer, locationId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ counters }) => this._availableCounters.set(counters),
        error: () => undefined,
      });
  }

  /**
   * Il numero mostrato è una PROPOSTA, non un'assegnazione: su un documento
   * nuovo lo prende chi salva per primo, e finché nessuno lo tocca può ancora
   * cambiare. Su un documento già salvato il numero è invece assegnato, e
   * appena l'operatore lo digita diventa una scelta da difendere.
   *
   * `dirty` non è un signal: la dipendenza da `formValue()` fa ricalcolare il
   * computed a ogni scrittura sul form, che è dove lo stato del controllo può
   * cambiare (ogni `markAsDirty` di questa maschera segue un `setValue`).
   */
  protected readonly numberIsProposal = computed(() => {
    this.formValue();
    return !this.isEditMode() && !this.form.controls.documentNumber.dirty;
  });

  /** Numero digitato in testata: vuoto = «assegnalo tu». */
  protected onDocumentNumberChange(value: number | null): void {
    this.form.controls.documentNumber.setValue(value);
    this.form.controls.documentNumber.markAsDirty();
  }

  /** Serie scelta dall'operatore: il numero passa al progressivo di quel contatore. */
  protected onSeriesChange(value: string): void {
    this.form.controls.series.setValue(value);
    this.form.controls.series.markAsDirty();
    const counter = this._availableCounters().find((entry) => (entry.series ?? '') === value);
    if (counter) {
      this.form.controls.documentNumber.setValue(counter.nextNumber);
      // Su un documento NUOVO il progressivo della serie scelta resta una
      // proposta: pristine, quindi non viaggia al salvataggio e a decidere è
      // il server (il primo libero di quella serie, nel momento del commit).
      // Su un documento GIÀ SALVATO cambiare serie sposta una numerazione che
      // esiste: lì il numero mostrato è quello che dev'essere scritto, quindi
      // va imposto — altrimenti il server terrebbe il numero vecchio e il
      // campo direbbe una cosa diversa da quella salvata.
      if (this.isEditMode()) {
        this.form.controls.documentNumber.markAsDirty();
      } else {
        this.form.controls.documentNumber.markAsPristine();
      }
    }
  }

  /**
   * Numero da mandare al server: SOLO quello scelto dall'operatore.
   *
   * La proposta non torna indietro come imposizione. Se il numero mostrato è
   * quello proposto all'apertura (controllo pristine), il campo si omette: il
   * server assegna il primo libero dentro la transazione che scrive il
   * documento, e due operatori che salvano insieme non si contendono più
   * niente. Se invece l'operatore l'ha digitato — è il caso del buco da
   * riempire — il numero viaggia, e se è occupato il dialogo di conflitto è
   * un'informazione che serve.
   */
  private imposedDocumentNumber(): number | undefined {
    // Si omette SOLO la proposta di un documento nuovo: in modifica il numero è
    // del documento, e ometterlo dopo un cambio di serie lo lascerebbe con il
    // numero della serie vecchia.
    if (this.numberIsProposal()) {
      return undefined;
    }
    return this.form.controls.documentNumber.value ?? undefined;
  }

  /**
   * Carica i contatori disponibili per (tipo, sede) e, su documento nuovo,
   * propone il predefinito: serie + prossimo numero. Un numero digitato a mano
   * non viene toccato.
   */
  private refreshNumberProposal(): void {
    const locationId = this.form.controls.locationId.value || null;
    this.countersService
      .available(DocumentType.Transfer, locationId)
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
            const draftEditable =
              doc.status === DocumentStatus.Draft && isTransferDocumentType(doc.type);
            const confirmedEditable =
              isConfirmedEditableDocumentStatus(doc.status) && isTransferDocumentType(doc.type);
            if (!draftEditable && !confirmedEditable) {
              this.loadedDocument.set(null);
              return 'not-found' as const;
            }
            this.loadedDocument.set(doc);
            // Confermato → si riapre bloccato (salvo sblocco già dato in sessione).
            this.editLock.syncOnLoad(doc.id);
            this.patchFormFromDocument(doc);
            // Un altro documento e' un'altra storia: l'avviso torna dovuto.
            this.lineSort.reset();
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

  // ── Ricerca articolo, come negli altri documenti ──────────────────────────
  //
  // Prima l'articolo si sceglieva da una tendina con ricerca al server: nessun
  // suggerimento sotto il campo, nessuna scorciatoia alla ricerca a tutta
  // pagina. Era il meccanismo di prima, rimasto qui mentre gli altri documenti
  // andavano avanti.
  //
  // La ricerca al catalogo era già qui (`variantSearchDraft` col suo debounce):
  // cambia chi la mostra, non chi la fa.
  protected readonly productSuggest = new DocumentProductSuggestStore();

  /** Il pannello di ricerca a tutta pagina, aperto dalla lente della riga. */
  protected readonly productPanelOpen = signal(false);
  protected readonly productPanelTerm = signal('');
  protected readonly productPanelSeq = signal(0);
  private productPanelLineIndex = -1;

  protected lineSuggestions(index: number): readonly VariantSummary[] {
    return this.productSuggest.suggestionsFor(index, this.suggestInputs(index));
  }

  protected lineSuggestionsOpen(index: number): boolean {
    return this.productSuggest.isOpenOn(index, this.suggestInputs(index));
  }

  private suggestInputs(index: number): {
    hasLinked: boolean;
    searched: readonly VariantSummary[];
  } {
    return {
      hasLinked: !!this.lines.at(index)?.controls.variantId.value,
      searched: this.searchedVariants() ?? [],
    };
  }

  /** Digitando si cerca a catalogo: è la stessa ricerca di prima, altro innesco. */
  protected onLineProductNameChange(index: number, value: string): void {
    this.lines.at(index)?.controls.description.setValue(value);
    this.productSuggest.focusLine(index);
    this.variantSearchDraft.set(value);
  }

  protected onLineProductFocus(index: number): void {
    this.productSuggest.focusLine(index);
    this.variantSearchDraft.set(this.lines.at(index)?.controls.description.value ?? '');
  }

  protected onLineProductBlur(index: number): void {
    this.productSuggest.blurLine(index);
  }

  protected onProductSuggestionPick(index: number, variantId: string): void {
    this.onVariantSelect(index, variantId);
    this.productSuggest.clear();
  }

  /** La lente: la ricerca a tutta pagina, col testo già digitato dentro. */
  protected openLineProductSearch(index: number): void {
    this.productPanelLineIndex = index;
    this.productPanelTerm.set(this.lines.at(index)?.controls.description.value ?? '');
    this.productPanelSeq.update((seq) => seq + 1);
    this.productPanelOpen.set(true);
  }

  protected onProductPanelSelected(variantId: string): void {
    if (this.productPanelLineIndex >= 0) {
      this.onVariantSelect(this.productPanelLineIndex, variantId);
    }
    this.productPanelOpen.set(false);
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

  /**
   * Trascinamento riga (§7.2). Non chiede conferma, a differenza del riordino
   * per colonna: e' un movimento singolo e visibile, e chi lo fa sa cosa sta
   * facendo. L'avviso serve a chi ribalta tutto in un colpo.
   */
  protected onLineDrop(event: CdkDragDrop<unknown>): void {
    if (this.formReadOnly()) {
      return;
    }
    const { previousIndex, currentIndex } = event;
    if (previousIndex === currentIndex) {
      return;
    }
    const line = this.lines.at(previousIndex);
    this.lines.removeAt(previousIndex, { emitEvent: false });
    this.lines.insert(currentIndex, line, { emitEvent: false });
    this.markFormDirty();
    this.lines.updateValueAndValidity();
  }

  protected fieldInvalid(name: 'locationId' | 'targetLocationId' | 'documentDate'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected readonly locationsConflict = computed(() => {
    this.formValue();
    return this.form.hasError('sameLocation') && this.form.touched;
  });

  // ── Testata mobile (M1, reference «Ordine cliente») ───────────────────────
  // Solo testi di vista per il pannello apribile: concatenano valori già
  // presenti nel form e nelle location operative — nessuna logica nuova.

  /** Titolo del pannello: «Origine → Destinazione» quando entrambe scelte. */
  protected readonly mobilePanelTitle = computed(() => {
    this.formValue();
    const origin = this.operationalLocations
      .writeLocations()
      .find((loc) => loc.id === this.form.controls.locationId.value)?.name;
    const target = this.operationalLocations
      .transferTargetLocations()
      .find((loc) => loc.id === this.form.controls.targetLocationId.value)?.name;
    return origin && target ? `${origin} → ${target}` : 'Origine e destinazione';
  });

  /** Riepilogo sotto il titolo: data documento e numero/serie se presenti. */
  protected readonly mobilePanelSummaryParts = computed<readonly string[]>(() => {
    this.formValue();
    const date = this.form.controls.documentDate.value;
    const parts: string[] = [date ? formatItalianInputDate(date) : 'Data non indicata'];
    const number = this.form.controls.documentNumber.value;
    if (number !== null) {
      const series = this.form.controls.series.value;
      parts.push(`N. ${number}${series ? `/${series}` : ''}`);
    }
    return parts;
  });

  /** Dati principali presenti: origine e destinazione scelte e distinte. */
  protected readonly mobileHeaderReady = computed(() => {
    this.formValue();
    return Boolean(
      this.form.controls.locationId.value &&
      this.form.controls.targetLocationId.value &&
      !this.form.hasError('sameLocation'),
    );
  });

  /** Riga di stato dentro il pannello: dice cosa manca. */
  protected readonly mobilePanelStatus = computed(() =>
    this.mobileHeaderReady()
      ? 'Dati principali completi.'
      : 'Origine e destinazione sono obbligatorie.',
  );

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
    // La sede predefinita dell'utente può precompilare SOLO l'origine (se
    // autorizzata); mono-location: preselezionabile l'unica sede scrivibile.
    // Mai fallback "prima location disponibile". La destinazione non viene
    // MAI autocompilata (specifica cliente «sede predefinita»).
    const writable = this.operationalLocations.writeLocations();
    const preferredOrigin =
      this.operationalLocations.defaultLocation()?.id ??
      (writable.length === 1 ? (writable[0]?.id ?? '') : '');
    if (preferredOrigin && !this.form.controls.locationId.value) {
      // Precompilazione programmatica: non è una modifica dell'utente.
      this.suppressDirtyMarking = true;
      try {
        this.form.controls.locationId.setValue(preferredOrigin);
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
    // Fotografia PRIMA dell'invio: cosa mostrava la testata e se quel numero
    // era una scelta dell'operatore. Dopo il salvataggio il confronto con il
    // numero assegnato dice se la proposta è stata soffiata da qualcun altro.
    const shownNumber = raw.documentNumber;
    const numberImposed = this.form.controls.documentNumber.dirty;
    this._submitState.set({ status: 'saving' });

    // Documento già confermato: la modifica righe deve preservare gli id
    // stabili, così i movimenti per riga si aggiornano invece di duplicarsi
    // (mirror arrivo merce — vedi POST /documents/transfer/save).
    const request$ = confirmedEdit
      ? this.documentService.saveTransfer(this.buildSaveTransferBody(editId!, raw))
      : this.persistNewOrUpdate(editId, raw);

    this.submitSubscription?.unsubscribe();
    this.submitSubscription = request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (doc) => {
        this._submitState.set({ status: 'idle' });
        // Documento salvato: il guard di uscita non deve più fermare la navigazione.
        this.dirtySinceLastSave.set(false);
        this.notifyNumberReassignment(shownNumber, numberImposed, doc.number);
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
   * Body del salvataggio dedicato (documento già confermato). Estratto dal
   * flusso per poterlo interrogare: la regola sul numero — si manda solo se
   * l'operatore l'ha scelto — è una decisione, e una decisione va provata.
   */
  private buildSaveTransferBody(
    editId: string,
    raw: ReturnType<TransferFormComponent['form']['getRawValue']>,
  ): SaveTransferBody {
    return {
      id: editId,
      documentDate: new Date(raw.documentDate).toISOString(),
      // Numero imposto in testata: non sposta il progressivo della serie.
      // Assente = il documento tiene il numero che ha già.
      number: this.imposedDocumentNumber(),
      series: (raw.series ?? '').trim() || undefined,
      locationId: raw.locationId,
      targetLocationId: raw.targetLocationId,
      // Documento della controparte: l'endpoint dedicato riscrive sempre
      // i tre campi, quindi vanno inviati anche vuoti — `null` sul tipo
      // dice «nessuno», non «non toccare».
      externalDocumentTypeId: raw.externalDocumentTypeId || null,
      externalDocNumber: raw.externalDocNumber.trim() || undefined,
      externalDocDate: raw.externalDocDate || undefined,
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
    };
  }

  /**
   * Il numero assegnato dal server non è quello che la testata mostrava: la
   * proposta era solo una proposta, e chi ha salvato per primo se l'è presa.
   * Va detto — un operatore che avesse già trascritto quel numero altrove
   * altrimenti non lo saprebbe mai.
   *
   * Sul numero IMPOSTO non si dice nulla: là il conflitto ha già il suo
   * dialogo dedicato, e doppiarlo con un toast confonde invece di informare.
   */
  private notifyNumberReassignment(
    shownNumber: number | null,
    numberImposed: boolean,
    assignedNumber: number | undefined,
  ): void {
    if (numberImposed || shownNumber === null || assignedNumber === undefined) {
      return;
    }
    if (assignedNumber === shownNumber) {
      return;
    }
    this.toasts.showInfo(
      `Salvato con il n. ${assignedNumber}: il ${shownNumber} è stato preso da un altro operatore.`,
    );
  }

  /**
   * Documento nuovo o modifica di una bozza residua: passa dal flusso generico
   * create/update, che con la nascita-confermato produce già un trasferimento
   * confermato (il percorso confirmedEdit usa invece POST /documents/transfer/save
   * per preservare gli id riga e non duplicare i movimenti).
   */
  private persistNewOrUpdate(
    editId: string | null,
    raw: ReturnType<TransferFormComponent['form']['getRawValue']>,
  ) {
    // Il numero viaggia solo se l'operatore l'ha digitato: la proposta la
    // omette `imposedDocumentNumber()`, e il server assegna il primo libero
    // sotto lock. Prima questo flusso non mandava il numero MAI, nemmeno
    // digitato: il campo lo accetta, quindi il documento nasceva con un altro
    // numero senza dirlo a nessuno — e chi voleva tappare un buco si ritrovava
    // il buco ancora lì. La serie resta al server, che usa la predefinita:
    // è la stessa su cui la maschera ha calcolato la propria proposta.
    const body = {
      type: DocumentType.Transfer,
      documentDate: new Date(raw.documentDate).toISOString(),
      number: this.imposedDocumentNumber(),
      locationId: raw.locationId,
      targetLocationId: raw.targetLocationId,
      currency: this.currency,
      // Documento della controparte: il tipo viaggia come `null` quando non
      // c'è, così il PATCH di una bozza lo toglie invece di lasciarlo com'era.
      externalDocumentTypeId: raw.externalDocumentTypeId || null,
      externalDocNumber: raw.externalDocNumber.trim() || undefined,
      externalDocDate: raw.externalDocDate || undefined,
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

    // Nascita-confermato (Fase 3): create e update producono già un
    // trasferimento confermato in transazione — nessun passaggio di conferma.
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
        targetLocationId: doc.targetLocationId ?? '',
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
