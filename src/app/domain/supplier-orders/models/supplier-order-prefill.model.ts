/**
 * ⭐ **Un ordine fornitore NUOVO, precompilato** — e non un ordine già creato.
 *
 * _Decisione del proprietario, 29/08/2026, sulla Situazione magazzino:_
 * «poi si crea direttamente un ordine ed è errato. Gli articoli devono finire
 * in nuovo ordine e lì vanno gestiti gli articoli e le quantità da ordinare».
 *
 * ⛔ Prima la Situazione chiamava l'API e **l'ordine esisteva nel database**
 * prima che l'operatore avesse visto una riga: se le quantità erano da
 * correggere — e lo sono quasi sempre, perché nascono tutte a 1 — bisognava
 * modificare un documento già emesso invece di compilarne uno.
 *
 * ⚠️ **Porta gli identificativi, non i valori.** Descrizione, costo, codice
 * fornitore, IVA e unità di misura li ricava la maschera dal risolutore comune
 * di richiamo articolo (`03c`), lo stesso che usa quando l'articolo lo si
 * sceglie a mano. Passarli qui vorrebbe dire avere una seconda strada per
 * riempire una riga, libera di divergere dalla prima.
 */
export interface SupplierOrderPrefill {
  /** Il fornitore già scelto: la maschera apre con la testata compilata. */
  readonly supplierId: string;

  /**
   * Le varianti da mettere in riga, **una riga ciascuna, quantità 1**.
   *
   * ⚠️ Quantità 1 è il default di una riga nuova, non un valore che viaggia:
   * è l'operatore a decidere quanti pezzi ordinare, ed è tutto il motivo per
   * cui la maschera si apre invece di salvare da sola.
   */
  readonly variantIds: readonly string[];
}

/**
 * La chiave sotto cui il precompilato viaggia nello stato del router.
 *
 * ⚠️ **Non è nell'indirizzo, ed è una scelta.** Con gli identificativi in query
 * string l'indirizzo reggerebbe il ricarica-pagina, ma cinquanta articoli
 * fanno quasi duemila caratteri di URL. Ricaricando, la maschera si apre
 * vuota — e lì l'operatore ha comunque del lavoro non salvato, che la maschera
 * gli segnala già per conto suo.
 */
export const SUPPLIER_ORDER_PREFILL_STATE_KEY = 'supplierOrderPrefill';

/** Legge il precompilato dallo stato di navigazione, se c'è ed è ben formato. */
export function readSupplierOrderPrefill(state: unknown): SupplierOrderPrefill | null {
  if (typeof state !== 'object' || state === null) {
    return null;
  }
  const raw = (state as Record<string, unknown>)[SUPPLIER_ORDER_PREFILL_STATE_KEY];
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const { supplierId, variantIds } = raw as Record<string, unknown>;
  if (typeof supplierId !== 'string' || !supplierId || !Array.isArray(variantIds)) {
    return null;
  }
  const puliti = variantIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return puliti.length > 0 ? { supplierId, variantIds: puliti } : null;
}
