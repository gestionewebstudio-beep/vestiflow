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
