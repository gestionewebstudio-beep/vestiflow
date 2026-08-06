/** Lunghezza minima del codice fornitore numerico progressivo (es. 0001). */
export const SUPPLIER_NUMERIC_CODE_PAD = 4;

/** Calcola il prossimo codice numerico progressivo a partire dai codici esistenti. */
export function nextNumericSupplierCode(existingCodes: readonly string[]): string {
  let max = 0;
  for (const raw of existingCodes) {
    const code = raw.trim();
    if (/^\d+$/.test(code)) {
      max = Math.max(max, Number.parseInt(code, 10));
    }
  }
  return String(max + 1).padStart(SUPPLIER_NUMERIC_CODE_PAD, '0');
}
