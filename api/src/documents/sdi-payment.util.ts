/**
 * Modalità di pagamento SDI (MP01–MP23).
 *
 * Le PaymentOption di sistema portano il codice normativo dentro il nome —
 * «Bonifico (MP05)», «Contanti (MP01)» — e i documenti salvano quel nome come
 * snapshot. Qui il codice viene estratto per l'XML FatturaPA: se il nome non
 * contiene un codice MP valido (voce personalizzata, valori cassa cash/card),
 * la modalità resta ignota e il blocco DatiPagamento non viene emesso.
 */

const SDI_PAYMENT_METHOD_PATTERN = /\(MP(0[1-9]|1\d|2[0-3])\)\s*$/;

/** Estrae il codice MP01–MP23 dal nome della modalità di pagamento, se c'è. */
export function sdiPaymentMethodCode(paymentMethod: string | null | undefined): string | null {
  const match = paymentMethod?.trim().match(SDI_PAYMENT_METHOD_PATTERN);
  return match ? `MP${match[1]}` : null;
}
