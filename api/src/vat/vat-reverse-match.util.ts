import type { VatUsageScope } from '@prisma/client';

import type { VatCodeWithNature } from './vat-codes.service';

/**
 * Corrispondenza inversa aliquota → Codice IVA per le vendite di canale
 * (Shopify e simili), dove l'aliquota è un **dato osservato**: quella che il
 * canale ha applicato alla transazione, non una scelta dell'operatore.
 *
 * **La vendita si registra come è avvenuta.** L'aliquota e l'imposta restano
 * quelle del canale — il cliente ha ricevuto una conferma d'ordine con quei
 * numeri, e due versioni della stessa vendita non possono esistere. Qui si
 * decide soltanto se a quell'aliquota corrisponde un Codice IVA del tenant, e
 * la risposta è sì **solo quando è una e una sola**.
 *
 * ⚠️ **Due casi in cui non si sceglie, e prima si sceglieva** _(registro
 * difetti 3.13, deciso il 15/08/2026)_:
 *
 * - **aliquota zero** — una percentuale dello 0% non identifica una Natura.
 *   Esente, non imponibile, fuori campo ed escluso art. 15 condividono lo zero
 *   e sono fattispecie diverse: la vecchia versione prendeva il primo codice a
 *   `zero_rate` che il database restituiva, cioè una natura fiscale scelta
 *   dall'ordine fisico delle righe. Uno zero che arriva da Shopify indica di
 *   norma un negozio configurato male, e va segnalato — non tradotto;
 * - **più codici alla stessa aliquota** — un tenant che ne crea due al 22%
 *   sceglie una distinzione che questa funzione non conosce. Prima vinceva il
 *   primo dell'elenco: un ripiego arbitrario della stessa famiglia della sede
 *   scelta in ordine alfabetico (difetto 3.8).
 *
 * In entrambi i casi torna `null`: la riga conserva l'aliquota osservata e
 * resta senza codice, che è il modo di dire «non lo so» invece di indovinare.
 * Per registrare ordini, corrispettivi e la comunicazione al commercialista
 * l'aliquota basta; dove serve la Natura — la fattura — il Codice IVA viene
 * dall'anagrafica prodotto, per un'altra strada.
 */
export function findVatCodeForDerivedRate(
  ratePercent: number | null,
  candidates: readonly VatCodeWithNature[],
  scopes: readonly VatUsageScope[] = ['sales', 'both'],
): VatCodeWithNature | null {
  if (ratePercent == null || ratePercent === 0) {
    return null;
  }

  const allowedScopes = new Set<string>(scopes);
  const matches = candidates.filter(
    (vatCode) =>
      vatCode.isActive &&
      allowedScopes.has(vatCode.usageScope) &&
      Number(vatCode.ratePercent) === ratePercent &&
      vatCode.calculationMode === 'standard',
  );

  return matches.length === 1 ? matches[0]! : null;
}
