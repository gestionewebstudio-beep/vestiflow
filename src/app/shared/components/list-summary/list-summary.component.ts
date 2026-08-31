import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { DataTableTotals } from '@shared/components/data-table/data-table.model';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

/** Una voce della fascia: etichetta sopra, valore sotto. */
interface VoceRiepilogo {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

/**
 * ⭐ **La fascia RIEPILOGO di un elenco**, nella forma del Registro Corrispettivi.
 *
 * Indicata dal proprietario il 31/08/2026: _«per i riepiloghi dei documenti,
 * quindi acquisti, ordini e vendite, la struttura dei totali dovrebbe essere
 * come quella dei corrispettivi per avere coerenza di visualizzazione. I totali
 * poi compariranno in base alla colonna attiva.»_
 *
 * ```text
 * ┌──────────────────────────────────────────────┐
 * │ 17 voci                                      │
 * │       IMPONIBILE      IVA         TOTALE     │
 * │         1.052,04   105,22       1.157,26     │
 * └──────────────────────────────────────────────┘
 * ```
 *
 * ## ⛔ Sostituisce la riga totali, non la affianca
 *
 * Chiesto esplicitamente — «se affianca si raddoppiano le info?» — e la risposta
 * è sì. Un elenco che monta questa fascia **non** passa `[totals]` al motore.
 *
 * ## ⭐ Il contenuto viene dalle COLONNE ATTIVE
 *
 * Non c'è un elenco di metriche scritto a mano: le voci sono le colonne visibili
 * che portano un totale, nell'ordine in cui stanno in tabella. Spegnere una
 * colonna dal selettore Colonne ne toglie il totale — la stessa regola della
 * riga totali, che questa fascia sostituisce e non riscrive.
 *
 * ## ⛔ Non somma e non ricalcola
 *
 * `regole-gestionale` è esplicita: «il riepilogo SOMMA, non ricalcola». Qui
 * arriva un `DataTableTotals` già determinato e già formattato — chi lo produce
 * decide anche l'AMBITO, cioè se sono i totali del filtro o quelli della
 * selezione.
 */
@Component({
  selector: 'app-list-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './list-summary.component.html',
})
export class ListSummaryComponent {
  readonly totals = input<DataTableTotals | null>(null);

  /**
   * Le colonne VISIBILI, nell'ordine della tabella: danno le etichette e
   * decidono quali totali compaiono.
   */
  readonly columns = input.required<readonly ResolvedTableColumn[]>();

  /**
   * ⭐ **Quale voce RISPONDE alla domanda dell'elenco** e sale al valore
   * evidenziato: su un registro documenti è il Totale.
   *
   * ⚠️ Omesso, nessuna voce si distingue — e va bene per un elenco che non ha
   * una risposta sola.
   */
  readonly emphasis = input<string | null>(null);

  /** Le voci che si leggono come una sottrazione (resi, note di credito). */
  readonly negative = input<readonly string[]>([]);

  /** Il nome della cosa contata: «17 voci», «17 documenti». */
  readonly countLabel = input<string>('voce');
  readonly countLabelPlural = input<string>('voci');

  protected readonly voci = computed<readonly VoceRiepilogo[]>(() => {
    const valori = this.totals()?.values ?? {};
    return this.columns()
      .filter((column) => valori[column.id] !== undefined)
      .map((column) => ({ id: column.id, label: column.label, value: valori[column.id]! }));
  });

  protected readonly conteggio = computed(() => {
    const n = this.totals()?.count ?? 0;
    return `${n} ${n === 1 ? this.countLabel() : this.countLabelPlural()}`;
  });

  /*
    ⚠️ **La fascia non sparisce quando non c'è nulla da sommare.** Il conteggio
    resta, ed è il caso di un elenco senza colonne numeriche accese: «17 voci» è
    già un totale. ⛔ Sparire farebbe saltare in verticale i comandi sotto, che è
    il difetto che la riga totali evitava restando sempre presente.
  */
  protected readonly haTotali = computed(() => this.totals() !== null);

  protected isNegativa(id: string): boolean {
    return this.negative().includes(id);
  }
}
