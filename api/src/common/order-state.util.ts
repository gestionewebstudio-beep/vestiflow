import { ConflictException } from '@nestjs/common';
import { SalesOrderFulfillmentStatus, SupplierOrderStatus } from '@prisma/client';

/**
 * La macchina degli stati COMUNE a Ordine cliente e Ordine fornitore.
 *
 * ⭐ Uno stato d'ordine decide UNA cosa sola: se l'ordine è includibile in un
 * documento di destinazione. Non decide se si apre, se si modifica, se si
 * salva, se si stampa, se si elimina, né come si comporta il lucchetto
 * (`17` §2.2, `18` §16).
 *
 * ⛔ **Questo è l'asse COMMERCIALE, non quello della persistenza.** Un ordine
 * «Da confermare» è già salvato e già numerato: «Da confermare» dice dove sta
 * nella trattativa, non se esiste. Non va mai rappresentato riportando il
 * documento a `DocumentStatus.draft` — sarebbe reintrodurre la Bozza sotto un
 * altro nome, dopo averla abolita (indice `00`, «due assi diversi»).
 *
 * Il modulo è **puro**: nessun Prisma, nessuna query, nessun servizio. Riceve
 * lo stato e risponde. Gli adattatori qui sotto traducono la rappresentazione
 * di ciascun ordine in questo vocabolario.
 */

/** I quattro stati decisi il 27-28/08/2026 (`17` §2.1, `18` §2.1). */
export const OrderState = {
  /** Salvato ma non ancora un impegno: fuori dall'elenco «Includi». */
  ToConfirm: 'to_confirm',
  /** Lo stato operativo, e l'unico eleggibile come sorgente. */
  Confirmed: 'confirmed',
  /** Derivato dal collegamento a un documento. Mai scelto a mano. */
  Concluded: 'concluded',
  /** Non si farà. Reversibile: non è un punto di non ritorno. */
  Cancelled: 'cancelled',
} as const;
export type OrderState = (typeof OrderState)[keyof typeof OrderState];

/**
 * ⭐ L'unico stato eleggibile come sorgente di «Includi» e «Genera».
 *
 * `17` §4 e `18` §18.2: Da confermare non lo è perché l'ordine non è ancora un
 * impegno; Concluso non lo è perché è già stato consumato; Annullato non lo è
 * perché non si farà.
 */
export function isEligibleAsSource(state: OrderState): boolean {
  return state === OrderState.Confirmed;
}

/**
 * ⛔ Finché è Concluso, lo STATO è bloccato: nessuna transizione manuale,
 * annullamento compreso (`17` §2.5).
 *
 * ⚠️ Il blocco è sullo **stato**, non sul documento: un ordine Concluso si
 * apre, si modifica, si salva, si stampa e si elimina secondo i permessi
 * comuni. Ciò che non si può fare è dichiararlo diverso da com'è.
 */
export function isStateLocked(state: OrderState): boolean {
  return state === OrderState.Concluded;
}

/**
 * Le transizioni che l'operatore può fare a mano.
 *
 * Tre stati liberi più uno derivato: Da confermare, Confermato e Annullato si
 * scelgono e si cambiano in **qualsiasi** direzione; Concluso non si sceglie
 * mai e, finché dura il legame, blocca tutto il resto (`17` §3).
 */
const MANUALLY_SELECTABLE: readonly OrderState[] = [
  OrderState.ToConfirm,
  OrderState.Confirmed,
  OrderState.Cancelled,
];

export function canTransitionManually(from: OrderState, to: OrderState): boolean {
  // Da Concluso non si esce a mano: ci si esce togliendo il legame, e allora
  // il ricalcolo riporta l'ordine a Confermato da solo.
  if (isStateLocked(from)) {
    return false;
  }
  // A Concluso non ci si arriva a mano: è derivato. Un valore scelto verrebbe
  // sovrascritto al primo ricalcolo, e nel frattempo mentirebbe.
  return MANUALLY_SELECTABLE.includes(to);
}

/** Il rifiuto, con il motivo che l'operatore possa capire. */
export function assertManualTransition(from: OrderState, to: OrderState): void {
  if (canTransitionManually(from, to)) {
    return;
  }
  if (isStateLocked(from)) {
    throw new ConflictException(
      'Un ordine concluso resta collegato al suo documento: per cambiarne lo stato, annulla o elimina prima il documento collegato.',
    );
  }
  throw new ConflictException(
    '«Concluso» non si imposta a mano: lo determina il collegamento a un documento.',
  );
}

// ── Adattatori ──────────────────────────────────────────────────────────
//
// Traducono la rappresentazione di ciascun ordine nel vocabolario comune.
// ⚠️ Sono il punto in cui si vede quanto il codice è indietro rispetto alla
// decisione, e devono dirlo — non nasconderlo.

/**
 * Ordine fornitore → stato comune.
 *
 * ⚠️ **Mappatura identità, ma su tre valori invece di quattro**:
 * `SupplierOrderStatus` non ha ancora «Da confermare», quindi questo
 * adattatore non può produrlo. Non è una scelta di disegno: è la colonna che
 * manca (`17` §2.3). Quando la migration arriverà, qui si aggiunge un caso e
 * la macchina non cambia.
 */
export function supplierOrderState(order: { readonly status: SupplierOrderStatus }): OrderState {
  switch (order.status) {
    case SupplierOrderStatus.concluded:
      return OrderState.Concluded;
    case SupplierOrderStatus.cancelled:
      return OrderState.Cancelled;
    case SupplierOrderStatus.confirmed:
    default:
      return OrderState.Confirmed;
  }
}

/**
 * Ordine cliente manuale → stato comune.
 *
 * ⛔ **Qui la distanza dalla decisione è molto maggiore, e va guardata in
 * faccia**: l'Ordine cliente non ha una colonna di stato. Lo stato si *deduce*
 * da tre campi che appartengono al canale — `cancelledAt`, `fulfilledAt` e
 * `fulfillmentStatus` — e per questo «Da confermare» non ha dove esistere
 * (`18` §2.4, `19` D1).
 *
 * ⭐ **`partially_fulfilled` si legge come Concluso**, ed è la decisione, non
 * una comodità: «Parzialmente concluso» è abolito, e un documento che copre
 * parte delle quantità **conclude comunque** l'ordine (`18` §7.4). L'ordine
 * resta comunque non eleggibile, come lo era prima — la lettura non cambia
 * nessun comportamento, dichiara solo qual è il nome giusto.
 */
export function manualSalesOrderState(order: {
  readonly cancelledAt: Date | null;
  readonly fulfilledAt: Date | null;
  readonly fulfillmentStatus: SalesOrderFulfillmentStatus;
}): OrderState {
  // L'ordine di precedenza è quello storico: annullato vince su tutto.
  if (order.cancelledAt !== null) {
    return OrderState.Cancelled;
  }
  if (order.fulfilledAt !== null) {
    return OrderState.Concluded;
  }
  if (order.fulfillmentStatus === SalesOrderFulfillmentStatus.partially_fulfilled) {
    return OrderState.Concluded;
  }
  return OrderState.Confirmed;
}
