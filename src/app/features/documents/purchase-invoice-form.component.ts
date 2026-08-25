import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
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
import { DocumentNotesComponent } from '@domain/documents/components/document-notes/document-notes.component';
import { DocumentChronologyWarningDialogComponent } from '@domain/documents/components/document-chronology-warning-dialog/document-chronology-warning-dialog.component';
import { DocumentPrefillErrorStore } from '@domain/documents/state/document-prefill-error.store';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { mapHttpErrorToAppError } from '@core/interceptors/http-error.mapper';
import type { Money } from '@core/models/common.model';
import { DocumentType } from '@core/models/document.model';
import type { DocumentTypeSetting } from '@core/models/document.model';
import type { DocumentRecord, GoodsReceiptVatBreakdownEntry } from '@core/models/document.model';
import type { PaymentOption } from '@core/models/payment-option.model';
import type { Supplier } from '@core/models/supplier.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { ToastService } from '@core/services/toast.service';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  moneyToDecimalString,
  parseMoneyInput,
} from '@core/utils/money.util';
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
  PurchaseInvoiceManualLineBody,
} from '@domain/documents/services/document-api.mapper';

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

/** Arrivo merce incluso nella registrazione (riga riepilogativa in maschera). */
interface IncludedReceiptRow {
  readonly id: string;
  readonly number?: number;
  readonly reference?: string;
  readonly documentDate: string;
  readonly causalText?: string;
  readonly subtotal: Money;
  readonly tax: Money;
  readonly total: Money;
  /** Quote IVA dell'arrivo: alimentano le righe per aliquota. */
  readonly vatBreakdown: readonly GoodsReceiptVatBreakdownEntry[];
}

/** Riga registrazione generata automaticamente (gruppo per aliquota IVA). */
interface AutoVatRow {
  readonly ratePercent: number;
  readonly net: Money;
  readonly vat: Money;
  readonly description: string;
}

type ManualLineForm = FormGroup<{
  description: FormControl<string>;
  netText: FormControl<string>;
  rateText: FormControl<string>;
  vatText: FormControl<string>;
}>;

type InstallmentForm = FormGroup<{
  dueDate: FormControl<string>;
  amountText: FormControl<string>;
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

/** Aliquota IVA da testo utente ("22", "10,5", "4%"): null se non valida. */
function parseRatePercent(value: string): number | null {
  const trimmed = value.trim().replace('%', '').replace(',', '.');
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

/**
 * Registrazione fattura fornitore (prompt §5-7): documento contabile che
 * collega uno o più Arrivi merce alla fattura ricevuta. Le righe si generano
 * raggruppando gli imponibili per aliquota IVA (più eventuali righe manuali);
 * il pagamento è gestito a scadenze con stato saldato. NON movimenta mai il
 * magazzino: le giacenze restano quelle caricate dagli Arrivi merce.
 */
@Component({
  selector: 'app-purchase-invoice-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NoImplicitSubmitDirective,
    InlineBannerComponent,
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

    // Ogni modifica utente al form marca la registrazione come «da salvare».
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.markFormDirty();
    });
  }

  protected readonly listPath = '/app/documents/registrazione-fattura';
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
    manualLines: this.fb.array<ManualLineForm>([]),
    installments: this.fb.array<InstallmentForm>([]),
  });

  /** Tick reattivo su ogni modifica del form (totali e opzioni derivate). */
  private readonly formChanges = toSignal(this.form.valueChanges, { initialValue: null });

  protected get manualLines(): FormArray<ManualLineForm> {
    return this.form.controls.manualLines;
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

  /** Arrivi merce inclusi (righe riepilogative, prompt §5.2). */
  protected readonly includedReceipts = signal<readonly IncludedReceiptRow[]>([]);

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

  // ── Righe registrazione (auto per aliquota + manuali) ───────────────────────

  /**
   * Righe generate dagli arrivi inclusi: imponibili raggruppati per aliquota
   * IVA con riferimento automatico ("Rif. Arrivo merce 6 del 15/07/2026, …").
   * Stessa logica del backend, che resta autoritativo al salvataggio.
   */
  protected readonly autoRows = computed<readonly AutoVatRow[]>(() => {
    const receipts = [...this.includedReceipts()].sort(
      (a, b) => a.documentDate.localeCompare(b.documentDate) || (a.number ?? 0) - (b.number ?? 0),
    );
    const byRate = new Map<number, { net: number; vat: number; refs: string[] }>();
    for (const receipt of receipts) {
      const label = receipt.number != null ? String(receipt.number) : (receipt.reference ?? '—');
      const ref = `${label} del ${formatShortDate(receipt.documentDate)}`;
      const quotas: readonly GoodsReceiptVatBreakdownEntry[] =
        receipt.vatBreakdown.length > 0
          ? receipt.vatBreakdown
          : receipt.subtotal.amountMinor !== 0 || receipt.tax.amountMinor !== 0
            ? [
                {
                  ratePercent:
                    receipt.subtotal.amountMinor > 0 && receipt.tax.amountMinor > 0
                      ? Math.round((receipt.tax.amountMinor / receipt.subtotal.amountMinor) * 100)
                      : 0,
                  net: receipt.subtotal,
                  vat: receipt.tax,
                },
              ]
            : [];
      for (const quota of quotas) {
        const entry = byRate.get(quota.ratePercent) ?? { net: 0, vat: 0, refs: [] };
        entry.net += quota.net.amountMinor;
        entry.vat += quota.vat.amountMinor;
        if (!entry.refs.includes(ref)) {
          entry.refs.push(ref);
        }
        byRate.set(quota.ratePercent, entry);
      }
    }
    return [...byRate.entries()]
      .map(([ratePercent, entry]): AutoVatRow => ({
        ratePercent,
        net: { amountMinor: entry.net, currencyCode: this.currency },
        vat: { amountMinor: entry.vat, currencyCode: this.currency },
        description: `Rif. Arrivo merce ${entry.refs.join(', ')}`,
      }))
      .sort((a, b) => a.ratePercent - b.ratePercent);
  });

  /** Importi netti/IVA delle righe manuali (reattivi sul form). */
  private readonly manualTotals = computed(() => {
    this.formChanges();
    let net = 0;
    let vat = 0;
    for (const line of this.form.getRawValue().manualLines) {
      net += parseMoneyInput(line.netText, this.currency)?.amountMinor ?? 0;
      vat += parseMoneyInput(line.vatText, this.currency)?.amountMinor ?? 0;
    }
    return { net, vat };
  });

  // ── Totali (sempre visibili in fondo): Tot. netto, IVA, Totale ─────────────

  protected readonly totalNet = computed<Money>(() => ({
    amountMinor:
      this.autoRows().reduce((sum, row) => sum + row.net.amountMinor, 0) + this.manualTotals().net,
    currencyCode: this.currency,
  }));

  protected readonly totalVat = computed<Money>(() => ({
    amountMinor:
      this.autoRows().reduce((sum, row) => sum + row.vat.amountMinor, 0) + this.manualTotals().vat,
    currencyCode: this.currency,
  }));

  protected readonly totalGross = computed<Money>(() => ({
    amountMinor: this.totalNet().amountMinor + this.totalVat().amountMinor,
    currencyCode: this.currency,
  }));

  /** Totale scadenze saldate ("Saldato"). */
  protected readonly settledTotal = computed<Money>(() => {
    this.formChanges();
    const amountMinor = this.form
      .getRawValue()
      .installments.filter((installment) => installment.settled)
      .reduce(
        (sum, installment) =>
          sum + (parseMoneyInput(installment.amountText, this.currency)?.amountMinor ?? 0),
        0,
      );
    return { amountMinor, currencyCode: this.currency };
  });

  /** Residuo "Da saldare" = totale registrazione - scadenze saldate. */
  protected readonly outstandingTotal = computed<Money>(() => ({
    amountMinor: Math.max(0, this.totalGross().amountMinor - this.settledTotal().amountMinor),
    currencyCode: this.currency,
  }));

  private readonly loadTick = signal(0);
  private readonly loadState = toSignal(
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
    if (previous && previous !== value && this.includedReceipts().length > 0) {
      // Gli arrivi inclusi appartengono al fornitore precedente: non più validi.
      this.includedReceipts.set([]);
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

  // ── Righe manuali ───────────────────────────────────────────────────────────

  private buildManualLine(init?: {
    description?: string;
    netText?: string;
    rateText?: string;
    vatText?: string;
  }): ManualLineForm {
    return this.fb.group({
      description: this.fb.control(init?.description ?? ''),
      netText: this.fb.control(init?.netText ?? ''),
      rateText: this.fb.control(init?.rateText ?? ''),
      vatText: this.fb.control(init?.vatText ?? ''),
    });
  }

  protected addManualLine(): void {
    this.manualLines.push(this.buildManualLine());
    this.manualLines.markAsDirty();
  }

  protected removeManualLine(index: number): void {
    this.manualLines.removeAt(index);
    this.manualLines.markAsDirty();
  }

  /** IVA riga ricalcolata da netto × aliquota (resta comunque modificabile). */
  protected recalcManualLineVat(index: number): void {
    const group = this.manualLines.at(index);
    if (!group) {
      return;
    }
    const net = parseMoneyInput(group.controls.netText.value, this.currency);
    const rate = parseRatePercent(group.controls.rateText.value);
    if (net === null || rate === null) {
      return;
    }
    const vatMinor = Math.round((net.amountMinor * rate) / 100);
    group.controls.vatText.setValue(
      this.moneyToInputText({ amountMinor: vatMinor, currencyCode: this.currency }),
    );
  }

  // ── Scadenze di pagamento ───────────────────────────────────────────────────

  private buildInstallment(init?: {
    dueDate?: string;
    amountText?: string;
    settled?: boolean;
    settledAt?: string;
  }): InstallmentForm {
    return this.fb.group({
      dueDate: this.fb.control(init?.dueDate ?? ''),
      amountText: this.fb.control(init?.amountText ?? ''),
      settled: this.fb.control(init?.settled ?? false),
      settledAt: this.fb.control(init?.settledAt ?? ''),
    });
  }

  protected addInstallment(): void {
    // Comodo default: il residuo non ancora coperto dalle scadenze esistenti.
    const covered = this.form
      .getRawValue()
      .installments.reduce(
        (sum, installment) =>
          sum + (parseMoneyInput(installment.amountText, this.currency)?.amountMinor ?? 0),
        0,
      );
    const residualMinor = Math.max(0, this.totalGross().amountMinor - covered);
    this.installments.push(
      this.buildInstallment({
        amountText:
          residualMinor > 0
            ? this.moneyToInputText({ amountMinor: residualMinor, currencyCode: this.currency })
            : '',
      }),
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
          const includedIds = new Set(this.includedReceipts().map((row) => row.id));
          this.linkableReceipts.set(rows.filter((row) => !includedIds.has(row.id)));
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

  protected includeSelectedReceipts(): void {
    const selection = this.linkableSelection();
    const toInclude = this.linkableReceipts().filter((row) => selection.has(row.id));
    if (toInclude.length === 0) {
      return;
    }
    this.includedReceipts.update((current) => [
      ...current,
      ...toInclude.map((row): IncludedReceiptRow => ({
        id: row.id,
        number: row.number,
        reference: row.reference,
        documentDate: row.documentDate,
        causalText: row.causalText,
        subtotal: row.subtotal,
        tax: row.tax,
        total: row.total,
        vatBreakdown: row.vatBreakdown ?? [],
      })),
    ]);
    // Gli arrivi inclusi vivono fuori dal FormGroup: dirty marcato a mano.
    this.markFormDirty();
    this.includePanelOpen.set(false);
  }

  protected removeReceipt(id: string): void {
    this.includedReceipts.update((current) => current.filter((row) => row.id !== id));
    this.markFormDirty();
  }

  /** Riga riepilogativa (§5.2): "Arrivo merce n. 3 del 30/05/2026 - DDT 145…". */
  protected receiptSummaryLabel(row: IncludedReceiptRow): string {
    const number = row.number != null ? `n. ${row.number}` : (row.reference ?? '');
    const base = `Arrivo merce ${number} del ${formatDate(row.documentDate)}`.trim();
    return row.causalText?.trim() ? `${base} - ${row.causalText.trim()}` : base;
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

    const manualLines: PurchaseInvoiceManualLineBody[] = [];
    for (const [index, line] of raw.manualLines.entries()) {
      const description = line.description.trim();
      const hasContent =
        description || line.netText.trim() || line.rateText.trim() || line.vatText.trim();
      if (!hasContent) {
        continue;
      }
      const net = parseMoneyInput(line.netText, this.currency);
      if (!description || net === null) {
        this._submitState.set({
          status: 'error',
          error: {
            kind: AppErrorKind.Validation,
            message: `Riga manuale ${index + 1}: inserisci descrizione e importo netto validi.`,
          },
        });
        return;
      }
      manualLines.push({
        description,
        netMinor: net.amountMinor,
        vatRatePercent: parseRatePercent(line.rateText) ?? 0,
        vatMinor: parseMoneyInput(line.vatText, this.currency)?.amountMinor ?? 0,
      });
    }

    const installments: PurchaseInvoiceInstallmentBody[] = [];
    for (const [index, installment] of raw.installments.entries()) {
      const hasContent =
        installment.dueDate.trim() || installment.amountText.trim() || installment.settled;
      if (!hasContent) {
        continue;
      }
      const amount = parseMoneyInput(installment.amountText, this.currency);
      if (!installment.dueDate || amount === null || amount.amountMinor < 0) {
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
        amountMinor: amount.amountMinor,
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
        goodsReceiptIds: this.includedReceipts().map((row) => row.id),
        manualLines,
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

    this.manualLines.clear();
    for (const line of doc.lines ?? []) {
      if (line.lineSource !== 'manual') {
        continue;
      }
      this.manualLines.push(
        this.buildManualLine({
          description: line.description,
          netText: this.moneyToInputText(line.lineTotal),
          rateText:
            line.vatSnapshot?.ratePercent != null
              ? String(line.vatSnapshot.ratePercent).replace('.', ',')
              : '',
          vatText: line.lineVatTotal ? this.moneyToInputText(line.lineVatTotal) : '',
        }),
      );
    }

    this.installments.clear();
    for (const installment of doc.paymentInstallments ?? []) {
      this.installments.push(
        this.buildInstallment({
          dueDate: installment.dueDate.slice(0, 10),
          amountText: this.moneyToInputText(installment.amount),
          settled: installment.settled,
          settledAt: installment.settledAt ? installment.settledAt.slice(0, 10) : '',
        }),
      );
    }

    this.includedReceipts.set(
      (doc.linkedGoodsReceipts ?? []).map((receipt): IncludedReceiptRow => ({
        id: receipt.id,
        number: receipt.number,
        reference: receipt.reference,
        documentDate: receipt.documentDate,
        causalText: receipt.causalText,
        subtotal: receipt.subtotal,
        tax: receipt.tax,
        total: receipt.total,
        vatBreakdown: receipt.vatBreakdown ?? [],
      })),
    );
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
    } finally {
      this.suppressDirtyMarking = false;
    }
    this.includedReceipts.set([]);
    this.refreshDocumentNumberProposal();
  }

  private moneyToInputText(money: Money): string {
    if (money.amountMinor === 0) {
      return '';
    }
    return moneyToDecimalString(money).replace('.', ',');
  }

  private toAppError(err: unknown): AppError {
    return isAppError(err) ? err : mapHttpErrorToAppError(err);
  }
}
