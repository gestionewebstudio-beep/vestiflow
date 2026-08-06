import type { Money } from '@core/models/money.model';

/**
 * Totali documento: algoritmo unico per tutti i tipi (Arrivo merce, Ordine
 * cliente, DDT, fattura). Prima viveva duplicato in ogni form; le due copie
 * differivano solo per come decidevano se l'IVA di una riga concorre al
 * totale, che qui è un dato in ingresso (`countsVatInTotal`).
 *
 * Specchio di `api/src/vat/*`: stesse formule e stessi arrotondamenti, così i
 * totali mostrati coincidono con quelli persistiti.
 */

/** Riga già ridotta a imponibile e imposta: il form sa come calcolarli. */
export interface DocumentTotalsLine {
  /** Imponibile della riga in unità minori (al netto degli sconti di riga). */
  readonly netMinor: number;
  /** Imposta della riga in unità minori, prima dello sconto documento. */
  readonly vatMinor: number;
  /** Aliquota, usata per ricalcolare l'imposta sul netto scontato. */
  readonly vatRate: number;
  /**
   * Se l'imposta concorre al totale documento. Falso per reverse charge e
   * aliquota zero: l'imponibile conta, l'IVA no.
   */
  readonly countsVatInTotal: boolean;
}

export interface DocumentTotals {
  /** Somma degli imponibili di riga, prima dello sconto documento. */
  readonly linesTotal: Money;
  /** Sconto documento in valore. */
  readonly documentDiscount: Money;
  /** Imponibile dopo lo sconto documento. */
  readonly subtotal: Money;
  readonly tax: Money;
  readonly total: Money;
}

/**
 * Lo sconto documento si applica DOPO gli sconti di riga, sull'imponibile
 * complessivo. L'IVA viene poi ricalcolata ripartendo lo sconto fra le
 * aliquote in proporzione al peso di ciascuna riga sull'imponibile.
 */
export function computeDocumentTotals(
  lines: readonly DocumentTotalsLine[],
  documentDiscountPercent: number,
  currencyCode: string,
): DocumentTotals {
  const linesTotalMinor = lines.reduce((sum, line) => sum + line.netMinor, 0);
  const discountMinor = Math.round((linesTotalMinor * documentDiscountPercent) / 100);
  const subtotalMinor = linesTotalMinor - discountMinor;

  const taxMinor =
    documentDiscountPercent === 0 || linesTotalMinor === 0
      ? lines.reduce((sum, line) => sum + (line.countsVatInTotal ? line.vatMinor : 0), 0)
      : lines.reduce((sum, line) => {
          if (!line.countsVatInTotal || line.vatRate <= 0) {
            return sum;
          }
          const share = line.netMinor / linesTotalMinor;
          const discountedNet = Math.round(subtotalMinor * share);
          return sum + Math.round((discountedNet * line.vatRate) / 100);
        }, 0);

  return {
    linesTotal: { amountMinor: linesTotalMinor, currencyCode },
    documentDiscount: { amountMinor: discountMinor, currencyCode },
    subtotal: { amountMinor: subtotalMinor, currencyCode },
    tax: { amountMinor: taxMinor, currencyCode },
    total: { amountMinor: subtotalMinor + taxMinor, currencyCode },
  };
}
