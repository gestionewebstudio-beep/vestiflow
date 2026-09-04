import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { InlineSpinnerComponent } from '../inline-spinner/inline-spinner.component';

/**
 * Esportata perché è la fonte unica dell'aspetto di un comando: chi dichiara
 * pulsanti per conto terzi — la barra azioni della selezione (`14` parte D) —
 * deve parlare di queste varianti e non tenerne un elenco parallelo, che
 * divergerebbe alla prima aggiunta.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
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

  /**
   * ⭐ **Disabilitato ma RAGGIUNGIBILE**: `aria-disabled` invece
   * dell'attributo nativo, così il pulsante resta nel giro del Tab e chi naviga
   * da tastiera può arrivarci e sentirne la ragione.
   *
   * ⛔ **Opt-in, e deve restarlo.** Il `disabled` nativo è la scelta giusta
   * quasi ovunque — un comando che non si può premere non deve rubare una
   * fermata del Tab. Serve solo dove il pulsante **spiega perché** non si può:
   * oggi le azioni dei riepiloghi (`14` §11), dove nascondere il motivo
   * lascerebbe l'operatore a riprovare.
   *
   * ⚠️ `aria-disabled` non impedisce il clic: lo blocca il componente, qui
   * sotto. Un attributo che descrive non è un attributo che impedisce.
   */
  readonly softDisabled = input<boolean>(false);
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
  /**
   * Lo stato di un pulsante-INTERRUTTORE.
   *
   * ⚠️ Un interruttore che cambia solo aspetto non dice il proprio stato a chi
   *    non lo vede. Aggiunto il 29/08/2026 per il pulsante «Filtri» degli
   *    elenchi, che accende i controlli di colonna.
   */
  readonly ariaPressed = input<boolean | undefined>();

  /** Elemento che descrive il pulsante: il motivo della disabilitazione. */
  readonly ariaDescribedBy = input<string | undefined>();

  /** Il clic non parte se il pulsante è spento in modo «morbido». */
  protected onClick(event: Event): void {
    if (this.softDisabled()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
}
