import { signal } from '@angular/core';

/**
 * **Quale card è aperta, e ce n'è UNA sola.**
 *
 * ⛔ Difetto misurato il 24/08/2026 su cinque maschere: lo stato aperto viveva
 * **dentro la card**, quindi la maschera non sapeva quale riga fosse aperta e
 * non poteva chiuderne nessuna. Su un documento da venti righe si arrivava a
 * venti corpi aperti insieme, e la card chiusa smetteva di essere la vista
 * compatta che è il suo unico motivo di esistere.
 *
 * ⭐ Lo stato è del DOCUMENTO, non della card: è il documento a sapere che le
 * righe sono venti, e che aprirle tutte non serve a nessuno.
 *
 * ⚠️ La chiave è l'**indice**, non l'identità del gruppo: le righe si
 * riordinano e si eliminano, e un indice che punta a una riga scomparsa non
 * apre niente — che è il comportamento giusto. Tenere l'identità terrebbe
 * aperta una card che nel frattempo si è spostata sotto un'altra.
 */
export class DocumentLineCardOpenStore {
  private readonly aperta = signal<number | null>(null);

  isOpen(index: number): boolean {
    return this.aperta() === index;
  }

  /** Apre questa e chiude quella che c'era; ripremendo la stessa, chiude. */
  toggle(index: number): void {
    this.aperta.update((corrente) => (corrente === index ? null : index));
  }

  /**
   * Chiude tutto.
   *
   * Serve quando le righe cambiano sotto: un caricamento, un riordino, una
   * riga eliminata. Lasciare l'indice aperto mostrerebbe il corpo di una riga
   * che non è più quella.
   */
  closeAll(): void {
    this.aperta.set(null);
  }
}
