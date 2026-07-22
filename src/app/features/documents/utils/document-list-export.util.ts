// Export massivo di un elenco documenti: CSV apribile in Excel e pagina HTML
// stampabile (stampa o "Salva come PDF" del browser) con totali di riepilogo.
// Funzioni pure e CONFIGURABILI per tipo documento: ogni elenco (Arrivi merce,
// Preventivi, e in futuro DDT/Fattura…) fornisce la propria configurazione di
// colonne, titolo e nome file, riusando lo stesso builder.

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

/** Aggregazione a piè di lista di una colonna (somma monetaria o intera). */
export type DocumentListExportFooter =
  | { readonly kind: 'sumMoney'; readonly money: (doc: DocumentRecord) => Money }
  | { readonly kind: 'sumInt'; readonly value: (doc: DocumentRecord) => number };

/** Colonna dell'export: intestazione, valore cella e (opzionale) totale. */
export interface DocumentListExportColumn {
  readonly header: string;
  readonly cell: (doc: DocumentRecord) => string;
  readonly numeric?: boolean;
  readonly footer?: DocumentListExportFooter;
}

/** Configurazione dell'export di un elenco: riusabile per tipo documento. */
export interface DocumentListExportConfig {
  /** Titolo della pagina stampata e intestazione dell'elenco. */
  readonly title: string;
  /** Prefisso del nome file (es. "arrivi-merce", "preventivi"). */
  readonly filePrefix: string;
  readonly columns: readonly DocumentListExportColumn[];
}

function lineCountOf(doc: DocumentRecord): number {
  return doc.lineCount ?? doc.lines?.length ?? 0;
}

/** Somma monetaria di una colonna sui documenti (valuta del primo documento). */
function sumMoney(docs: readonly DocumentRecord[], money: (doc: DocumentRecord) => Money): Money {
  const currencyCode = docs[0]?.currency ?? DEFAULT_CURRENCY;
  const amountMinor = docs.reduce((sum, doc) => sum + money(doc).amountMinor, 0);
  return { amountMinor, currencyCode };
}

/** Testo del totale di colonna, '' se la colonna non aggrega. */
function footerText(column: DocumentListExportColumn, docs: readonly DocumentRecord[]): string {
  if (!column.footer) {
    return '';
  }
  if (column.footer.kind === 'sumMoney') {
    return formatMoney(sumMoney(docs, column.footer.money));
  }
  const value = column.footer;
  return String(docs.reduce((sum, doc) => sum + value.value(doc), 0));
}

/** Decimale con virgola (Excel it-IT), senza simbolo valuta. */
function csvMoney(money: Money): string {
  return moneyToDecimalString(money).replace('.', ',');
}

/** Testo del totale di colonna per il CSV (numeri con virgola, senza valuta). */
function footerCsvText(column: DocumentListExportColumn, docs: readonly DocumentRecord[]): string {
  if (!column.footer) {
    return '';
  }
  if (column.footer.kind === 'sumMoney') {
    return csvMoney(sumMoney(docs, column.footer.money));
  }
  const value = column.footer;
  return String(docs.reduce((sum, doc) => sum + value.value(doc), 0));
}

/** Campo CSV con escaping RFC 4180 (separatore ';' per Excel it-IT). */
function csvField(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Nome file datato per l'export (es. "preventivi-2026-07-21.csv"). */
export function documentListExportFileName(
  config: DocumentListExportConfig,
  extension: string,
): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${config.filePrefix}-${stamp}.${extension}`;
}

/**
 * CSV dei documenti selezionati (BOM UTF-8 + separatore ';': doppio click e
 * Excel it-IT lo apre già incolonnato). La prima cella del piè mostra il
 * conteggio, le colonne con `footer` mostrano la loro somma.
 */
export function buildDocumentListCsv(
  docs: readonly DocumentRecord[],
  config: DocumentListExportConfig,
): string {
  const header = config.columns.map((column) => column.header);
  const rows = docs.map((doc) => config.columns.map((column) => column.cell(doc)));
  const totalsRow = config.columns.map((column, index) =>
    index === 0 ? `Totale (${docs.length} documenti)` : footerCsvText(column, docs),
  );
  const lines = [header, ...rows, totalsRow].map((row) =>
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
 * tabella documenti e riga totali. Il PDF si ottiene con "Salva come PDF"
 * dalla finestra di stampa del browser.
 */
export function buildDocumentListPrintHtml(
  docs: readonly DocumentRecord[],
  config: DocumentListExportConfig,
): string {
  const generatedAt = new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());
  const title = escapeHtml(`${config.title} — elenco selezionati`);

  const headHtml = config.columns
    .map((column) => `<th${column.numeric ? ' class="num"' : ''}>${escapeHtml(column.header)}</th>`)
    .join('');

  const bodyRows = docs
    .map((doc) => {
      const cellsHtml = config.columns
        .map((column) => {
          const text = column.cell(doc) || '—';
          return `<td${column.numeric ? ' class="num"' : ''}>${escapeHtml(text)}</td>`;
        })
        .join('');
      return `<tr>${cellsHtml}</tr>`;
    })
    .join('\n');

  const footerHtml = config.columns
    .map((column, index) => {
      if (index === 0) {
        return `<td>Totale (${docs.length} documenti)</td>`;
      }
      const text = footerText(column, docs);
      return `<td${column.numeric ? ' class="num"' : ''}>${escapeHtml(text)}</td>`;
    })
    .join('');

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>${title}</title>
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
<h1>${title}</h1>
<p class="meta">${docs.length} documenti · generato il ${escapeHtml(generatedAt)}</p>
<table>
<thead>
<tr>${headHtml}</tr>
</thead>
<tbody>
${bodyRows}
</tbody>
<tfoot>
<tr>${footerHtml}</tr>
</tfoot>
</table>
</body>
</html>`;
}

// ── Configurazioni per tipo documento ──────────────────────────────────────

/** Export elenco Arrivi merce (colonne fornitore/causale/collegamento fattura). */
export const GOODS_RECEIPT_LIST_EXPORT: DocumentListExportConfig = {
  title: 'Arrivi merce',
  filePrefix: 'arrivi-merce',
  columns: [
    { header: 'Data', cell: (doc) => formatDate(doc.documentDate) },
    { header: 'Numero', cell: (doc) => doc.reference ?? '' },
    { header: 'Fornitore', cell: (doc) => doc.supplierName ?? '' },
    { header: 'Doc. fornitore', cell: (doc) => goodsReceiptExternalDocLabel(doc) },
    { header: 'Causale carico', cell: (doc) => doc.causalText?.trim() ?? '' },
    { header: 'Magazzino', cell: (doc) => doc.locationName ?? '' },
    {
      header: 'Righe',
      numeric: true,
      cell: (doc) => String(lineCountOf(doc)),
      footer: { kind: 'sumInt', value: lineCountOf },
    },
    {
      header: 'Imponibile',
      numeric: true,
      cell: (doc) => formatMoney(doc.subtotal),
      footer: { kind: 'sumMoney', money: (doc) => doc.subtotal },
    },
    {
      header: 'IVA',
      numeric: true,
      cell: (doc) => formatMoney(doc.tax),
      footer: { kind: 'sumMoney', money: (doc) => doc.tax },
    },
    {
      header: 'Totale',
      numeric: true,
      cell: (doc) => formatMoney(doc.total),
      footer: { kind: 'sumMoney', money: (doc) => doc.total },
    },
    { header: 'Fattura collegata', cell: (doc) => goodsReceiptLinkStatusLabel(doc) ?? '' },
  ],
};

/** Export elenco Preventivi (colonne cliente-oriented, nessun dato magazzino). */
export const QUOTE_LIST_EXPORT: DocumentListExportConfig = {
  title: 'Preventivi',
  filePrefix: 'preventivi',
  columns: [
    { header: 'Data', cell: (doc) => formatDate(doc.documentDate) },
    { header: 'Numero', cell: (doc) => doc.reference ?? '' },
    { header: 'Cliente', cell: (doc) => doc.customerName ?? '' },
    { header: 'Cod. cliente', cell: (doc) => doc.customerCode?.trim() ?? '' },
    { header: 'Pagamento', cell: (doc) => doc.paymentTerms?.trim() ?? '' },
    {
      header: 'Righe',
      numeric: true,
      cell: (doc) => String(lineCountOf(doc)),
      footer: { kind: 'sumInt', value: lineCountOf },
    },
    {
      header: 'Imponibile',
      numeric: true,
      cell: (doc) => formatMoney(doc.subtotal),
      footer: { kind: 'sumMoney', money: (doc) => doc.subtotal },
    },
    {
      header: 'IVA',
      numeric: true,
      cell: (doc) => formatMoney(doc.tax),
      footer: { kind: 'sumMoney', money: (doc) => doc.tax },
    },
    {
      header: 'Totale',
      numeric: true,
      cell: (doc) => formatMoney(doc.total),
      footer: { kind: 'sumMoney', money: (doc) => doc.total },
    },
  ],
};
