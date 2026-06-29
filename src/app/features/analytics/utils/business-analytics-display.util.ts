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

export function marginHint(summary: BusinessAnalyticsSummary): string {
  if (summary.margin.costCoveragePercent <= 0) {
    return "Compila i costi d'acquisto in catalogo per calcolare il margine";
  }
  if (summary.margin.costCoveragePercent < 100) {
    return `Margine stimato su ${summary.margin.costCoveragePercent.toLocaleString('it-IT', { maximumFractionDigits: 1 })}% del fatturato (costo noto)`;
  }
  return "Margine lordo sul fatturato con costo d'acquisto noto";
}

export function forecastHint(summary: BusinessAnalyticsSummary): string {
  const parts = [`Media giornaliera nel periodo`];
  if (summary.forecast.daysOfCover !== null) {
    parts.push(`copertura stock ~${summary.forecast.daysOfCover} gg`);
  }
  return parts.join(' · ');
}
