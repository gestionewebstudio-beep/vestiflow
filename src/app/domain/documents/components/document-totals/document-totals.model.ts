import type { FormControl } from '@angular/forms';

import type { Money } from '@core/models/money.model';

/**
 * Che **ruolo** ha la voce nel riepilogo — non che cosa contiene.
 *
 * ⛔ I quattro valori non sono un elenco di casi documentali: sono i quattro
 * modi in cui una voce di totale si comporta, e il foglio di stile li vestiva
 * già così (`doc-form__totals-row--field`, `--total`, `--info`). Qui si
 * dichiara il ruolo; il documento decide quali voci ha.
 */
export type DocumentTotalKind =
  /** Voce normale: etichetta a sinistra, importo a destra. */
  | 'plain'
  /** Voce MODIFICABILE: al posto dell'importo c'è un campo. */
  | 'field'
  /** La voce che risponde alla domanda del documento: peso e tinta propri. */
  | 'total'
  /** Voce di dettaglio (per aliquota, per natura): rientrata e più piccola. */
  | 'info';

/**
 * Una voce del riepilogo totali.
 *
 * ⚠️ **Il componente NON calcola.** Riceve valori già decisi e li rende. Il
 * calcolo dei totali diverge oggi fra le maschere sull'arrotondamento dello
 * sconto, e unificarlo cambierebbe gli importi su documenti fiscali **già
 * emessi**: è una decisione separata, che non deve entrare di straforo con un
 * lavoro di presentazione.
 */
export interface DocumentTotalRow {
  /** Identificativo stabile della voce: serve al `track` e alle prove. */
  readonly key: string;
  readonly label: string;
  /**
   * L'importo. Assente sulle voci `field`, dove al suo posto c'è il controllo.
   *
   * ⚠️ `null` non è zero: è «questa voce non ha un importo». Una voce a zero si
   * dichiara con un `Money` che vale zero.
   */
  readonly value?: Money | null;
  /** Default `plain`. */
  readonly kind?: DocumentTotalKind;
  /**
   * Mostra il segno meno davanti all'importo.
   *
   * ⚠️ È una scelta di RAPPRESENTAZIONE, non un calcolo: lo sconto documento si
   * memorizza positivo e si mostra in detrazione. Chi passa un valore già
   * negativo non deve alzare questa bandiera, o il meno comparirebbe due volte.
   */
  readonly negative?: boolean;
  /**
   * Solo per `kind: 'field'`: il controllo che la voce modifica.
   *
   * ⛔ Il componente non sa che cos'è — sconto, spese, acconto. Sa che questa
   * voce si scrive invece di leggersi. È la differenza fra conoscere la
   * grammatica dei documenti e conoscerne i nomi.
   */
  readonly control?: FormControl<string>;
  readonly inputId?: string;
  readonly ariaLabel?: string;
  readonly placeholder?: string;
}
