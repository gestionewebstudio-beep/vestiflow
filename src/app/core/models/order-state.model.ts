import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/**
 * Il ciclo commerciale COMUNE a Ordine cliente manuale e Ordine fornitore.
 *
 * ⭐ È il gemello lato client di `api/src/common/order-state.util.ts`: gli stessi
 * quattro valori, con le stesse stringhe. Un secondo vocabolario qui vorrebbe
 * dire tradurre a ogni chiamata, e la traduzione è il posto dove i due lati si
 * separano senza che nessuno se ne accorga.
 *
 * ⛔ **Uno stato decide UNA cosa sola: se l'ordine è includibile in un documento
 * di destinazione.** Non decide se si apre, se si modifica, se si salva, se si
 * stampa o se si elimina (`17` §2.2, `18` §16).
 */
export const OrderState = {
  /** Salvato ma non ancora un impegno: niente reservation, fuori da «Includi». */
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
 * I tre stati che l'operatore sceglie dal selettore.
 *
 * ⛔ **Concluso non è qui, ed è la ragione per cui questo elenco esiste**: è
 * derivato dal collegamento a un documento, e un valore scelto a mano verrebbe
 * sovrascritto al primo ricalcolo — mentendo nel frattempo. L'API lo rifiuta
 * (`assertManualTransition`); qui non deve nemmeno essere proponibile.
 */
export const ORDER_STATE_SELECTABLE: readonly OrderState[] = [
  OrderState.ToConfirm,
  OrderState.Confirmed,
  OrderState.Cancelled,
];

export function isSelectableOrderState(value: string): value is OrderState {
  return (ORDER_STATE_SELECTABLE as readonly string[]).includes(value);
}

/**
 * ⛔ Finché è Concluso, il campo Stato è **bloccato**.
 *
 * ⚠️ Il blocco è sullo **stato**, non sul documento: un ordine Concluso si apre,
 * si modifica, si salva, si stampa e si elimina secondo i permessi comuni. Ciò
 * che non si può fare è dichiararlo diverso da com'è — da Concluso si esce
 * annullando o eliminando il documento collegato (`17` §2.5, `12` §0.4-bis).
 */
export function isOrderStateLocked(state: OrderState): boolean {
  return state === OrderState.Concluded;
}

export function orderStateLabel(state: OrderState): string {
  switch (state) {
    case OrderState.ToConfirm:
      return 'Da confermare';
    case OrderState.Concluded:
      return 'Concluso';
    case OrderState.Cancelled:
      return 'Annullato';
    case OrderState.Confirmed:
      return 'Confermato';
  }
}

export type OrderStateTone = 'success' | 'error' | 'info' | 'warning';

export function orderStateTone(state: OrderState): OrderStateTone {
  switch (state) {
    case OrderState.ToConfirm:
      return 'warning';
    case OrderState.Concluded:
      return 'info';
    case OrderState.Cancelled:
      return 'error';
    case OrderState.Confirmed:
      return 'success';
  }
}

/** Le voci del selettore: i tre scegliibili, sempre le stesse e nello stesso ordine. */
export const ORDER_STATE_OPTIONS: readonly SelectMenuOption[] = ORDER_STATE_SELECTABLE.map(
  (state) => ({ value: state, label: orderStateLabel(state) }),
);
