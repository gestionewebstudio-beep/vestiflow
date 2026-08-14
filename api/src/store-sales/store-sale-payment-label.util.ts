/**
 * Etichette dei metodi di pagamento della cassa, lato API.
 *
 * Il documento salva il codice grezzo (`cash`/`card`/`other`), non lo snapshot
 * testuale che usano i DDT: senza questa mappa la stampa di una vendita in
 * negozio uscirebbe con scritto «cash».
 *
 * Gemella di `src/app/domain/store-sales/models/store-sale-payment.util.ts`:
 * stesse tre voci, stesso trattamento della nota libera di «Altro». L'insieme è
 * chiuso e minuscolo — se un giorno cresce, cresce in due punti.
 */
const STORE_SALE_PAYMENT_LABELS: Readonly<Record<string, string>> = {
  cash: 'Contanti',
  card: 'Carta',
  other: 'Altro',
};

/** Etichetta leggibile del metodo; il valore grezzo se non riconosciuto. */
export function storeSalePaymentMethodLabel(value: string): string {
  return STORE_SALE_PAYMENT_LABELS[value] ?? value;
}

/**
 * Etichetta del metodo con la descrizione libera di «Altro» in coda, quando
 * presente: «Altro — Assegno». Per contanti e carta la nota è ignorata.
 */
export function storeSalePaymentMethodLabelWithNote(
  value: string,
  note: string | null | undefined,
): string {
  const label = storeSalePaymentMethodLabel(value);
  const trimmed = note?.trim();
  return value === 'other' && trimmed ? `${label} — ${trimmed}` : label;
}
