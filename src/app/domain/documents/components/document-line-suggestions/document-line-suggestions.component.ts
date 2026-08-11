import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { DocumentLineSuggestionItem } from './document-line-suggestions.model';

/**
 * Pannello suggerimenti sotto (o sopra) un campo di ricerca prodotto in riga
 * documento. Era duplicato quasi letterale nelle card mobile di arrivo merce
 * e ordine cliente; qui vive l'unica copia.
 *
 * Dumb e senza ancora propria: l'host è `display: contents`, il pannello si
 * stende in assoluto rispetto al contenitore del chiamante, che dichiara
 * `position: relative` sul campo. Il chiamante decide anche QUANDO mostrarlo
 * (`@if` sull'apertura): il pannello disegna soltanto.
 *
 * ## La voce-comando in coda
 *
 * `tailLabel` aggiunge in fondo al pannello un comando — «» Altro…», che apre
 * la gestione delle voci. Sta **fuori dall'elenco filtrato**, e le due cose che
 * ne conseguono sono entrambe volute:
 *
 * - **il filtro non se la mangia.** Messa dentro le opzioni sparirebbe al primo
 *   carattere digitato, cioè proprio quando serve: si cerca una voce, non c'è, e
 *   il modo per crearla se n'è appena andato;
 * - **non è un `role="option"`.** Un lettore di schermo annuncerebbe un comando
 *   come un valore scegliibile. Sta fuori dalla `<ul role="listbox">`, come
 *   `<button>`, che è quello che è.
 *
 * Per lo stesso motivo il pannello si apre anche a elenco vuoto **se** c'è una
 * coda: senza risultati e senza comando non ci sarebbe niente da mostrare, ma
 * col comando c'è ancora una cosa da fare.
 *
 * Punti di regolazione (custom property con fallback): `--doc-suggestions-z`,
 * `--doc-suggestions-offset`, `--doc-suggestions-max-h`,
 * `--doc-suggestions-item-min-h`.
 */
@Component({
  selector: 'app-document-line-suggestions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-line-suggestions.component.html',
  styleUrl: './document-line-suggestions.component.scss',
})
export class DocumentLineSuggestionsComponent {
  readonly items = input.required<readonly DocumentLineSuggestionItem[]>();
  /** Indice evidenziato dalla navigazione tastiera del campo; null = nessuno. */
  readonly activeIndex = input<number | null>(null);
  readonly placement = input<'below' | 'above'>('below');
  /** Id del listbox, riferito da `aria-controls` sul campo del chiamante. */
  readonly listboxId = input('');
  readonly ariaLabel = input('Suggerimenti prodotto');
  /** Comando in coda fissa, fuori dall'elenco filtrato. Vuoto = nessuna coda. */
  readonly tailLabel = input('');
  /** La coda è la fermata corrente della navigazione da tastiera. */
  readonly tailActive = input(false);

  readonly picked = output<number>();
  readonly tailPicked = output<void>();

  protected pickWithKeyboard(event: Event, index: number): void {
    event.preventDefault();
    this.picked.emit(index);
  }
}
