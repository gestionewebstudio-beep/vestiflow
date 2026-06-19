/** Lunghezza standard EAN-13 (12 cifre dati + 1 di controllo). */
export const EAN13_LENGTH = 13;

const EAN13_DATA_LENGTH = 12;
const MAX_DISTINCT_ATTEMPTS = 20;

/** Calcola la cifra di controllo EAN-13 per le prime 12 cifre. */
export function calculateEan13CheckDigit(data12: string): string {
  if (!/^\d{12}$/.test(data12)) {
    throw new Error('EAN-13 richiede esattamente 12 cifre dati.');
  }

  let sum = 0;
  for (let index = 0; index < EAN13_DATA_LENGTH; index += 1) {
    const digit = Number(data12[index]);
    sum += index % 2 === 0 ? digit : digit * 3;
  }

  return String((10 - (sum % 10)) % 10);
}

/** Genera un barcode EAN-13 casuale con cifra di controllo valida. */
export function generateEan13Barcode(): string {
  const data12 = randomDigits(EAN13_DATA_LENGTH);
  return `${data12}${calculateEan13CheckDigit(data12)}`;
}

/**
 * Genera un EAN-13 distinto da `exclude` (confronto case-insensitive, trim).
 * Utile per evitare collisione con lo SKU della variante.
 */
export function generateDistinctEan13Barcode(exclude: string): string {
  const normalizedExclude = exclude.trim().toUpperCase();
  for (let attempt = 0; attempt < MAX_DISTINCT_ATTEMPTS; attempt += 1) {
    const candidate = generateEan13Barcode();
    if (candidate.toUpperCase() !== normalizedExclude) {
      return candidate;
    }
  }

  return generateEan13Barcode();
}

function randomDigits(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let digits = '';
  for (let index = 0; index < length; index += 1) {
    digits += String(bytes[index]! % 10);
  }
  return digits;
}
