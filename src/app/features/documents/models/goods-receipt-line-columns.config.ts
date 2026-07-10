import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

export const GOODS_RECEIPT_LINES_VIEW = TableViewId.GoodsReceiptLines;

export const GOODS_RECEIPT_LINE_COLUMNS: readonly TableColumnDef[] = [
  { id: 'sku', label: 'SKU', defaultWidthPx: 72, minWidthPx: 56 },
  { id: 'barcode', label: 'EAN', defaultWidthPx: 88, minWidthPx: 72 },
  {
    id: 'supplierCode',
    label: 'Cod. fornitore',
    defaultVisible: false,
    defaultWidthPx: 96,
    minWidthPx: 72,
  },
  { id: 'product', label: 'Nome prodotto', defaultWidthPx: 320, minWidthPx: 160 },
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
  { id: 'quantity', label: 'Q.tà', numeric: true, defaultWidthPx: 52, minWidthPx: 44 },
  {
    id: 'stockAvailable',
    label: 'Q.tà disp.',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 64,
    minWidthPx: 52,
  },
  {
    id: 'unitOfMeasure',
    label: 'U.m.',
    defaultVisible: false,
    defaultWidthPx: 44,
    minWidthPx: 36,
  },
  { id: 'unitCost', label: 'Costo', numeric: true, defaultWidthPx: 64, minWidthPx: 52 },
  {
    id: 'discount',
    label: 'Sconto',
    numeric: true,
    defaultWidthPx: 56,
    minWidthPx: 44,
  },
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
  { id: 'vat', label: 'IVA', numeric: true, defaultWidthPx: 44, minWidthPx: 40 },
  { id: 'lot', label: 'Lotto', defaultVisible: false, defaultWidthPx: 88, minWidthPx: 64 },
  { id: 'expiry', label: 'Scadenza', defaultVisible: false, defaultWidthPx: 104, minWidthPx: 88 },
  { id: 'serials', label: 'Seriali', defaultVisible: false, defaultWidthPx: 112, minWidthPx: 88 },
  { id: 'loadsStock', label: 'Mag.', defaultWidthPx: 36, minWidthPx: 32 },
  { id: 'lineTotal', label: 'Totale', numeric: true, defaultWidthPx: 72, minWidthPx: 56 },
  { id: 'actions', label: 'Azioni', defaultWidthPx: 88, minWidthPx: 72 },
];

export const GOODS_RECEIPT_LINE_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: [
    'sku',
    'barcode',
    'product',
    'quantity',
    'stockAvailable',
    'unitOfMeasure',
    'unitCost',
    'discount',
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
    'supplierCode',
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
    'stockAvailable',
    'unitOfMeasure',
    'unitCost',
    'discount',
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
