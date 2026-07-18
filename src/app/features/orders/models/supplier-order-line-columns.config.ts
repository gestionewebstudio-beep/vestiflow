import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

export const SUPPLIER_ORDER_LINES_VIEW = TableViewId.SupplierOrderLines;

// Colonne righe Ordine fornitore (prompt 2026-07). Visibili di default:
// Cod. articolo, SKU, EAN, Cod. fornitore, Nome prodotto, Q.tà, U.m.,
// Costo (netto/ivato), Sconto, IVA, Totale. Attivabili dal selettore:
// Prezzo al pubblico, Prezzo barrato, Q.tà giacenza, Q.tà disponibile.
// NESSUNA colonna "Mag.": l'ordine fornitore non incide sulle giacenze.
export const SUPPLIER_ORDER_LINE_COLUMNS: readonly TableColumnDef[] = [
  { id: 'articleCode', label: 'Cod. articolo', defaultWidthPx: 96, minWidthPx: 64 },
  { id: 'sku', label: 'SKU', defaultWidthPx: 104, minWidthPx: 64 },
  { id: 'barcode', label: 'EAN', defaultWidthPx: 124, minWidthPx: 72 },
  { id: 'supplierCode', label: 'Cod. fornitore', defaultWidthPx: 96, minWidthPx: 72 },
  { id: 'product', label: 'Nome prodotto', defaultWidthPx: 280, minWidthPx: 160 },
  { id: 'quantity', label: 'Q.tà', numeric: true, defaultWidthPx: 56, minWidthPx: 44 },
  { id: 'unitOfMeasure', label: 'U.m.', defaultWidthPx: 44, minWidthPx: 36 },
  { id: 'unitCost', label: 'Costo', numeric: true, defaultWidthPx: 84, minWidthPx: 56 },
  { id: 'discount', label: 'Sconto', numeric: true, defaultWidthPx: 56, minWidthPx: 44 },
  { id: 'vat', label: 'IVA', numeric: true, defaultWidthPx: 56, minWidthPx: 40 },
  {
    id: 'sellingPrice',
    label: 'Prezzo al pubblico',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 96,
    minWidthPx: 72,
  },
  {
    id: 'compareAtPrice',
    label: 'Prezzo barrato',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 96,
    minWidthPx: 72,
  },
  {
    id: 'stockOnHand',
    label: 'Q.tà giacenza',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 64,
    minWidthPx: 52,
  },
  {
    id: 'stockAvailable',
    label: 'Q.tà disponibile',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 64,
    minWidthPx: 52,
  },
  { id: 'lineTotal', label: 'Totale', numeric: true, defaultWidthPx: 88, minWidthPx: 56 },
  { id: 'actions', label: 'Azioni', defaultWidthPx: 52, minWidthPx: 48 },
];

const DEFAULT_VISIBLE = [
  'articleCode',
  'sku',
  'barcode',
  'supplierCode',
  'product',
  'quantity',
  'unitOfMeasure',
  'unitCost',
  'discount',
  'vat',
  'lineTotal',
  'actions',
];

export const SUPPLIER_ORDER_LINE_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: DEFAULT_VISIBLE,
  [PresetId.Warehouse]: [
    'articleCode',
    'sku',
    'barcode',
    'product',
    'quantity',
    'unitOfMeasure',
    'stockOnHand',
    'stockAvailable',
    'actions',
  ],
  [PresetId.Supplier]: [
    'sku',
    'barcode',
    'supplierCode',
    'product',
    'quantity',
    'unitCost',
    'discount',
    'vat',
    'lineTotal',
    'actions',
  ],
  [PresetId.Accountant]: ['sku', 'product', 'quantity', 'unitCost', 'discount', 'vat', 'lineTotal'],
  [PresetId.Analysis]: ['sku', 'product', 'quantity', 'unitCost', 'lineTotal'],
  [PresetId.Operational]: DEFAULT_VISIBLE,
};

/** Alias colonna legacy salvata nelle preferenze utente. */
export function normalizeSupplierOrderColumnId(columnId: string): string {
  if (columnId === 'variant') {
    return 'product';
  }
  return columnId;
}
