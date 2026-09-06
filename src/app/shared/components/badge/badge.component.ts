import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'vestiflow';

/**
 * Badge per stati/label brevi. Dumb puro, non cliccabile. Il testo (label)
 * resta sempre leggibile: il colore e' un rinforzo, non l'unico significato.
 */
@Component({
  selector: 'app-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './badge.component.html',
  styleUrl: './badge.component.scss',
})
export class BadgeComponent {
  readonly tone = input<BadgeTone>('neutral');

  /**
   * ⭐ **Solo il testo, col colore del tono**: niente pastiglia, niente fondo,
   * niente bordo.
   *
   * Deciso dal proprietario il 30/08/2026 guardando l'elenco prodotti: «le card
   * vanno via e possiamo lasciare quel colore per il testo». Tre colonne su dieci
   * portavano una pastiglia per riga — trenta pastiglie a schermo — e il rilievo
   * che dovrebbe segnalare un'eccezione diventava lo sfondo normale.
   *
   * ⚠️ **È una variante del badge, non uno span colorato nella pagina**: la mappa
   * tono → colore resta dichiarata in un posto solo. Un elenco che se la
   * riscrivesse addosso sarebbe la divergenza che il design system esiste per
   * togliere — ed è la stessa ragione per cui `app-segmented` ha `flat` invece di
   * lasciare a chi lo ospita il compito di spegnergli la pista.
   *
   * ⛔ **Non toglie l'altezza minima solo per estetica**: senza pastiglia la
   * cella torna alta quanto il testo, ed è ciò che assottiglia la riga.
   */
  readonly flat = input(false);
}
