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

  readonly picked = output<number>();

  protected pickWithKeyboard(event: Event, index: number): void {
    event.preventDefault();
    this.picked.emit(index);
  }
}
