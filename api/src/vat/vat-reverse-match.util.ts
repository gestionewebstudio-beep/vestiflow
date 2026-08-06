import type { VatUsageScope } from '@prisma/client';

import type { VatCodeWithNature } from './vat-codes.service';

/**
 * Corrispondenza inversa aliquota → Codice IVA (vendite online, corrispettivi,
 * ordini canale): l'aliquota qui è un DATO OSSERVATO (derivato da subtotale/
 * imposta reali del canale), non una scelta dell'utente. Si cerca un Codice
 * IVA attivo, con lo scope adeguato, che rappresenti la stessa aliquota — mai
 * si fabbrica un codice per un'aliquota senza corrispondenza (a differenza
 * del backfill di migrazione, che sintetizza voci "-LEGACY" storiche).
 *
 * Stessa logica di `vatCodeIdForRate` lato frontend (goods-receipt-form):
 * l'aliquota è già arrotondata all'intero più vicino da `deriveVatRatePercent`,
 * quindi il confronto con `ratePercent` del Codice IVA è un'uguaglianza esatta,
 * non una tolleranza sui decimali.
 */
export function findVatCodeForDerivedRate(
  ratePercent: number | null,
  candidates: readonly VatCodeWithNature[],
  scopes: readonly VatUsageScope[] = ['sales', 'both'],
): VatCodeWithNature | null {
  if (ratePercent == null) {
    return null;
  }
  const allowedScopes = new Set<string>(scopes);
  const match = candidates.find(
    (vatCode) =>
      vatCode.isActive &&
      allowedScopes.has(vatCode.usageScope) &&
      Number(vatCode.ratePercent) === ratePercent &&
      (vatCode.calculationMode === 'standard' ||
        (ratePercent === 0 && vatCode.calculationMode === 'zero_rate')),
  );
  return match ?? null;
}
