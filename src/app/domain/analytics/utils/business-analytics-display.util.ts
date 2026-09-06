import { DEFAULT_CURRENCY, formatMoney } from '@core/utils/money.util';
import type { Money } from '@core/models/common.model';

import type { BusinessAnalyticsSummary } from '../models/business-analytics.model';

export function moneyMinor(amountMinor: number, currencyCode = DEFAULT_CURRENCY): Money {
  return { amountMinor, currencyCode };
}

export function formatChangePercent(value: number | null): string | null {
  if (value === null) {
    return null;
  }
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toLocaleString('it-IT', { maximumFractionDigits: 1 })}% vs periodo prec.`;
}

export function changeTrendTone(value: number | null): 'success' | 'error' | 'neutral' {
  if (value === null || value === 0) {
    return 'neutral';
  }
  return value > 0 ? 'success' : 'error';
}

export function formatPercentSuffix(value: number): string {
  return `(${value.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%)`;
}

export function formatMarginValue(summary: BusinessAnalyticsSummary): string {
  if (summary.margin.grossMinor === null || summary.margin.grossPercent === null) {
    return '—';
  }
  return formatMoney(moneyMinor(summary.margin.grossMinor, summary.currencyCode));
}

export function formatMarginPercentSuffix(summary: BusinessAnalyticsSummary): string | null {
  if (summary.margin.grossPercent === null) {
    return null;
  }
  return formatPercentSuffix(summary.margin.grossPercent);
}

/**
 * ⛔ Qui c'erano tre messaggi costruiti su `costCoveragePercent` — «Compila i
 * costi d'acquisto…», «Margine stimato su X% del fatturato (costo noto)» e
 * «…con costo d'acquisto noto». Dicevano quanta parte del fatturato avesse un
 * costo NOTO, distinzione che esisteva solo perché il costo poteva essere NULL.
 * Un costo non valorizzato vale zero, quindi ogni vendita ha un costo e la
 * copertura è sempre totale: raccontarla sarebbe raccontare un modello che il
 * database non ha più.
 *
 * ⚠️ `grossMinor === null` ha ancora DUE cause, e vanno dette diversamente:
 * il mascheramento per permessi, e un periodo senza vendite.
 */
export function marginHint(summary: BusinessAnalyticsSummary): string {
  if (summary.margin.grossMinor === null) {
    return summary.revenue.totalMinor > 0
      ? 'Margine non visibile con i tuoi permessi'
      : 'Nessuna vendita nel periodo';
  }
  return 'Margine lordo sul fatturato';
}

export function forecastHint(summary: BusinessAnalyticsSummary): string {
  const parts = [`Media giornaliera nel periodo`];
  if (summary.forecast.daysOfCover !== null) {
    parts.push(`copertura stock ~${summary.forecast.daysOfCover} gg`);
  }
  return parts.join(' · ');
}
