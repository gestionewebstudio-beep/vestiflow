import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Il titolo di un gruppo dentro il corpo della card riga — «Articolo»,
 * «Magazzino», «Vendita», «Carico».
 *
 * Occupa la riga intera della griglia e porta il filo che separa dal gruppo
 * precedente; il primo non ce l'ha. Quali gruppi esistano lo decide il
 * documento: è il posto dove le logiche diverse si vedono senza che la card
 * debba conoscerle.
 */
@Component({
  selector: 'app-document-line-card-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'doc-line-card-group',
    '[class.doc-line-card-group--first]': 'first()',
  },
  template: '{{ label() }}',
  styleUrl: './document-line-card-group.component.scss',
})
export class DocumentLineCardGroupComponent {
  readonly label = input.required<string>();
  /** Il primo gruppo non porta il filo sopra: non separa da niente. */
  readonly first = input(false);
}
