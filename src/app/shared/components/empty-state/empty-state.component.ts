import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ButtonComponent } from '@shared/components/button/button.component';

/**
 * Stato vuoto generico per liste/tabelle. Dumb puro: titolo, descrizione,
 * icona e CTA opzionali. Riusabile in products, inventory, orders, ecc.
 */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly description = input<string>();
  /** Classe PrimeIcons (es. 'pi-inbox'). */
  readonly icon = input<string>('pi-inbox');
  /** Se valorizzata, mostra la CTA. */
  readonly ctaLabel = input<string>();
  /**
   * `stacked` (default) e' lo stato vuoto di una pagina o di una tabella.
   * `inline` e' la riga compatta che sta dentro un pannello gia' intitolato:
   * icona e titolo affiancati, descrizione omessa perche' il contesto la da'
   * gia'. Prima era un override ::ng-deep del chiamante.
   */
  readonly layout = input<'stacked' | 'inline'>('stacked');

  readonly ctaClick = output<void>();
}
