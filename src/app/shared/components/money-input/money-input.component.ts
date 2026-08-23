import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import type { CurrencyCode } from '@core/models/common.model';
import {
  DEFAULT_CURRENCY,
  currencyDecimals,
  parseMoneyInput,
  sameAmountAtCent,
} from '@core/utils/money.util';

/**
 * **Il campo di denaro, uno solo per tutta l'applicazione.**
 *
 * Non sa cosa sta modificando: un prezzo di variante in anagrafica, il prezzo
 * unitario di una riga documento, un costo. Riceve un valore canonico in unità
 * minori e restituisce quello digitato, nella stessa forma. Significato,
 * conversione netto/ivato e destinazione del salvataggio restano di chi lo usa.
 *
 * ⭐ **Sta in `shared/` e non in `domain/documents/` per una ragione precisa**:
 * lo usa anche l'anagrafica prodotto, che vive in `domain/products` e non può
 * importare da un altro dominio. Chiamarlo «cella di riga documento» avrebbe
 * legato al primo consumer una primitiva che ne ha molti.
 *
 * ── Perché `type="text"` e non `type="number"` ─────────────────────────────
 *
 * ⛔ `type="number"` **non può mostrare `86,00`**: il browser normalizza secondo
 * la propria locale e scarta gli zeri finali. Il formato dei soldi è una
 * decisione dell'applicazione, non del browser — e il segno decimale italiano è
 * la virgola.
 *
 * `inputmode="decimal"` resta il contratto globale dei campi monetari (deciso il
 * 17/08/2026): è la discriminante con cui la regola di progetto toglie le frecce
 * ai campi di denaro e `number-input-wheel-guard` spegne la rotella. Dichiararlo
 * qui significa ereditare quella protezione, non riscriverla.
 *
 * ── La coda decimale sopravvive al giro di editing ─────────────────────────
 *
 * ⚠️ **La regola che questo componente esiste per rispettare.** Un costo nato da
 * uno scorporo vale 84,4262 centesimi e a schermo è `0,84`. Se entrare e uscire
 * dal campo riscrivesse il canonico col valore mostrato, la coda morirebbe al
 * primo `Tab` — e con lei il fatto che 1,03 ivati tornano 1,03.
 *
 * Perciò allo sfocamento il valore digitato si confronta **al centesimo** con
 * quello ricevuto: se coincidono non si emette nulla e si rimostra il canonico.
 * Si emette solo quando l'operatore ha cambiato davvero qualcosa.
 */
@Component({
  selector: 'app-money-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './money-input.component.html',
  styleUrl: './money-input.component.scss',
})
export class MoneyInputComponent {
  /** Valore canonico in unità minori, coda decimale inclusa. */
  readonly value = input.required<number>();
  readonly currencyCode = input<CurrencyCode>(DEFAULT_CURRENCY);
  readonly inputId = input('');
  readonly ariaLabel = input('');
  readonly placeholder = input('0,00');
  readonly readOnly = input(false);
  readonly disabled = input(false);
  /** Non valido per decisione del chiamante: qui non si valida nulla da soli. */
  readonly invalid = input(false);
  /**
   * Soglia di SEGNALAZIONE in unità minori, non un limite che taglia.
   *
   * ⛔ Sostituisce il `min` nativo che si perde passando a `type="text"`, e ne
   * conserva il solo effetto onesto: dire che il valore è fuori soglia. **Non
   * fa clamp**: cambiare in silenzio quello che l'operatore ha scritto è una
   * regola economica, e le regole economiche stanno nel consumer.
   */
  readonly min = input<number | null>(null);
  /** All'ingresso il contenuto è selezionato: si sovrascrive digitando. */
  readonly selectOnFocus = input(false);
  /** Classi del campo: chi lo ospita decide la propria veste (tabella, form). */
  readonly inputClass = input('');

  /** Il nuovo valore canonico, in unità minori. */
  readonly valueChange = output<number>();
  readonly focused = output<void>();
  readonly blurred = output<void>();

  /**
   * Quello che l'operatore sta scrivendo. `null` = nessuna digitazione in corso,
   * quindi si mostra il canonico formattato.
   */
  private readonly digitato = signal<string | null>(null);

  protected readonly testo = computed(() => this.digitato() ?? this.formattato());

  protected readonly fuoriSoglia = computed(() => {
    const soglia = this.min();
    return soglia != null && this.value() < soglia;
  });

  /** Il canonico come lo legge l'operatore: due decimali, mai il simbolo. */
  private formattato(): string {
    const decimali = currencyDecimals(this.currencyCode());
    const maggiore = Math.round(this.value()) / 10 ** decimali;
    return new Intl.NumberFormat('it-IT', {
      minimumFractionDigits: decimali,
      maximumFractionDigits: decimali,
      // ⛔ Niente separatore delle migliaia DENTRO il campo: `1.234,56` in un
      // input si rilegge male mentre lo si modifica, e chi cancella una cifra
      // si trova il punto fuori posto. Nelle celle di sola lettura e nelle
      // stampe il raggruppamento resta, ed è `formatMoney` a metterlo.
      useGrouping: false,
    }).format(maggiore);
  }

  protected onInput(testo: string): void {
    this.digitato.set(testo);
  }

  protected onFocus(target: EventTarget | null): void {
    if (this.selectOnFocus() && target instanceof HTMLInputElement) {
      target.select();
    }
    this.focused.emit();
  }

  /**
   * Lo sfocamento è il momento in cui il campo decide: normalizza sempre a due
   * decimali, ed emette **solo** se il valore è cambiato al centesimo.
   */
  protected onBlur(): void {
    const scritto = this.digitato();
    this.digitato.set(null);
    this.blurred.emit();

    if (scritto === null) {
      // Entrato e uscito senza scrivere: non c'è niente da decidere.
      return;
    }

    const letto = parseMoneyInput(scritto, this.currencyCode());
    if (letto === null) {
      // Testo vuoto o non numerico: il canonico resta quello che era, e il
      // campo torna a mostrarlo. Svuotare un campo di denaro non significa
      // «azzera»: significa «non ho scritto niente».
      return;
    }

    if (sameAmountAtCent(letto.amountMinor, this.value())) {
      // ⭐ Il cuore: lo stesso importo per l'operatore. Emetterlo sostituirebbe
      // 84,4262 con 84, e la coda non tornerebbe più.
      return;
    }

    this.valueChange.emit(letto.amountMinor);
  }
}
