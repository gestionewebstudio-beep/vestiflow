// Aritmetica del multi-tender di cassa: quote per metodo, quadratura col
// totale, resto sui contanti. Funzioni pure — la UI mostra, qui si calcola.

import type { CreateStoreSalePayload, StoreSalePaymentMethod } from './store-sale.model';

/** Riga pagamento in compilazione in cassa (importi LORDI in unità minori). */
export interface TenderRow {
  readonly method: StoreSalePaymentMethod;
  /** Descrizione libera, significativa solo per «Altro». */
  readonly methodNote: string;
  /** Quota del totale coperta da questo metodo. */
  readonly amountMinor: number;
  /** Solo contanti: consegnato dal cliente (null = non digitato). */
  readonly tenderedMinor: number | null;
}

/** Somma delle quote inserite. */
export function tenderPaidMinor(rows: readonly TenderRow[]): number {
  return rows.reduce((sum, row) => sum + row.amountMinor, 0);
}

/** Quanto manca alla quadratura (negativo = quote oltre il totale). */
export function tenderRemainingMinor(totalMinor: number, rows: readonly TenderRow[]): number {
  return totalMinor - tenderPaidMinor(rows);
}

/** Resto da rendere: contanti consegnati oltre la quota da incassare. */
export function tenderChangeMinor(rows: readonly TenderRow[]): number {
  return rows.reduce(
    (sum, row) =>
      row.method === 'cash' && row.tenderedMinor != null
        ? sum + Math.max(0, row.tenderedMinor - row.amountMinor)
        : sum,
    0,
  );
}

/** Contanti consegnati sotto la quota: il resto non può essere negativo. */
export function tenderHasCashShortfall(rows: readonly TenderRow[]): boolean {
  return rows.some(
    (row) =>
      row.method === 'cash' && row.tenderedMinor != null && row.tenderedMinor < row.amountMinor,
  );
}

/**
 * Il pagamento è concludibile: quote positive che coprono esattamente il
 * totale, senza contanti sotto quota. La vendita a totale zero (omaggio
 * pieno) non ha incasso da ripartire ed è sempre concludibile.
 */
export function canConcludeTender(totalMinor: number, rows: readonly TenderRow[]): boolean {
  if (totalMinor === 0) {
    return true;
  }
  return (
    rows.length > 0 &&
    rows.every((row) => row.amountMinor > 0) &&
    tenderRemainingMinor(totalMinor, rows) === 0 &&
    !tenderHasCashShortfall(rows)
  );
}

/**
 * Frammento di payload per il server: le righe pagamento, oppure il metodo
 * unico legacy quando il totale è zero (niente quote da ripartire). Nota solo
 * su «Altro», «ricevuti» solo sui contanti e mai sotto quota.
 */
export function tenderToPaymentsPayload(
  totalMinor: number,
  rows: readonly TenderRow[],
): Pick<CreateStoreSalePayload, 'payments' | 'paymentMethod' | 'paymentMethodNote'> {
  if (totalMinor === 0) {
    const first = rows[0];
    const note = first?.method === 'other' ? first.methodNote.trim() : '';
    return {
      paymentMethod: first?.method ?? 'cash',
      paymentMethodNote: note || undefined,
    };
  }
  return {
    payments: rows.map((row) => ({
      method: row.method,
      methodNote: row.method === 'other' ? row.methodNote.trim() || undefined : undefined,
      amountMinor: row.amountMinor,
      tenderedMinor:
        row.method === 'cash' && row.tenderedMinor != null && row.tenderedMinor >= row.amountMinor
          ? row.tenderedMinor
          : undefined,
    })),
  };
}
