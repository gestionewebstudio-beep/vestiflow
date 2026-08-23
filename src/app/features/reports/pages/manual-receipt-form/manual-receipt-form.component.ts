import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, of, take } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Money } from '@core/models/money.model';
import type { VatCode } from '@core/models/vat-code.model';
import { formatVatRate, isSalesVatCode } from '@core/models/vat-code.model';
import { NavigationHistoryService } from '@core/services/navigation-history.service';
import { VatCodeService } from '@core/services/vat-code.service';
import type { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  moneyToDecimalString,
  parseMoneyInput,
  roundToMinor,
  toStorableMinor,
} from '@core/utils/money.util';
import { DocumentLineCardComponent } from '@domain/documents/components/document-line-card/document-line-card.component';
import { DocumentLineCardControlComponent } from '@domain/documents/components/document-line-card/document-line-card-control.component';
import { DocumentLineCardFieldComponent } from '@domain/documents/components/document-line-card/document-line-card-field.component';
import { DocumentLineCardGroupComponent } from '@domain/documents/components/document-line-card/document-line-card-group.component';
import type { DocumentLineCardMeta } from '@domain/documents/components/document-line-card/document-line-card.model';
import { DocumentLineSelectCellComponent } from '@domain/documents/components/document-line-select-cell/document-line-select-cell.component';
import {
  grossFromNetMinor,
  lineVatFromNetExact,
  netFromGrossExact,
} from '@domain/documents/utils/document-vat.util';
import {
  vatCodeSelectOption,
  vatOptionsIncludingSelected,
} from '@domain/documents/utils/document-vat-options.util';
import { computeDocumentTotals } from '@domain/documents/utils/document-totals.util';
import { DocumentEditLockService } from '@domain/documents/services/document-edit-lock.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { EditLockBannerComponent } from '@shared/components/edit-lock-banner/edit-lock-banner.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type {
  ManualReceipt,
  ManualReceiptLocation,
  SaveManualReceiptBody,
} from '../../models/manual-receipt.model';
import { ManualReceiptService } from '../../services/manual-receipt.service';

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

/** Il gruppo di una riga: un campo VISTA e il netto canonico che lo governa. */
interface LineControls {
  description: FormControl<string>;
  amount: FormControl<string>;
  netAmountMinor: FormControl<number | null>;
  vatCodeId: FormControl<string>;
}

const LIST_PATH = '/app/sales/corrispettivi';

/**
 * Il **Corrispettivo manuale** (`docs/10` §12): una registrazione economica
 * autonoma, con righe `Descrizione · Importo · Codice IVA`.
 *
 * ⛔ **Non tocca il magazzino, e non è una maschera documento.** Non ha
 * articoli, non ha quantità, non ha cliente, non ha pagamenti: se un giorno
 * qualcuno aggiungesse qui un selettore di prodotto starebbe costruendo un'altra
 * cosa. Riusa l'anatomia visiva delle maschere documento — i fogli globali
 * `_document-form*.scss` — non il loro modello.
 *
 * ⚠️ **La modalità Ivati/Netti parte da IVATA e non ha memoria.** Il caso
 * operativo è ricopiare i valori di una chiusura di cassa, che ivati lo sono.
 * Nessuna convenzione aziendale, nessuna preferenza dell'operatore: quelle
 * governano i documenti di vendita, e questa registrazione documento non è.
 */
@Component({
  selector: 'app-manual-receipt-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackButtonComponent,
    ButtonComponent,
    DateInputComponent,
    DocumentLineCardComponent,
    DocumentLineCardControlComponent,
    DocumentLineCardFieldComponent,
    DocumentLineCardGroupComponent,
    DocumentLineSelectCellComponent,
    EditLockBannerComponent,
    EmptyStateComponent,
    InlineBannerComponent,
    ReactiveFormsModule,
    SelectMenuComponent,
  ],
  // Una maschera = un'istanza: ogni istanza traccia gli id che ha sbloccato e
  // li rilascia all'uscita, così alla riapertura tornano protetti.
  providers: [DocumentEditLockService],
  templateUrl: './manual-receipt-form.component.html',
  styleUrl: './manual-receipt-form.component.scss',
})
export class ManualReceiptFormComponent implements CanComponentDeactivate {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly manualReceipts = inject(ManualReceiptService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly navHistory = inject(NavigationHistoryService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly currency = DEFAULT_CURRENCY;
  protected readonly formatMoney = formatMoney;
  protected readonly listPath = LIST_PATH;

  /**
   * L'id del corrispettivo, che **cambia dopo il primo salvataggio**.
   *
   * È un signal e non una costante perché la maschera non se ne va più: salvato
   * il primo, resta aperta sullo stesso record, e da lì in avanti ogni
   * salvataggio è un `PATCH`. Con una costante il secondo salvataggio avrebbe
   * creato una seconda registrazione — con un secondo numero.
   */
  private readonly receiptId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  protected readonly isEdit = computed(() => this.receiptId() != null);

  /**
   * Il corrispettivo salvato è **protetto**: si guarda, non si tocca.
   *
   * ⚠️ **Il meccanismo non è nuovo**: è `DocumentEditLockService` con
   * `app-edit-lock-banner`, lo stesso di Arrivo merce, Ordine fornitore, DDT e
   * Ordine cliente. Il commento di `relock()` descrive esattamente il caso che
   * serve qui — «salvato il documento, chi vuole rimetterci mano lo sblocca di
   * nuovo». Scriverne uno mio avrebbe dato alla maschera un comportamento che
   * somiglia a quello delle altre senza esserlo.
   */
  private readonly editLock = inject(DocumentEditLockService);
  protected readonly formReadOnly = computed(
    () => this.receiptId() != null && !this.editLock.unlocked(),
  );
  protected readonly unlockDialogOpen = signal(false);

  protected readonly form = this.fb.group({
    documentDate: this.fb.control(todayIsoDate(), { validators: [Validators.required] }),
    locationId: this.fb.control('', { validators: [Validators.required] }),
    notes: this.fb.control(''),
    lines: this.fb.array<FormGroup<LineControls>>([]),
  });

  /** Parte IVATA: è il verso in cui arrivano i valori di una chiusura di cassa. */
  protected readonly pricesIncludeVat = signal(true);

  protected readonly assignedNumber = signal<number | null>(null);
  protected readonly createdByName = signal<string | null>(null);
  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
  protected readonly saving = computed(() => this._submitState().status === 'saving');
  protected readonly submitError = computed(() => {
    const state = this._submitState();
    return state.status === 'error' ? state.error : null;
  });
  protected readonly loadError = signal<AppError | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteDialogOpen = signal(false);

  // ── Uscita con modifiche non salvate (pattern Registrazione fattura) ────────
  protected readonly dirtySinceLastSave = signal(false);
  protected readonly exitDialogOpen = signal(false);
  private pendingDeactivate: ((allow: boolean) => void) | null = null;
  /** True durante il patch programmatico del form (caricamento in modifica). */
  private suppressDirtyMarking = false;

  protected readonly locations = toSignal(
    this.manualReceipts
      .listLocations()
      .pipe(catchError(() => of([] as readonly ManualReceiptLocation[]))),
    { initialValue: [] as readonly ManualReceiptLocation[] },
  );

  protected readonly locationOptions = computed<readonly SelectMenuOption[]>(() =>
    this.locations().map((location) => ({ value: location.id, label: location.name })),
  );

  private readonly vatCodes = toSignal(
    this.vatCodeService.list().pipe(catchError(() => of([] as readonly VatCode[]))),
    { initialValue: [] as readonly VatCode[] },
  );

  private readonly salesVatCodes = computed(() =>
    this.vatCodes().filter((vatCode) => vatCode.isActive && isSalesVatCode(vatCode)),
  );

  private readonly vatCodesById = computed(
    () => new Map(this.vatCodes().map((vatCode) => [vatCode.id, vatCode])),
  );

  /**
   * Il Codice IVA **predefinito dell'azienda** (`isDefault` in anagrafica
   * fiscale), se utilizzabile in vendita.
   *
   * È quello che la riga nuova propone. Qui c'era la scelta opposta — nessuna
   * proposta, «l'aliquota è metà del dato e va guardata» — e costava un gesto a
   * ogni riga per riscrivere ogni volta lo stesso codice: su una chiusura di
   * cassa le righe sono quasi sempre tutte all'aliquota ordinaria.
   */
  private readonly defaultVatCodeId = computed(
    () => this.salesVatCodes().find((vatCode) => vatCode.isDefault)?.id ?? '',
  );

  /**
   * Le voci della cella IVA: **il codice è l'etichetta**, aliquota e descrizione
   * stanno nel dettaglio. Il filtro della cella dà la precedenza al prefisso del
   * `label`, e un'etichetta lunga lo renderebbe inutile.
   */
  private readonly vatCodeOptionsBase = computed<readonly SelectMenuOption[]>(() =>
    this.salesVatCodes().map(vatCodeSelectOption),
  );

  protected readonly priceModeOptions: readonly SelectMenuOption[] = [
    { value: 'gross', label: 'Ivati' },
    { value: 'net', label: 'Netti' },
  ];

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.markFormDirty();
    });

    /**
     * Il Codice IVA **predefinito dell'azienda** sulle righe che non ne hanno
     * ancora uno.
     *
     * Serve un effetto e non basta `addLine()`: la prima riga nasce nel
     * costruttore, quando l'elenco dei codici non è ancora arrivato dalla rete.
     * L'effetto scatta una volta sola, quando il predefinito diventa noto.
     *
     * ⚠️ Non ririempie una riga che l'operatore ha svuotato di proposito:
     * dipende dal solo `defaultVatCodeId`, che dopo il primo caricamento non
     * cambia più. E `emitEvent: false` perché una proposta non è una modifica —
     * altrimenti un documento appena aperto risulterebbe «da salvare».
     */
    effect(() => {
      const predefinito = this.defaultVatCodeId();
      if (!predefinito) {
        return;
      }
      untracked(() => {
        for (const line of this.lines.controls) {
          if (!line.controls.vatCodeId.value) {
            line.controls.vatCodeId.setValue(predefinito, { emitEvent: false });
          }
        }
      });
    });

    const id = this.receiptId();
    if (id) {
      // Un corrispettivo che si RIAPRE nasce protetto, come ogni documento del
      // gestionale: la frase è una sola, ed è del servizio condiviso.
      this.editLock.syncOnLoad(id);
      this.loadReceipt(id);
    } else {
      this.addLine();
      // Il form nasce «pulito»: la riga vuota iniziale e il precompilato non
      // sono modifiche dell'operatore, e non devono far scattare la guardia
      // d'uscita alla prima navigazione indietro.
      this.dirtySinceLastSave.set(false);
    }
  }

  // ── Righe ─────────────────────────────────────────────────────────────────

  protected get lines(): FormArray<FormGroup<LineControls>> {
    return this.form.controls.lines;
  }

  /**
   * «Aggiungi riga» dalla barra strumenti: la riga nuova nasce **aperta**.
   *
   * Sotto lg la card chiusa mostra il titolo, e su una riga vuota il titolo è
   * «Riga senza descrizione»: senza aprirla, la descrizione non si potrebbe
   * digitare. Su desktop non cambia niente — le card non si vedono.
   */
  protected addLineFromToolbar(): void {
    this.addLine();
    this.openLine.set(this.lines.length - 1);
  }

  protected addLine(): void {
    this.lines.push(
      this.fb.group<LineControls>({
        description: this.fb.control(''),
        /**
         * Il campo dell'importo è una **VISTA**: contiene il netto o l'ivato
         * secondo il selettore di testata, ed è quello che l'operatore legge e
         * digita.
         */
        amount: this.fb.control(''),
        /**
         * Il netto CANONICO in unità minori, con la coda dello scorporo. È il
         * valore vero della riga: `amount` si ridisegna da qui, mai il
         * contrario. Vive nel gruppo e non in un signal per indice perché così
         * segue la riga quando la si aggiunge o elimina.
         */
        netAmountMinor: this.fb.control<number | null>(null),
        // Il Codice IVA predefinito dell'azienda. Vuoto se l'elenco non è
        // ancora arrivato: ci pensa l'effetto nel costruttore.
        vatCodeId: this.fb.control(this.defaultVatCodeId()),
      }),
    );
  }

  protected removeLine(index: number): void {
    this.lines.removeAt(index);
    if (this.lines.length === 0) {
      this.addLine();
    }
    this.openLine.set(null);
  }

  // ── La vista card, sotto lg ────────────────────────────────────────────────
  //
  // Sotto lg il foglio globale spegne `.doc-form__table-wrap`: senza le card le
  // righe non ci sarebbero proprio. La forma è quella condivisa da tutte le
  // maschere documento; qui si dice solo cosa scriverci.

  /** Quale card è aperta. Una per volta: due aperte fanno perdere il segno. */
  private readonly openLine = signal<number | null>(null);

  protected isLineOpen(index: number): boolean {
    return this.openLine() === index;
  }

  protected toggleLine(index: number): void {
    this.openLine.update((corrente) => (corrente === index ? null : index));
  }

  /**
   * Il titolo della card.
   *
   * ⚠️ **Si passa sempre un testo**: il default della card condivisa è «Riga
   * senza prodotto», e su una registrazione che prodotti non ne ha mai è la
   * parola sbagliata. Si configura dall'esterno invece di toccare il componente.
   *
   * Senza descrizione — che è **facoltativa** — il titolo è l'**importo**: è il
   * dato con cui l'operatore riconosce la riga, ed è ciò che il riferimento
   * gestionale mette per primo. «Riga senza descrizione» descriveva un'assenza
   * invece di identificare la riga.
   */
  protected lineCardTitle(index: number): string {
    const descrizione = this.lines.at(index)?.controls.description.value.trim();
    if (descrizione) {
      return descrizione;
    }
    const importo = this.lines.at(index)?.controls.amount.value.trim();
    return importo ? `${importo} ${this.currency === 'EUR' ? '€' : this.currency}` : 'Nuova riga';
  }

  /** Sotto il titolo: il Codice IVA, che a card chiusa è metà del dato. */
  protected lineCardMeta(index: number): readonly DocumentLineCardMeta[] {
    const vatCode = this.vatCodesById().get(this.lines.at(index)?.controls.vatCodeId.value ?? '');
    if (!vatCode) {
      // Non un trattino: la riga NON si salva senza Codice IVA, e la card lo
      // deve dire dove si guarda, non solo al momento del rifiuto.
      return [{ text: 'Codice IVA da scegliere', tone: 'warning' }];
    }
    // «22 · 22%» dice due volte la stessa cosa: il codice di un'aliquota
    // ordinaria SI CHIAMA come l'aliquota. Si mostra il codice solo quando
    // aggiunge qualcosa — è la stessa regola di `vatCodeSelectOption`.
    const aliquota = formatVatRate(vatCode.ratePercent);
    const codice = vatCode.code.trim();
    return [{ text: aliquota.startsWith(codice) ? aliquota : `${codice} · ${aliquota}` }];
  }

  protected lineVatOptions(index: number): readonly SelectMenuOption[] {
    return vatOptionsIncludingSelected(
      this.vatCodeOptionsBase(),
      this.lines.at(index)?.controls.vatCodeId.value,
      this.vatCodesById(),
    );
  }

  protected onLineVatSelect(index: number, value: string | null): void {
    const line = this.lines.at(index);
    if (!line) {
      return;
    }
    line.controls.vatCodeId.setValue(value ?? '');
    // Cambiando aliquota cambia lo scorporo: in modalità ivata il campo mostra
    // ancora l'ivato di prima, e il canonico va ricalcolato da lì — o la riga
    // varrebbe d'improvviso un altro importo senza che nulla si muova.
    if (this.pricesIncludeVat()) {
      this.onAmountInput(index, line.controls.amount.value);
    }
    this.redrawAmountFields();
  }

  // ── Netto memorizzato, netto o ivato a schermo ─────────────────────────────
  //
  // La riga porta sempre l'importo NETTO canonico (`netAmountMinor`), con la
  // coda dello scorporo. Il campo è solo una vista: `amountFieldValue` rende,
  // `netFromDisplayed` memorizza, e il selettore cambia SOLO la vista.
  //
  // Il modello è l'Ordine fornitore, non la maschera Fatture: quella riconverte
  // il valore MOSTRATO, già arrotondato a due decimali, e su un importo digitato
  // ivato perde il centesimo. Qui il canonico non viene mai ricostruito da ciò
  // che si vede, quindi si può passare avanti e indietro quante volte si vuole.

  /** Aliquota effettiva di una riga: solo l'IVA esposta si scorpora. */
  private lineRate(index: number): number {
    const vatCode = this.vatCodesById().get(this.lines.at(index)?.controls.vatCodeId.value ?? '');
    const exposed =
      vatCode?.calculationMode === 'standard' || vatCode?.calculationMode === 'split_payment';
    if (!vatCode || !exposed) {
      return 0;
    }
    return Math.max(0, vatCode.ratePercent);
  }

  /** L'imposta di questa riga concorre al totale? */
  private lineCountsVat(index: number): boolean {
    return this.lineRate(index) > 0;
  }

  /** Il selettore mostra l'ivato su questa riga? */
  private showsGross(index: number): boolean {
    return this.pricesIncludeVat() && this.lineRate(index) > 0;
  }

  /**
   * Valore digitato nella modalità corrente → netto da MEMORIZZARE, quindi
   * scorporato ESATTAMENTE: 70,00 ivati al 22% non hanno un netto intero, e
   * arrotondarlo qui li farebbe tornare 69,99 al giro dopo.
   */
  private netFromDisplayed(displayedMinor: number, index: number): number {
    return this.showsGross(index)
      ? toStorableMinor(netFromGrossExact(displayedMinor, this.lineRate(index)))
      : toStorableMinor(displayedMinor);
  }

  /**
   * Netto canonico → stringa per il campo, nella modalità corrente. È il punto
   * di USCITA: due decimali, sempre — anche in modalità netta, dove non c'è
   * conversione da fare ma il netto può portare la coda di uno scorporo.
   */
  private amountFieldValue(netMinor: number, index: number): string {
    const displayed = this.showsGross(index)
      ? grossFromNetMinor(netMinor, this.lineRate(index))
      : roundToMinor(netMinor);
    return moneyToDecimalString({ amountMinor: displayed, currencyCode: this.currency }).replace(
      '.',
      ',',
    );
  }

  /**
   * Il campo è stato digitato: il canonico si aggiorna da lì. È l'UNICO punto in
   * cui il netto nasce da ciò che si vede, ed è giusto che sia così — qui il
   * valore mostrato è quello che l'operatore ha appena deciso.
   */
  protected onAmountInput(index: number, value: string): void {
    const line = this.lines.at(index);
    if (!line) {
      return;
    }
    const parsed = parseMoneyInput(value, this.currency);
    line.controls.netAmountMinor.setValue(
      parsed ? this.netFromDisplayed(parsed.amountMinor, index) : null,
      { emitEvent: false },
    );
  }

  /**
   * Riscrive i campi importo dal netto canonico. `emitEvent: false` di
   * proposito: ridisegnare la vista non è una modifica della registrazione e non
   * deve rimbalzare sul canonico.
   */
  private redrawAmountFields(): void {
    this.lines.controls.forEach((line, index) => {
      const net = line.controls.netAmountMinor.value;
      if (net == null) {
        return;
      }
      line.controls.amount.setValue(this.amountFieldValue(net, index), { emitEvent: false });
    });
  }

  /**
   * Cambio Ivati/Netti: cambia SOLO come si guardano gli importi, mai quanto
   * valgono. I campi si ridisegnano dal netto canonico, che non viene toccato.
   */
  protected setPriceMode(value: string | null): void {
    const gross = value !== 'net';
    if (gross === this.pricesIncludeVat()) {
      return;
    }
    // Lo switch non vive nel form: va marcato a mano, o la guardia d'uscita
    // lascerebbe uscire perdendo la scelta.
    this.markFormDirty();
    this.pricesIncludeVat.set(gross);
    this.redrawAmountFields();
  }

  protected priceModeValue(): string {
    return this.pricesIncludeVat() ? 'gross' : 'net';
  }

  // ── Totali ────────────────────────────────────────────────────────────────

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: null });

  protected readonly totals = computed(() => {
    this.formValue();
    this.pricesIncludeVat();
    this.vatCodesById();
    const lines = this.lines.controls.map((line, index) => {
      const netExact = line.controls.netAmountMinor.value ?? 0;
      const rate = this.lineRate(index);
      return {
        netMinor: Math.round(netExact),
        vatMinor: lineVatFromNetExact(netExact, rate),
        vatRate: rate,
        countsVatInTotal: this.lineCountsVat(index),
      };
    });
    return computeDocumentTotals(lines, 0, this.currency);
  });

  /** Imponibile della riga: l'arrotondamento sta qui, non sul canonico. */
  protected lineNet(index: number): Money {
    const net = this.lines.at(index)?.controls.netAmountMinor.value ?? 0;
    return { amountMinor: Math.round(net), currencyCode: this.currency };
  }

  /** Imposta della riga, calcolata sull'imponibile ESATTO. */
  protected lineVat(index: number): Money {
    const net = this.lines.at(index)?.controls.netAmountMinor.value ?? 0;
    return {
      amountMinor: lineVatFromNetExact(net, this.lineRate(index)),
      currencyCode: this.currency,
    };
  }

  // ── Convalide di maschera ─────────────────────────────────────────────────

  protected fieldInvalid(name: 'documentDate' | 'locationId'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  /**
   * Il campo tiene ferma la registrazione: obbligatorio, ancora vuoto, e finché
   * resta così il resto è spento. Distinto da `fieldInvalid`, che dice «hai
   * provato a salvare e questo è sbagliato»: aprire una registrazione nuova non
   * è un errore, è l'inizio del lavoro.
   */
  protected locationWaiting(): boolean {
    this.formValue();
    return !this.form.controls.locationId.value;
  }

  /**
   * **Il cancello della testata**: finché la Sede è vuota il resto della
   * registrazione è spento, come in Arrivo merce e Ordine fornitore.
   *
   * ⚠️ **La ragione qui non è tecnica, ed è giusto dirlo.** Sull'Ordine
   * fornitore il cancello esiste perché fra le colonne c'è «Cod. fornitore» —
   * scriverlo prima di aver detto chi è il fornitore sarebbe la scritta senza il
   * suo soggetto. Nel Corrispettivo manuale quel campo non esiste: la riga porta
   * importo, aliquota e descrizione, e nessuno dei tre dipende dalla sede.
   *
   * Il cancello c'è lo stesso, per **prevedibilità** (deciso il 17/08/2026):
   * quattro maschere che si comportano allo stesso modo valgono più di una
   * regola in meno da ricordare. È lo stesso argomento con cui l'Ordine
   * fornitore ha adottato il blocco alla riapertura.
   */
  protected readonly headerGateActive = computed(() => {
    this.formValue();
    return !this.form.controls.locationId.value;
  });

  /** Titolo dello stato vuoto: dice cosa manca, non che manca qualcosa. */
  protected readonly linesEmptyTitle = computed(() =>
    this.headerGateActive() ? 'Scegli la sede' : 'Nessuna riga inserita',
  );

  protected readonly linesEmptyDescription = computed(() =>
    this.headerGateActive()
      ? 'Le righe si compilano dopo: un corrispettivo appartiene sempre a una sede, ed è la sola cosa senza la quale non si salva.'
      : 'Aggiungi una riga con importo e Codice IVA.',
  );

  protected lineIncomplete(index: number): boolean {
    const line = this.lines.at(index);
    if (!line) {
      return false;
    }
    const vuota = !line.controls.description.value.trim() && !line.controls.amount.value.trim();
    return !vuota && !line.controls.vatCodeId.value;
  }

  // ── Caricamento ───────────────────────────────────────────────────────────

  private loadReceipt(id: string): void {
    this.manualReceipts
      .getById(id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (receipt) => this.patchFromReceipt(receipt),
        error: (err: unknown) => this.loadError.set(this.toAppError(err)),
      });
  }

  private patchFromReceipt(receipt: ManualReceipt): void {
    this.suppressDirtyMarking = true;
    this.assignedNumber.set(receipt.number);
    this.createdByName.set(receipt.createdByName);
    this.pricesIncludeVat.set(receipt.pricesIncludeVat);
    this.form.patchValue({
      documentDate: receipt.documentDate,
      locationId: receipt.locationId,
      notes: receipt.notes ?? '',
    });
    this.lines.clear();
    for (const line of receipt.lines) {
      this.addLine();
      const group = this.lines.at(this.lines.length - 1);
      group.controls.description.setValue(line.description);
      group.controls.vatCodeId.setValue(line.vatCodeId ?? '');
      // ⚠️ Si riparte dal netto CANONICO, non dall'importo digitato: è la coda
      // di quel numero a far tornare 70,00 quando la modalità è ivata.
      group.controls.netAmountMinor.setValue(line.netAmountMinor, { emitEvent: false });
    }
    if (this.lines.length === 0) {
      this.addLine();
    }
    this.redrawAmountFields();
    this.suppressDirtyMarking = false;
    this.dirtySinceLastSave.set(false);
  }

  // ── Salvataggio ed eliminazione ───────────────────────────────────────────

  protected save(onSaved?: () => void): void {
    if (this.saving()) {
      return;
    }
    this.form.markAllAsTouched();
    if (this.form.controls.documentDate.invalid || this.form.controls.locationId.invalid) {
      return;
    }

    const lines = this.buildLinesBody();
    if (lines.length === 0) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: 'Aggiungi almeno una riga con descrizione e importo.',
        },
      });
      return;
    }
    const incompleta = this.lines.controls.findIndex((_line, index) => this.lineIncomplete(index));
    if (incompleta >= 0) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: `Riga ${incompleta + 1}: scegli il Codice IVA della riga.`,
        },
      });
      return;
    }

    const body: SaveManualReceiptBody = {
      documentDate: this.form.controls.documentDate.value,
      locationId: this.form.controls.locationId.value,
      pricesIncludeVat: this.pricesIncludeVat(),
      notes: this.form.controls.notes.value.trim() || undefined,
      lines,
    };

    this._submitState.set({ status: 'saving' });
    const id = this.receiptId();
    const request = id ? this.manualReceipts.update(id, body) : this.manualReceipts.create(body);

    request.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this._submitState.set({ status: 'idle' });
        this.dirtySinceLastSave.set(false);
        /**
         * ⚠️ **Salvato si RESTA, non si torna all'elenco.**
         *
         * Andarsene faceva perdere di vista quello che si era appena scritto, e
         * col numero assegnato in quel momento: per rileggerlo bisognava
         * ritrovarlo nel Registro. Ora la registrazione resta sotto gli occhi,
         * col suo numero, **bloccata** — si sblocca con «Modifica».
         *
         * L'id assegnato si tiene: da qui in avanti ogni salvataggio è un
         * `PATCH` sullo stesso record. Senza, un secondo Salva avrebbe creato
         * una seconda registrazione con un secondo numero.
         */
        this.receiptId.set(saved.id);
        this.assignedNumber.set(saved.number);
        this.createdByName.set(saved.createdByName);
        // Torna protetto SUBITO: lo sblocco valeva per la modifica che si è
        // appena conclusa, non per tutta la sessione.
        this.editLock.relock(saved.id);
        onSaved?.();
      },
      error: (err: unknown) => {
        this._submitState.set({ status: 'error', error: this.toAppError(err) });
      },
    });
  }

  // ── Sblocco, col dialogo delle altre maschere ─────────────────────────────

  protected requestUnlockEdit(): void {
    this.unlockDialogOpen.set(true);
  }

  protected confirmUnlockEdit(): void {
    this.unlockDialogOpen.set(false);
    this.editLock.unlock(this.receiptId());
  }

  protected cancelUnlockEdit(): void {
    this.unlockDialogOpen.set(false);
  }

  /**
   * Le righe da mandare: quelle vuote non partono.
   *
   * L'importo viaggia **nella modalità della testata**, derivato dal canonico —
   * mai riletto dal campo, che è una vista.
   */
  private buildLinesBody(): SaveManualReceiptBody['lines'] {
    return this.lines.controls
      .map((line, index) => {
        const net = line.controls.netAmountMinor.value;
        const description = line.controls.description.value.trim();
        if (!description && (net == null || net === 0)) {
          return null;
        }
        const amountMinor =
          net == null
            ? 0
            : this.showsGross(index)
              ? grossFromNetMinor(net, this.lineRate(index))
              : net;
        return {
          description,
          amountMinor,
          vatCodeId: line.controls.vatCodeId.value || undefined,
        };
      })
      .filter((line): line is NonNullable<typeof line> => line !== null);
  }

  protected askDelete(): void {
    this.deleteDialogOpen.set(true);
  }

  protected cancelDelete(): void {
    this.deleteDialogOpen.set(false);
  }

  /**
   * L'eliminazione è semplice, e resta semplice: la registrazione se ne va con
   * le sue righe. **Il buco nella numerazione resta**, e non si rinumera niente.
   */
  protected confirmDelete(): void {
    const id = this.receiptId();
    if (!id || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.manualReceipts
      .remove(id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.deleteDialogOpen.set(false);
          this.dirtySinceLastSave.set(false);
          void this.router.navigateByUrl(LIST_PATH);
        },
        error: (err: unknown) => {
          this.deleting.set(false);
          this.deleteDialogOpen.set(false);
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  // ── Uscita ────────────────────────────────────────────────────────────────

  protected cancel(): void {
    this.navHistory.backOr(LIST_PATH);
  }

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

  protected confirmExitSaving(): void {
    this.save(() => {
      this.exitDialogOpen.set(false);
      this.pendingDeactivate?.(true);
      this.pendingDeactivate = null;
    });
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
