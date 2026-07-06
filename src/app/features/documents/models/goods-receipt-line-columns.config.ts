import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

export const GOODS_RECEIPT_LINES_VIEW = TableViewId.GoodsReceiptLines;

export const GOODS_RECEIPT_LINE_COLUMNS: readonly TableColumnDef[] = [
  { id: 'sku', label: 'SKU', defaultWidthPx: 88, minWidthPx: 64 },
  { id: 'barcode', label: 'EAN', defaultWidthPx: 104, minWidthPx: 80 },
  { id: 'product', label: 'Nome prodotto', defaultWidthPx: 220, minWidthPx: 140 },
  {
    id: 'description',
    label: 'Descrizione',
    defaultVisible: false,
    defaultWidthPx: 180,
    minWidthPx: 120,
  },
  {
    id: 'poOrdered',
    label: 'Ord.',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 48,
    minWidthPx: 40,
  },
  {
    id: 'poReceived',
    label: 'Ric.',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 48,
    minWidthPx: 40,
  },
  {
    id: 'poRemaining',
    label: 'Res.',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 48,
    minWidthPx: 40,
  },
  { id: 'quantity', label: 'Q.tà', numeric: true, defaultWidthPx: 56, minWidthPx: 48 },
  { id: 'unitCost', label: 'Costo', numeric: true, defaultWidthPx: 72, minWidthPx: 56 },
  {
    id: 'sellingPrice',
    label: 'Prezzo di vendita',
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
  { id: 'vat', label: 'IVA', numeric: true, defaultWidthPx: 52, minWidthPx: 44 },
  { id: 'lot', label: 'Lotto', defaultVisible: false, defaultWidthPx: 88, minWidthPx: 64 },
  { id: 'expiry', label: 'Scadenza', defaultVisible: false, defaultWidthPx: 104, minWidthPx: 88 },
  { id: 'serials', label: 'Seriali', defaultVisible: false, defaultWidthPx: 112, minWidthPx: 88 },
  { id: 'loadsStock', label: 'Mag.', defaultWidthPx: 44, minWidthPx: 40 },
  { id: 'lineTotal', label: 'Totale', numeric: true, defaultWidthPx: 80, minWidthPx: 64 },
  { id: 'actions', label: 'Azioni', defaultWidthPx: 44, minWidthPx: 40 },
];

export const GOODS_RECEIPT_LINE_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: [
    'sku',
    'barcode',
    'product',
    'quantity',
    'unitCost',
    'vat',
    'loadsStock',
    'lineTotal',
    'actions',
  ],
  [PresetId.Warehouse]: [
    'sku',
    'barcode',
    'product',
    'poOrdered',
    'poReceived',
    'poRemaining',
    'quantity',
    'unitCost',
    'lot',
    'expiry',
    'serials',
    'loadsStock',
    'lineTotal',
    'actions',
  ],
  [PresetId.Supplier]: [
    'sku',
    'barcode',
    'product',
    'quantity',
    'unitCost',
    'vat',
    'lineTotal',
    'actions',
  ],
  [PresetId.Accountant]: ['sku', 'product', 'quantity', 'unitCost', 'vat', 'lineTotal'],
  [PresetId.Analysis]: ['sku', 'product', 'quantity', 'unitCost', 'lineTotal'],
  [PresetId.Operational]: [
    'sku',
    'barcode',
    'product',
    'quantity',
    'unitCost',
    'sellingPrice',
    'compareAtPrice',
    'loadsStock',
    'lineTotal',
    'actions',
  ],
};

/** Alias colonna legacy salvata nelle preferenze utente. */
export function normalizeGoodsReceiptColumnId(columnId: string): string {
  if (columnId === 'variant') {
    return 'product';
  }
  return columnId;
}
