// Etichette e toni display per gli stati vendita (it-IT). Funzioni pure
// riusate da lista, dettaglio, report e dashboard.

import {
  SalesOrderFinancialStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
} from '@core/models/sales-order.model';
import type { SalesOrderLine } from '@core/models/sales-order.model';
import type { BadgeTone } from '@shared/components/badge/badge.component';

const FINANCIAL_LABELS: Record<SalesOrderFinancialStatus, string> = {
  [SalesOrderFinancialStatus.Pending]: 'In attesa',
  [SalesOrderFinancialStatus.Paid]: 'Pagato',
  [SalesOrderFinancialStatus.PartiallyRefunded]: 'Rimborso parziale',
  [SalesOrderFinancialStatus.Refunded]: 'Rimborsato',
  [SalesOrderFinancialStatus.Voided]: 'Annullato',
};

const FINANCIAL_TONES: Record<SalesOrderFinancialStatus, BadgeTone> = {
  [SalesOrderFinancialStatus.Pending]: 'warning',
  [SalesOrderFinancialStatus.Paid]: 'success',
  [SalesOrderFinancialStatus.PartiallyRefunded]: 'warning',
  [SalesOrderFinancialStatus.Refunded]: 'neutral',
  [SalesOrderFinancialStatus.Voided]: 'error',
};

const FULFILLMENT_LABELS: Record<SalesOrderFulfillmentStatus, string> = {
  [SalesOrderFulfillmentStatus.Unfulfilled]: 'Da evadere',
  [SalesOrderFulfillmentStatus.Partial]: 'Evasione parziale',
  [SalesOrderFulfillmentStatus.Fulfilled]: 'Evaso',
};

const FULFILLMENT_TONES: Record<SalesOrderFulfillmentStatus, BadgeTone> = {
  [SalesOrderFulfillmentStatus.Unfulfilled]: 'warning',
  [SalesOrderFulfillmentStatus.Partial]: 'info',
  [SalesOrderFulfillmentStatus.Fulfilled]: 'success',
};

const SOURCE_LABELS: Record<SalesOrderSource, string> = {
  [SalesOrderSource.Online]: 'Online',
  [SalesOrderSource.Pos]: 'Negozio',
};

export function financialStatusLabel(status: SalesOrderFinancialStatus): string {
  return FINANCIAL_LABELS[status];
}

export function financialStatusTone(status: SalesOrderFinancialStatus): BadgeTone {
  return FINANCIAL_TONES[status];
}

export function fulfillmentStatusLabel(status: SalesOrderFulfillmentStatus): string {
  return FULFILLMENT_LABELS[status];
}

export function fulfillmentStatusTone(status: SalesOrderFulfillmentStatus): BadgeTone {
  return FULFILLMENT_TONES[status];
}

export function sourceLabel(source: SalesOrderSource): string {
  return SOURCE_LABELS[source];
}

/** Riepilogo righe ordine per lista vendite (titolo Shopify congelato al momento dell'ordine). */
export function salesOrderLinesSummary(
  lines: readonly Pick<SalesOrderLine, 'title' | 'quantity'>[],
): string {
  if (lines.length === 0) {
    return '—';
  }

  const first = lines[0]!;
  const firstLabel =
    first.quantity > 1
      ? `${formatLineTitle(first.title)} × ${first.quantity}`
      : formatLineTitle(first.title);

  if (lines.length === 1) {
    return firstLabel;
  }

  const others = lines.length - 1;
  return `${firstLabel} + ${others} ${others === 1 ? 'altro' : 'altri'}`;
}

function formatLineTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : '—';
}
