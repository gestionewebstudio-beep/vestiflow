/**
 * Ripartizione proporzionale di un importo in unità minori su una lista di
 * pesi, senza perdite da arrotondamento (metodo dei cumulati): la somma delle
 * quote è SEMPRE uguale al totale. Usata per allocare l'IVA ordine sulle
 * righe della Vendita online quando il canale non fornisce il dettaglio.
 */
export function allocateProportional(
  totalMinor: number,
  weights: readonly number[],
): number[] {
  if (weights.length === 0) {
    return [];
  }
  const weightSum = weights.reduce((acc, weight) => acc + Math.max(0, weight), 0);
  if (weightSum <= 0 || totalMinor === 0) {
    return weights.map(() => 0);
  }

  const result: number[] = [];
  let allocated = 0;
  let cumulative = 0;
  for (const weight of weights) {
    cumulative += Math.max(0, weight);
    const target = Math.round((totalMinor * cumulative) / weightSum);
    result.push(target - allocated);
    allocated = target;
  }
  return result;
}

/**
 * Aliquota IVA % intera derivata da imponibile e imposta (es. 2200/10000 → 22).
 * Null quando non derivabile (imponibile nullo o negativo).
 */
export function deriveVatRatePercent(
  subtotalMinor: number,
  taxMinor: number,
): number | null {
  if (subtotalMinor <= 0) {
    return null;
  }
  if (taxMinor <= 0) {
    return 0;
  }
  return Math.round((taxMinor / subtotalMinor) * 100);
}
