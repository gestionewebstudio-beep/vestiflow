import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { formatMoney } from '@core/utils/money.util';

import type { DocumentTotalRow } from './document-totals.model';

/**
 * **Il riepilogo totali di un documento, per tutte le maschere.**
 *
 * ⛔ **Era la stessa cosa scritta cinque volte.** Misurato il 24/08/2026:
 * l'elenco dell'Ordine cliente e quello dell'Arrivo merce sono identici riga
 * per riga salvo il prefisso degli identificativi e un commento; l'Ordine
 * fornitore differisce per tre righe di commento e tre accessor che sono alias
 * puri. Le voci ricorrono così: «Imponibile righe» 5/5, «IVA» 5/5, «Totale
 * documento» 5/5, «Sconto documento» e «Imponibile» 4/5.
 *
 * ## ⚠️ Il componente NON calcola
 *
 * Riceve valori già decisi e li rende. Il calcolo dei totali **diverge** oggi
 * fra le maschere sull'arrotondamento dello sconto — quattro usano
 * `computeDocumentTotals`, che lo ripartisce per aliquota, mentre i Documenti
 * di vendita moltiplicano l'imposta già sommata. Unificarlo cambierebbe gli
 * importi su **fatture già emesse**: è una decisione fiscale separata, e il
 * modo peggiore di prenderla sarebbe farla entrare insieme a un lavoro di
 * presentazione.
 *
 * ## ⛔ Una divergenza che questo componente NON risolve, e che va vista
 *
 * «Imponibile righe» significa oggi **due grandezze diverse**:
 *
 * ```text
 * Ordine cliente · Arrivo merce · Ordine fornitore · Banco → il totale righe PRE-sconto
 * Documenti di vendita                                     → il totale righe GIA' scontato
 * ```
 *
 * Nessuna ragione scritta è stata trovata per la differenza. I valori
 * continuano ad arrivare da ogni maschera, quindi l'estrazione non la crea —
 * ma la rende **meno visibile**, perché il markup che la mostra diventa uno
 * solo. È dichiarata qui perché chi la incontra la veda invece di ereditarla.
 *
 * ## Che cosa resta della maschera
 *
 * Quali voci ci sono, in che ordine, con quali valori — e la decisione se una
 * voce compaia (lo sconto documento si mostra solo quando c'è). Qui sta la
 * **forma**: la griglia, i pesi, le tinte, l'incolonnamento delle cifre.
 */
@Component({
  selector: 'app-document-totals',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './document-totals.component.html',
})
export class DocumentTotalsComponent {
  readonly rows = input.required<readonly DocumentTotalRow[]>();

  /**
   * La classe che porta il ruolo della voce.
   *
   * ⚠️ `plain` non aggiunge nulla: il foglio veste la riga base, e i tre
   * modificatori esistono già in `_document-form-footer.scss`.
   */
  protected rowClass(row: DocumentTotalRow): string {
    const kind = row.kind ?? 'plain';
    return kind === 'plain' ? '' : `doc-form__totals-row--${kind}`;
  }

  /**
   * L'importo come si legge.
   *
   * ⚠️ **Un solo formattatore.** Le maschere ne usavano due — `formatMoney` e
   * un `money()` locale che forzava la valuta predefinita — e la differenza non
   * aveva ragione: un documento in un'altra valuta si sarebbe letto sbagliato
   * al banco e giusto altrove.
   *
   * ⛔ Il segno meno è una **rappresentazione**: lo sconto si memorizza
   * positivo e si mostra in detrazione. Chi passa un valore già negativo non
   * alza `negative`, o il meno comparirebbe due volte.
   */
  protected testo(row: DocumentTotalRow): string {
    if (row.value == null) {
      return '';
    }
    const importo = formatMoney(row.value);
    return row.negative ? `−${importo}` : importo;
  }
}
