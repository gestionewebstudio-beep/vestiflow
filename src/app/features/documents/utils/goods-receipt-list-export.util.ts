// Export massivo della lista Arrivi merce: CSV apribile in Excel e pagina
// HTML stampabile (stampa o "Salva come PDF" del browser) con totali di
// riepilogo. Funzioni pure: nessuna dipendenza Angular, testabili in isolamento.

import type { DocumentRecord } from '@core/models/document.model';
import type { Money } from '@core/models/money.model';
import { formatDate } from '@core/utils/date.util';
import { DEFAULT_CURRENCY, formatMoney, moneyToDecimalString } from '@core/utils/money.util';

import { goodsReceiptLinkStatusLabel } from '../models/document-labels.util';

/** "DDT 145 del 08/05/2026" da snapshot tipo + numero + data documento fornitore. */
export function goodsReceiptExternalDocLabel(doc: DocumentRecord): string {
  const number = doc.externalDocNumber?.trim();
  if (!number) {
    return doc.externalRef?.trim() ?? '';
  }
  const typePrefix = doc.externalDocumentTypeSnapshot?.trim();
  const label = typePrefix ? `${typePrefix} ${number}` : number;
  return doc.externalDocDate ? `${label} del ${formatDate(doc.externalDocDate)}` : label;
}

interface GoodsReceiptListTotals {
  readonly count: number;
  readonly lineCount: number;
  readonly subtotal: Money;
  readonly tax: Money;
  readonly total: Money;
}

function sumTotals(docs: readonly DocumentRecord[]): GoodsReceiptListTotals {
  const currencyCode = docs[0]?.currency ?? DEFAULT_CURRENCY;
  let subtotalMinor = 0;
  let taxMinor = 0;
  let totalMinor = 0;
  let lineCount = 0;
  for (const doc of docs) {
    subtotalMinor += doc.subtotal.amountMinor;
    taxMinor += doc.tax.amountMinor;
    totalMinor += doc.total.amountMinor;
    lineCount += doc.lineCount ?? doc.lines?.length ?? 0;
  }
  return {
    count: docs.length,
    lineCount,
    subtotal: { amountMinor: subtotalMinor, currencyCode },
    tax: { amountMinor: taxMinor, currencyCode },
    total: { amountMinor: totalMinor, currencyCode },
  };
}

/** Decimale con virgola (Excel it-IT), senza simbolo valuta. */
function csvAmount(money: Money): string {
  return moneyToDecimalString(money).replace('.', ',');
}

/** Campo CSV con escaping RFC 4180 (separatore ';' per Excel it-IT). */
function csvField(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * CSV dei documenti selezionati (BOM UTF-8 + separatore ';': doppio click e
 * Excel it-IT lo apre già incolonnato).
 */
export function buildGoodsReceiptListCsv(docs: readonly DocumentRecord[]): string {
  const header = [
    'Data',
    'Numero',
    'Fornitore',
    'Doc. fornitore',
    'Causale carico',
    'Magazzino',
    'Righe',
    'Imponibile',
    'IVA',
    'Totale',
    'Fattura collegata',
  ];
  const rows = docs.map((doc) => [
    formatDate(doc.documentDate),
    doc.reference ?? '',
    doc.supplierName ?? '',
    goodsReceiptExternalDocLabel(doc),
    doc.causalText?.trim() ?? '',
    doc.locationName ?? '',
    String(doc.lineCount ?? doc.lines?.length ?? 0),
    csvAmount(doc.subtotal),
    csvAmount(doc.tax),
    csvAmount(doc.total),
    goodsReceiptLinkStatusLabel(doc) ?? '',
  ]);
  const totals = sumTotals(docs);
  const totalsRow = [
    'Totale',
    `${totals.count} documenti`,
    '',
    '',
    '',
    '',
    String(totals.lineCount),
    csvAmount(totals.subtotal),
    csvAmount(totals.tax),
    csvAmount(totals.total),
    '',
  ];
  const lines = [header, ...rows, totalsRow].map((row) =>
    row.map((field) => csvField(field)).join(';'),
  );
  // BOM UTF-8: senza, Excel it-IT apre il file leggendo Windows-1252.
  return '\uFEFF' + lines.join('\r\n');
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
 * tabella documenti e riga totali. Il PDF si ottiene con "Salva come PDF"
 * dalla finestra di stampa del browser.
 */
export function buildGoodsReceiptListPrintHtml(docs: readonly DocumentRecord[]): string {
  const totals = sumTotals(docs);
  const generatedAt = new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());

  const bodyRows = docs
    .map((doc) => {
      const cells: readonly { readonly text: string; readonly numeric?: boolean }[] = [
        { text: formatDate(doc.documentDate) },
        { text: doc.reference ?? '—' },
        { text: doc.supplierName ?? '—' },
        { text: goodsReceiptExternalDocLabel(doc) || '—' },
        { text: doc.causalText?.trim() || '—' },
        { text: doc.locationName ?? '—' },
        { text: String(doc.lineCount ?? doc.lines?.length ?? 0), numeric: true },
        { text: formatMoney(doc.subtotal), numeric: true },
        { text: formatMoney(doc.tax), numeric: true },
        { text: formatMoney(doc.total), numeric: true },
        { text: goodsReceiptLinkStatusLabel(doc) ?? '—' },
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
<title>Arrivi merce — elenco selezionati</title>
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
<h1>Arrivi merce — elenco selezionati</h1>
<p class="meta">${totals.count} documenti · generato il ${escapeHtml(generatedAt)}</p>
<table>
<thead>
<tr>
  <th>Data</th><th>Numero</th><th>Fornitore</th><th>Doc. fornitore</th><th>Causale carico</th>
  <th>Magazzino</th><th class="num">Righe</th><th class="num">Imponibile</th><th class="num">IVA</th>
  <th class="num">Totale</th><th>Fattura collegata</th>
</tr>
</thead>
<tbody>
${bodyRows}
</tbody>
<tfoot>
<tr>
  <td colspan="6">Totale (${totals.count} documenti)</td>
  <td class="num">${totals.lineCount}</td>
  <td class="num">${escapeHtml(formatMoney(totals.subtotal))}</td>
  <td class="num">${escapeHtml(formatMoney(totals.tax))}</td>
  <td class="num">${escapeHtml(formatMoney(totals.total))}</td>
  <td></td>
</tr>
</tfoot>
</table>
</body>
</html>`;
}
