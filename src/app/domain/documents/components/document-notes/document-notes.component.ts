import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type FormGroup, ReactiveFormsModule } from '@angular/forms';

/**
 * ⭐ **L'area note del piede documento: due campi, e la differenza fra loro.**
 *
 * ## ⛔ La misura che l'ha resa necessaria (25/08/2026)
 *
 * Gli stessi due controlli — `notes` e `internalComment` — vivevano in cinque
 * maschere, con **cinque etichette diverse** e una lunghezza che andava da 11 a
 * 59 righe:
 *
 * ```text
 * Trasferimento        «Note»
 * Rettifica            «Note»
 * Arrivo merce         «Note documento»
 * Fatture / DDT        «Note (visibili in stampa)»
 * Registrazione fatt.  «Note»
 * ```
 *
 * ⭐ **Una sola delle cinque diceva la cosa utile** — «(visibili in stampa)» — e
 * quella distinzione vale per tutte: e' l'unica differenza che conta fra i due
 * campi. Qui la dicono entrambi, ognuno la sua, nel segnaposto.
 *
 * ## Le due etichette, e perche' queste
 *
 * | | |
 * | --- | --- |
 * | **Note documento** | quello che il cliente legge sulla stampa |
 * | **Commento interno** | quello che resta in casa |
 *
 * Il testo «Nota interna, mai in stampa» non e' inventato: era gia' il
 * segnaposto della Registrazione fattura, ed era il migliore dei cinque.
 *
 * ## ⚠️ Perche' un `FormGroup` in ingresso e non `formControlName` diretto
 *
 * `formControlName` si risolve sull'albero delle DICHIARAZIONI, non su quello
 * del DOM: un `[formGroup]` sul contenitore che ospita questo componente **non
 * arriva** al suo template. Senza il gruppo esplicito il componente esploderebbe
 * con NG01050 — ed e' gia' successo su `document-line-card-reference`.
 *
 * ## ⛔ Chi resta fuori, e perche'
 *
 * - **Ordine cliente**: salva su `SalesOrder`, che nello schema ha `notes` e
 *   basta. Dargli il commento interno vuol dire una migration sul database
 *   condiviso, non montare un componente.
 * - **Vendita/Reso al banco**: i suoi campi non stanno in un `FormGroup` — li
 *   tiene in un segnale `preserved()`, perche' la testata sopravvive fra una
 *   vendita e la successiva. E la sua «Causale» e' un campo di dominio, non una
 *   nota.
 * - **Registrazione fattura**: ha entrambi i controlli, ma il commento interno
 *   sta in TESTATA. Spostarlo e' un cambiamento che si vede, e va deciso.
 */
@Component({
  selector: 'app-document-notes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './document-notes.component.html',
  styleUrl: './document-notes.component.scss',
})
export class DocumentNotesComponent {
  /** Il gruppo che ospita `notes` e `internalComment`. */
  readonly group = input.required<FormGroup>();

  /**
   * Gli identificativi dei due campi.
   *
   * ⚠️ Non sono generati dal componente: una maschera puo' montarlo piu' di una
   * volta — oggi nessuna lo fa, ma un identificativo duplicato romperebbe
   * l'accoppiata `label`/`for` in silenzio, e le prove cercano per etichetta.
   */
  readonly notesId = input.required<string>();
  readonly internalId = input.required<string>();

  /** Documento in sola lettura: i due campi non si modificano. */
  readonly readOnly = input<boolean>(false);
}
