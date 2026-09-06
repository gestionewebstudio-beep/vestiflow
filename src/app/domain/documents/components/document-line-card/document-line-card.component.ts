import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ButtonComponent } from '@shared/components/button/button.component';

import type { DocumentLineCardMeta } from './document-line-card.model';

/**
 * La riga documento come **card**, sotto lg. Una sola, per tutti i documenti.
 *
 * ## Forma qui, contenuto dalla maschera
 *
 * Questa card dà la **forma**: la banda d'avviso, la riga titolo con elimina e
 * chevron, la variante, la riga meta, la striscia dei valori sempre visibili, il
 * corpo apribile a due colonne e il piede con Elimina.
 *
 * Quello che **cambia col documento** non entra qui come interruttore: entra
 * come contenuto proiettato. L'Arrivo merce mette nella striscia il costo con la
 * sua scelta netto/ivato, l'Ordine cliente il prezzo di vendita; nei gruppi del
 * corpo ognuno mette i campi che il suo documento richiede. È la stessa scelta
 * del contratto della navigazione di riga: dentro vive il meccanismo, ciò che
 * differisce resta nella maschera.
 *
 * Il criterio con cui è stata tagliata: **se una differenza esiste perché il
 * documento è un'altra cosa, resta e si esprime nel contenuto; se esiste perché
 * nessuno l'ha mai allineata, sparisce nella forma.**
 *
 * ## La testata è UNA
 *
 * Ce n'erano due — «order» per l'Ordine cliente e «registry» per i documenti di
 * registro — e la seconda era dichiarata **ramo temporaneo** nel foglio di
 * stile: «quando il layout andrà agli altri documenti, il ramo va rimosso e la
 * card torna una sola». È adesso. Resta quella buona, e il bivio non entra nella
 * forma condivisa.
 *
 * ## Da dove viene
 *
 * È la card dell'Ordine cliente, promossa: era la più avanzata delle due
 * esistenti — 47 elementi contro 24, e solo 7 nomi in comune, cioè non erano
 * copie ma due disegni diversi. Fonderle avrebbe richiesto la dozzina di
 * interruttori che `regole-architettura` chiama per nome; adottare la migliore
 * no.
 */
@Component({
  selector: 'app-document-line-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './document-line-card.component.html',
  styleUrl: './document-line-card.component.scss',
})
export class DocumentLineCardComponent {
  /** Posizione 1-based nella lettura assistita: «Riga 3». */
  readonly lineIndex = input.required<number>();
  readonly open = input(false);
  /** Riga da completare: la card se lo porta scritto sul fianco. */
  readonly complete = input(true);
  readonly readOnly = input(false);
  readonly canRemove = input(true);

  /** Il nome sulla riga; vuoto diventa «Riga senza prodotto». */
  readonly title = input('');
  /** La variante, su riga propria sotto il nome. Vuota = riga assente. */
  readonly variantLabel = input('');
  readonly meta = input<readonly DocumentLineCardMeta[]>([]);
  /** Avviso non bloccante in cima alla card (es. disponibilità insufficiente). */
  readonly alert = input('');

  readonly toggled = output<void>();
  /** Elimina dalla testata: passa dalla conferma della maschera. */
  readonly removeRequested = output<void>();
  /** Elimina dal piede del corpo aperto: diretta, la card è già aperta. */
  readonly removed = output<void>();

  protected readonly displayTitle = () => this.title().trim() || 'Riga senza prodotto';
}
