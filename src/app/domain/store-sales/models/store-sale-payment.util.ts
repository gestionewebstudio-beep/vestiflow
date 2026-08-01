import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type { StoreSalePaymentMethod } from './store-sale.model';

/**
 * Etichette dei metodi di pagamento della cassa. Il documento salva il codice
 * grezzo (`cash`/`card`/`other`), non lo snapshot testuale usato dai DDT: senza
 * questa mappa elenco e dettaglio mostrerebbero il codice all'operatore.
 */
const STORE_SALE_PAYMENT_LABELS: Record<StoreSalePaymentMethod, string> = {
  cash: 'Contanti',
  card: 'Carta',
  other: 'Altro',
};

export function isStoreSalePaymentMethod(value: string): value is StoreSalePaymentMethod {
  return value in STORE_SALE_PAYMENT_LABELS;
}

/** Etichetta leggibile del metodo; il valore grezzo se non riconosciuto. */
export function storeSalePaymentMethodLabel(value: string): string {
  return isStoreSalePaymentMethod(value) ? STORE_SALE_PAYMENT_LABELS[value] : value;
}

/**
 * Etichetta del metodo con la descrizione libera di «Altro» in coda, quando
 * presente: «Altro — Assegno». Per cash/card la nota è ignorata.
 */
export function storeSalePaymentMethodLabelWithNote(
  value: string,
  note: string | null | undefined,
): string {
  const label = storeSalePaymentMethodLabel(value);
  const trimmed = note?.trim();
  return value === 'other' && trimmed ? `${label} — ${trimmed}` : label;
}

export const STORE_SALE_PAYMENT_METHOD_OPTIONS: readonly SelectMenuOption[] = Object.entries(
  STORE_SALE_PAYMENT_LABELS,
).map(([value, label]) => ({ value, label }));
