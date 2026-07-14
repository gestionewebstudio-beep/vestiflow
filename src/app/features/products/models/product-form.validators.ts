// Validazioni di dominio pure (framework-agnostiche): riusabili sia dalla UI
// (reactive forms, step 8.6) sia dal mock service. La validazione autoritativa
// vivra' comunque lato backend NestJS.

import { DEFAULT_CURRENCY, isValidCompareAt, moneyFromMajor } from '@core/utils/money.util';

/** SKU: alfanumerico con trattini, senza spazi, prima lettera/numero. */
export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

/** Normalizza lo SKU per i confronti di unicita' (trim + maiuscolo). */
export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

/**
 * Verifica formale dello SKU (non l'unicita'). Lo SKU è facoltativo: una
 * stringa vuota è sempre valida (nessun `if SKU is empty -> non creabile`,
 * per specifica cliente). Se valorizzato, deve rispettare il formato.
 */
export function isValidSku(sku: string): boolean {
  const trimmed = sku.trim();
  return trimmed.length === 0 || SKU_PATTERN.test(trimmed);
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

/** Esito di validazione del prezzo barrato: nessun errore o non maggiore del prezzo vendita. */
export type CompareAtError = 'notHigher' | null;

/**
 * Regola unica e centralizzata del prezzo "barrato" (compareAtPrice):
 * - null / assente -> null (campo opzionale, nessun errore)
 * - <= prezzo vendita -> 'notHigher'
 * - altrimenti -> null (valido)
 */
export function compareAtPriceError(
  sellingPriceMajor: number,
  compareAtMajor: number | null,
): CompareAtError {
  if (compareAtMajor === null) {
    return null;
  }
  const price = moneyFromMajor(sellingPriceMajor, DEFAULT_CURRENCY);
  const compareAt = moneyFromMajor(compareAtMajor, DEFAULT_CURRENCY);
  return isValidCompareAt(price, compareAt) ? null : 'notHigher';
}

/** Normalizza il barcode per confronti di unicita' (trim + maiuscolo). */
export function normalizeBarcode(barcode: string): string {
  return barcode.trim().toUpperCase();
}

/**
 * Barcode duplicati nella lista (case-insensitive). Ritorna i valori normalizzati
 * che compaiono piu' di una volta; lista vuota = nessun duplicato.
 */
export function findDuplicateBarcodes(barcodes: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const raw of barcodes) {
    const barcode = normalizeBarcode(raw);
    if (!barcode) {
      continue;
    }
    if (seen.has(barcode)) {
      duplicates.add(barcode);
    } else {
      seen.add(barcode);
    }
  }
  return [...duplicates];
}

/** Il barcode, se presente, deve essere diverso dallo SKU (sono cose distinte). */
export function isBarcodeDistinct(sku: string, barcode: string): boolean {
  const trimmed = barcode.trim();
  if (!trimmed) {
    return true;
  }
  return normalizeBarcode(trimmed) !== normalizeSku(sku);
}
