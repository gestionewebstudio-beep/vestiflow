/**
 * Verifiche formali dei dati fiscali italiani dell'anagrafica cliente:
 * partita IVA (11 cifre + carattere di controllo), codice fiscale (16
 * caratteri con checksum, o 11 cifre per i soggetti giuridici), codice
 * destinatario SDI (7 caratteri, 6 per la PA).
 *
 * Sono AVVISI non bloccanti (regole-gestionale): un dato malformato farebbe
 * scartare la fattura elettronica dallo SDI, ma non rompe l'integrità del
 * database — l'operatore vede l'avviso e può salvare comunque (es. anagrafiche
 * estere o importate da Shopify). Campo vuoto = sempre valido.
 */

const VAT_NUMBER_PATTERN = /^\d{11}$/;
const TAX_CODE_PATTERN = /^[A-Z]{6}[A-Z0-9]{2}[A-Z][A-Z0-9]{2}[A-Z][A-Z0-9]{3}[A-Z]$/;
// Solo il formato B2B a 7 caratteri: il generatore trasmette in FPR12, e un
// codice ufficio PA a 6 caratteri verrebbe scartato dallo SDI (00427).
const SDI_CODE_PATTERN = /^[A-Z0-9]{7}$/;

export const VAT_NUMBER_WARNING_MESSAGE =
  'Partita IVA non valida: servono 11 cifre con carattere di controllo corretto.';
export const TAX_CODE_WARNING_MESSAGE =
  'Codice fiscale non valido: controlla i 16 caratteri (o le 11 cifre per le società).';
export const SDI_CODE_WARNING_MESSAGE =
  'Codice destinatario non valido: servono 7 caratteri alfanumerici.';

/** Checksum di partita IVA e codice fiscale numerico (algoritmo Luhn art. 35 DPR 633/72). */
function hasValidVatChecksum(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const digit = Number(digits[i]);
    if (i % 2 === 0) {
      sum += digit;
    } else {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[10]);
}

// Tabelle ufficiali del carattere di controllo del codice fiscale (DM 12/03/1974).
const CF_ODD_VALUES: Readonly<Record<string, number>> = {
  '0': 1,
  '1': 0,
  '2': 5,
  '3': 7,
  '4': 9,
  '5': 13,
  '6': 15,
  '7': 17,
  '8': 19,
  '9': 21,
  A: 1,
  B: 0,
  C: 5,
  D: 7,
  E: 9,
  F: 13,
  G: 15,
  H: 17,
  I: 19,
  J: 21,
  K: 2,
  L: 4,
  M: 18,
  N: 20,
  O: 11,
  P: 3,
  Q: 6,
  R: 8,
  S: 12,
  T: 14,
  U: 16,
  V: 10,
  W: 22,
  X: 25,
  Y: 24,
  Z: 23,
};

function cfEvenValue(char: string): number {
  return char >= '0' && char <= '9' ? Number(char) : char.charCodeAt(0) - 65;
}

function hasValidTaxCodeChecksum(code: string): boolean {
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const char = code[i] as string;
    // Posizioni 1-based: dispari usano la tabella ODD, pari la conversione diretta.
    sum += i % 2 === 0 ? (CF_ODD_VALUES[char] ?? 0) : cfEvenValue(char);
  }
  return String.fromCharCode(65 + (sum % 26)) === code[15];
}

/** Partita IVA italiana: vuota o 11 cifre con checksum corretto. */
export function isValidItalianVatNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  return VAT_NUMBER_PATTERN.test(trimmed) && hasValidVatChecksum(trimmed);
}

/**
 * Codice fiscale: vuoto, 16 caratteri con checksum (persone fisiche, omocodia
 * inclusa) oppure 11 cifre con checksum P.IVA (soggetti giuridici).
 */
export function isValidItalianTaxCode(value: string): boolean {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) {
    return true;
  }
  if (VAT_NUMBER_PATTERN.test(trimmed)) {
    return hasValidVatChecksum(trimmed);
  }
  return TAX_CODE_PATTERN.test(trimmed) && hasValidTaxCodeChecksum(trimmed);
}

/** Codice destinatario SDI: vuoto o 7 caratteri alfanumerici (formato FPR12). */
export function isValidSdiCode(value: string): boolean {
  const trimmed = value.trim().toUpperCase();
  return !trimmed || SDI_CODE_PATTERN.test(trimmed);
}

export function vatNumberWarning(value: string): string | null {
  return isValidItalianVatNumber(value) ? null : VAT_NUMBER_WARNING_MESSAGE;
}

export function taxCodeWarning(value: string): string | null {
  return isValidItalianTaxCode(value) ? null : TAX_CODE_WARNING_MESSAGE;
}

export function sdiCodeWarning(value: string): string | null {
  return isValidSdiCode(value) ? null : SDI_CODE_WARNING_MESSAGE;
}
