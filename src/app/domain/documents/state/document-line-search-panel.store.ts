import { signal } from '@angular/core';

/**
 * Stato del **pannello di ricerca articolo aperto da una riga** documento:
 * quale riga l'ha aperto, con che termine, e quante volte è stato lanciato.
 *
 * ⛔ Non è `DocumentProductPanelStore`, ed è la sua metà mancante: quello tiene
 * il pannello dell'**anagrafica** (crea/modifica articolo), questo il pannello
 * di **ricerca**. I due si passano il testimone — «Crea articolo» chiude il
 * secondo e apre il primo — ma sono due pannelli, due stati, due momenti.
 *
 * **Perché sta qui.** I quattro signal erano scritti identici in **tre**
 * maschere (Ordine cliente, Arrivo merce, Ordine fornitore), alle stesse righe
 * e con gli stessi nomi; la Vendita al banco sarebbe stata la quarta copia. La
 * cella `app-document-line-product-cell` emette `searchOpen`, quindi chiunque
 * la monti deve tenere questo stato: o condiviso, o duplicato.
 *
 * **Classe-campo, non service iniettabile**: nessuna dipendenza e un'istanza per
 * maschera, come `DocumentProductPanelStore`, `DocumentCodeLookupStore` e
 * `DocumentLineFocusStore`.
 *
 * ⚠️ Qui vive **solo lo stato**. Da dove nasce il termine di lancio
 * (`documentSearchLaunchTerm` legge i campi della riga), che cosa può creare
 * un articolo e che cosa succede alla scelta restano nella maschera, perché
 * differiscono per tipo documento.
 */
export class DocumentLineSearchPanelStore {
  private readonly _open = signal(false);
  private readonly _lineIndex = signal<number | null>(null);
  private readonly _launchTerm = signal('');
  private readonly _launchSeq = signal(0);

  readonly isOpen = this._open.asReadonly();
  /** Riga che ha aperto il pannello; `null` = aperto da fuori le righe. */
  readonly lineIndex = this._lineIndex.asReadonly();
  /** Testo con cui il pannello parte: codice, SKU, EAN o nome già digitati. */
  readonly launchTerm = this._launchTerm.asReadonly();
  /**
   * Contatore di aperture.
   *
   * ⚠️ Non è un dettaglio: il pannello resta montato, e senza un valore che
   * **cambia a ogni apertura** riaprirlo sullo stesso termine non
   * reinizializzerebbe la query — la seconda ricerca partirebbe da dove era
   * rimasta la prima.
   */
  readonly launchSeq = this._launchSeq.asReadonly();

  /** Apre il pannello dalla riga `lineIndex`, con il termine già digitato. */
  openForLine(lineIndex: number, launchTerm: string): void {
    this._launchTerm.set(launchTerm);
    this._launchSeq.update((seq) => seq + 1);
    this._lineIndex.set(lineIndex);
    this._open.set(true);
  }

  /** Apre il pannello senza una riga di partenza (barra, comando globale). */
  open(launchTerm = ''): void {
    this._launchTerm.set(launchTerm);
    this._launchSeq.update((seq) => seq + 1);
    this._lineIndex.set(null);
    this._open.set(true);
  }

  /**
   * Chiude, e **dimentica la riga**: le due cose vanno insieme. Lasciare
   * l'indice dietro di sé fa sì che l'azione successiva — «Crea articolo»,
   * l'aggancio della variante — si applichi a una riga che non ha aperto
   * niente.
   */
  close(): void {
    this._open.set(false);
    this._lineIndex.set(null);
  }
}
