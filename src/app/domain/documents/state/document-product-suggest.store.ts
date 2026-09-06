import { signal } from '@angular/core';

import type { VariantSummary } from '@domain/products/models/variant-summary.model';

/** Cosa la maschera sa della riga nel momento in cui si chiede l'elenco. */
export interface DocumentProductSuggestInputs {
  /** La riga ha gia' un articolo agganciato. */
  readonly hasLinked: boolean;
  /** Risultati della ricerca a catalogo per il testo corrente. */
  readonly searched: readonly VariantSummary[];
}

/**
 * Il pannello suggerimenti del nome prodotto, per tutte le maschere documento.
 *
 * Nasce da due copie divergenti (Ordine cliente e Arrivo merce) e da una terza
 * che stava per essere scritta per l'Ordine fornitore. Le tre non differivano
 * solo nella forma: l'una proponeva in cima le varianti gia' nel documento e
 * l'altra no, l'una restava aperta senza risultati e l'altra si chiudeva, le
 * frecce in una giravano in tondo e nell'altra si fermavano agli estremi.
 * Divergenze cosi' non si notano leggendo il codice — si notano usando due
 * documenti di seguito.
 *
 * Comportamento unico, quattro decisioni prese una per una:
 *
 * 1. **Solo catalogo.** Gli articoli gia' presenti nel documento NON vengono
 *    riproposti in cima: il pannello mostra risultati di catalogo, e un
 *    articolo gia' in riga non e' un risultato diverso dagli altri. Metterlo
 *    per primo e' rumore proprio dove si sta guardando.
 * 2. **Senza risultati non si apre.** Nessun messaggio di vuoto, nessuna voce
 *    "Apri scheda completa" dentro l'elenco: la creazione di un articolo vive
 *    sulla riga, non nel pannello.
 * 3. **Tace se la riga ha gia' un articolo.** Li' non c'e' piu' nulla da
 *    scegliere, e il pannello coprirebbe la riga sotto.
 * 4. **Le frecce si fermano agli estremi**, non girano in tondo: stessa regola
 *    del contratto di navigazione (dalla prima riga ↑ non fa nulla).
 *
 * La soglia di caratteri non e' qui: la ricerca a catalogo non parte sotto i
 * due caratteri, quindi sotto quella soglia l'elenco arriva gia' vuoto e il
 * punto 2 chiude il pannello da solo. Ripetere la soglia darebbe due posti da
 * cambiare per una regola sola.
 *
 * Classe, non servizio iniettabile: una maschera documento ne vuole una
 * istanza propria, non una condivisa con le altre schede aperte.
 */
export class DocumentProductSuggestStore {
  private readonly _lineIndex = signal<number | null>(null);
  private readonly _activeIndex = signal(0);

  /** Riga su cui il pannello sta lavorando, se aperto. */
  readonly lineIndex = this._lineIndex.asReadonly();

  /** Posizione evidenziata nell'elenco, base zero. */
  readonly activeIndex = this._activeIndex.asReadonly();

  /** La cella nome della riga prende il fuoco: il pannello passa a lei. */
  focusLine(index: number): void {
    this._lineIndex.set(index);
    this._activeIndex.set(0);
  }

  /**
   * La cella nome perde il fuoco. Chiude solo se il pannello era davvero suo:
   * chi esce da una riga mentre il fuoco e' gia' andato altrove non deve
   * chiudere il pannello di quell'altra.
   */
  blurLine(index: number): void {
    if (this._lineIndex() === index) {
      this._lineIndex.set(null);
    }
  }

  /** Chiude il pannello ovunque si trovi. */
  clear(): void {
    this._lineIndex.set(null);
    this._activeIndex.set(0);
  }

  /** L'elenco da mostrare sulla riga indicata; vuoto se il pannello non e' suo. */
  suggestionsFor(index: number, inputs: DocumentProductSuggestInputs): readonly VariantSummary[] {
    if (this._lineIndex() !== index || inputs.hasLinked) {
      return [];
    }
    return inputs.searched;
  }

  /** Pannello aperto sulla riga indicata: solo se c'e' qualcosa da mostrare. */
  isOpenOn(index: number, inputs: DocumentProductSuggestInputs): boolean {
    return this.suggestionsFor(index, inputs).length > 0;
  }

  /** Sposta l'evidenziazione, fermandosi al primo e all'ultimo elemento. */
  navigate(direction: 'next' | 'prev', count: number): void {
    if (count <= 0) {
      return;
    }
    this._activeIndex.update((current) => {
      const clamped = Math.min(Math.max(current, 0), count - 1);
      return direction === 'next' ? Math.min(clamped + 1, count - 1) : Math.max(clamped - 1, 0);
    });
  }
}
