/** Converte notazione sconto (es. "10%", "4+10%") in percentuale effettiva a cascata (0–100). */
export function parseEffectiveDiscountPercent(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) {
    return 0;
  }

  const parts = trimmed
    .replace(/%/g, '')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return 0;
  }

  let multiplier = 1;
  for (const part of parts) {
    const value = Number.parseFloat(part.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      continue;
    }
    multiplier *= (100 - value) / 100;
  }

  const effective = (1 - multiplier) * 100;
  return Math.round(Math.min(100, Math.max(0, effective)));
}

/** Applica sconto percentuale effettivo a un importo in unità minori. */
export function applyDiscountMinor(amountMinor: number, discountInput: string): number {
  if (amountMinor <= 0) {
    return 0;
  }
  const discount = parseEffectiveDiscountPercent(discountInput);
  if (discount <= 0) {
    return amountMinor;
  }
  return Math.round((amountMinor * (100 - discount)) / 100);
}

/**
 * Moltiplicatore ESATTO dello sconto a cascata (§Ordine cliente): a differenza
 * di `parseEffectiveDiscountPercent` non arrotonda mai la percentuale —
 * "4+10%" → 0.96 × 0.90 = 0.864 (13,6% effettivo, NON 14%).
 */
export function cascadeDiscountMultiplier(input: string | null | undefined): number {
  const trimmed = input?.trim();
  if (!trimmed) {
    return 1;
  }
  let multiplier = 1;
  for (const part of trimmed.replace(/%/g, '').split('+')) {
    const value = Number.parseFloat(part.trim().replace(',', '.'));
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      continue;
    }
    multiplier *= (100 - value) / 100;
  }
  return Math.min(1, Math.max(0, multiplier));
}

/**
 * Prezzo scontato in unità minori con cascata esatta (arrotondamento al
 * centesimo solo alla fine): prezzo × Π(1 − sᵢ/100).
 */
export function applyCascadeDiscountMinor(
  amountMinor: number,
  discountInput: string | null | undefined,
): number {
  if (amountMinor <= 0) {
    return 0;
  }
  return Math.round(amountMinor * cascadeDiscountMultiplier(discountInput));
}
