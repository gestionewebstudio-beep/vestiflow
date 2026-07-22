// Export massivo della lista Ordini cliente: CSV apribile in Excel e pagina
// HTML stampabile (stampa o "Salva come PDF" del browser) con riga totali.
// Funzioni pure, testabili: stesso approccio dell'elenco Arrivi merce.

import {
  manualOrderState,
  SalesOrderSource,
  type SalesOrder,
} from '@core/models/sales-order.model';
import type { Money } from '@core/models/money.model';
import { formatDate } from '@core/utils/date.util';
import { DEFAULT_CURRENCY, formatMoney, moneyToDecimalString } from '@core/utils/money.util';

import {
  financialStatusLabel,
  fulfillmentStatusLabel,
  sourceLabel,
} from '../models/sales-order-labels.util';

/** Stato derivato (colonna Stato), coerente con la tabella ordini. */
function orderStateLabel(order: SalesOrder): string {
  if (order.source === SalesOrderSource.Manual) {
    switch (manualOrderState(order)) {
      case 'cancelled':
        return 'Annullato';
      case 'concluded':
        return 'Concluso';
      case 'partially_concluded':
        return 'Parzialmente concluso';
      default:
        return 'Confermato';
    }
  }
  if (order.cancelledAt) {
    return 'Annullato';
  }
  if (order.fulfillmentStatus === 'fulfilled') {
    return 'Evaso';
  }
  return 'Aperto';
}

interface SalesOrderListTotals {
  readonly count: number;
  readonly total: Money;
}

function sumTotals(orders: readonly SalesOrder[]): SalesOrderListTotals {
  const currencyCode = orders[0]?.total.currencyCode ?? DEFAULT_CURRENCY;
  let totalMinor = 0;
  for (const order of orders) {
    totalMinor += order.total.amountMinor;
  }
  return { count: orders.length, total: { amountMinor: totalMinor, currencyCode } };
}

/** Decimale con virgola (Excel it-IT), senza simbolo valuta. */
function csvAmount(money: Money): string {
  return moneyToDecimalString(money).replace('.', ',');
}

/** Campo CSV con escaping RFC 4180 (separatore ';' per Excel it-IT). */
function csvField(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const COLUMNS = [
  'Data',
  'Numero',
  'Origine',
  'Cliente',
  'Stato',
  'Pagamento',
  'Evasione',
  'Location',
  'Totale',
] as const;

/** CSV degli ordini selezionati (BOM UTF-8 + separatore ';' per Excel it-IT). */
export function buildSalesOrderListCsv(orders: readonly SalesOrder[]): string {
  const rows = orders.map((order) => [
    formatDate(order.placedAt),
    order.orderNumber,
    sourceLabel(order.source),
    order.customerName,
    orderStateLabel(order),
    financialStatusLabel(order.financialStatus),
    fulfillmentStatusLabel(order.fulfillmentStatus),
    order.locationName ?? '',
    csvAmount(order.total),
  ]);
  const totals = sumTotals(orders);
  const totalsRow = [
    'Totale',
    `${totals.count} ordini`,
    '',
    '',
    '',
    '',
    '',
    '',
    csvAmount(totals.total),
  ];
  const lines = [[...COLUMNS], ...rows, totalsRow].map((row) =>
    row.map((field) => csvField(field)).join(';'),
  );
  // BOM UTF-8: senza, Excel it-IT apre il file leggendo Windows-1252.
  return '﻿' + lines.join('\r\n');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Pagina HTML autonoma per la stampa dell'elenco selezionato: intestazione,
 * tabella ordini e riga totali. Il PDF si ottiene con "Salva come PDF" dalla
 * finestra di stampa del browser.
 */
export function buildSalesOrderListPrintHtml(orders: readonly SalesOrder[]): string {
  const totals = sumTotals(orders);
  const generatedAt = new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());

  const bodyRows = orders
    .map((order) => {
      const cells: readonly { readonly text: string; readonly numeric?: boolean }[] = [
        { text: formatDate(order.placedAt) },
        { text: order.orderNumber },
        { text: sourceLabel(order.source) },
        { text: order.customerName || '—' },
        { text: orderStateLabel(order) },
        { text: financialStatusLabel(order.financialStatus) },
        { text: fulfillmentStatusLabel(order.fulfillmentStatus) },
        { text: order.locationName ?? '—' },
        { text: formatMoney(order.total), numeric: true },
      ];
      const cellsHtml = cells
        .map((cell) => `<td${cell.numeric ? ' class="num"' : ''}>${escapeHtml(cell.text)}</td>`)
        .join('');
      return `<tr>${cellsHtml}</tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>Ordini cliente — elenco selezionati</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 24px; font: 12px/1.45 "Segoe UI", Arial, sans-serif; color: #1a1a1a; }
  h1 { margin: 0 0 2px; font-size: 18px; }
  .meta { margin: 0 0 16px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 5px 8px; border: 1px solid #c9c9c9; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tfoot td { font-weight: 700; background: #f7f7f7; }
  @media print { body { margin: 8mm; } }
</style>
</head>
<body>
<h1>Ordini cliente — elenco selezionati</h1>
<p class="meta">${totals.count} ordini · generato il ${escapeHtml(generatedAt)}</p>
<table>
<thead>
<tr>
  <th>Data</th><th>Numero</th><th>Origine</th><th>Cliente</th><th>Stato</th>
  <th>Pagamento</th><th>Evasione</th><th>Location</th><th class="num">Totale</th>
</tr>
</thead>
<tbody>
${bodyRows}
</tbody>
<tfoot>
<tr>
  <td colspan="8">Totale (${totals.count} ordini)</td>
  <td class="num">${escapeHtml(formatMoney(totals.total))}</td>
</tr>
</tfoot>
</table>
</body>
</html>`;
}
