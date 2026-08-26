import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { ViewportService } from '@core/services/viewport.service';

/**
 * **Due campi brevi affiancati DENTRO il pannello — e trasparente su scrivania.**
 *
 * ## Il difetto che chiude
 *
 * `app-document-header` ha già `twoColumns`, ma è tutto-o-niente: mette
 * `--two` sull'unico contenitore dei campi, quindi o si affiancano tutti o
 * nessuno. La testata dell'Ordine cliente affianca **solo** Data documento,
 * Stato e Consegna prevista, e impila tutto il resto — Numero, Modalità
 * prezzo, Listino, Rif., Pagamento.
 *
 * ⛔ **Senza questo, migrare avrebbe cambiato la vista mobile di riferimento**:
 * accendendo `twoColumns` sull'intero pannello si sarebbero affiancati anche
 * gli altri cinque. Ed è la vista che il proprietario ha scelto come modello,
 * quindi non è un dettaglio negoziabile.
 *
 * ## Perché non basta un `<div>` scritto nella maschera
 *
 * Il contenuto della testata si dichiara **una volta** e viene proiettato in
 * tutte e due le vesti. Un `<div class="doc-panel__fields--two">` scritto a
 * mano finirebbe anche nella griglia di scrivania, dove i figli diretti sono le
 * **celle**: là dentro diventerebbe una cella sola che ne contiene tre.
 *
 * ⭐ Quindi il raggruppatore **cambia natura con la vesta**, come ogni altro
 * pezzo di questa famiglia:
 *
 * ```text
 * compatta    host = .doc-panel__fields.doc-panel__fields--two  → griglia a due colonne
 * scrivania   host senza classe, display: contents              → i campi salgono
 *             al livello della fascia e restano celle come gli altri
 * ```
 *
 * ⚠️ `display: contents` è ciò che lo rende **trasparente** e non solo invisibile:
 * l'elemento resta nell'albero ma non genera una scatola, quindi le tre celle
 * partecipano al flex della fascia esattamente come se il raggruppatore non ci
 * fosse. Con `display: block` diventerebbero figlie di un contenitore e la
 * fascia le vedrebbe come una cella sola.
 *
 * ⚠️ La regola globale `.doc-form--m-ref .doc-panel__fields { display: grid }`
 * (specificità 0,2,0) vince su `:host` (0,1,0): in vesta compatta la griglia
 * torna da sé, senza `!important` e senza `::ng-deep`.
 */
@Component({
  selector: 'app-document-header-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classi()' },
  template: `<ng-content />`,
  styles: [':host { display: contents; }'],
})
export class DocumentHeaderGroupComponent {
  private readonly viewport = inject(ViewportService);

  /**
   * Affianca i campi a due a due in vesta compatta. È l'unico modo di usarlo
   * oggi; l'input esiste perché spegnerlo sia una dichiarazione e non
   * l'assenza del componente.
   */
  readonly twoColumns = input(true);

  protected readonly compatto = this.viewport.compact;

  protected readonly classi = computed(() => {
    if (!this.compatto()) {
      return '';
    }
    return this.twoColumns() ? 'doc-panel__fields doc-panel__fields--two' : 'doc-panel__fields';
  });
}
