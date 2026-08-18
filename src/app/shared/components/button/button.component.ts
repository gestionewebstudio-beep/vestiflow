import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { InlineSpinnerComponent } from '../inline-spinner/inline-spinner.component';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonType = 'button' | 'submit';
/** `spinner`: cerchio dedicato; `icon`: anima le icone nel contenuto del bottone. */
type ButtonLoadingIndicator = 'spinner' | 'icon';

/**
 * Bottone condiviso. Dumb puro: stili centralizzati e varianti minime.
 * Renderizza un <button> nativo (il click risale naturalmente al consumer).
 */
@Component({
  selector: 'app-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InlineSpinnerComponent],
  templateUrl: './button.component.html',
  styleUrl: './button.component.scss',
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly type = input<ButtonType>('button');
  readonly disabled = input<boolean>(false);
  /** Stato di caricamento: disabilita e segnala aria-busy. */
  readonly loading = input<boolean>(false);
  /** Indicatore visivo durante il loading (default: spinner separato). */
  readonly loadingIndicator = input<ButtonLoadingIndicator>('spinner');
  readonly fullWidth = input<boolean>(false);
  /** ID form esterno per submit (attributo HTML `form` sul bottone). */
  readonly formId = input<string | undefined>();

  /**
   * Nome accessibile, quando l'etichetta visibile è abbreviata per ragioni di
   * spazio e da sola non basterebbe fuori contesto: «Nuovo» si capisce sotto
   * il titolo «Corrispettivi», ma un lettore di schermo che elenca i comandi
   * della pagina leggerebbe soltanto la parola. Vuoto = il nome accessibile è
   * il testo del pulsante, che è il caso normale e va lasciato tale.
   */
  readonly ariaLabel = input<string | undefined>();
}
