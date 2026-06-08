// Validazioni di dominio pure (framework-agnostiche): riusabili sia dalla UI
// (reactive forms, step 8.6) sia dal mock service. La validazione autoritativa
// vivra' comunque lato backend NestJS.

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

/** Il barcode, se presente, deve essere diverso dallo SKU (sono cose distinte). */
export function isBarcodeDistinct(sku: string, barcode: string): boolean {
  const trimmed = barcode.trim();
  if (!trimmed) {
    return true;
  }
  return normalizeSku(trimmed) !== normalizeSku(sku);
}
