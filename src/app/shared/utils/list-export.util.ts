import type { Money } from '@core/models/money.model';
import { DEFAULT_CURRENCY, formatMoney, moneyToDecimalString } from '@core/utils/money.util';

/**
 * Export di un **elenco**: CSV apribile in Excel e pagina HTML stampabile, con
 * riga totali (`14` §5.2).
 *
 * ⛔ **Non è codice nuovo.** Era `document-list-export.util.ts`, già
 * config-driven e ben fatto: l'unica cosa che lo legava ai documenti era il
 * tipo della riga. Reso generico invece di riscritto, perché la stessa coppia
 * CSV + stampa esisteva **due volte** — documenti e ordini cliente — e Ordini
 * fornitore stava per essere la terza.
 *
 * Ogni elenco fornisce **solo** ciò che lo distingue: titolo, prefisso del file
 * e colonne. Il resto — escaping, BOM, separatore, totali, foglio di stile
 * della stampa — vive qui una volta sola.
 */

/** Aggregazione a piè di lista di una colonna (somma monetaria o intera). */
export type ListExportFooter<T> =
  | { readonly kind: 'sumMoney'; readonly money: (row: T) => Money }
  | { readonly kind: 'sumInt'; readonly value: (row: T) => number };

/** Colonna dell'export: intestazione, valore cella e (opzionale) totale. */
export interface ListExportColumn<T> {
  readonly header: string;
  readonly cell: (row: T) => string;
  readonly numeric?: boolean;
  readonly footer?: ListExportFooter<T>;
}

export interface ListExportConfig<T> {
  /** Titolo della pagina stampata e intestazione dell'elenco. */
  readonly title: string;
  /** Prefisso del nome file (es. «arrivi-merce», «ordini-fornitore»). */
  readonly filePrefix: string;
  /** Come si chiamano gli elementi nel piè: «documenti», «ordini»… */
  readonly itemNoun: string;
  readonly columns: readonly ListExportColumn<T>[];
}

/**
 * Somma monetaria di una colonna.
 *
 * ⚠️ La valuta arriva dal `Money` della **prima riga**, non da un campo della
 * riga stessa: è ciò che ha reso possibile generalizzare senza chiedere agli
 * elenchi un accessore in più — `Money` la porta già con sé.
 */
function sumMoney<T>(rows: readonly T[], money: (row: T) => Money): Money {
  const first = rows[0];
  const currencyCode = first ? money(first).currencyCode : DEFAULT_CURRENCY;
  const amountMinor = rows.reduce((sum, row) => sum + money(row).amountMinor, 0);
  return { amountMinor, currencyCode };
}

/** Testo del totale di colonna, `''` se la colonna non aggrega. */
function footerText<T>(
  column: ListExportColumn<T>,
  rows: readonly T[],
  money: (value: Money) => string,
): string {
  if (!column.footer) {
    return '';
  }
  if (column.footer.kind === 'sumMoney') {
    return money(sumMoney(rows, column.footer.money));
  }
  const accessor = column.footer;
  return String(rows.reduce((sum, row) => sum + accessor.value(row), 0));
}

/** Decimale con virgola (Excel it-IT), senza simbolo valuta. */
function csvMoney(money: Money): string {
  return moneyToDecimalString(money).replace('.', ',');
}

/** Campo CSV con escaping RFC 4180 (separatore `;` per Excel it-IT). */
function csvField(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Nome file datato per l'export (es. «preventivi-2026-07-21.csv»). */
export function listExportFileName<T>(config: ListExportConfig<T>, extension: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${config.filePrefix}-${stamp}.${extension}`;
}

/**
 * CSV dell'elenco: BOM UTF-8 e separatore `;`, così un doppio clic lo apre già
 * incolonnato in Excel it-IT.
 */
export function buildListCsv<T>(rows: readonly T[], config: ListExportConfig<T>): string {
  const header = config.columns.map((column) => column.header);
  const body = rows.map((row) => config.columns.map((column) => column.cell(row)));
  const totals = config.columns.map((column, index) =>
    index === 0 ? `Totale (${rows.length} ${config.itemNoun})` : footerText(column, rows, csvMoney),
  );
  const lines = [header, ...body, totals].map((line) =>
    line.map((field) => csvField(field)).join(';'),
  );
  // BOM UTF-8: senza, Excel it-IT apre il file leggendo Windows-1252.
  return '﻿' + lines.join('\r\n');
}

/**
 * Pagina HTML autonoma per la stampa dell'elenco: intestazione, tabella e riga
 * totali. Il PDF si ottiene con «Salva come PDF» dalla finestra di stampa.
 */
export function buildListPrintHtml<T>(rows: readonly T[], config: ListExportConfig<T>): string {
  const generatedAt = new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());
  const title = escapeHtml(config.title);

  const headHtml = config.columns
    .map((column) => `<th${column.numeric ? ' class="num"' : ''}>${escapeHtml(column.header)}</th>`)
    .join('');

  const bodyHtml = rows
    .map((row) => {
      const cells = config.columns
        .map((column) => {
          const text = column.cell(row) || '—';
          return `<td${column.numeric ? ' class="num"' : ''}>${escapeHtml(text)}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('\n');

  const footHtml = config.columns
    .map((column, index) => {
      if (index === 0) {
        return `<td>Totale (${rows.length} ${escapeHtml(config.itemNoun)})</td>`;
      }
      const text = footerText(column, rows, formatMoney);
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
<p class="meta">${rows.length} ${escapeHtml(config.itemNoun)} · generato il ${escapeHtml(generatedAt)}</p>
<table>
<thead><tr>${headHtml}</tr></thead>
<tbody>
${bodyHtml}
</tbody>
<tfoot><tr>${footHtml}</tr></tfoot>
</table>
</body>
</html>`;
}
