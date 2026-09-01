/**
 * ⭐ **I controlli di digitazione dei dati fiscali e postali italiani**, comuni
 * a ogni anagrafica: fornitore, cliente, azienda.
 *
 * ⛔ **Sono AVVISI, non blocchi**, ed è `regole-gestionale` a deciderlo: i
 * blocchi restano alle sole violazioni che romperebbero il database, la sync o
 * l'identità di un'entità — SKU, codice articolo, barcode. Una partita IVA con
 * la cifra di controllo sbagliata non rompe niente: è quasi sempre un errore di
 * battitura, e ogni tanto è il dato che il fornitore ha davvero mandato così.
 * L'operatore vede l'avviso e salva lo stesso. Per questo qui non c'è nessun
 * `ValidatorFn`: ci sono predicati e messaggi.
 *
 * ⚠️ **Gli algoritmi sono COPIATI, non riscritti**, dal ramo archiviato
 * `archivio/fattura-elettronica` (`7866b80f`,
 * `src/app/domain/customers/utils/customer-fiscal.validators.ts`), che
 * `docs/06b-estrazione-fattura-elettronica.md` §B riporta con l'istruzione
 * esplicita: «vanno copiati testualmente, non reinventati — in particolare la
 * tabella del codice fiscale non è derivabile».
 *
 * ⛔ **E la tabella non si indovina davvero**: 0→1, 1→0, 2→5, 3→7, 4→9, 5→13.
 * I valori di prova di questo file vengono dallo spec archiviato, non da
 * esempi trovati altrove: `RSSMRA85M01H501Z`, che gira come «il» codice
 * fiscale d'esempio, **non ha il carattere di controllo giusto** — misurato.
 *
 * ⚠️ **Un campo vuoto è sempre valido**: sono tutti facoltativi, e l'assenza di
 * un dato non è un errore di battitura.
 *
 * ⏸ Il codice destinatario SDI ha la stessa forma e resta in `docs/06b` §B.4
 * finché un campo non lo chiede: qui sarebbe codice morto.
 */

const VAT_NUMBER_PATTERN = /^\d{11}$/;
const TAX_CODE_PATTERN = /^[A-Z]{6}[A-Z0-9]{2}[A-Z][A-Z0-9]{2}[A-Z][A-Z0-9]{3}[A-Z]$/;
const POSTAL_CODE_PATTERN = /^\d{5}$/;
const PROVINCE_PATTERN = /^[A-Za-z]{2}$/;
const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/;

export const VAT_NUMBER_WARNING_MESSAGE =
  'Partita IVA non valida: servono 11 cifre con carattere di controllo corretto.';
export const TAX_CODE_WARNING_MESSAGE =
  'Codice fiscale non valido: controlla i 16 caratteri (o le 11 cifre per le società).';
export const POSTAL_CODE_WARNING_MESSAGE = 'CAP non valido: servono 5 cifre.';
export const PROVINCE_WARNING_MESSAGE = 'Provincia: due lettere, es. NA.';
export const COUNTRY_CODE_WARNING_MESSAGE = 'Paese: due lettere, es. IT.';

/** Checksum di partita IVA e codice fiscale numerico (algoritmo Luhn art. 35 DPR 633/72). */
function hasValidVatChecksum(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
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

/** Tabelle ufficiali del carattere di controllo del codice fiscale (DM 12/03/1974). */
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
  for (let i = 0; i < 15; i += 1) {
    const char = code[i] as string;
    // Posizioni 1-based: le dispari usano la tabella ODD, le pari la conversione diretta.
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
 *
 * ⚠️ **La doppia forma non è una comodità**: per una società il codice fiscale
 * È la partita IVA, e un controllo che pretendesse sempre 16 caratteri
 * segnalerebbe come errata ogni anagrafica B2B — cioè quasi tutte, qui.
 *
 * ⚠️ **L'omocodia** sostituisce cifre con lettere nelle posizioni numeriche:
 * per questo anno, giorno e codice catastale accettano `[A-Z0-9]`, non `[0-9]`.
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

/** CAP italiano: vuoto o cinque cifre. */
export function isValidItalianPostalCode(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || POSTAL_CODE_PATTERN.test(trimmed);
}

/** Sigla di provincia: vuota o due lettere (NA, MI, RM). */
export function isValidItalianProvince(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || PROVINCE_PATTERN.test(trimmed);
}

/** Codice paese ISO 3166-1 alpha-2: vuoto o due lettere (IT, DE, FR). */
export function isValidCountryCode(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || COUNTRY_CODE_PATTERN.test(trimmed);
}

export function vatNumberWarning(value: string): string | null {
  return isValidItalianVatNumber(value) ? null : VAT_NUMBER_WARNING_MESSAGE;
}

export function taxCodeWarning(value: string): string | null {
  return isValidItalianTaxCode(value) ? null : TAX_CODE_WARNING_MESSAGE;
}

export function postalCodeWarning(value: string): string | null {
  return isValidItalianPostalCode(value) ? null : POSTAL_CODE_WARNING_MESSAGE;
}

export function provinceWarning(value: string): string | null {
  return isValidItalianProvince(value) ? null : PROVINCE_WARNING_MESSAGE;
}

export function countryCodeWarning(value: string): string | null {
  return isValidCountryCode(value) ? null : COUNTRY_CODE_WARNING_MESSAGE;
}
