// Validazioni di dominio pure (framework-agnostiche): riusabili sia dalla UI
// (reactive forms, step 8.6) sia dal mock service. La validazione autoritativa
// vivra' comunque lato backend NestJS.

import {
  DEFAULT_CURRENCY,
  isValidCompareAt,
  moneyFromMajor,
  parseMoneyInput,
} from '@core/utils/money.util';

/** SKU: alfanumerico con trattini, senza spazi, prima lettera/numero. */
export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

/** Normalizza lo SKU per i confronti di unicita' (trim + maiuscolo). */
export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

/** Verifica formale dello SKU (non l'unicita'). */
export function isValidSku(sku: string): boolean {
  return SKU_PATTERN.test(sku.trim());
}

/**
 * SKU duplicati nella lista (case-insensitive). Ritorna i valori normalizzati
 * che compaiono piu' di una volta; lista vuota = nessun duplicato.
 */
export function findDuplicateSkus(skus: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const raw of skus) {
    const sku = normalizeSku(raw);
    if (!sku) {
      continue;
    }
    if (seen.has(sku)) {
      duplicates.add(sku);
    } else {
      seen.add(sku);
    }
  }
  return [...duplicates];
}

/** Numero massimo di assi opzione per prodotto (vincolo Shopify: max 3 opzioni). */
export const MAX_OPTION_AXES = 3;

/** Nome asse opzione valido: non vuoto dopo trim. */
export function isValidAxisName(name: string): boolean {
  return name.trim().length > 0;
}

/**
 * Nomi asse duplicati (case-insensitive, trim). Ritorna i nomi normalizzati che
 * compaiono piu' di una volta; lista vuota = nessun duplicato.
 */
export function findDuplicateAxisNames(names: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const raw of names) {
    const name = raw.trim().toLowerCase();
    if (!name) {
      continue;
    }
    if (seen.has(name)) {
      duplicates.add(name);
    } else {
      seen.add(name);
    }
  }
  return [...duplicates];
}

/** Esito di validazione del prezzo barrato: nessun errore, formato, o non maggiore. */
export type CompareAtError = 'format' | 'notHigher' | null;

/**
 * Regola unica e centralizzata del prezzo "barrato" (compareAtPrice) a partire
 * dall'input utente (stringa) e dal prezzo di vendita in unità maggiori:
 * - testo vuoto      -> null  (campo opzionale, nessun errore)
 * - non parsabile    -> 'format'
 * - <= prezzo vendita -> 'notHigher'
 * - altrimenti       -> null  (valido)
 * Il parsing passa per parseMoneyInput (niente float); il confronto per
 * isValidCompareAt sul value object Money. Nessun hardcode valuta: DEFAULT_CURRENCY.
 */
export function compareAtPriceError(
  sellingPriceMajor: number,
  compareAtText: string,
): CompareAtError {
  if (compareAtText.trim() === '') {
    return null;
  }
  const compareAt = parseMoneyInput(compareAtText, DEFAULT_CURRENCY);
  if (compareAt === null) {
    return 'format';
  }
  const price = moneyFromMajor(sellingPriceMajor, DEFAULT_CURRENCY);
  return isValidCompareAt(price, compareAt) ? null : 'notHigher';
}

/** Il barcode, se presente, deve essere diverso dallo SKU (sono cose distinte). */
export function isBarcodeDistinct(sku: string, barcode: string): boolean {
  const trimmed = barcode.trim();
  if (!trimmed) {
    return true;
  }
  return normalizeSku(trimmed) !== normalizeSku(sku);
}
