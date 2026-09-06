import { ConflictException } from '@nestjs/common';
import { OrderCommercialState, SalesOrderSource, SupplierOrderStatus } from '@prisma/client';

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
    case SupplierOrderStatus.to_confirm:
      return OrderState.ToConfirm;
    case SupplierOrderStatus.concluded:
      return OrderState.Concluded;
    case SupplierOrderStatus.cancelled:
      return OrderState.Cancelled;
    case SupplierOrderStatus.confirmed:
      return OrderState.Confirmed;
  }
}

/**
 * Stato comune → valore persistibile dell'Ordine fornitore.
 *
 * ⚠️ I due enum hanno gli stessi quattro valori ma restano tipi PostgreSQL
 * diversi (`18` §2.4-bis): la conversione è esplicita perché l'unificazione
 * fisica è un refactor futuro, non un fatto già avvenuto.
 */
export function supplierOrderStatusDa(state: OrderState): SupplierOrderStatus {
  switch (state) {
    case OrderState.ToConfirm:
      return SupplierOrderStatus.to_confirm;
    case OrderState.Concluded:
      return SupplierOrderStatus.concluded;
    case OrderState.Cancelled:
      return SupplierOrderStatus.cancelled;
    case OrderState.Confirmed:
      return SupplierOrderStatus.confirmed;
  }
}

/**
 * Ordine cliente manuale → stato comune.
 *
 * ⭐ **Dal 28/08/2026 lo stato si LEGGE, non si deduce.** `commercialState` è
 * l'autorità per `source = manual`; i tre campi del canale — `cancelledAt`,
 * `fulfilledAt`, `fulfillmentStatus` — non entrano più in questa decisione e
 * conservano il significato che hanno per Shopify e per il Registro.
 *
 * ⛔ **Nessun ripiego, e non è una svista**: dopo la migration un ordine
 * `manual` con `commercialState` a NULL è un'INCOERENZA da rilevare, non un
 * quinto modo di dedurre lo stato. Un `commercialState ?? deduci(...)`
 * rimetterebbe in piedi la derivazione parallela che questo lavoro toglie, e la
 * renderebbe invisibile (`18` §2.4-bis).
 */
export type LetturaStatoManuale =
  | { readonly ok: true; readonly state: OrderState }
  /** `source ≠ manual`: l'ordine non ha un ciclo commerciale VestiFlow. */
  | { readonly ok: false; readonly motivo: 'ordine-di-canale' }
  /** `source = manual` senza stato: incoerenza, da segnalare. */
  | { readonly ok: false; readonly motivo: 'stato-assente' };

export function leggiStatoOrdineCliente(order: {
  readonly source: SalesOrderSource;
  readonly commercialState: OrderCommercialState | null;
}): LetturaStatoManuale {
  if (order.source !== SalesOrderSource.manual) {
    return { ok: false, motivo: 'ordine-di-canale' };
  }
  // ⚠️ `== null` copre anche `undefined`: una `select` parziale che ometta la
  //    colonna deve dare «stato assente», non uno stato indefinito che
  //    attraversa i confronti senza far scattare niente.
  if (order.commercialState == null) {
    return { ok: false, motivo: 'stato-assente' };
  }
  return { ok: true, state: order.commercialState };
}

/**
 * Variante stretta, per i percorsi che un ordine manuale ce l'hanno per
 * contratto (salvataggio, transizione, eleggibilità per ID).
 *
 * ⚠️ Lancia invece di indovinare: un ordine manuale senza stato è un dato
 * rotto, e proseguire con un valore inventato lo propagherebbe.
 */
export function statoOrdineClienteRichiesto(order: {
  readonly source: SalesOrderSource;
  readonly commercialState: OrderCommercialState | null;
}): OrderState {
  const lettura = leggiStatoOrdineCliente(order);
  if (lettura.ok) {
    return lettura.state;
  }
  throw new ConflictException(
    lettura.motivo === 'ordine-di-canale'
      ? "L'ordine appartiene a un canale esterno e non ha uno stato commerciale VestiFlow."
      : "L'ordine non ha uno stato commerciale: il dato è incoerente e va corretto.",
  );
}

/**
 * ⭐ **La guardia d'integrità fra stato e collegamento** (`12` §0.4-bis).
 *
 * Non è una seconda regola commerciale: la regola è lo stato. Questo confronta
 * lo stato col collegamento e dice se si contraddicono — e le due combinazioni
 * incoerenti sono ANOMALIE, non flusso ordinario.
 *
 * ⚠️ `hasActiveLink` lo calcola il chiamante, perché i due Ordini lo prendono da
 * posti diversi: il Cliente da una colonna (`documentId` → documento non
 * annullato), il Fornitore da un `EXISTS` sui documenti collegati. Il giudizio
 * è comune, la query no.
 */
export type CoerenzaCollegamento = 'coerente' | 'stato-vecchio' | 'legame-vecchio';

export function coerenzaCollegamento(
  state: OrderState,
  hasActiveLink: boolean,
): CoerenzaCollegamento {
  // Dice «confermato» ma un collegamento conclusivo attivo c'è: il ricalcolo
  // non è passato, o è passato e la scrittura si è persa.
  if (state === OrderState.Confirmed && hasActiveLink) {
    return 'stato-vecchio';
  }
  // Dice «concluso» e non c'è più nulla a cui essere collegato.
  if (state === OrderState.Concluded && !hasActiveLink) {
    return 'legame-vecchio';
  }
  return 'coerente';
}

/**
 * Eleggibilità come sorgente di Includi/Genera, guardia compresa.
 *
 * ⛔ **Fail closed**: un ordine incoerente NON è eleggibile. Non deve
 * ricomparire in silenzio fra gli includibili.
 */
export function eleggibileConGuardia(state: OrderState, hasActiveLink: boolean): boolean {
  return isEligibleAsSource(state) && coerenzaCollegamento(state, hasActiveLink) === 'coerente';
}

/** Il messaggio all'operatore quando sceglie per ID un ordine non più eleggibile. */
export const NON_PIU_ELEGGIBILE =
  "L'ordine non è più disponibile per l'inclusione. Aggiorna l'elenco e riprova.";
