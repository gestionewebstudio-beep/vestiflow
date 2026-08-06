/** Cifre decimali della percentuale: la cascata di due sconti interi non ne fa di più. */
const PERCENT_DECIMALS = 4;

/**
 * Notazione sconto (es. "10%", "4+10%") → percentuale effettiva a cascata
 * (0–100). La cascata è la regola: "4+10%" è 4%, poi 10% su quel che resta,
 * cioè **13,6%** — non 14.
 *
 * Prima arrotondava all'intero, e non per scelta: la colonna `discount_percent`
 * era INTEGER. Il risultato era che l'anteprima mostrava 13,6% e il documento
 * ne salvava 14, valendo un po' meno di quanto l'operatore aveva letto. Ora la
 * colonna tiene i decimali e questa funzione non ha più motivo di perderli.
 */
export function parseEffectiveDiscountPercent(input: string): number {
  const factor = 10 ** PERCENT_DECIMALS;
  const effective = (1 - cascadeDiscountMultiplier(input)) * 100;
  return Math.round(effective * factor) / factor;
}

const PERCENT_FORMAT = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });

/**
 * Percentuale di sconto → testo, per rimetterla in un campo o mostrarla in
 * tabella. I decimali compaiono solo se ci sono, con la virgola: una cascata
 * vale «13,6», uno sconto secco resta «10». Il parser sopra la rilegge.
 */
export function formatDiscountPercentValue(percent: number): string {
  return PERCENT_FORMAT.format(percent);
}

/** Come sopra, col segno: «13,6%». */
export function formatDiscountPercent(percent: number): string {
  return `${formatDiscountPercentValue(percent)}%`;
}

/**
 * Moltiplicatore dello sconto a cascata: "4+10%" → 0,96 × 0,90 = 0,864.
 * È la forma da usare per scontare un importo; `parseEffectiveDiscountPercent`
 * dà lo stesso sconto espresso in percentuale, per chi deve memorizzarlo o
 * mostrarlo.
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
