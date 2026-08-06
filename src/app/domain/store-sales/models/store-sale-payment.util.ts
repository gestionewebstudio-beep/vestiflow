import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type { StoreSaleDocumentPaymentCode } from './store-sale.model';

/**
 * Etichette dei codici pagamento della cassa. Il documento salva il codice
 * grezzo (`cash`/`card`/`other`, o `mixed` per il multi-tender), non lo
 * snapshot testuale usato dai DDT: senza questa mappa elenco e dettaglio
 * mostrerebbero il codice all'operatore.
 */
const STORE_SALE_PAYMENT_LABELS: Record<StoreSaleDocumentPaymentCode, string> = {
  cash: 'Contanti',
  card: 'Carta',
  other: 'Altro',
  mixed: 'Misto',
};

export function isStoreSalePaymentCode(value: string): value is StoreSaleDocumentPaymentCode {
  return value in STORE_SALE_PAYMENT_LABELS;
}

/** Etichetta leggibile del codice; il valore grezzo se non riconosciuto. */
export function storeSalePaymentMethodLabel(value: string): string {
  return isStoreSalePaymentCode(value) ? STORE_SALE_PAYMENT_LABELS[value] : value;
}

/**
 * Etichetta del codice con la nota in coda, quando c'è: «Altro — Assegno»,
 * «Misto — Contanti 10,00 € + Carta 9,90 €». Per contanti/carta la nota è
 * ignorata (non esiste).
 */
export function storeSalePaymentMethodLabelWithNote(
  value: string,
  note: string | null | undefined,
): string {
  const label = storeSalePaymentMethodLabel(value);
  const trimmed = note?.trim();
  return (value === 'other' || value === 'mixed') && trimmed ? `${label} — ${trimmed}` : label;
}

export const STORE_SALE_PAYMENT_METHOD_OPTIONS: readonly SelectMenuOption[] = Object.entries(
  STORE_SALE_PAYMENT_LABELS,
).map(([value, label]) => ({ value, label }));
