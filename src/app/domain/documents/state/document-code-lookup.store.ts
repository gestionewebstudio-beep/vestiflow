import { signal } from '@angular/core';

import type { DocumentLineCodeField } from '@domain/documents/utils/document-code-match.util';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

/**
 * Stato della scelta aperta da una cella codice: quale riga, quale campo, le
 * corrispondenze fra cui scegliere e quella evidenziata.
 *
 * Non è un elenco di risultati di ricerca — il campo codice non cerca (spec
 * §codici). È la scelta fra più corrispondenze **esatte**: quale taglia dello
 * stesso articolo (codice articolo), o quale articolo per lo stesso codice
 * fornitore. Si apre solo quando le corrispondenze sono più d'una.
 *
 * Come `DocumentProductPanelStore`, non è un service iniettabile: nessuna
 * dipendenza e un'istanza per form, quindi si costruisce come campo del
 * componente. Qui vive SOLO lo stato: la chiamata al catalogo sta in
 * `DocumentCodeLookupService`, e l'aggancio della variante resta nel form,
 * perché cambia per tipo documento.
 *
 * **Non è generico sul campo**, a differenza di quanto servirà al punto unico
 * della navigazione: i campi codice sono quattro e sono un insieme chiuso, già
 * dichiarato da `DocumentLineCodeField`. Una maschera che ne usa tre (Ordine
 * cliente non ha il codice fornitore) semplicemente non apre mai sul quarto.
 */
export class DocumentCodeLookupStore {
  private readonly _lineIndex = signal<number | null>(null);
  private readonly _field = signal<DocumentLineCodeField | null>(null);
  private readonly _matches = signal<readonly VariantSummary[]>([]);
  /**
   * Voce evidenziata. Indice PROPRIO della scelta sui codici, da tenere
   * distinto da quello dei suggerimenti sul nome prodotto: sono due collezioni
   * diverse, con lunghezze diverse, e un indice solo si sfaserebbe passando
   * dall'una all'altra.
   */
  private readonly _activeIndex = signal(0);

  readonly matches = this._matches.asReadonly();
  readonly activeIndex = this._activeIndex.asReadonly();
  /**
   * Da quale campo è stata aperta la scelta. Serve a chi la risolve: prendere
   * una voce dopo aver digitato un **codice fornitore** non è la stessa cosa
   * che prenderla dopo uno SKU — nel primo caso il codice digitato è quello con
   * cui si aggancia, e va scritto nella riga.
   */
  readonly field = this._field.asReadonly();

  /**
   * Apre la scelta. Sempre sulla prima voce: il fuoco è rimasto nel campo, le
   * frecce la scorrono, Invio prende quella evidenziata.
   */
  open(lineIndex: number, field: DocumentLineCodeField, matches: readonly VariantSummary[]): void {
    this._lineIndex.set(lineIndex);
    this._field.set(field);
    this._matches.set(matches);
    this._activeIndex.set(0);
  }

  clear(): void {
    this._lineIndex.set(null);
    this._field.set(null);
    this._matches.set([]);
    this._activeIndex.set(0);
  }

  /**
   * Frecce a scelta aperta. Si ferma ai capi invece di girare: una scelta fra
   * corrispondenze esatte è un elenco corto e chiuso, e chi tiene premuto ↓ si
   * aspetta di fermarsi in fondo, non di ritrovarsi in cima senza accorgersene.
   */
  navigate(direction: 'next' | 'prev'): void {
    const count = this._matches().length;
    if (count === 0) {
      return;
    }
    this._activeIndex.update((current) =>
      direction === 'next' ? Math.min(current + 1, count - 1) : Math.max(current - 1, 0),
    );
  }

  /** Le corrispondenze da mostrare in quella cella: [] se la scelta è altrove. */
  matchesFor(lineIndex: number, field: DocumentLineCodeField): readonly VariantSummary[] {
    return this.isOpenOn(lineIndex, field) ? this._matches() : [];
  }

  isOpenOn(lineIndex: number, field: DocumentLineCodeField): boolean {
    return this._lineIndex() === lineIndex && this._field() === field && this._matches().length > 0;
  }

  /**
   * La scelta è aperta su una qualsiasi cella di quella riga. Serve alla riga,
   * non alla cella: elencare i campi a mano nel chiamante è il modo in cui il
   * quarto codice viene dimenticato quando lo si aggiunge.
   */
  isOpenOnLine(lineIndex: number): boolean {
    return this._lineIndex() === lineIndex && this._matches().length > 0;
  }
}
