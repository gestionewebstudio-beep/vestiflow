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

/**
 * Il menu netto/ivato che vive **nell'intestazione della colonna** che governa:
 * Costo sui documenti d'acquisto, Prezzo su quelli di vendita.
 *
 * Perché è un componente e non markup copiato: la stessa tendina esisteva già
 * in **tre** maschere — Arrivo merce, Ordine fornitore, DDT/Ordine cliente — a
 * quarantacinque righe l'una, e la maschera vendita ne avrebbe fatta una quarta.
 * La regola di progetto sull'estrazione (> 15 righe duplicate in 2+ posti) qui
 * era già superata di tre volte.
 *
 * Il pulsante di **ordinamento** della colonna resta al chiamante: alcune
 * maschere lo hanno e altre no, e fonderli avrebbe prodotto un componente con
 * due mestieri. Questo si occupa solo del chevron e della tendina.
 *
 * **Perché non `app-select-menu`** — verificato, non dato per scontato: il suo
 * trigger stampa **sempre** `selectedLabel()` più il chevron, e non ha una
 * forma sola-icona. In un'intestazione dove l'etichetta è già il pulsante di
 * ordinamento si leggerebbe «Prezzo ivato» due volte, una accanto all'altra. È
 * la ragione per cui le tre maschere l'avevano scritto a mano, e resta valida:
 * chi un giorno volesse «semplificare» sostituendolo, trovi qui la misura già
 * fatta invece di rifarla.
 *
 * Rispetto alle tre copie aggiunge due cose che nessuna aveva: **Esc** chiude, e
 * il clic fuori chiude. Una tendina che resta aperta mentre l'operatore scrive
 * altrove copre la riga sotto.
 */
@Component({
  selector: 'app-price-mode-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './price-mode-menu.component.html',
  styleUrl: './price-mode-menu.component.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
})
export class PriceModeMenuComponent {
  // `inject(ElementRef<HTMLElement>)` non tipizza: il parametro generico sta sul
  // token, non sul risultato, e `nativeElement` resterebbe `any`.
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** true = il documento tratta gli importi come ivati. */
  readonly pricesIncludeVat = input.required<boolean>();
  /** Voce «netto»: cambia parola fra costi e prezzi. */
  readonly netLabel = input.required<string>();
  readonly grossLabel = input.required<string>();
  /** Documento in sola lettura: il chevron resta, la scelta no. */
  readonly disabled = input<boolean>(false);
  /** Etichetta per i lettori di schermo, che il chevron da solo non dà. */
  readonly ariaLabel = input<string>('Modalità prezzo del documento');

  readonly modeChange = output<boolean>();

  private readonly _open = signal(false);
  readonly open = this._open.asReadonly();

  readonly expanded = computed(() => (this._open() ? 'true' : 'false'));

  toggle(): void {
    if (this.disabled()) {
      return;
    }
    this._open.update((open) => !open);
  }

  close(): void {
    this._open.set(false);
  }

  select(pricesIncludeVat: boolean): void {
    this.close();
    if (pricesIncludeVat !== this.pricesIncludeVat()) {
      this.modeChange.emit(pricesIncludeVat);
    }
  }

  /** Clic fuori dal componente: chiude. Dentro, lascia fare al bottone. */
  protected onDocumentClick(event: Event): void {
    if (!this._open()) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && !this.host.nativeElement.contains(target)) {
      this.close();
    }
  }
}
