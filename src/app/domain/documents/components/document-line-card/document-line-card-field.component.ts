import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Un campo dentro il corpo apribile della card riga: etichetta sopra, controllo
 * sotto, mezza colonna della griglia.
 *
 * **Perché è un componente e non una classe.** Il contenuto proiettato porta
 * l'incapsulamento di chi lo scrive, non di chi lo ospita: una regola scritta
 * nel foglio della card non raggiungerebbe un campo che arriva dalla maschera.
 * Qui markup e stile restano insieme, e ogni documento ci mette dentro il
 * controllo che gli serve.
 */
@Component({
  selector: 'app-document-line-card-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'doc-line-card-field',
    '[class.doc-line-card-field--full]': 'full()',
    '[class.doc-line-card-field--readonly]': 'readonly()',
    '[class.doc-line-card-field--anchor]': 'anchor()',
  },
  templateUrl: './document-line-card-field.component.html',
  styleUrl: './document-line-card-field.component.scss',
})
export class DocumentLineCardFieldComponent {
  readonly label = input.required<string>();
  /** Id del controllo dentro: lega l'etichetta a chi la porta. Vuoto = `<span>`. */
  readonly controlId = input('');
  /** Occupa la riga intera invece di mezza colonna. */
  readonly full = input(false);
  /** Valore calcolato: stessa altezza, ma si vede che non si scrive. */
  readonly readonly = input(false);
  /**
   * Il campo è l'ancora di un pannello che si stende sotto (la scelta fra più
   * codici, i suggerimenti sul nome).
   */
  readonly anchor = input(false);
}
