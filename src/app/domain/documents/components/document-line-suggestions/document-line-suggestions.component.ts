import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { afterNextRender } from '@angular/core';

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
/**
 * Sotto questo spazio residuo il pannello non ci sta: due voci piu' il bordo.
 * Non e' una misura esatta dell'elenco — quella cambierebbe a ogni carattere
 * digitato, e il pannello si ribalterebbe mentre lo si guarda.
 */
const ALTEZZA_MINIMA = 168;

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

  /**
   * Il pannello decide da sé se stendersi sopra o sotto il campo.
   *
   * ⛔ **Qui c'era un vuoto, e lo riempiva una maschera sola.** L'Ordine
   * cliente misurava lo spazio residuo e passava `placement`; le altre cinque
   * restavano al default `'below'`, quindi su una card in fondo alla lista, con
   * la tastiera aperta, l'elenco cadeva fuori dallo schermo — e con lui la
   * scelta fra più corrispondenze, che è l'unico modo di agganciare l'articolo.
   *
   * ⭐ La misura sta qui e non nelle maschere perché **è del pannello**: nessun
   * chiamante sa quanto è alto l'elenco che gli ha appena passato, e il
   * pannello sì. Sei copie della stessa misura erano sei occasioni di
   * divergere.
   */
  readonly autoPlacement = input(false);
  /** Id del listbox, riferito da `aria-controls` sul campo del chiamante. */
  readonly listboxId = input('');
  readonly ariaLabel = input('Suggerimenti prodotto');
  /** Comando in coda fissa, fuori dall'elenco filtrato. Vuoto = nessuna coda. */
  readonly tailLabel = input('');
  /** La coda è la fermata corrente della navigazione da tastiera. */
  readonly tailActive = input(false);

  readonly picked = output<number>();
  readonly tailPicked = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Misurato al primo disegno: il pannello nasce quando il campo si apre. */
  private readonly misurato = signal<'below' | 'above' | null>(null);

  constructor() {
    afterNextRender(() => {
      if (!this.autoPlacement()) {
        return;
      }
      const campo = this.host.nativeElement.parentElement;
      const rect = (campo ?? this.host.nativeElement).getBoundingClientRect();
      const sotto = window.innerHeight - rect.bottom;
      // ⚠️ Si ribalta solo se sotto NON ci sta e sopra ci sta di più: su uno
      // schermo basso nessuna delle due va bene, e allora meglio sotto — è
      // dove l'operatore si aspetta l'elenco.
      this.misurato.set(sotto < ALTEZZA_MINIMA && rect.top > sotto ? 'above' : 'below');
    });
  }

  /** Dove va davvero: la misura se c'è, altrimenti quello che dice il chiamante. */
  protected readonly posizione = computed<'below' | 'above'>(
    () => (this.autoPlacement() ? this.misurato() : null) ?? this.placement(),
  );

  protected pickWithKeyboard(event: Event, index: number): void {
    event.preventDefault();
    this.picked.emit(index);
  }
}
