import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { CurrencyCode } from '@core/models/common.model';
import { MoneyInputComponent } from '@shared/components/money-input/money-input.component';

import { classifyLineCellKey } from '../../utils/document-line-cell-keys.util';

/**
 * L'importo **dentro una riga documento**: la primitiva monetaria comune più le
 * sole cose che una riga ha in più — l'indice e il giro del fuoco fra colonne.
 *
 * ⭐ **Adattatore sottile, per scelta.** Parsing, formattazione, normalizzazione
 * a due decimali e conservazione del canonico stanno **tutti** in
 * `app-money-input` e non sono riscritti qui: se lo fossero avremmo due
 * grammatiche del denaro, che è il difetto che la primitiva esiste per togliere.
 *
 * È lo stesso schema di `document-line-unit-cell`, che è 55 righe sopra la cella
 * a ricerca-e-selezione e aggiunge solo ciò che l'unità di misura ha in più.
 *
 * ⛔ **Non sa che documento la ospita.** Se quell'importo sia un costo, il prezzo
 * di una riga di vendita o il prezzo anagrafico di una variante mostrato in riga
 * lo sa il consumer — e con esso la modalità netto/ivato, l'aliquota e dove il
 * valore verrà salvato.
 */
@Component({
  selector: 'app-document-line-money-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyInputComponent],
  templateUrl: './document-line-money-cell.component.html',
})
export class DocumentLineMoneyCellComponent {
  readonly lineIndex = input.required<number>();
  /** Valore canonico in unità minori, coda inclusa. `null` = assente. */
  readonly value = input.required<number | null>();
  readonly currencyCode = input<CurrencyCode>('EUR');
  readonly inputId = input('');
  readonly ariaLabel = input('');
  readonly placeholder = input('0,00');
  readonly readOnly = input(false);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly min = input<number | null>(null);
  readonly selectOnFocus = input(true);
  readonly inputClass = input('doc-form__input doc-form__input--table doc-form__input--num');
  /**
   * Il campo partecipa al giro delle colonne. Su card è `false`: lì le colonne
   * non esistono e il Tab resta al browser.
   */
  readonly inColumnCycle = input(true);

  readonly valueChange = output<number | null>();
  readonly focused = output<void>();
  readonly blurred = output<void>();
  readonly lineAdvance = output<number>();
  readonly lineRetreat = output<number>();
  readonly lineRowAdvance = output<number>();
  readonly lineRowRetreat = output<number>();

  /**
   * ⚠️ Le frecce ←/→ escono al primo colpo, come nelle celle a
   * ricerca-e-selezione: in un campo numerico il cursore non si legge, e
   * `caretAtEdge` risponde «sono al bordo» per la stessa ragione.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (!this.inColumnCycle()) {
      return;
    }
    const esito = classifyLineCellKey(event, {
      suggestionsOpen: false,
      activeSuggestionIndex: -1,
      arrowsLeaveAtOnce: true,
    });
    if (!esito) {
      return;
    }
    switch (esito.kind) {
      case 'row-advance':
        event.preventDefault();
        this.lineRowAdvance.emit(this.lineIndex());
        return;
      case 'row-retreat':
        event.preventDefault();
        this.lineRowRetreat.emit(this.lineIndex());
        return;
      case 'field-retreat':
        event.preventDefault();
        this.lineRetreat.emit(this.lineIndex());
        return;
      case 'confirm':
        event.preventDefault();
        // Invio registra e RESTA (§4.5): avanza solo Tab e → al bordo.
        if (esito.advance) {
          this.lineAdvance.emit(this.lineIndex());
        }
        return;
      default:
        return;
    }
  }
}
