import {
  TableViewId,
  TableViewPresetId as PresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

export const SALES_DOCUMENT_LINES_VIEW = TableViewId.SalesDocumentLines;

/**
 * Le colonne della riga di un documento di vendita: Proforma, Fattura e Fattura
 * accompagnatoria, che sono la stessa maschera.
 *
 * Le larghezze sono quelle dell'Ordine cliente per le colonne omonime: un
 * Cod. articolo non è più stretto perché sta in una fattura.
 *
 * «Scarica mag.» è dichiarata qui ma vive solo sulla Fattura accompagnatoria
 * senza DDT agganciato — con un DDT le giacenze le ha già scaricate quello, e
 * il template non rende proprio la colonna.
 */
export const SALES_DOCUMENT_LINE_COLUMNS: readonly TableColumnDef[] = [
  { id: 'articleCode', label: 'Cod. articolo', defaultWidthPx: 96, minWidthPx: 64 },
  { id: 'sku', label: 'SKU', defaultWidthPx: 104, minWidthPx: 64 },
  { id: 'barcode', label: 'EAN', defaultWidthPx: 124, minWidthPx: 72 },
  { id: 'product', label: 'Nome prodotto', defaultWidthPx: 300, minWidthPx: 160 },
  { id: 'quantity', label: 'Qtà', numeric: true, defaultWidthPx: 72, minWidthPx: 52 },
  { id: 'unitPrice', label: 'Prezzo', numeric: true, defaultWidthPx: 104, minWidthPx: 72 },
  { id: 'discount', label: 'Sconto', numeric: true, defaultWidthPx: 84, minWidthPx: 60 },
  { id: 'vat', label: 'IVA', defaultWidthPx: 120, minWidthPx: 84 },
  { id: 'loadsStock', label: 'Scarica mag.', defaultWidthPx: 88, minWidthPx: 64 },
  { id: 'actions', label: 'Azioni', defaultWidthPx: 44, minWidthPx: 44 },
];

const TUTTE = SALES_DOCUMENT_LINE_COLUMNS.map((column) => column.id);

/**
 * Le viste salvate. Quella del commercialista toglie i codici — a chi registra
 * interessano descrizione, imponibile e aliquota — e quella di magazzino toglie
 * prezzo e sconto, che a chi prepara la merce non servono.
 */
export const SALES_DOCUMENT_LINE_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: TUTTE,
  [PresetId.Warehouse]: [
    'articleCode',
    'sku',
    'barcode',
    'product',
    'quantity',
    'loadsStock',
    'actions',
  ],
  [PresetId.Accountant]: ['product', 'quantity', 'unitPrice', 'discount', 'vat', 'actions'],
  [PresetId.Supplier]: TUTTE,
  [PresetId.Analysis]: TUTTE,
  [PresetId.Operational]: ['sku', 'product', 'quantity', 'unitPrice', 'discount', 'vat', 'actions'],
};
