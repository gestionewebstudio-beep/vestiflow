import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** Tono del messaggio: decide colore, sfondo, bordo e urgenza per lo screen reader. */
export type InlineBannerTone = 'error' | 'success' | 'warning' | 'info' | 'neutral';

/**
 * Messaggio in linea sopra il contenuto: errore di fetch, esito di un'azione,
 * avviso non bloccante.
 *
 * Esisteva gia' in una dozzina di schermate, riscritto ogni volta con un nome
 * diverso (`__alert`, `__banner`, `__action-feedback`) e le stesse sette
 * dichiarazioni. Le regole di progetto lo chiedono come componente: gli stati
 * non si scrivono inline in piu' punti (regole-architettura, «Catalogo dei
 * pattern che DEVONO essere componenti»).
 *
 * Dumb: nessun service, nessuna logica. Chi lo usa decide quando mostrarlo.
 */
@Component({
  selector: 'app-inline-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-banner-host',
    '[class.inline-banner-host--block]': 'true',
  },
  templateUrl: './inline-banner.component.html',
  styleUrl: './inline-banner.component.scss',
})
export class InlineBannerComponent {
  readonly tone = input<InlineBannerTone>('error');

  /**
   * Il ruolo ARIA segue il tono, non una scelta di chi chiama: un errore
   * interrompe la lettura (`alert`), un avanzamento aspetta la pausa
   * (`status`). Sbagliarlo significa o non annunciare un errore o interrompere
   * l'utente per un'informazione di servizio.
   */
  protected readonly role = computed(() =>
    this.tone() === 'error' || this.tone() === 'warning' ? 'alert' : 'status',
  );
  /** Testo. Se serve markup, si usa il contenuto proiettato al posto suo. */
  readonly message = input<string>();
  /**
   * Etichetta del pulsante che chiude il banner. Assente = banner non
   * chiudibile: un errore di fetch resta finche' non si riprova.
   */
  readonly dismissLabel = input<string>();
  readonly dismissed = output<void>();
}
