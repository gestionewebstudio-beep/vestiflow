import type { BusinessAnalyticsSummaryDto } from './dto/business-analytics-summary.dto';

/**
 * Margini e valorizzazione al costo derivano dal costo d'acquisto (dato
 * sensibile §permessi): margine + prezzo = costo con una sottrazione, quindi
 * il permesso deve coprire l'informazione, non solo il campo. Senza
 * "Visualizza costi d'acquisto" questi blocchi escono azzerati; il resto del
 * report (fatturato, vendite, giacenze a valore di vendita) resta integro.
 */
export function maskCostSensitiveSummary(
  summary: BusinessAnalyticsSummaryDto,
): BusinessAnalyticsSummaryDto {
  return {
    ...summary,
    margin: { grossMinor: null, grossPercent: null },
    inventory: {
      ...summary.inventory,
      stockCostMinor: null,
      stockMarginMinor: null,
      stockMarginPercent: null,
    },
  };
}
