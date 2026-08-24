import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
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
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  VARIANT_SEARCH_DEBOUNCE_MS,
  VARIANT_SEARCH_MIN_CHARS,
  VARIANT_SEARCH_PAGE_SIZE,
} from '@domain/documents/utils/document-variant-search.config';
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
import { hasTenantPermission } from '@core/permissions/user-permissions.util';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { documentNumberConflictOf } from '@core/models/document-number-conflict.util';
import { DocumentNumberConflictStore } from '@domain/documents/state/document-number-conflict.store';
import { DocumentChronologyGuard } from '@domain/documents/state/document-chronology-guard';
import { DocumentChronologyWarningDialogComponent } from '@domain/documents/components/document-chronology-warning-dialog/document-chronology-warning-dialog.component';
import { DocumentPrefillErrorStore } from '@domain/documents/state/document-prefill-error.store';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { DocumentStatus, DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { isConfirmedEditableDocumentStatus } from '@core/models/document.model';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { prefillDefaultLocation } from '@domain/inventory/utils/default-location-prefill.util';
import { toLocationSelectOptions } from '@core/utils/location-select-options.util';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import { ProductService } from '@domain/products/services/product.service';
import { DocumentLineArticleService } from '@domain/documents/services/document-line-article.service';
import { DocumentLineHeadComponent } from '@domain/documents/components/document-line-head/document-line-head.component';
import { DocumentLineRowComponent } from '@domain/documents/components/document-line-row/document-line-row.component';
import { DOCUMENT_LINE_ROW_VIEW_VUOTA } from '@domain/documents/components/document-line-row/document-line-row.model';
import type {
  DocumentLineColumnId,
  DocumentLineFieldEvent,
  DocumentLineFocusField,
  DocumentLineRowView,
  DocumentLineSuggestionDirection,
  DocumentLineSuggestionPick,
} from '@domain/documents/components/document-line-row/document-line-row.model';
import {
  CONTESTO_MOVIMENTO_INTERNO,
  POLICY_MOVIMENTO_INTERNO,
} from '@domain/documents/models/movimento-interno-richiamo.config';
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
import { DocumentMobilePanelComponent } from '@domain/documents/components/document-mobile-panel/document-mobile-panel.component';
import { EditLockBannerComponent } from '@shared/components/edit-lock-banner/edit-lock-banner.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import { DocumentLineCardComponent } from '@domain/documents/components/document-line-card/document-line-card.component';
import { DocumentLineCardBodyComponent } from '@domain/documents/components/document-line-card/document-line-card-body.component';
import { DocumentLineCardStripComponent } from '@domain/documents/components/document-line-card/document-line-card-strip.component';
import { documentLineCardHead } from '@domain/documents/components/document-line-card/document-line-card.model';
import type { DocumentLineCardHead } from '@domain/documents/components/document-line-card/document-line-card.model';
import { DocumentLineCardOpenStore } from '@domain/documents/state/document-line-card-open.store';
import { DocumentProductSearchPanelComponent } from '@domain/documents/components/document-product-search-panel/document-product-search-panel.component';
import { DocumentProductSuggestStore } from '@domain/documents/state/document-product-suggest.store';
import { DocumentCodeLookupStore } from '@domain/documents/state/document-code-lookup.store';
import { DocumentCodeLookupService } from '@domain/documents/services/document-code-lookup.service';
import { DocumentLineFocusStore } from '@domain/documents/state/document-line-focus.store';
import type { DocumentLineCodeField } from '@domain/documents/utils/document-code-match.util';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { DocumentEditLockService } from '@domain/documents/services/document-edit-lock.service';
import { formatItalianInputDate } from '@shared/utils/calendar.util';

import { documentReferenceLabel } from '@domain/documents/models/document-labels.util';
import { isTransferDocumentType } from './models/document-transfer.util';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentNumberingStore } from '@domain/documents/state/document-numbering.store';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import type { SaveTransferBody } from '@domain/documents/services/document-api.mapper';
import { parseSerialNumbersText } from '@domain/documents/utils/serial-numbers-input.util';
import { DocumentLineSortStore } from '@domain/documents/state/document-line-sort.store';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { TableViewId } from '@shared/table-columns/table-column.model';
import { createLineColumnWidths } from '@shared/table-columns/line-column-widths.store';
import {
  MOVEMENT_LINE_FOCUS_FIELDS,
  STOCK_MOVEMENT_LINE_COLUMNS,
  STOCK_MOVEMENT_LINE_PRESETS,
} from '@domain/documents/models/stock-movement-line-columns.config';
import type { MovementLineFocusField } from '@domain/documents/models/stock-movement-line-columns.config';
import { CdkDrag, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { trailingEmptyLineIndices } from '@domain/documents/utils/trailing-empty-lines.util';
import { sortByValue, type SortValueKind } from '@shared/utils/sort-values.util';

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

function distinctLocations(control: AbstractControl): ValidationErrors | null {
  const origin = control.get('locationId')?.value as string | undefined;
  const target = control.get('targetLocationId')?.value as string | undefined;
  if (origin && target && origin === target) {
    return { sameLocation: true };
  }
  return null;
}

/** Colonne del Trasferimento su cui si può ordinare le righe (§7.1). */
export type TransferLineSortColumn = 'articleCode' | 'sku' | 'barcode' | 'product' | 'quantity';

const TRANSFER_SORTABLE_LINE_COLUMNS: readonly TransferLineSortColumn[] = [
  'articleCode',
  'sku',
  'barcode',
  'product',
  'quantity',
];

/**
 * I campi di riga nell'ordine in cui il Tab li attraversa. I tre codici e il
 * nome sono gli stessi degli altri documenti: un movimento di magazzino trova
 * l'articolo come lo trova un ordine — ciò che cambia è cosa ne fa dopo.
 */
// I campi del fuoco vivono accanto alle colonne che il Tab attraversa,
// condivisi con l'altra maschera di movimento.

/**
 * Quanto si aspetta, allo sfocamento di un campo codice della card, prima di
 * decidere cosa fare: il tempo che serve al tocco su una voce della scelta per
 * arrivare. Sotto, lo sfocamento vincerebbe la corsa contro il tocco.
 */
const MOBILE_PICK_GRACE_MS = 200;

/** I tre codici di questa maschera: niente codice fornitore, non è un acquisto. */
type MovementCodeField = Extract<DocumentLineCodeField, 'articleCode' | 'sku' | 'barcode'>;

@Component({
  selector: 'app-transfer-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DocumentLineHeadComponent,
    DocumentLineRowComponent,
    CdkDropList,
    CdkDrag,
    InlineBannerComponent,
    ReactiveFormsModule,
    BackButtonComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    DateInputComponent,
    DocumentMobilePanelComponent,
    DocumentNumberFieldComponent,
    DocumentSeriesManagerDialogComponent,
    DocumentChronologyWarningDialogComponent,
    EditLockBannerComponent,
    SelectMenuComponent,
    DocumentLineCardComponent,
    DocumentLineCardBodyComponent,
    DocumentLineCardStripComponent,
    TableColumnPickerComponent,
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
  private readonly lineArticles = inject(DocumentLineArticleService);
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
    this.columnPreferences.registerView(
      this.lineColumnsView,
      STOCK_MOVEMENT_LINE_COLUMNS,
      STOCK_MOVEMENT_LINE_PRESETS,
    );

    // Sede predefinita in testata (§1-bis): la regola vive in `domain/`, ed è
    // la stessa per tutte le maschere.
    //
    // **Solo l'origine.** La destinazione la sceglie l'operatore: precompilarla
    // con la stessa sede farebbe un trasferimento verso sé stesso, che il
    // validatore `distinctLocations` rifiuta — il documento nascerebbe già in
    // errore.
    prefillDefaultLocation({
      control: this.form.controls.locationId,
      isEdit: () => this.isEditMode(),
      write: (apply) => {
        this.suppressDirtyMarking = true;
        apply();
        this.suppressDirtyMarking = false;
      },
    });

    // Cambio sede: la tendina Serie cambia con lei — un contatore legato a una
    // sede è disponibile SOLO lì, e quelli senza sede ovunque (§1-bis). Senza
    // questa ricarica l'elenco resterebbe quello chiesto all'apertura, e
    // mostrerebbe serie che in questa sede non si possono usare.
    //
    // `refreshNumberProposal` ricarica l'elenco e ripropone serie e numero solo
    // se il documento è nuovo e nessuno ha toccato il numero: su un documento
    // salvato, o con un numero digitato, cambia solo la tendina.
    this.form.controls.locationId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.numbering.refreshProposal());

    // Cambio data: il numero proposto dipende dalla data (§2), quindi la
    // testata deve rifare l'anteprima — o mostrerebbe il primo libero di OGGI
    // mentre il salvataggio assegna quello della data scelta.
    this.form.controls.documentDate.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.numbering.refreshProposal());

    // Breadcrumb: numero del documento al posto del generico «Dettaglio».
    bindBreadcrumbEntityLabel(() => ({
      id: this.editDocumentId() || null,
      label: this.breadcrumbLabel(),
    }));

    // Carica i contatori disponibili (tendina serie) e propone il predefinito.
    afterNextRender(() => {
      this.numbering.refreshProposal();
      this.prefillFromDuplicateIfRequested();
    });

    // Ogni modifica utente al form marca il documento come «da salvare».
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.markFormDirty();
      // L'avviso di blocco si spegne appena il motivo non c'è più: tenerlo
      // acceso su un form ormai valido sarebbe un secondo modo di mentire.
      if (this._formErrorMessage() !== null && this.form.valid && this.hasStockLine()) {
        this._formErrorMessage.set(null);
      }
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
    this.numbering.refreshProposal();
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
  // ── Prima la testata, poi le righe (§4.13) ────────────────────────────────
  //
  // Finché mancano i campi che governano le righe, al posto della tabella (e
  // delle card) c'è uno stato vuoto che dice **cosa manca**. Non una tabella
  // spenta a metà tinta: se una cosa non è utilizzabile non si veste di grigio,
  // non c'è.
  //
  // Qui i campi sono DUE, e nessuno dei due è di comodo: senza l'origine non si
  // sa da quale giacenza si attinge, senza la destinazione non si sa dove
  // finisce. Un articolo scelto prima di saperlo mostrerebbe una disponibilità
  // che non è quella su cui si sta lavorando.

  protected readonly headerGateActive = computed(() => {
    if (this.formReadOnly()) {
      return false;
    }
    this.formValue();
    return !this.form.controls.locationId.value || !this.form.controls.targetLocationId.value;
  });

  /** Il titolo dello stato vuoto dice cosa manca, non che manca qualcosa. */
  protected readonly linesEmptyTitle = computed(() => {
    this.formValue();
    if (!this.headerGateActive()) {
      return 'Nessuna riga inserita';
    }
    const senzaOrigine = !this.form.controls.locationId.value;
    const senzaDestinazione = !this.form.controls.targetLocationId.value;
    if (senzaOrigine && senzaDestinazione) {
      return 'Scegli origine e destinazione';
    }
    return senzaOrigine ? 'Scegli la location di origine' : 'Scegli la location di destinazione';
  });

  protected readonly linesEmptyDescription = computed(() =>
    this.headerGateActive()
      ? 'Le righe si aggiungono dopo: da qui potrai cercare un articolo per codice, SKU, EAN o nome.'
      : 'Cerca un articolo per codice, SKU, EAN o nome.',
  );

  /**
   * Campo obbligatorio ancora vuoto che tiene ferme le righe: si segna col
   * colore del **campo in attesa** (`--color-field-waiting`, regole-stile-ui
   * §5), non col rosso dell'errore. Il rosso vuol dire «hai provato a salvare e
   * questo è sbagliato»; aprire un trasferimento nuovo non è un errore.
   *
   * Il colore sta sul CONTROLLO, via `--field-border-color`: la cella di
   * testata è alta, e un filo sul suo bordo si leggerebbe come separazione.
   */
  protected fieldWaiting(field: 'locationId' | 'targetLocationId'): boolean {
    this.formValue();
    if (!this.headerGateActive()) {
      return false;
    }
    return !this.form.controls[field].value;
  }

  // ── Larghezza e visibilità delle colonne ──────────────────────────────────
  //
  // Stesso sistema condiviso degli altri documenti (`shared/table-columns`):
  // la vista è propria della maschera, le colonne e le viste salvate sono le
  // stesse per i due movimenti, che hanno la stessa riga.

  private readonly columnPreferences = inject(TableColumnPreferenceService);

  /** Serve a misurare la tabella resa: la ridistribuzione lavora in pixel. */

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly lineColumnsView = TableViewId.TransferLines;

  /**
   * Una colonna è visibile solo se **questo documento la dichiara**.
   *
   * ⛔ Prima la risposta veniva dalle sole preferenze utente, e su un id che il
   * config non contiene quelle rispondono «visibile»: la riga comune conosce
   * diciassette colonne, un movimento ne dichiara sette, e le altre dieci
   * risultavano accese. Il template cercava allora `formControlName="unitPrice"`
   * su un gruppo che quel controllo non ha, e la riga esplodeva con «Cannot
   * find control with name».
   *
   * ⚠️ Non era un difetto teorico: è comparso portando la Rettifica sulla riga
   * comune, e prima non poteva comparire perché il markup locale rendeva solo
   * le colonne che sapeva di avere. Il config diventa la fonte di verità nel
   * momento in cui la riga è condivisa.
   */
  protected isLineColumnVisible(columnId: string): boolean {
    const dichiarata = STOCK_MOVEMENT_LINE_COLUMNS.some((column) => column.id === columnId);
    return dichiarata && this.columnPreferences.isColumnVisible(this.lineColumnsView, columnId);
  }

  /**
   * ⭐ **Le larghezze vengono dal PUNTO COMUNE.** Qui c'erano le quote senza
   * la ridistribuzione: mezzo sistema. La maniglia dell'intestazione comune
   * e' montata `[live]`, quindi la direttiva non disegna niente da sola e
   * aspetta che qualcuno ascolti `resizing` — nessuno ascoltava. Si
   * trascinava senza vedere nulla, e al rilascio la colonna saltava
   * riscalando tutte le altre.
   *
   * Questo documento dichiara solo il proprio catalogo e la propria vista.
   */
  private readonly lineWidths = createLineColumnWidths({
    defs: STOCK_MOVEMENT_LINE_COLUMNS,
    viewId: this.lineColumnsView,
    preferences: this.columnPreferences,
    // ⚠️ **Lo STESSO predicato che passa alla testata e alla riga.** Il banco
    // ne aveva due — uno per il template, uno per le larghezze — e le quote si
    // calcolavano su un insieme di colonne diverso da quello reso: sommavano
    // 116,84%. Se qui e nel template le domande divergono, la geometria
    // sbaglia in silenzio.
    isVisible: (id) => this.isLineColumnVisibleFn(id as DocumentLineColumnId),
    host: this.host,
  });

  protected lineColumnWidth(columnId: string): string {
    return this.lineWidths.width(columnId);
  }

  protected lineIndexColumnWidth(): string {
    return this.lineWidths.indexWidth();
  }

  protected onLineColumnResizing(columnId: string, renderedWidthPx: number): void {
    this.lineWidths.onResizing(columnId, renderedWidthPx);
  }

  protected onLineColumnResize(columnId: string, renderedWidthPx: number): void {
    this.lineWidths.onResize(columnId, renderedWidthPx);
  }

  protected readonly lineSort = new DocumentLineSortStore<TransferLineSortColumn>();

  private readonly lineSortKinds: Readonly<Record<TransferLineSortColumn, SortValueKind>> = {
    articleCode: 'text',
    sku: 'text',
    barcode: 'text',
    product: 'text',
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
    const controls = sortByValue(
      this.lines.controls,
      (control) => {
        const raw = control.getRawValue();
        if (column === 'quantity') {
          return Number(raw.quantity) || 0;
        }
        // La colonna si chiama `product`, il controllo sotto `productName`.
        return column === 'product' ? raw.productName : raw[column];
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

  /**
   * «L'operatore ha toccato il numero?» in forma reattiva. Lo stato vero resta
   * `documentNumber.dirty` — qui non se ne tiene una copia, si ascolta: gli
   * eventi del controllo includono `PristineChangeEvent`, quindi il signal si
   * aggiorna anche su `markAsDirty()`, che `valueChanges` non emette.
   */
  private readonly documentNumberPristine = toSignal(
    this.form.controls.documentNumber.events.pipe(
      map(() => this.form.controls.documentNumber.pristine),
    ),
    { initialValue: true },
  );

  protected readonly confirmDialogOpen = signal(false);

  /** Conflitto numero restituito dal server: dialogo «Usa N» / «Annulla». */
  // Avviso «numero già assegnato»: la macchina a stati vive in domain, qui
  // resta solo quale controllo della testata riceve il numero aggiornato.
  // ── Numerazione ───────────────────────────────────────────────────────────
  //
  // Il meccanismo vive in `domain/` (`DocumentNumberingStore`): proposta,
  // scelta della serie, numero imposto. Era copiato in sei maschere, con
  // 15-24 riferimenti ciascuna alle stesse otto voci — e copie così non
  // divergono con un errore, divergono con una sfumatura.

  protected readonly numbering = new DocumentNumberingStore({
    isEdit: () => this.isEditMode(),
    number: () => this.form.controls.documentNumber.value,
    setNumber: (value) => this.form.controls.documentNumber.setValue(value),
    series: () => this.form.controls.series.value,
    setSeries: (value) => this.form.controls.series.setValue(value),
    numberIsDirty: () => !this.documentNumberPristine(),
    markNumberDirty: () => this.form.controls.documentNumber.markAsDirty(),
    markNumberPristine: () => this.form.controls.documentNumber.markAsPristine(),
    // I contatori: il giro — chiamata, `take(1)`, chiusura col ciclo di vita,
    // «riproponi» contro «ricarica l'elenco» — vive nello store comune (E-6).
    // Qui restano le tre letture che cambiano da una maschera all'altra.
    countersSource: {
      service: this.countersService,
      destroyRef: this.destroyRef,
      documentType: () => DocumentType.Transfer,
      locationId: () => this.form.controls.locationId.value || null,
      documentDate: () => this.form.controls.documentDate.value,
    },
    asProgrammatic: (write) => {
      // La proposta iniziale non è una modifica dell'operatore: scriverla non
      // deve accendere il guard di uscita.
      this.suppressDirtyMarking = true;
      try {
        write();
      } finally {
        this.suppressDirtyMarking = false;
      }
    },
  });

  /** Reattivo per costruzione: `isProposal()` legge il signal degli eventi. */
  protected readonly numberIsProposal = computed(() => this.numbering.isProposal());

  /**
   * Chiusura del pannello numerazioni: ricarica l'elenco serie SENZA riproporre
   * serie e numero — la selezione resta quella che era.
   */
  protected onSeriesManagerClosed(): void {
    this.seriesDialogOpen.set(false);
    this.numbering.reloadCounters();
  }

  /**
   * Avviso cronologico (§4): la serie contiene documenti fuori posto. Avviso
   * e non blocco — da lì si salva comunque — e il meccanismo vive in
   * `domain/`, come quello del conflitto sul numero.
   */
  protected readonly chronology = new DocumentChronologyGuard({
    documentType: () => this.documentType,
    series: () => this.form.controls.series.value,
    number: () => this.form.controls.documentNumber.value,
    documentDate: () => this.form.controls.documentDate.value,
    // In modifica il documento non deve risultare fuori ordine con la
    // propria riga vecchia: cambiare numero E data basterebbe.
    excludeId: () => this.editDocumentId(),
  });
  private readonly numberConflictDialog = new DocumentNumberConflictStore();
  /** Precompilato non arrivato: la maschera e' vuota e va detto perche'. */
  protected readonly prefillError = new DocumentPrefillErrorStore();
  protected readonly conflictDialogOpen = this.numberConflictDialog.isOpen;
  protected readonly conflictMessage = this.numberConflictDialog.message;

  /** Tipo documento fisso di questa maschera (per il pannello numerazioni). */
  protected readonly documentType = DocumentType.Transfer;
  /** Pannello «gestisci numerazioni» aperto dall'ingranaggio del campo Serie. */
  protected readonly seriesDialogOpen = signal(false);

  /**
   * Senza il permesso, accanto alla serie resta solo il campo: niente
   * ingranaggio e nessun pannello numerazioni da aprire.
   */
  protected readonly puoConfigurareDocumenti = computed(() =>
    hasTenantPermission(this.authService.currentUser(), TenantPermission.DocumentsConfigure),
  );

  protected acknowledgeConflictNumber(): void {
    this.numbering.acknowledgeConflict(this.numberConflictDialog);
  }

  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
  protected readonly saving = computed(() => this._submitState().status === 'saving');
  protected readonly submitError = computed(() => {
    const state = this._submitState();
    return state.status === 'error' ? state.error : null;
  });

  /**
   * Perché il salvataggio non è partito. Senza questo testo il `markAllAsTouched`
   * + `return` di validateForm() resterebbe muto: l'operatore preme Salva e non
   * succede niente (modello «Ordine cliente»).
   */
  private readonly _formErrorMessage = signal<string | null>(null);
  protected readonly formErrorMessage = this._formErrorMessage.asReadonly();

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
          // La sede di origine la precompila `prefillDefaultLocation` nel
          // costruttore: una regola sola, in `domain/`, per tutte le maschere.
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
        // `locationId` non filtra i risultati: restringe le giacenze mostrate
        // alla sede del movimento, che è l'unica che conta quando si sposta o
        // si corregge merce. Senza, il suggerimento mostrava la disponibilità
        // di un'altra sede o di nessuna.
        const locationId = this.form.controls.locationId.value || undefined;
        return (
          this.productService
            .searchVariantSummaries({
              search: term,
              pageSize: VARIANT_SEARCH_PAGE_SIZE,
              locationId,
            })
            // Senza questo, un errore di rete **spegne la ricerca per sempre**:
            // l'errore chiude il flusso di `toSignal`, e da lì in poi digitare
            // nel nome non mostra più niente — senza un messaggio, senza un
            // modo di accorgersene se non riaprendo il documento.
            .pipe(catchError(() => of([] as readonly VariantSummary[])))
        );
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

  // ── Celle codice (Cod. articolo / SKU / EAN): confronto esatto alla conferma
  //
  // Stesso meccanismo degli altri documenti: il campo NON cerca mentre si
  // digita, confronta col catalogo alla conferma (Tab/Invio). Ogni carattere
  // digitato invalida una scelta rimasta aperta, che si riferiva al valore di
  // prima.

  protected readonly codeLookup = new DocumentCodeLookupStore();
  private readonly codeLookupService = inject(DocumentCodeLookupService);

  protected onLineCodeChange(index: number, field: MovementCodeField, value: string): void {
    this.lines.at(index)?.controls[field].setValue(value);
    this.codeLookup.clear();
    this.markFormDirty();
  }

  protected onLineCodeFocus(index: number, field: MovementCodeField): void {
    this.productSuggest.clear();
    if (this.codeLookup.isOpenOn(index, field)) {
      return;
    }
    this.codeLookup.clear();
  }

  protected onLineCodeBlur(index: number): void {
    if (this.codeLookup.isOpenOnLine(index)) {
      this.codeLookup.clear();
    }
  }

  protected onLineSearchEscape(index: number): void {
    this.codeLookup.clear();
    this.productSuggest.blurLine(index);
  }

  /**
   * Conferma di un codice: confronto esatto col catalogo, e gli esiti sono TRE
   * — una aggancia, più d'una apre la scelta, nessuna lascia il valore scritto
   * e la riga prosegue.
   *
   * `advance` distingue il Tab dall'Invio: «Invio registra e resta».
   */
  protected commitCodeLookup(index: number, field: MovementCodeField, advance = true): void {
    const line = this.lines.at(index);
    if (!line) {
      return;
    }
    if (line.controls.variantId.value) {
      if (advance) {
        this.lineFocus.next(index, field);
      }
      return;
    }
    const code = line.controls[field].value.trim();
    if (!code) {
      this.codeLookup.clear();
      if (advance) {
        this.lineFocus.next(index, field);
      }
      return;
    }
    // `locationId` non filtra i risultati: restringe soltanto le giacenze
    // mostrate alla sede del movimento.
    const locationId = this.form.controls.locationId.value || undefined;
    this.codeLookupService
      .resolve(code, field, { locationId })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((outcome) => {
        if (outcome.kind === 'one') {
          // Il riepilogo arriva già dalla ricerca di conferma: passarlo evita
          // che `onVariantSelect` debba ritrovarlo in liste dove non c'è ancora.
          this.onVariantSelect(index, outcome.variantId, outcome.summary);
          this.codeLookup.clear();
          this.lineFocus.focusField(index, 'quantity');
          return;
        }
        if (outcome.kind === 'many') {
          this.codeLookup.open(index, field, outcome.matches);
          return;
        }
        // Nessuna corrispondenza: il valore resta scritto e la riga prosegue.
        // Non è un errore — può essere un articolo che non esiste ancora.
        this.codeLookup.clear();
        if (advance) {
          this.lineFocus.next(index, field);
        }
      });
  }

  /** La scelta aperta da un codice: la voce presa aggancia la riga. */
  protected onCodeSuggestionPick(index: number, variantId: string): void {
    this.onVariantSelect(index, variantId);
    this.codeLookup.clear();
    this.lineFocus.focusField(index, 'quantity');
  }

  /**
   * Cod. articolo ed EAN di una riga agganciata. **Il documento non li salva**
   * — sono chiavi di ricerca, non dati della riga — quindi su un documento
   * riaperto i controlli sono vuoti e a saperli è il riepilogo della variante.
   *
   * Lo SKU no: quello il documento lo memorizza, e il controllo basta.
   */
  protected lineArticleCode(index: number): string {
    return (
      this.lineVariantSummary(index)?.articleCode ||
      this.lines.at(index)?.controls.articleCode.value ||
      ''
    );
  }

  protected lineBarcode(index: number): string {
    return (
      this.lineVariantSummary(index)?.barcode || this.lines.at(index)?.controls.barcode.value || ''
    );
  }

  private lineVariantSummary(index: number): VariantSummary | null {
    const variantId = this.lines.at(index)?.controls.variantId.value;
    if (!variantId) {
      return null;
    }
    return findVariantSummaryById(variantId, this.pinnedVariants(), this.searchedVariants());
  }

  // ── I codici sulla card mobile ────────────────────────────────────────────
  //
  // ⛔ Qui c'erano `mobileCodeChoice` e `movementSuggestionDetail`: componevano
  // a mano la scelta fra più corrispondenze per l'involucro locale della card.
  // Non servono più — la card comune usa le stesse celle di codice della riga
  // di scrivania, che leggono i suggerimenti da `lineRowView`. Ricomporli qui
  // darebbe due testi diversi per la stessa scelta a seconda del device, e la
  // differenza non la vedrebbe nessun test.

  /**
   * Uscita da un campo codice della card. **Lo sfocamento conferma**, come Tab
   * sul desktop: perdere il fuoco su un telefono non è un caso — lo scorrimento
   * non lo toglie, e quando si perde è perché l'operatore ha toccato un altro
   * campo, gesto deliberato quanto un Tab.
   *
   * ⚠️ **Perché è un solo punto, e ritardato.** Qui si incrociano due
   * meccanismi che, presi separatamente, si pestano: la conferma allo
   * sfocamento e la grazia che lascia arrivare il tocco su una voce della
   * scelta. Toccando una voce, se lo sfocamento partisse per primo e
   * confermasse, partirebbe una **seconda ricerca** il cui esito «più d'una»
   * riaprirebbe la scelta **dopo** che il tocco l'aveva già risolta — un
   * pannello che ricompare da solo su una riga già agganciata.
   *
   * I tre casi sono in ordine, e l'ordine conta.
   */
  protected onMobileCodeBlur(index: number, field: MovementCodeField): void {
    if (this.mobileCodeBlurTimer !== null) {
      clearTimeout(this.mobileCodeBlurTimer);
    }
    this.mobileCodeBlurTimer = setTimeout(() => {
      this.mobileCodeBlurTimer = null;
      // 1. Il tocco su una voce ha già agganciato la riga: non c'è altro da fare.
      if (this.lines.at(index)?.controls.variantId.value) {
        return;
      }
      // 2. Scelta aperta e non presa: si abbandona. Il valore digitato resta
      //    scritto — è la stessa risposta di «nessuna corrispondenza» — e NON
      //    si cerca di nuovo, che è ciò che la farebbe ricomparire.
      if (this.codeLookup.isOpenOn(index, field)) {
        this.codeLookup.clear();
        return;
      }
      // 3. Codice digitato e mai confermato: qui lo sfocamento fa la conferma.
      this.commitCodeLookup(index, field);
    }, MOBILE_PICK_GRACE_MS);
  }

  private mobileCodeBlurTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Il giro del fuoco fra i campi riga ────────────────────────────────────
  //
  // Il meccanismo vive in `domain/`, identico alle altre maschere: qui restano
  // solo le voci che DIFFERISCONO.

  /**
   * ⚠️ Gli identificativi presuppongono che le due viste siano **esclusive**:
   * la card mobile ne ha di propri, e con la tabella viva sotto il breakpoint
   * questa mappa punterebbe a un elemento nascosto — `.focus()` su
   * `display:none` è un no-op silenzioso. Vedi `ViewportService`.
   */
  protected readonly lineFocus = new DocumentLineFocusStore<MovementLineFocusField>({
    fields: ['articleCode', 'sku', 'barcode', 'product', 'quantity', 'serials'],
    elementId: (index, field) =>
      ({
        articleCode: `tr-code-` + index,
        sku: `tr-sku-` + index,
        barcode: `tr-barcode-` + index,
        product: `tr-product-` + index,
        quantity: `tr-qty-` + index,
        serials: `tr-serials-` + index,
      })[field],
    // Su riga già agganciata i tre codici diventano testo: il Tab li salta,
    // come negli altri documenti.
    isFieldEnabled: (index, field) => {
      const identita = field === 'articleCode' || field === 'sku' || field === 'barcode';
      return !(identita && !!this.lines.at(index)?.controls.variantId.value);
    },
    isReadOnly: () => this.formReadOnly(),
    lineCount: () => this.lines.length,
    createLine: () => this.addLine(),
    onRowChange: (_index, then) => {
      setTimeout(then);
    },
    // «Riga vuota» qui è: nessun articolo scelto e niente digitato nei codici
    // né nel nome. La quantità non conta: nasce a 1 da sola.
    isLineEmpty: (index) => {
      const line = this.lines.at(index);
      if (!line) {
        return true;
      }
      const raw = line.getRawValue();
      return (
        !raw.variantId &&
        !raw.articleCode.trim() &&
        !raw.sku.trim() &&
        !raw.barcode.trim() &&
        !raw.productName.trim()
      );
    },
    removeLine: (index) => this.removeLine(index),
  });

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
    this.lines.at(index)?.controls.productName.setValue(value);
    this.productSuggest.focusLine(index);
    this.variantSearchDraft.set(value);
  }

  protected onLineProductFocus(index: number): void {
    this.productSuggest.focusLine(index);
    this.variantSearchDraft.set(this.lines.at(index)?.controls.productName.value ?? '');
  }

  protected onLineProductBlur(index: number): void {
    this.productSuggest.blurLine(index);
  }

  /** Frecce sui suggerimenti del nome: il conteggio lo sa solo la maschera. */
  protected onProductSuggestionNavigate(direction: 'next' | 'prev'): void {
    const lineIndex = this.productSuggest.lineIndex();
    if (lineIndex === null) {
      return;
    }
    this.productSuggest.navigate(direction, this.lineSuggestions(lineIndex).length);
  }

  protected onProductSuggestionPick(index: number, variantId: string): void {
    this.onVariantSelect(index, variantId);
    this.productSuggest.clear();
  }

  /** La lente: la ricerca a tutta pagina, col testo già digitato dentro. */
  protected openLineProductSearch(index: number): void {
    this.productPanelLineIndex = index;
    this.productPanelTerm.set(this.lines.at(index)?.controls.productName.value ?? '');
    this.productPanelSeq.update((seq) => seq + 1);
    this.productPanelOpen.set(true);
  }

  protected onProductPanelSelected(variantId: string): void {
    if (this.productPanelLineIndex >= 0) {
      this.onVariantSelect(this.productPanelLineIndex, variantId);
    }
    this.productPanelOpen.set(false);
  }

  /**
   * Aggancia la riga a una variante. `known` è il riepilogo quando chi chiama
   * ce l'ha già in mano — la conferma di un codice lo riceve dalla ricerca —:
   * senza, si cerca nelle liste, dove una variante appena trovata per codice
   * non c'è ancora e i campi resterebbero vuoti.
   */
  protected onVariantSelect(
    index: number,
    value: string | null,
    known: VariantSummary | null = null,
  ): void {
    const line = this.lines.at(index);
    // Letto PRIMA di scrivere il nuovo: dopo sarebbe uguale a quello richiesto,
    // e il risolutore non distinguerebbe piu' «stesso articolo» da «cambiato».
    const precedente = line.controls.variantId.value || null;
    line.controls.variantId.setValue(value ?? '');
    line.controls.variantId.markAsTouched();
    if (!value) {
      return;
    }
    const summary =
      known ?? findVariantSummaryById(value, this.pinnedVariants(), this.searchedVariants());
    if (!summary) {
      // ⛔ Articolo illeggibile: NON si scrive niente. Una riga a meta' si
      // scopre al salvataggio, una riga invariata si vede subito.
      return;
    }

    // ⭐ Il richiamo articolo passa dal RISOLUTORE COMUNE (`03c`), non da
    // quattro assegnazioni scritte a mano qui.
    //
    // ⛔ Qui c'era `${productName} · ${title}`, e `title` contiene gia' il
    // nome: la riga portava il nome DUE VOLTE — «Maglia · Maglia — M / Rosso»,
    // e su un articolo senza varianti «Cintura · Cintura». Il risolutore
    // scrive `nomeProdotto` e `variantLabel` separati, come devono stare.
    const esito = this.lineArticles.resolveWithSummary({
      articolo: summary,
      policy: POLICY_MOVIMENTO_INTERNO,
      contesto: CONTESTO_MOVIMENTO_INTERNO,
      riga: {
        variantIdPrecedente: precedente,
        rigaPersistita: Boolean(line.controls.id.value),
        // Il Trasferimento non ha sconti: la merce cambia scaffale, non prezzo.
        scontoCorrente: '',
      },
    });
    if (esito.esito !== 'risolto') {
      return;
    }

    const valori = esito.valori;
    line.controls.productName.setValue(String(valori['nomeProdotto'] ?? ''));
    line.controls.variantLabel.setValue(String(valori['variantLabel'] ?? ''));
    line.controls.sku.setValue(String(valori['sku'] ?? ''));
    line.controls.articleCode.setValue(String(valori['articleCode'] ?? ''));
    line.controls.barcode.setValue(String(valori['barcode'] ?? ''));
  }

  /**
   * L'etichetta della variante di una riga, per la colonna che la mostra.
   *
   * ⛔ Non si ricava dal titolo per differenza dal nome: arriva dal
   * risolutore quando l'articolo entra, e dal DOCUMENTO quando la riga si
   * ricarica — cioè fotografata, non ricostruita.
   */
  protected variantLabelOf(index: number): string {
    return this.lines.at(index)?.controls.variantLabel.value ?? '';
  }

  /** Larghezza minima di una colonna: la usa il ridimensionamento comune. */
  protected lineColumnMinWidth(columnId: string): number {
    return this.lineWidths.minWidth(columnId);
  }

  /**
   * Riga completa: quella incompleta prende la classe che la segna, la stessa
   * di ogni maschera.
   *
   * Una riga VUOTA è completa per definizione — non è stata compilata male, non
   * è stata compilata affatto, e le righe vuote in coda si scartano al
   * salvataggio.
   */
  protected lineRowComplete(index: number): boolean {
    const line = this.lines.at(index);
    if (!line) {
      return true;
    }
    const raw = line.getRawValue();
    const vuota =
      !raw.variantId.trim() &&
      !raw.articleCode.trim() &&
      !raw.sku.trim() &&
      !raw.barcode.trim() &&
      !raw.productName.trim();
    return vuota || (Boolean(raw.variantId.trim()) && Number(raw.quantity) > 0);
  }

  /**
   * Il giro del fuoco: la riga comune parla di DIECI campi, questo documento
   * ne ha SEI.
   *
   * ⚠️ Il restringimento è esplicito e non un cast: la riga comune emette
   * anche `unitPrice`, `discount`, `vat` e `unitOfMeasure`, che qui non
   * esistono perché le colonne non ci sono. Forzare il tipo li farebbe
   * arrivare allo store del fuoco, che cercherebbe un campo inesistente e si
   * fermerebbe in silenzio a metà riga.
   */
  private campoDiQuestoDocumento(field: DocumentLineFocusField): MovementLineFocusField | null {
    return (MOVEMENT_LINE_FOCUS_FIELDS as readonly string[]).includes(field)
      ? (field as MovementLineFocusField)
      : null;
  }

  protected onRowFieldKeydown(index: number, event: DocumentLineFieldEvent<KeyboardEvent>): void {
    const field = this.campoDiQuestoDocumento(event.field);
    if (field) {
      this.lineFocus.handleKeydown(index, field, event.value);
    }
  }

  protected onRowFieldAdvance(index: number, field: DocumentLineFocusField): void {
    const proprio = this.campoDiQuestoDocumento(field);
    if (proprio) {
      this.lineFocus.next(index, proprio);
    }
  }

  protected onRowFieldRetreat(index: number, field: DocumentLineFocusField): void {
    const proprio = this.campoDiQuestoDocumento(field);
    if (proprio) {
      this.lineFocus.previous(index, proprio);
    }
  }

  protected onRowLineAdvance(index: number, field: DocumentLineFocusField): void {
    const proprio = this.campoDiQuestoDocumento(field);
    if (proprio) {
      this.lineFocus.rowDown(index, proprio);
    }
  }

  protected onRowLineRetreat(index: number, field: DocumentLineFocusField): void {
    const proprio = this.campoDiQuestoDocumento(field);
    if (proprio) {
      this.lineFocus.rowUp(index, proprio);
    }
  }

  // ── Il ponte verso la RIGA COMUNE ────────────────────────────────────────
  //
  // ⭐ Il Trasferimento non ha più un proprio `<tr>`: usa
  // `app-document-line-row` e `app-document-line-head`, come l'Ordine cliente.
  // Qui sotto c'è tutto ciò che quelle componenti chiedono — e nient'altro.
  //
  // ⛔ Le differenze di questo documento NON stanno nel markup: stanno nel SET
  // DI COLONNE (`stock-movement-line-columns`, sette colonne contro le sedici
  // dell'Ordine cliente). Una colonna in meno non giustifica una riga propria.

  /**
   * ⚠️ Legate una volta sola: passandole come funzioni anonime nel template,
   * l'identità cambierebbe a ogni giro e la riga si riterrebbe sempre nuova.
   */
  protected readonly isLineColumnVisibleFn = (column: DocumentLineColumnId): boolean =>
    this.isLineColumnVisible(column);

  protected readonly lineColumnWidthFn = (column: DocumentLineColumnId): string =>
    this.lineColumnWidth(column);

  protected readonly lineColumnMinWidthFn = (column: DocumentLineColumnId): number =>
    this.lineColumnMinWidth(column);

  /** Il gruppo della riga: i controlli restano quelli di questo form. */
  protected lineGroup(index: number): FormGroup {
    return this.lines.at(index);
  }

  // ── Il ponte verso la CARD COMUNE ────────────────────────────────
  //
  // Sotto la soglia la riga diventa `app-document-line-card`, con la striscia e
  // il corpo comuni: gli stessi gestori della riga di scrivania, lo stesso
  // catalogo colonne. Qui resta solo cosa la card deve MOSTRARE.

  /**
   * Quale card è aperta — una sola.
   *
   * ⭐ Lo stato vive nel DOCUMENTO, non dentro la card: l'involucro locale se
   * lo teneva per sé, e su un movimento da venti righe se ne aprivano venti
   * insieme, che è esattamente ciò che la vista compatta serve a evitare.
   */
  private readonly cardAperte = new DocumentLineCardOpenStore();

  protected isLineCardOpen(index: number): boolean {
    return this.cardAperte.isOpen(index);
  }

  protected toggleLineCard(index: number): void {
    this.cardAperte.toggle(index);
  }

  /** Testata della card (nome, variante, meta, avviso): calcolo comune. */
  protected lineCardHead(index: number): DocumentLineCardHead {
    return documentLineCardHead(this.lineRowView(index), this.lineGroup(index));
  }

  /** L'ordinamento arriva dall'intestazione comune col nome della colonna. */
  protected onRowSortToggled(column: DocumentLineColumnId): void {
    if (this.isLineColumnSortable(column)) {
      this.toggleLineSort(column as TransferLineSortColumn);
    }
  }

  /**
   * Ciò che la riga comune deve MOSTRARE, già calcolato da chi lo possiede.
   *
   * ⭐ È il confine giusto: la riga rende, il documento calcola. Un
   * trasferimento non ha denaro né IVA, quindi quei campi restano vuoti — e
   * restare vuoti non costa niente, perché le colonne non ci sono.
   */
  protected lineRowView(index: number): DocumentLineRowView {
    return {
      ...DOCUMENT_LINE_ROW_VIEW_VUOTA,
      complete: this.lineRowComplete(index),
      linked: Boolean(this.lines.at(index)?.controls.variantId.value),
      linkedArticleCode: this.lineArticleCode(index),
      quantityInvalid: this.lineFieldInvalid(index, 'quantity'),
      productInvalid: this.lineFieldInvalid(index, 'variantId'),
      articleCodeSuggest: {
        items: this.codeLookup.matchesFor(index, 'articleCode'),
        open: this.codeLookup.isOpenOn(index, 'articleCode'),
        activeIndex: this.codeLookup.activeIndex(),
      },
      skuSuggest: {
        items: this.codeLookup.matchesFor(index, 'sku'),
        open: this.codeLookup.isOpenOn(index, 'sku'),
        activeIndex: this.codeLookup.activeIndex(),
      },
      barcodeSuggest: {
        items: this.codeLookup.matchesFor(index, 'barcode'),
        open: this.codeLookup.isOpenOn(index, 'barcode'),
        activeIndex: this.codeLookup.activeIndex(),
      },
      productSuggest: {
        items: this.lineSuggestions(index),
        open: this.lineSuggestionsOpen(index),
        activeIndex: this.productSuggest.activeIndex(),
      },
    };
  }

  /** Il campo dice quale codice è cambiato: la riga non conosce i tre gestori. */
  protected onRowCodeChanged(index: number, event: DocumentLineFieldEvent<string>): void {
    // ⚠️ La riga comune conosce piu' campi di quanti ne abbia questo documento
    // (ha anche sconto, prezzo, costo): qui arrivano solo i tre codici che le
    // colonne del Trasferimento rendono, ma il tipo dell'evento e' quello
    // comune e va ristretto invece che forzato.
    if (event.field === 'articleCode' || event.field === 'sku' || event.field === 'barcode') {
      this.onLineCodeChange(index, event.field, event.value);
    }
  }

  protected onRowSuggestionPicked(index: number, event: DocumentLineSuggestionPick): void {
    if (event.field === 'product') {
      this.onProductSuggestionPick(index, event.variantId);
      return;
    }
    this.onCodeSuggestionPick(index, event.variantId);
  }

  protected onRowSuggestionNavigated(
    event: DocumentLineFieldEvent<DocumentLineSuggestionDirection>,
  ): void {
    if (event.field === 'product') {
      this.onProductSuggestionNavigate(event.value);
      return;
    }
    this.codeLookup.navigate(event.value);
  }

  /**
   * Il campo codice che arriva dalla riga comune, ristretto a quelli che questo
   * documento ha davvero.
   *
   * ⚠️ La riga comune ne conosce QUATTRO (c'è anche il codice fornitore); qui
   * ne esistono tre: un movimento interno non ha fornitore. Il restringimento è esplicito e non un cast: un campo che non
   * esiste cercherebbe un controllo assente e fermerebbe il giro del fuoco.
   */
  private codiceDiQuestoDocumento(field: DocumentLineCodeField): MovementCodeField | null {
    // ⭐ Nessun cast: il confronto RESTRINGE gia' il tipo, e il compilatore lo
    // sa. Un `as` qui sarebbe rumore — e il giorno in cui l'elenco cambiasse,
    // zittirebbe proprio l'errore che serve vedere.
    return field === 'articleCode' || field === 'sku' || field === 'barcode' ? field : null;
  }

  protected onRowCodeFocused(index: number, field: DocumentLineCodeField): void {
    const proprio = this.codiceDiQuestoDocumento(field);
    if (proprio) {
      this.onLineCodeFocus(index, proprio);
    }
  }

  protected onRowCodeCommitted(
    index: number,
    event: { field: DocumentLineCodeField; advance: boolean },
  ): void {
    const proprio = this.codiceDiQuestoDocumento(event.field);
    if (proprio) {
      this.commitCodeLookup(index, proprio, event.advance);
    }
  }

  protected addLine(): void {
    if (this.formReadOnly()) {
      return;
    }
    this.lines.push(this.createLine());
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
    name: 'variantId' | 'productName' | 'quantity',
  ): boolean {
    const control = this.lines.at(index).controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected saveDraft(): void {
    this.chronology.run(() => void this.persist());
  }

  protected requestConfirm(): void {
    if (!this.validateForm()) {
      return;
    }
    this.confirmDialogOpen.set(true);
  }

  /**
   * Il controllo cronologico (§4) sta DOPO la conferma dell'operazione, non
   * prima: sono due domande diverse — quella chiede se muovere la merce, questo
   * segnala com'è messa la numerazione — e metterlo davanti farebbe rispondere
   * «sì» due volte prima di aver deciso la cosa principale.
   */
  protected confirmAndSave(): void {
    this.confirmDialogOpen.set(false);
    this.chronology.run(() => void this.persist());
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

  private validateForm(): boolean {
    if (this.form.invalid || !this.hasStockLine()) {
      this.form.markAllAsTouched();
      this._formErrorMessage.set(this.describeInvalidForm());
      return false;
    }
    this._formErrorMessage.set(null);
    return true;
  }

  /**
   * Il motivo del blocco, detto per esteso: «Controlla i campi» non dice a chi
   * guarda dove guardare. I motivi si sommano, così una sola lettura basta.
   */
  private describeInvalidForm(): string {
    const problems: string[] = [];
    if (this.form.hasError('sameLocation')) {
      problems.push('origine e destinazione devono essere due location diverse');
    } else if (
      this.form.controls.locationId.invalid ||
      this.form.controls.targetLocationId.invalid
    ) {
      problems.push('scegli la location di origine e quella di destinazione');
    }
    if (this.form.controls.documentDate.invalid) {
      problems.push('indica la data del documento');
    }
    if (this.lines.invalid) {
      problems.push(
        'completa le righe evidenziate: variante, descrizione e quantità sono obbligatorie',
      );
    } else if (!this.hasStockLine()) {
      // Righe formalmente valide ma nessuna che muova giacenza (es. righe
      // descrittive caricate da un documento esistente).
      problems.push('aggiungi almeno una riga con una variante e quantità maggiore di zero');
    }
    if (problems.length === 0) {
      return 'Non è possibile salvare il trasferimento: controlla i campi evidenziati.';
    }
    return `Non è possibile salvare il trasferimento: ${problems.join('; ')}.`;
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
      number: this.numbering.imposedNumber(),
      series: this.numbering.chosenSeries(),
      locationId: raw.locationId,
      targetLocationId: raw.targetLocationId,
      // Documento della controparte: l'endpoint dedicato riscrive sempre
      // i tre campi, quindi vanno inviati anche vuoti — `null` sul tipo
      // dice «nessuno», non «non toccare».
      notes: raw.notes.trim() || undefined,
      internalComment: raw.internalComment.trim() || undefined,
      lines: raw.lines
        .filter((line) => line.variantId || line.productName.trim())
        .map((line) => ({
          id: line.id || undefined,
          variantId: line.variantId || undefined,
          sku: line.sku.trim() || undefined,
          description: line.productName.trim() || 'Riga trasferimento',
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
      number: this.numbering.imposedNumber(),
      locationId: raw.locationId,
      targetLocationId: raw.targetLocationId,
      currency: this.currency,
      // Documento della controparte: il tipo viaggia come `null` quando non
      // c'è, così il PATCH di una bozza lo toglie invece di lasciarlo com'era.
      notes: raw.notes.trim() || undefined,
      internalComment: raw.internalComment.trim() || undefined,
      lines: raw.lines
        .filter((line) => line.variantId || line.productName.trim())
        .map((line) => ({
          // Come nel salvataggio dedicato: l'id della riga già salvata torna
          // indietro, così il PATCH la aggiorna invece di ricrearla.
          id: line.id || undefined,
          variantId: line.variantId || undefined,
          sku: line.sku.trim() || undefined,
          description: line.productName.trim() || 'Riga trasferimento',
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
        notes: doc.notes ?? '',
        internalComment: doc.internalComment ?? '',
      });
      this.lines.clear();
      for (const line of doc.lines ?? []) {
        // Una riga sola la sa costruire, ed è `createLine`: qui c'era una
        // seconda copia dei controlli, che al primo campo aggiunto è rimasta
        // indietro. Si costruisce quella e le si mettono dentro i valori.
        //
        // I tre codici non arrivano dal documento — non sono salvati, sono
        // campi di ricerca — e restano vuoti nel controllo: a mostrarli su una
        // riga già agganciata è il riepilogo della variante.
        const group = this.createLine();
        group.patchValue({
          // Id riga esistente: preservato (mai esposto in UI) per consentire al
          // salvataggio dedicato di aggiornare il movimento collegato invece di
          // duplicarlo.
          id: line.id ?? null,
          variantId: line.variantId ?? '',
          sku: line.sku ?? '',
          // Il documento memorizza il nome nel proprio campo `description`: la
          // riga lo rilegge nel suo `productName`.
          productName: line.description,
          // L'etichetta FOTOGRAFATA sul documento, non quella dell'anagrafica
          // di oggi: una riga di marzo continua a dire quello che diceva.
          variantLabel: line.variantLabel ?? '',
          quantity: line.quantity,
          serialNumbersText: (line.serialNumbers ?? []).join(', '),
        });
        if (!line.loadsStock) {
          // Riga che non muove giacenza: la variante non è obbligatoria.
          group.controls.variantId.clearValidators();
          group.controls.variantId.updateValueAndValidity({ emitEvent: false });
        }
        this.lines.push(group);
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
      // Le tre chiavi d'identità. Non sono campi da compilare: si digitano per
      // TROVARE l'articolo, e restano scritte se non corrisponde niente. Non
      // vengono salvate — il documento memorizza la variante e lo SKU.
      articleCode: this.fb.control(''),
      sku: this.fb.control(''),
      barcode: this.fb.control(''),
      // ⭐ Il NOME dell'articolo, col nome che gli danno la riga e la card
      // comuni: `productName`. Qui si chiamava `description`, e da quando la
      // riga di scrivania è quella condivisa il campo restava VUOTO a schermo:
      // la riga legge `productName` e qui non c'era. La descrizione di riga è
      // un'altra cosa, e questo documento non ne ha la colonna.
      productName: this.fb.control('', { validators: [Validators.required] }),
      // L'etichetta della VARIANTE, nella sua colonna: «M / Rosso».
      //
      // ⛔ Non si SALVA da qui: il server la fotografa dalle opzioni della
      // variante, con la regola dello snapshot e una guardia che lo verifica
      // (`document-line-variant-snapshot.util`). Mandarla anche dal client
      // creerebbe una seconda fonte per lo stesso dato — che e' il difetto
      // che questo lavoro sta chiudendo, non uno da aggiungere.
      variantLabel: this.fb.control(''),
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
      return !line.controls.variantId.value.trim() && !line.controls.productName.value.trim();
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
