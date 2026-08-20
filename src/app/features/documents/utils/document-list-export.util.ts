// Export massivo di un elenco documenti: colonne, titolo e nome file di QUESTO
// dominio. Il come — CSV con BOM e separatore ';', pagina HTML stampabile,
// totali di colonna — vive in `shared/utils/list-export.util.ts`.
//
// ⛔ Il builder generico stava qui, ed era già ben fatto: configurabile per
// tipo documento, con colonne, totali e nome file. Il 20/08/2026 è stato reso
// generico e spostato invece che riscritto, perché la stessa coppia CSV +
// stampa esisteva DUE volte — qui e negli Ordini cliente — e Ordini fornitore
// stava per essere la terza (`14` §5.2).
//
// Qui resta ciò che è dei documenti: l'etichetta della controparte e il nome
// con cui questo elenco chiama i propri elementi.

import type { DocumentRecord } from '@core/models/document.model';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import {
  buildListCsv,
  buildListPrintHtml,
  listExportFileName,
  type ListExportColumn,
  type ListExportConfig,
  type ListExportFooter,
} from '@shared/utils/list-export.util';

import {
  counterpartyDocLabel,
  goodsReceiptLinkStatusLabel,
} from '@domain/documents/models/document-labels.util';

/**
 * Colonna «Doc. fornitore» dell'elenco arrivi merce: l'etichetta della
 * controparte, con il riferimento collegato come ripiego per gli arrivi
 * storici che portano solo quello.
 */
export function goodsReceiptExternalDocLabel(doc: DocumentRecord): string {
  return counterpartyDocLabel(doc) || (doc.externalRef?.trim() ?? '');
}

export type DocumentListExportFooter = ListExportFooter<DocumentRecord>;
export type DocumentListExportColumn = ListExportColumn<DocumentRecord>;

/**
 * Configurazione dell'export di un elenco documenti.
 *
 * ⚠️ Non porta `itemNoun`: per questo dominio è sempre «documenti», e chiederlo
 * a ogni configurazione sarebbe una riga copiata quindici volte.
 */
export type DocumentListExportConfig = Omit<ListExportConfig<DocumentRecord>, 'itemNoun'>;

/**
 * ⚠️ Il suffisso «— elenco selezionati» sta QUI e non nel builder comune.
 *
 * ⛔ **Diventerà falso quando l'ambito sarà cablato**: con la regola di `14`
 * §5.3 una stampa senza selezione riguarda l'intero risultato dei filtri, non
 * una selezione. Il titolo dovrà arrivare dal chiamante, che l'ambito lo
 * conosce. Per ora resta com'era, così questa estrazione non cambia una virgola
 * di ciò che l'operatore vede.
 */
function conTitolo(config: DocumentListExportConfig): ListExportConfig<DocumentRecord> {
  return { ...config, title: `${config.title} — elenco selezionati`, itemNoun: 'documenti' };
}

/** Nome file datato per l'export (es. «preventivi-2026-07-21.csv»). */
export function documentListExportFileName(
  config: DocumentListExportConfig,
  extension: string,
): string {
  return listExportFileName(conTitolo(config), extension);
}

export function buildDocumentListCsv(
  docs: readonly DocumentRecord[],
  config: DocumentListExportConfig,
): string {
  return buildListCsv(docs, conTitolo(config));
}

export function buildDocumentListPrintHtml(
  docs: readonly DocumentRecord[],
  config: DocumentListExportConfig,
): string {
  return buildListPrintHtml(docs, conTitolo(config));
}

/** Righe del documento: il conteggio se il server lo manda, o quelle caricate. */
function lineCountOf(doc: DocumentRecord): number {
  return doc.lineCount ?? doc.lines?.length ?? 0;
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
