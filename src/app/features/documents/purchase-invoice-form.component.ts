import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, startWith, switchMap, take } from 'rxjs';

import { NoImplicitSubmitDirective } from '@shared/directives/no-implicit-submit.directive';
import { NavigationHistoryService } from '@core/services/navigation-history.service';
import { ViewportService } from '@core/services/viewport.service';
import type { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import { AuthService } from '@core/auth';
import { hasTenantPermission } from '@core/permissions/user-permissions.util';
import { TenantPermission } from '@core/models/tenant-permission.model';
import type { AppError } from '@core/models/app-error.model';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import { documentNumberConflictOf } from '@core/models/document-number-conflict.util';
import { DocumentNumberConflictStore } from '@domain/documents/state/document-number-conflict.store';
import { DocumentChronologyGuard } from '@domain/documents/state/document-chronology-guard';
import { DocumentActionsComponent } from '@domain/documents/components/document-actions/document-actions.component';
import { DocumentPageStateComponent } from '@domain/documents/components/document-page-state/document-page-state.component';
import { DocumentTotalsComponent } from '@domain/documents/components/document-totals/document-totals.component';
import type { DocumentTotalRow } from '@domain/documents/components/document-totals/document-totals.model';
import { DocumentPrefillErrorComponent } from '@domain/documents/components/document-prefill-error/document-prefill-error.component';
import { DocumentNotesComponent } from '@domain/documents/components/document-notes/document-notes.component';
import { DocumentChronologyWarningDialogComponent } from '@domain/documents/components/document-chronology-warning-dialog/document-chronology-warning-dialog.component';
import { DocumentPrefillErrorStore } from '@domain/documents/state/document-prefill-error.store';
import { mapHttpErrorToAppError } from '@core/interceptors/http-error.mapper';
import type { Money } from '@core/models/common.model';
import { DocumentType } from '@core/models/document.model';
import type { DocumentTypeSetting } from '@core/models/document.model';
import type { DocumentRecord, GoodsReceiptVatBreakdownEntry } from '@core/models/document.model';
import type { PaymentOption } from '@core/models/payment-option.model';
import type { Supplier } from '@core/models/supplier.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { ToastService } from '@core/services/toast.service';
import type { VatCode } from '@core/models/vat-code.model';
import { isPurchaseVatCode } from '@core/models/vat-code.model';
import { VatCodeService } from '@core/services/vat-code.service';
import { DEFAULT_CURRENCY, formatMoney } from '@core/utils/money.util';
import { formatDate } from '@core/utils/date.util';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import { bindBreadcrumbEntityLabel } from '@core/services/breadcrumb-label.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DocumentNumberFieldComponent } from '@shared/components/document-number-field/document-number-field.component';
import { DocumentCounterpartyRefComponent } from '@domain/documents/components/document-counterparty-ref/document-counterparty-ref.component';
import { DocumentHeaderComponent } from '@domain/documents/components/document-header/document-header.component';
import { DocumentHeaderFieldComponent } from '@domain/documents/components/document-header/document-header-field.component';
import { DocumentMobilePanelComponent } from '@domain/documents/components/document-mobile-panel/document-mobile-panel.component';
import { DocumentSeriesManagerDialogComponent } from '@domain/documents/components/document-series-manager-dialog/document-series-manager-dialog.component';
import { MoneyInputComponent } from '@shared/components/money-input/money-input.component';
import { DocumentLineSelectCellComponent } from '@domain/documents/components/document-line-select-cell/document-line-select-cell.component';
import {
  vatCodeSelectOption,
  vatOptionsIncludingSelected,
} from '@domain/documents/utils/document-vat-options.util';
import { vatCodeIdForLinePayload } from '@domain/documents/utils/document-line-vat-payload.util';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import type { LinkableGoodsReceipt } from '@domain/documents/models/goods-receipt-causal.model';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentNumberingStore } from '@domain/documents/state/document-numbering.store';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { ExternalDocumentTypeService } from '@domain/documents/services/external-document-type.service';
import { DocumentSettingsService } from './services/document-settings.service';
import { isPrintableDocumentType } from './models/document-print.util';
import { DocumentPrintActionsComponent } from '@domain/documents/components/document-print-actions/document-print-actions.component';
import type {
  PurchaseInvoiceInstallmentBody,
  PurchaseInvoiceLineBody,
} from '@domain/documents/services/document-api.mapper';

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

// ⛔ Qui c'era `IncludedReceiptRow`: la forma dell'arrivo incluso, che serviva
// alla tabella «Arrivi merce inclusi». Quella tabella non c'è più — gli arrivi
// si vedono dalle righe che hanno generato, e si scollegano cancellandole.

/**
 * ⭐ **Riga economica della registrazione: UNA lista, tutte modificabili.**
 *
 * ⛔ **Fino al 25/08/2026 erano DUE.** Sopra, le righe generate dagli arrivi
 * inclusi — raggruppate per aliquota, in sola lettura, ricalcolate dal server a
 * ogni salvataggio. Sotto, le «righe manuali», le uniche scrivibili.
 *
 * ⚠️ **Il difetto non era estetico.** Una fattura fornitore quasi mai coincide
 * al centesimo con la somma degli arrivi — arrotondamenti, spese, un abbuono —
 * e la parte non correggibile era proprio quella. Chi doveva registrare
 * l'importo vero non aveva dove scriverlo.
 *
 * ⭐ Ora includere un arrivo **MATERIALIZZA** le sue righe una volta sola: da lì
 * sono righe del documento come tutte le altre, e `linkedGoodsReceiptId` è
 * l'unico segno di dove sono nate.
 */
type EconomicLineForm = FormGroup<{
  /** L'id della riga già salvata. Stringa vuota = riga nuova. */
  id: FormControl<string>;
  description: FormControl<string>;
  /**
   * Importo canonico in unità minori, coda decimale inclusa. `null` = non
   * scritto.
   *
   * ⛔ Era `FormControl<string>` (`netText`), col denaro tenuto come TESTO e
   * convertito a mano in due direzioni. Costava un difetto misurabile: una riga
   * salvata a 0,00 si rileggeva come stringa VUOTA — `moneyToInputText`
   * restituiva `''` per lo zero — e al salvataggio la maschera la rifiutava
   * come «importo netto non valido». Una registrazione con un abbuono a zero
   * **non si poteva più risalvare**.
   */
  netMinor: FormControl<number | null>;
  /** Il Codice IVA scelto. Stringa vuota = nessuno (righe storiche). */
  vatCodeId: FormControl<string>;
  /**
   * L'aliquota della riga, non più digitata: la porta il Codice IVA scelto, e
   * su una riga storica senza codice resta quella dello snapshot persistito.
   */
  ratePercent: FormControl<number | null>;
  vatMinor: FormControl<number | null>;
  /** L'arrivo merce da cui la riga è nata. Vuoto = voce libera. */
  linkedGoodsReceiptId: FormControl<string>;
}>;

type InstallmentForm = FormGroup<{
  dueDate: FormControl<string>;
  /** Importo canonico in unità minori. `null` = non scritto. */
  amountMinor: FormControl<number | null>;
  settled: FormControl<boolean>;
  settledAt: FormControl<string>;
}>;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** dd/MM/yyyy per i riferimenti automatici (stesso formato del backend). */
const SHORT_DATE_FORMAT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function formatShortDate(iso: string): string {
  return SHORT_DATE_FORMAT.format(new Date(iso));
}

// ⛔ Qui c'era `parseRatePercent`: l'aliquota letta da testo utente. Tolta il
// 25/08/2026 — l'aliquota non si digita piu', la porta il Codice IVA scelto
// dall'elenco. Era l'ultimo pezzo di grammatica fiscale scritto a mano in
// questa maschera.

/**
 * Registrazione fattura fornitore (prompt §5-7): documento contabile che
 * collega uno o più Arrivi merce alla fattura ricevuta. Le righe sono UNA lista
 * sola e tutte modificabili: includere un arrivo le materializza una volta;
 * il pagamento è gestito a scadenze con stato saldato. NON movimenta mai il
 * magazzino: le giacenze restano quelle caricate dagli Arrivi merce.
 */
@Component({
  selector: 'app-purchase-invoice-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NoImplicitSubmitDirective,
    NgTemplateOutlet,
    ReactiveFormsModule,
    BackButtonComponent,
    BadgeComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    DateInputComponent,
    DocumentCounterpartyRefComponent,
    DocumentHeaderComponent,
    DocumentHeaderFieldComponent,
    DocumentMobilePanelComponent,
    DocumentNumberFieldComponent,
    DocumentPrintActionsComponent,
    DocumentSeriesManagerDialogComponent,
    DocumentChronologyWarningDialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SelectMenuComponent,
    SlidePanelComponent,
    TableSkeletonComponent,
    DocumentActionsComponent,
    DocumentNotesComponent,
    DocumentPrefillErrorComponent,
    DocumentTotalsComponent,
    DocumentPageStateComponent,
    MoneyInputComponent,
    DocumentLineSelectCellComponent,
  ],
  templateUrl: './purchase-invoice-form.component.html',
  styleUrl: './purchase-invoice-form.component.scss',
})
export class PurchaseInvoiceFormComponent implements CanComponentDeactivate {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly documentService = inject(DocumentService);
  private readonly countersService = inject(DocumentCountersService);
  private readonly documentSettingsService = inject(DocumentSettingsService);
  private readonly supplierService = inject(SupplierService);
  private readonly externalDocumentTypeService = inject(ExternalDocumentTypeService);
  private readonly paymentOptionsService = inject(PaymentOptionsService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);
  private readonly navHistory = inject(NavigationHistoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly viewport = inject(ViewportService);

  constructor() {
    // Nuova registrazione: il numero proposto è il primo libero della
    // serie predefinita (in modifica resta quello già assegnato).
    afterNextRender(() => {
      this.refreshDocumentNumberProposal();
      this.prefillFromDuplicateIfRequested();
    });

    // ⭐ **Una riga pronta all'apertura**, come su ogni altra maschera
    // documentale: chi apre un documento nuovo trova dove scrivere, senza
    // dover prima premere «Aggiungi riga».
    //
    // ⚠️ In modifica no: le righe le porta il documento, e una riga vuota in
    // più al caricamento marcherebbe il form come «da salvare» appena aperto.
    if (!this.isEditMode()) {
      this.suppressDirtyMarking = true;
      try {
        this.lines.push(this.buildLine());
      } finally {
        this.suppressDirtyMarking = false;
      }
    }

    // Breadcrumb: numero del documento al posto del generico «Dettaglio».
    bindBreadcrumbEntityLabel(() => ({
      id: this.editDocumentId() || null,
      label: this.loadedReference(),
    }));

    // Cambio data: il numero proposto dipende dalla data (§2), quindi la
    // testata deve rifare l'anteprima — o mostrerebbe il primo libero di OGGI
    // mentre il salvataggio assegna quello della data scelta.
    // Qui la data che numera è `documentDate` (la data della fattura), non
    // `registrationDate`: è quella che il server passa a `resolveDocumentNumber`.
    this.form.controls.documentDate.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshDocumentNumberProposal());

    /**
     * Il Codice IVA predefinito d'acquisto sulle righe NUOVE che non ne hanno.
     *
     * Serve un effetto e non basta `buildLine`: la prima riga nasce nel
     * costruttore, quando l'elenco dei codici non è ancora arrivato dalla rete.
     * Scatta una volta sola, quando il predefinito diventa noto.
     *
     * ⛔ **Solo le righe NUOVE**, e la distinzione è la più delicata di questo
     * passo: le righe già salvate hanno tutte `vat_code_id = NULL` — sono nate
     * prima che questa maschera sapesse cosa fosse un Codice IVA. Assegnargliene
     * uno che nessuno ha scelto riscriverebbe l'aliquota storica di una fattura
     * di marzo al primo Salva.
     *
     * ⚠️ `emitEvent: false` perché una proposta non è una modifica: senza, un
     * documento appena aperto risulterebbe «da salvare».
     */
    effect(() => {
      const predefinito = this.defaultVatCodeId();
      if (!predefinito) {
        return;
      }
      untracked(() => {
        for (const line of this.lines.controls) {
          if (line.controls.id.value === '' && !line.controls.vatCodeId.value) {
            line.controls.vatCodeId.setValue(predefinito, { emitEvent: false });
            const vatCode = this.vatCodesById().get(predefinito);
            if (vatCode) {
              line.controls.ratePercent.setValue(vatCode.ratePercent, { emitEvent: false });
            }
          }
        }
      });
    });

    // Ogni modifica utente al form marca la registrazione come «da salvare».
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.markFormDirty();
    });
  }

  private readonly vatCodeService = inject(VatCodeService);

  protected readonly listPath = '/app/documents/registrazioni-fatture-fornitori';
  protected readonly currency = DEFAULT_CURRENCY;
  protected readonly formatMoney = formatMoney;
  protected readonly formatDate = formatDate;

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly editDocumentId = computed(() => this.paramMap().get('id'));
  protected readonly isEditMode = computed(() => Boolean(this.editDocumentId()));

  protected readonly pageTitle = computed(() =>
    this.isEditMode()
      ? 'Modifica registrazione fattura fornitore'
      : 'Registrazione fattura fornitore',
  );

  readonly form = this.fb.group({
    supplierId: this.fb.control('', { validators: [Validators.required] }),
    /** Data documento: la data della fattura ricevuta dal fornitore. */
    documentDate: this.fb.control(todayIsoDate(), { validators: [Validators.required] }),
    externalDocNumber: this.fb.control(''),
    /**
     * Tipo del documento della controparte. Qui la coppia numero+data ha nomi
     * propri («N. fattura», «Data fattura») e vive da sempre su
     * `externalDocNumber` + `documentDate`: il tipo e' l'unico pezzo che
     * mancava, e li raggiunge senza spostarne la semantica.
     */
    /** Data registrazione interna: default oggi, modificabile. */
    registrationDate: this.fb.control(todayIsoDate(), { validators: [Validators.required] }),
    /** Numero interno: proposto dal progressivo di serie, editabile. */
    documentNumber: this.fb.control<number | null>(null),
    series: this.fb.control(''),
    internalComment: this.fb.control(''),
    paymentMethod: this.fb.control(''),
    notes: this.fb.control(''),
    recipient: this.fb.group({
      name: this.fb.control(''),
      address: this.fb.control(''),
      zip: this.fb.control(''),
      city: this.fb.control(''),
      province: this.fb.control(''),
      country: this.fb.control(''),
      fiscalCode: this.fb.control(''),
      vatNumber: this.fb.control(''),
    }),
    lines: this.fb.array<EconomicLineForm>([]),
    installments: this.fb.array<InstallmentForm>([]),
  });

  /** Tick reattivo su ogni modifica del form (totali e opzioni derivate). */
  private readonly formChanges = toSignal(this.form.valueChanges, { initialValue: null });

  protected get lines(): FormArray<EconomicLineForm> {
    return this.form.controls.lines;
  }

  protected get installments(): FormArray<InstallmentForm> {
    return this.form.controls.installments;
  }

  private readonly loadedDocument = signal<DocumentRecord | null>(null);
  protected readonly loadedReference = computed(() => this.loadedDocument()?.reference ?? null);
  protected readonly loadedDocumentDate = computed(
    () => this.loadedDocument()?.documentDate ?? null,
  );

  /**
   * Comandi di stampa: solo su un documento già salvato. Il tipo è fisso —
   * questa maschera gestisce solo la registrazione fattura fornitore — e sta
   * fra i tipi stampabili.
   */
  protected readonly canExportPdf = computed(
    () => Boolean(this.editDocumentId()) && isPrintableDocumentType(this.documentType),
  );

  /** Lo scarico PDF è fallito: l'errore entra nella fascia della maschera. */
  protected onPrintFailed(err: unknown): void {
    this._submitState.set({ status: 'error', error: this.toAppError(err) });
  }

  /**
   * Etichetta del tipo fotografata sul documento. Serve alla tendina quando il
   * tipo e' stato eliminato: senza, riaprendo una vecchia registrazione il
   * campo apparirebbe vuoto e al salvataggio successivo la dicitura sparirebbe
   * davvero. La scrive `applyDocumentToForm`, quindi vale anche per il duplica.
   */

  // ── Numero interno (numerazione VestiFlow) ─────────────────────────────

  /**
   * Serie configurate per la Registrazione fattura. Oggi il tipo documento
   * espone una sola serie predefinita: il campo resta una label statica finché
   * non se ne configurano altre.
   */
  private readonly documentSettings = toSignal(
    this.documentSettingsService.getSettings().pipe(catchError(() => of([]))),
    { initialValue: [] as readonly DocumentTypeSetting[] },
  );

  private readonly purchaseInvoiceSetting = computed(() =>
    this.documentSettings().find((setting) => setting.type === DocumentType.SupplierInvoice),
  );

  /**
   * «L'operatore ha toccato il numero?» in forma reattiva. Lo stato vero è
   * `documentNumber.dirty` — qui non se ne tiene una copia, si ascolta: gli
   * eventi del controllo includono `PristineChangeEvent`, quindi il signal si
   * aggiorna DOPO il `markAsDirty()`, cosa che un `computed` appeso a
   * `valueChanges` non farebbe (l'emissione precede la marcatura).
   */
  private readonly documentNumberPristine = toSignal(
    this.form.controls.documentNumber.events.pipe(
      map(() => this.form.controls.documentNumber.pristine),
    ),
    { initialValue: true },
  );

  /**
   * Il numero in testata è una PROPOSTA — il primo libero, che se lo prende
   * chi salva per primo — finché il documento è nuovo e nessuno l'ha digitato.
   * Su un documento già salvato il numero è assegnato, e appena l'operatore lo
   * scrive diventa una sua scelta: in entrambi i casi non è più una proposta.
   *
   * Reattivo per costruzione: `isProposal()` interroga `numberIsDirty`, che qui
   * legge il signal degli eventi. Era questa maschera ad avere il meccanismo
   * giusto; dal 13/08/2026 ce l'hanno tutte.
   */
  protected readonly documentNumberIsProposal = computed(() => this.numbering.isProposal());

  /** Tipo documento fisso di questa maschera (per il pannello numerazioni). */
  protected readonly documentType = DocumentType.SupplierInvoice;
  /** Pannello «gestisci numerazioni» aperto dall'ingranaggio del campo Serie. */
  protected readonly seriesDialogOpen = signal(false);

  /** Conflitto sul numero restituito dal server: dialogo «Usa N» / «Annulla». */
  // Avviso «numero già assegnato»: la macchina a stati vive in domain, qui
  // resta solo quale controllo della testata riceve il numero aggiornato.
  // ── Numerazione ───────────────────────────────────────────────────────────
  //
  // Il meccanismo vive in `domain/` (`DocumentNumberingStore`): proposta,
  // scelta della serie, numero imposto. Era copiato in sei maschere.

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
      documentType: () => DocumentType.SupplierInvoice,
      // La Fattura acquisto non ha sede in testata: valgono i contatori
      // senza sede.
      locationId: () => null,
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

  /**
   * Senza il permesso, accanto alla serie resta solo il campo: niente
   * ingranaggio e nessun pannello numerazioni da aprire.
   */
  protected readonly puoConfigurareDocumenti = computed(() =>
    hasTenantPermission(this.authService.currentUser(), TenantPermission.DocumentsConfigure),
  );

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
    documentType: () => DocumentType.SupplierInvoice,
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

  protected readonly includePanelOpen = signal(false);
  protected readonly linkableReceipts = signal<readonly LinkableGoodsReceipt[]>([]);
  protected readonly linkableLoading = signal(false);
  protected readonly linkableError = signal<AppError | null>(null);
  protected readonly linkableSelection = signal<ReadonlySet<string>>(new Set());

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

  private readonly suppliers = toSignal(
    this.supplierService.getSuppliers().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly supplierOptions = computed<readonly SelectMenuOption[]>(() =>
    this.suppliers().map((supplier) => ({ value: supplier.id, label: supplier.name })),
  );

  /** Voci "Modalità di pagamento" da Impostazioni → Pagamenti. */
  private readonly paymentOptions = toSignal(
    this.paymentOptionsService.list('method').pipe(catchError(() => of([] as PaymentOption[]))),
    { initialValue: [] as readonly PaymentOption[] },
  );

  protected readonly paymentMethodOptions = computed<readonly SelectMenuOption[]>(() => {
    this.formChanges();
    const current = this.form.controls.paymentMethod.value.trim();
    const names = this.paymentOptions()
      .filter((option) => option.isActive)
      .map((option) => option.name);
    const options = names.map((name): SelectMenuOption => ({ value: name, label: name }));
    // Valore storico non più in elenco: resta selezionabile (snapshot).
    if (current && !names.includes(current)) {
      options.unshift({ value: current, label: current });
    }
    return options;
  });

  /** "Mostra avviso" (anagrafica fornitore): banner alla selezione. */
  protected readonly supplierDocumentAlert = computed(() => {
    const supplierId = this.selectedSupplierId();
    if (!supplierId) {
      return '';
    }
    const supplier = this.suppliers().find((entry) => entry.id === supplierId);
    return supplier?.documentCreationAlert?.trim() ?? '';
  });

  private readonly selectedSupplierId = signal('');

  /** Ultima nota anagrafica inserita in automatico nelle note documento. */
  private lastAutoInsertedNote = '';

  // ── Testata: quale veste è viva ────────────────────────────────────────────
  //
  // La griglia e i pannelli non convivono più nel DOM: li sceglie il viewport,
  // e la testata comune (`app-document-header`) legge lo STESSO segnale — la
  // soglia resta una sola. Qui serve perché due cose restano della maschera: il
  // secondo pannello (la testata comune ne rende uno) e la veste del documento
  // della controparte, che su scrivania è la fascia secondaria e su mobile una
  // sezione del pannello.
  protected readonly compactView = this.viewport.compact;

  // ── Testata mobile (m-ref): riepiloghi display-only dei pannelli ────────────
  // Solo concatenazioni di valori già nel form: nessuna logica né validazione.

  /** Titolo del pannello fornitore: il nome scelto, o l'invito a sceglierlo. */
  protected readonly supplierPanelTitle = computed(() => {
    const supplierId = this.selectedSupplierId();
    const name = this.suppliers().find((entry) => entry.id === supplierId)?.name;
    return name ?? 'Fornitore da selezionare';
  });

  /** Riepilogo sotto il titolo: data e numero della fattura ricevuta. */
  protected readonly supplierPanelSummaryParts = computed(() => {
    this.formChanges();
    const raw = this.form.getRawValue();
    const externalNumber = raw.externalDocNumber.trim();
    return [
      raw.documentDate ? `Fattura del ${formatDate(raw.documentDate)}` : 'Data fattura da indicare',
      externalNumber ? `N. ${externalNumber}` : 'N. fattura da indicare',
    ];
  });

  /** Stato del pannello: il fornitore è il dato che sblocca gli arrivi. */
  protected readonly supplierPanelReady = computed(() => Boolean(this.selectedSupplierId()));
  protected readonly supplierPanelStatus = computed(() =>
    this.supplierPanelReady()
      ? 'Fornitore selezionato'
      : 'Seleziona il fornitore per includere gli arrivi merce',
  );

  /** Riepilogo del pannello registrazione: data interna, numero, pagamento. */
  protected readonly registrationPanelSummaryParts = computed(() => {
    this.formChanges();
    const raw = this.form.getRawValue();
    return [
      raw.registrationDate
        ? `Registrata il ${formatDate(raw.registrationDate)}`
        : 'Data registrazione da indicare',
      raw.documentNumber != null ? `N. ${raw.documentNumber}` : 'Numero da assegnare',
      raw.paymentMethod.trim() || 'Pagamento non indicato',
    ];
  });

  // ── Righe economiche: totali e legame con gli arrivi ────────────────────────

  /**
   * ⭐ **Gli arrivi collegati si leggono DALLE RIGHE.**
   *
   * ⛔ Qui c'era un signal `includedReceipts` tenuto a parte: una seconda verità
   * sullo stesso fatto. Si potevano cancellare tutte le righe di un arrivo
   * lasciandolo agganciato, e il documento diceva due cose diverse.
   */
  protected readonly linkedReceiptIds = computed<ReadonlySet<string>>(() => {
    this.formChanges();
    const ids = new Set<string>();
    for (const line of this.form.getRawValue().lines) {
      if (line.linkedGoodsReceiptId) {
        ids.add(line.linkedGoodsReceiptId);
      }
    }
    return ids;
  });

  /** Importi netti/IVA delle righe (reattivi sul form). */
  private readonly linesTotals = computed(() => {
    this.formChanges();
    let net = 0;
    let vat = 0;
    for (const line of this.form.getRawValue().lines) {
      net += line.netMinor ?? 0;
      vat += line.vatMinor ?? 0;
    }
    return { net, vat };
  });

  // ── Totali (sempre visibili in fondo): Tot. netto, IVA, Totale ─────────────

  protected readonly totalNet = computed<Money>(() => ({
    amountMinor: this.linesTotals().net,
    currencyCode: this.currency,
  }));

  protected readonly totalVat = computed<Money>(() => ({
    amountMinor: this.linesTotals().vat,
    currencyCode: this.currency,
  }));

  protected readonly totalGross = computed<Money>(() => ({
    amountMinor: this.totalNet().amountMinor + this.totalVat().amountMinor,
    currencyCode: this.currency,
  }));

  /**
   * Le righe della banda totali, per la griglia comune.
   *
   * ⭐ Questa maschera ha righe ECONOMICHE — nessun articolo, nessuna variante,
   * nessun magazzino — e i suoi totali sono comunque tre righe piane. E' la
   * prova che la griglia comune non e' «la griglia dei documenti con articoli»:
   * non sa che documento sta mostrando, e non deve saperlo.
   */
  protected readonly totalsRows = computed<readonly DocumentTotalRow[]>(() => [
    { key: 'net', label: 'Tot. netto', value: this.totalNet() },
    { key: 'vat', label: 'IVA', value: this.totalVat() },
    { key: 'total', label: 'Totale documento', value: this.totalGross(), kind: 'total' as const },
  ]);

  /** Totale scadenze saldate ("Saldato"). */
  protected readonly settledTotal = computed<Money>(() => {
    this.formChanges();
    const amountMinor = this.form
      .getRawValue()
      .installments.filter((installment) => installment.settled)
      .reduce((sum, installment) => sum + (installment.amountMinor ?? 0), 0);
    return { amountMinor, currencyCode: this.currency };
  });

  /** Residuo "Da saldare" = totale registrazione - scadenze saldate. */
  protected readonly outstandingTotal = computed<Money>(() => ({
    amountMinor: Math.max(0, this.totalGross().amountMinor - this.settledTotal().amountMinor),
    currencyCode: this.currency,
  }));

  private readonly loadTick = signal(0);
  protected readonly loadState = toSignal(
    toObservable(computed(() => ({ id: this.editDocumentId(), tick: this.loadTick() }))).pipe(
      switchMap(({ id }) => {
        if (!id) {
          return of<'ready' | 'loading' | 'not-found' | 'error'>('ready');
        }
        return this.documentService.getDocumentById(id).pipe(
          map((doc) => {
            if (doc.type !== DocumentType.SupplierInvoice) {
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
  protected readonly notFound = computed(() => this.loadState() === 'not-found');

  /**
   * Carica i contatori disponibili e, su documento nuovo, propone il
   * predefinito (serie + numero). Un valore digitato a mano non si tocca.
   */
  private refreshDocumentNumberProposal(): void {
    this.countersService
      .available(DocumentType.SupplierInvoice, null, this.form.controls.documentDate.value)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ counters, proposedCounterId }) =>
          this.numbering.applyProposal(counters, proposedCounterId),
        error: () => undefined,
      });
  }

  // ── Documento della controparte (tipo + numero + data) ─────────────────────

  /** N. fattura del fornitore: stesso controllo di prima, nuovo contenitore. */
  protected onCounterpartyNumberChange(value: string): void {
    this.form.controls.externalDocNumber.setValue(value);
    this.form.controls.externalDocNumber.markAsDirty();
  }

  /**
   * Data fattura = `documentDate`. In questa maschera la data del documento
   * della controparte E' la data del documento (la registrazione ha la sua,
   * `registrationDate`): il campo resta quello, cambia solo chi lo disegna.
   */
  protected onCounterpartyDateChange(value: string): void {
    this.form.controls.documentDate.setValue(value);
    this.form.controls.documentDate.markAsDirty();
    this.form.controls.documentDate.markAsTouched();
  }

  protected acknowledgeConflictNumber(): void {
    this.numbering.acknowledgeConflict(this.numberConflictDialog);
  }

  protected reload(): void {
    this.loadTick.update((tick) => tick + 1);
  }

  protected fieldInvalid(name: 'supplierId' | 'documentDate' | 'registrationDate'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected onSupplierSelect(value: string | null): void {
    const previous = this.form.controls.supplierId.value;
    this.form.controls.supplierId.setValue(value ?? '');
    this.form.controls.supplierId.markAsTouched();
    this.selectedSupplierId.set(value ?? '');
    const supplier = value ? (this.suppliers().find((entry) => entry.id === value) ?? null) : null;
    this.applySupplierDocumentNote(supplier);
    this.applySupplierPaymentDefault(supplier);
    this.applySupplierAddress(supplier);
    if (previous && previous !== value && this.linkedReceiptIds().size > 0) {
      // ⭐ **Le righe RESTANO, il legame cade.** Deciso dal proprietario il
      // 25/08/2026: «in danea le righe non vengono toccate, cambia solo il
      // fornitore». Gli importi che l'operatore ha davanti sono quelli della
      // fattura che sta registrando, e non c'entrano col fornitore.
      //
      // ⚠️ Ma il LEGAME sì: un arrivo del fornitore precedente non può stare
      // agganciato alla fattura di un altro — il server lo rifiuterebbe, e
      // avrebbe ragione. Cade quello, e le righe diventano voci libere.
      for (const line of this.lines.controls) {
        line.controls.linkedGoodsReceiptId.setValue('');
      }
      this.lines.markAsDirty();
    }
  }

  protected onPaymentMethodChange(value: string | null): void {
    this.form.controls.paymentMethod.setValue(value ?? '');
    this.form.controls.paymentMethod.markAsDirty();
  }

  /**
   * "Inserisci nota" (anagrafica fornitore): compila le note della
   * registrazione senza sovrascrivere testo digitato dall'operatore.
   */
  private applySupplierDocumentNote(supplier: Supplier | null): void {
    if (this.isEditMode()) {
      return;
    }
    const note = supplier?.documentCreationNote?.trim() ?? '';
    const control = this.form.controls.notes;
    const current = control.value.trim();
    if (note && (!current || current === this.lastAutoInsertedNote)) {
      control.setValue(note);
      this.lastAutoInsertedNote = note;
    } else if (!note && current && current === this.lastAutoInsertedNote) {
      control.setValue('');
      this.lastAutoInsertedNote = '';
    }
  }

  /** Tipo pagamento dall'anagrafica fornitore (modificabile, mai sovrascritto se toccato). */
  private applySupplierPaymentDefault(supplier: Supplier | null): void {
    const control = this.form.controls.paymentMethod;
    if (control.dirty) {
      return;
    }
    control.setValue(supplier?.paymentMethod?.trim() ?? '');
  }

  /** Indirizzi dall'anagrafica fornitore (modificabili per eccezioni). */
  private applySupplierAddress(supplier: Supplier | null): void {
    const group = this.form.controls.recipient;
    if (group.dirty) {
      return;
    }
    const addressLine = [supplier?.addressLine1?.trim(), supplier?.addressLine2?.trim()]
      .filter(Boolean)
      .join(' ');
    group.patchValue({
      name: supplier?.name ?? '',
      address: addressLine,
      zip: supplier?.postalCode ?? '',
      city: supplier?.city ?? '',
      province: supplier?.province ?? '',
      country: supplier?.countryCode ?? '',
      fiscalCode: supplier?.taxCode ?? '',
      vatNumber: supplier?.vatNumber ?? '',
    });
  }

  // ── Codici IVA ──────────────────────────────────────────────────────────
  //
  // ⛔ Questa maschera era l'UNICA dell'app a digitare l'aliquota a mano, dal
  // 19/07/2026 — cinque giorni dopo che il dominio Codice IVA era già in
  // codice. Otto form tengono `vatCodeId`; questo no.
  //
  // ⚠️ E i quattro codici in inversione contabile d'acquisto (22R, 10R, 5R, 4R)
  // sono gli unici con `usageScope: 'purchase'`: esistono SOLO per questa
  // maschera, che non poteva sceglierli.

  private readonly vatCodes = toSignal(
    this.vatCodeService.list().pipe(catchError(() => of([] as readonly VatCode[]))),
    { initialValue: [] as readonly VatCode[] },
  );

  private readonly purchaseVatCodes = computed(() =>
    this.vatCodes().filter((vatCode) => vatCode.isActive && isPurchaseVatCode(vatCode)),
  );

  private readonly vatCodesById = computed(
    () => new Map(this.vatCodes().map((vatCode) => [vatCode.id, vatCode])),
  );

  private readonly defaultVatCodeId = computed(
    () => this.purchaseVatCodes().find((vatCode) => vatCode.isDefault)?.id ?? '',
  );

  private readonly vatCodeOptionsBase = computed<readonly SelectMenuOption[]>(() =>
    this.purchaseVatCodes().map(vatCodeSelectOption),
  );

  /**
   * Il Codice IVA di ogni riga **com'era quando il documento è stato aperto**.
   *
   * ⭐ È il riferimento del contratto binario, e si fissa al caricamento: non si
   * aggiorna durante le modifiche locali, o due modifiche di fila si
   * annullerebbero a vicenda e la seconda non partirebbe.
   */
  private readonly persistedVatCodeIds = signal<ReadonlyMap<string, string | null>>(new Map());

  protected lineVatOptions(index: number): readonly SelectMenuOption[] {
    return vatOptionsIncludingSelected(
      this.vatCodeOptionsBase(),
      this.lines.at(index)?.controls.vatCodeId.value,
      this.vatCodesById(),
    );
  }

  /**
   * L'operatore sceglie un Codice IVA: la riga prende la sua aliquota e
   * ripropone l'imposta.
   *
   * ⚠️ L'imposta resta comunque modificabile. Una fattura ricevuta si REGISTRA,
   * non si produce: l'imposta stampata dal fornitore può differire di un
   * centesimo dall'arrotondamento, e un campo derivato costringerebbe a falsare
   * il netto per farla tornare.
   */
  protected onLineVatSelect(index: number, value: string | null): void {
    const group = this.lines.at(index);
    if (!group) {
      return;
    }
    group.controls.vatCodeId.setValue(value ?? '');
    const vatCode = value ? this.vatCodesById().get(value) : undefined;
    if (vatCode) {
      group.controls.ratePercent.setValue(vatCode.ratePercent);
    }
    this.lines.markAsDirty();
    this.recalcLineVat(index);
  }

  // ── Righe economiche ────────────────────────────────────────────────────────

  private buildLine(init?: {
    id?: string;
    description?: string;
    netMinor?: number | null;
    vatCodeId?: string;
    ratePercent?: number | null;
    vatMinor?: number | null;
    linkedGoodsReceiptId?: string;
  }): EconomicLineForm {
    return this.fb.group({
      id: this.fb.control(init?.id ?? ''),
      description: this.fb.control(init?.description ?? ''),
      netMinor: this.fb.control<number | null>(init?.netMinor ?? null),
      vatCodeId: this.fb.control(init?.vatCodeId ?? ''),
      ratePercent: this.fb.control<number | null>(init?.ratePercent ?? null),
      vatMinor: this.fb.control<number | null>(init?.vatMinor ?? null),
      linkedGoodsReceiptId: this.fb.control(init?.linkedGoodsReceiptId ?? ''),
    });
  }

  /** L'importo di una riga cambia: lo scrive e ripropone l'imposta. */
  protected onLineNetChange(index: number, value: number | null): void {
    const group = this.lines.at(index);
    if (!group) {
      return;
    }
    group.controls.netMinor.setValue(value);
    this.lines.markAsDirty();
    this.recalcLineVat(index);
  }

  protected onLineVatChange(index: number, value: number | null): void {
    const group = this.lines.at(index);
    if (!group) {
      return;
    }
    group.controls.vatMinor.setValue(value);
    this.lines.markAsDirty();
  }

  protected onInstallmentAmountChange(index: number, value: number | null): void {
    const group = this.installments.at(index);
    if (!group) {
      return;
    }
    group.controls.amountMinor.setValue(value);
    this.installments.markAsDirty();
  }

  protected addLine(): void {
    const predefinito = this.defaultVatCodeId();
    this.lines.push(
      this.buildLine({
        vatCodeId: predefinito || undefined,
        ratePercent: predefinito
          ? (this.vatCodesById().get(predefinito)?.ratePercent ?? null)
          : null,
      }),
    );
    this.lines.markAsDirty();
  }

  /**
   * ⭐ **Togliere le righe di un arrivo lo SCOLLEGA**, e non serve altro.
   *
   * Deciso dal proprietario il 25/08/2026 sul modello Danea: «non si toglie
   * l'incluso, si eliminano le righe ed, in automatico, non risulterà più
   * l'arrivo merci agganciato a quella fattura».
   */
  protected removeLine(index: number): void {
    this.lines.removeAt(index);
    this.lines.markAsDirty();
  }

  /**
   * IVA riga riproposta da netto × aliquota. Resta comunque modificabile: una
   * fattura ricevuta si REGISTRA, e l'imposta stampata dal fornitore può
   * differire di un centesimo dall'arrotondamento.
   *
   * ⚠️ **Si ricalcola allo sfocamento, non a ogni tasto** — è la conseguenza
   * dichiarata del passaggio alla primitiva monetaria, che emette al blur per
   * non distruggere la coda decimale del canonico.
   */
  protected recalcLineVat(index: number): void {
    const group = this.lines.at(index);
    if (!group) {
      return;
    }
    const net = group.controls.netMinor.value;
    const rate = group.controls.ratePercent.value;
    if (net === null || rate === null) {
      return;
    }
    group.controls.vatMinor.setValue(Math.round((net * rate) / 100));
  }

  // ── Scadenze di pagamento ───────────────────────────────────────────────────

  private buildInstallment(init?: {
    dueDate?: string;
    amountMinor?: number | null;
    settled?: boolean;
    settledAt?: string;
  }): InstallmentForm {
    return this.fb.group({
      dueDate: this.fb.control(init?.dueDate ?? ''),
      amountMinor: this.fb.control<number | null>(init?.amountMinor ?? null),
      settled: this.fb.control(init?.settled ?? false),
      settledAt: this.fb.control(init?.settledAt ?? ''),
    });
  }

  protected addInstallment(): void {
    // Comodo default: il residuo non ancora coperto dalle scadenze esistenti.
    const covered = this.form
      .getRawValue()
      .installments.reduce((sum, installment) => sum + (installment.amountMinor ?? 0), 0);
    const residualMinor = Math.max(0, this.totalGross().amountMinor - covered);
    this.installments.push(
      this.buildInstallment({ amountMinor: residualMinor > 0 ? residualMinor : null }),
    );
    this.installments.markAsDirty();
  }

  protected removeInstallment(index: number): void {
    this.installments.removeAt(index);
    this.installments.markAsDirty();
  }

  /** Spunta "Saldato": propone oggi come data saldo se assente. */
  protected onInstallmentSettledChange(index: number, checked: boolean): void {
    const group = this.installments.at(index);
    if (!group) {
      return;
    }
    group.controls.settled.setValue(checked);
    group.controls.settled.markAsDirty();
    if (checked && !group.controls.settledAt.value) {
      group.controls.settledAt.setValue(todayIsoDate());
    }
  }

  // ── Includi arrivo merce (prompt §5.1) ──────────────────────────────────────

  protected openIncludePanel(): void {
    const supplierId = this.form.controls.supplierId.value;
    if (!supplierId) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: 'Seleziona prima il fornitore: gli arrivi includibili dipendono dal fornitore.',
        },
      });
      return;
    }
    this._submitState.set({ status: 'idle' });
    this.includePanelOpen.set(true);
    this.linkableSelection.set(new Set());
    this.loadLinkableReceipts(supplierId);
  }

  protected closeIncludePanel(): void {
    this.includePanelOpen.set(false);
  }

  private loadLinkableReceipts(supplierId: string): void {
    this.linkableLoading.set(true);
    this.linkableError.set(null);
    this.documentService
      .listLinkableGoodsReceipts(supplierId, this.editDocumentId() ?? undefined)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          const collegati = this.linkedReceiptIds();
          this.linkableReceipts.set(rows.filter((row) => !collegati.has(row.id)));
          this.linkableLoading.set(false);
        },
        error: (err: unknown) => {
          this.linkableLoading.set(false);
          this.linkableError.set(this.toAppError(err));
        },
      });
  }

  protected toggleLinkableSelection(id: string): void {
    this.linkableSelection.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  /**
   * ⭐ **Includere un arrivo MATERIALIZZA le sue righe, una volta sola.**
   *
   * ⛔ Prima l'arrivo entrava in un elenco a parte e le righe se le ricalcolava
   * il server a ogni salvataggio: in sola lettura, e mai correggibili. Ora
   * nascono qui, come righe del documento, e da lì si modificano come le altre.
   *
   * ⚠️ **Una riga per aliquota, per arrivo** — non per aliquota e basta: la riga
   * porta il legame con UN arrivo, e sommare due arrivi nella stessa riga
   * perderebbe il legame di uno dei due.
   */
  protected includeSelectedReceipts(): void {
    const selection = this.linkableSelection();
    const toInclude = this.linkableReceipts()
      .filter((row) => selection.has(row.id))
      .sort(
        (a, b) => a.documentDate.localeCompare(b.documentDate) || (a.number ?? 0) - (b.number ?? 0),
      );
    if (toInclude.length === 0) {
      return;
    }
    for (const receipt of toInclude) {
      const descrizione = this.receiptLineDescription(receipt);
      for (const quota of this.vatQuotasOf(receipt)) {
        this.lines.push(
          this.buildLine({
            description: descrizione,
            netMinor: quota.net.amountMinor,
            // ⭐ Il Codice IVA dell'arrivo arriva fin qui: senza, la riga
            // materializzata nascerebbe SENZA codice mentre tutto il resto
            // della maschera lo usa, e il reverse charge d'acquisto si
            // perderebbe proprio nel percorso che lo produce.
            vatCodeId: quota.vatCodeId ?? '',
            ratePercent: quota.ratePercent,
            vatMinor: quota.vat.amountMinor,
            linkedGoodsReceiptId: receipt.id,
          }),
        );
      }
    }
    this.lines.markAsDirty();
    this.markFormDirty();
    this.linkableSelection.set(new Set());
    this.includePanelOpen.set(false);
  }

  /** «Rif. Arrivo merce 6 del 15/07/2026»: la descrizione della riga generata. */
  private receiptLineDescription(receipt: {
    readonly number?: number | null;
    readonly reference?: string | null;
    readonly documentDate: string;
  }): string {
    const label = receipt.number != null ? String(receipt.number) : (receipt.reference ?? '—');
    return `Rif. Arrivo merce ${label} del ${formatShortDate(receipt.documentDate)}`;
  }

  /**
   * Le quote IVA dell'arrivo. Se l'arrivo non le porta, se ne ricava una sola
   * dall'imponibile e dall'imposta complessivi: meglio una riga con l'aliquota
   * dedotta che nessuna riga.
   */
  private vatQuotasOf(receipt: {
    readonly subtotal: Money;
    readonly tax: Money;
    readonly vatBreakdown?: readonly GoodsReceiptVatBreakdownEntry[] | null;
  }): readonly GoodsReceiptVatBreakdownEntry[] {
    const quote = receipt.vatBreakdown ?? [];
    if (quote.length > 0) {
      return quote;
    }
    if (receipt.subtotal.amountMinor === 0 && receipt.tax.amountMinor === 0) {
      return [];
    }
    return [
      {
        // Arrivo storico senza quote dettagliate: nessun codice da portare.
        vatCodeId: null,
        ratePercent:
          receipt.subtotal.amountMinor > 0 && receipt.tax.amountMinor > 0
            ? Math.round((receipt.tax.amountMinor / receipt.subtotal.amountMinor) * 100)
            : 0,
        net: receipt.subtotal,
        vat: receipt.tax,
      },
    ];
  }

  // ── Salvataggio ─────────────────────────────────────────────────────────────

  /**
   * Controllo cronologico (§4) davanti a ogni salvataggio: il pulsante e il
   * dialogo di uscita passano entrambi da `save`.
   */
  /**
   * ⛔ Qui c'era un parametro `onSaved`, e lo passava UN solo chiamante:
   * «Salva e chiudi» del dialogo d'uscita. Tolto quel pulsante il 25/08/2026,
   * il parametro non ha piu' chiamanti e i suoi rami erano irraggiungibili.
   */
  protected save(): void {
    this.chronology.run(() => this.saveNow());
  }

  private saveNow(): void {
    if (this.saving()) {
      return;
    }
    this.form.markAllAsTouched();
    if (
      this.form.controls.supplierId.invalid ||
      this.form.controls.documentDate.invalid ||
      this.form.controls.registrationDate.invalid
    ) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: 'Compila fornitore, data documento e data registrazione prima di salvare.',
        },
      });
      return;
    }

    const raw = this.form.getRawValue();

    const lines: PurchaseInvoiceLineBody[] = [];
    for (const [index, line] of raw.lines.entries()) {
      const description = line.description.trim();
      // ⛔ **`!== null`, mai la verità del valore.** Con `line.netMinor` nudo,
      // una riga da 0,00 sarebbe FALSA e verrebbe saltata — e siccome il server
      // fa `deleteMany` prima di riscrivere, saltata significa **cancellata**.
      // «Non l'ho scritto» e «vale zero» sono due cose diverse.
      // ⛔ **Il Codice IVA NON conta come contenuto**, ed è una distinzione che
      // costa un difetto se si sbaglia: il predefinito lo mette la maschera, non
      // l'operatore. Contandolo, la riga pronta all'apertura risulterebbe
      // «scritta», il salvataggio la rifiuterebbe come incompleta, e **un
      // documento vuoto non si potrebbe più salvare** — che è una regola di
      // progetto, non una preferenza.
      const hasContent = description !== '' || line.netMinor !== null || line.vatMinor !== null;
      if (!hasContent) {
        // ⭐ Riga vuota: si salta, non è un errore. È la riga che ogni maschera
        // documentale tiene pronta in fondo — e un documento vuoto si salva.
        continue;
      }
      const net = line.netMinor;
      if (!description || net === null) {
        this._submitState.set({
          status: 'error',
          error: {
            kind: AppErrorKind.Validation,
            message: `Riga ${index + 1}: inserisci descrizione e importo netto validi.`,
          },
        });
        return;
      }
      lines.push({
        // ⭐ Vuoto = riga NUOVA, e il campo non entra proprio nel corpo: una
        // stringa vuota verrebbe rifiutata dalla validazione UUID del DTO.
        id: line.id || undefined,
        description,
        netMinor: net,
        vatRatePercent: line.ratePercent ?? 0,
        vatMinor: line.vatMinor ?? 0,
        // ⭐ **Contratto binario.** Su una riga esistente si dichiara il codice
        // SOLO se è cambiato rispetto a quello letto all'apertura: rimandare
        // sempre quello persistito farebbe rifotografare lo snapshot al server,
        // e una fattura di marzo cambierebbe aliquota il giorno in cui qualcuno
        // modifica quel Codice IVA. La regola sta in un posto solo.
        vatCodeId: vatCodeIdForLinePayload({
          currentVatCodeId: line.vatCodeId,
          persistedVatCodeId: line.id ? (this.persistedVatCodeIds().get(line.id) ?? null) : null,
          isExistingLine: line.id !== '',
        }),
        // ⭐ Il legame all'arrivo viaggia sulla riga: è l'unica fonte, e il
        // server ci ricava sia i collegamenti sia il controllo dei permessi.
        linkedGoodsReceiptId: line.linkedGoodsReceiptId || undefined,
      });
    }

    const installments: PurchaseInvoiceInstallmentBody[] = [];
    for (const [index, installment] of raw.installments.entries()) {
      const hasContent =
        installment.dueDate.trim() !== '' ||
        installment.amountMinor !== null ||
        installment.settled;
      if (!hasContent) {
        continue;
      }
      const amount = installment.amountMinor;
      if (!installment.dueDate || amount === null || amount < 0) {
        this._submitState.set({
          status: 'error',
          error: {
            kind: AppErrorKind.Validation,
            message: `Scadenza ${index + 1}: inserisci data scadenza e importo validi.`,
          },
        });
        return;
      }
      installments.push({
        dueDate: new Date(installment.dueDate).toISOString(),
        amountMinor: amount,
        settled: installment.settled,
        settledAt: installment.settledAt
          ? new Date(installment.settledAt).toISOString()
          : undefined,
      });
    }

    // Il numero si manda solo se l'operatore l'ha davvero digitato. Quello
    // che la maschera mostra all'apertura è una proposta: rimandarlo indietro lo
    // trasformerebbe in un'imposizione, e il secondo operatore si prenderebbe un
    // dialogo di conflitto per un numero che non ha mai scelto — glielo aveva
    // proposto la maschera. Omesso, il server assegna il primo libero al commit
    // e la concorrenza si risolve da sé, in silenzio.
    // Si omette SOLO la proposta di un documento nuovo: in modifica il
    // numero è del documento, non una proposta, e va sempre mandato.
    const documentNumberImposed = !this.documentNumberIsProposal();
    // Numero mostrato al momento dell'invio: va letto PRIMA della richiesta,
    // perché è con questo che si confronta quello assegnato dal server.
    const shownDocumentNumber = raw.documentNumber;

    this._submitState.set({ status: 'saving' });
    this.documentService
      .savePurchaseInvoice({
        id: this.editDocumentId() ?? this.loadedDocument()?.id ?? undefined,
        supplierId: raw.supplierId,
        documentDate: new Date(raw.documentDate).toISOString(),
        registrationDate: new Date(raw.registrationDate).toISOString(),
        externalDocNumber: raw.externalDocNumber.trim() || undefined,
        // Il tipo si nomina sempre: `null` e' la cancellazione voluta (tendina
        // svuotata), `undefined` direbbe al server «non conosco il campo» e
        // lascerebbe in piedi quello vecchio.
        internalComment: raw.internalComment.trim() || undefined,
        paymentMethod: raw.paymentMethod.trim() || undefined,
        notes: raw.notes.trim() || undefined,
        recipientAddress: {
          name: raw.recipient.name.trim() || undefined,
          address: raw.recipient.address.trim() || undefined,
          zip: raw.recipient.zip.trim() || undefined,
          city: raw.recipient.city.trim() || undefined,
          province: raw.recipient.province.trim() || undefined,
          country: raw.recipient.country.trim() || undefined,
          fiscalCode: raw.recipient.fiscalCode.trim() || undefined,
          vatNumber: raw.recipient.vatNumber.trim() || undefined,
        },
        currency: this.currency,
        // Numero imposto a mano: non sposta il progressivo della serie.
        // Non imposto: campo assente, così il server lo assegna lui.
        number: this.numbering.imposedNumber(),
        series: this.numbering.chosenSeries(),
        lines,
        installments,
      })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ document }) => {
          this._submitState.set({ status: 'idle' });
          this.notifyDocumentNumberReassigned(
            document.number ?? null,
            shownDocumentNumber,
            documentNumberImposed,
          );
          // Registrazione salvata: il guard di uscita non deve più fermarla.
          this.dirtySinceLastSave.set(false);
          void this.router.navigateByUrl(this.listPath);
        },
        error: (err: unknown) => {
          // Numero già preso: il vincolo del database non ammette
          // duplicati, si può solo prendere il primo libero o correggere.
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
   * Il numero assegnato dal server può non essere quello che la maschera
   * mostrava: fra l'apertura e il salvataggio un altro operatore può aver preso
   * il numero. Non è un errore — il primo libero spetta a chi salva prima — ma
   * va detto, perché chi l'aveva già trascritto altrove ha in mano un numero
   * che non è il suo.
   *
   * Solo sul numero proposto: se era stato imposto a mano il conflitto ha già
   * il suo dialogo, e raddoppiare l'avviso non aggiunge nulla.
   */
  private notifyDocumentNumberReassigned(
    assigned: number | null,
    shown: number | null,
    imposed: boolean,
  ): void {
    if (imposed || assigned === null || shown === null || assigned === shown) {
      return;
    }
    this.toasts.showInfo(
      `Salvato con il n. ${assigned}: il ${shown} è stato preso da un altro operatore.`,
    );
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

  protected confirmExitWithoutSaving(): void {
    this.exitDialogOpen.set(false);
    this.dirtySinceLastSave.set(false);
    this.pendingDeactivate?.(true);
    this.pendingDeactivate = null;
  }

  // ⛔ Qui c'era il gestore di «Salva e chiudi» del dialogo d'uscita, tolto il
  // 25/08/2026 con quel pulsante: il dialogo ha DUE azioni — Annulla · Esci
  // senza salvare — e il salvataggio resta il pulsante Salva della barra.
  // (decisione del proprietario, 24/08/2026)

  private patchFormFromDocument(doc: DocumentRecord): void {
    // Patch programmatico (caricamento/duplica): non è una modifica dell'utente.
    this.suppressDirtyMarking = true;
    try {
      this.applyDocumentToForm(doc);
    } finally {
      this.suppressDirtyMarking = false;
    }
  }

  private applyDocumentToForm(doc: DocumentRecord): void {
    this.selectedSupplierId.set(doc.supplierId ?? '');
    this.form.patchValue({
      supplierId: doc.supplierId ?? '',
      documentDate: doc.documentDate.slice(0, 10),
      externalDocNumber: doc.externalDocNumber ?? '',
      registrationDate: doc.registrationDate ? doc.registrationDate.slice(0, 10) : todayIsoDate(),
      documentNumber: doc.number ?? null,
      series: doc.series ?? '',
      internalComment: doc.internalComment ?? '',
      paymentMethod: doc.paymentMethod ?? '',
      notes: doc.notes ?? '',
      recipient: {
        name: doc.recipientAddress?.name ?? '',
        address: doc.recipientAddress?.address ?? '',
        zip: doc.recipientAddress?.zip ?? '',
        city: doc.recipientAddress?.city ?? '',
        province: doc.recipientAddress?.province ?? '',
        country: doc.recipientAddress?.country ?? '',
        fiscalCode: doc.recipientAddress?.fiscalCode ?? '',
        vatNumber: doc.recipientAddress?.vatNumber ?? '',
      },
    });

    // ⛔ **Qui c'era `if (line.lineSource !== 'manual') continue;`.**
    //
    // Scartava ogni riga che non fosse una voce libera, perche' quelle da arrivo
    // il client se le ri-derivava da solo. Con le righe materializzate quel
    // filtro sarebbe stato distruttivo, in tre tempi: le righe da arrivo non
    // entravano nel form, quindi non entravano nel payload, quindi il
    // `deleteMany` del server le cancellava per sempre. **Il documento si
    // sarebbe svuotato in silenzio**, e nessun test lo avrebbe visto.
    this.lines.clear();
    for (const line of doc.lines ?? []) {
      this.lines.push(
        this.buildLine({
          id: line.id,
          description: line.description,
          // ⭐ `?? null`, mai `?? 0`: una riga senza imposta non è una riga con
          // imposta zero, e la differenza decide se il campo mostra il
          // segnaposto o un valore che nessuno ha scritto.
          netMinor: line.lineTotal.amountMinor,
          vatCodeId: line.vatCodeId ?? '',
          ratePercent: line.vatSnapshot?.ratePercent ?? null,
          vatMinor: line.lineVatTotal?.amountMinor ?? null,
          linkedGoodsReceiptId: line.linkedGoodsReceiptId ?? '',
        }),
      );
    }

    // ⭐ Il riferimento del contratto binario si fissa QUI, al caricamento, e
    // non si aggiorna durante le modifiche locali: altrimenti due modifiche di
    // fila si annullerebbero a vicenda e la seconda non partirebbe.
    this.persistedVatCodeIds.set(
      new Map((doc.lines ?? []).map((line) => [line.id, line.vatCodeId ?? null])),
    );

    this.installments.clear();
    for (const installment of doc.paymentInstallments ?? []) {
      this.installments.push(
        this.buildInstallment({
          dueDate: installment.dueDate.slice(0, 10),
          amountMinor: installment.amount.amountMinor,
          settled: installment.settled,
          settledAt: installment.settledAt ? installment.settledAt.slice(0, 10) : '',
        }),
      );
    }

    // ⭐ Gli arrivi collegati NON si rileggono da `doc.linkedGoodsReceipts`: le
    // righe portano già il legame, e rileggerlo da un'altra parte rifarebbe la
    // seconda verità che questa unificazione ha tolto.
  }

  /**
   * «Duplica documento» (Fase 3, no bozze): il param `duplicateFrom` porta la
   * registrazione fattura originale, copiata in un documento NUOVO. Nessuna
   * copia nasce a monte: si crea (confermata) solo al salvataggio.
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
    // Copia indipendente, come il duplica legacy: numero e date fresche, niente
    // rate né ricevute agganciate; resta il rif. fattura fornitore e le righe
    // manuali. La registrazione fattura non movimenta magazzino.
    // Prefill programmatico: non è una modifica dell'utente.
    this.suppressDirtyMarking = true;
    try {
      this.form.patchValue({
        documentNumber: null,
        documentDate: todayIsoDate(),
        registrationDate: todayIsoDate(),
      });
      this.installments.clear();
      // ⚠️ **I legami agli arrivi NON si duplicano.** Gli arrivi della fattura
      // di partenza sono già fatturati da quella: riportarli qui li aggancerebbe
      // due volte, e il server rifiuterebbe il salvataggio. Le righe restano —
      // sono gli importi che si vogliono ricopiare — ma diventano voci libere.
      for (const line of this.lines.controls) {
        line.controls.linkedGoodsReceiptId.setValue('');
      }
    } finally {
      this.suppressDirtyMarking = false;
    }
    this.refreshDocumentNumberProposal();
  }

  // ⛔ Qui c'era `moneyToInputText`: la conversione denaro→testo scritta a mano
  // in questa maschera. Tolta il 25/08/2026 col passaggio ad `app-money-input`,
  // che quella grammatica ce l'ha già — e la aveva **due giorni prima**.
  //
  // ⚠️ Portava anche un difetto: restituiva stringa VUOTA per lo zero, quindi
  // una riga salvata a 0,00 si rileggeva vuota e al salvataggio veniva rifiutata
  // come «importo netto non valido». Un abbuono a zero non si poteva risalvare.

  private toAppError(err: unknown): AppError {
    return isAppError(err) ? err : mapHttpErrorToAppError(err);
  }
}
