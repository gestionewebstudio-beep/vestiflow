import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

export const GOODS_RECEIPT_LINES_VIEW = TableViewId.GoodsReceiptLines;

export const GOODS_RECEIPT_LINE_COLUMNS: readonly TableColumnDef[] = [
  { id: 'product', label: 'Nome prodotto', defaultWidthPx: 320, minWidthPx: 200 },
  {
    id: 'description',
    label: 'Descrizione',
    defaultVisible: false,
    defaultWidthPx: 220,
    minWidthPx: 140,
  },
  {
    id: 'poOrdered',
    label: 'Ord.',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 56,
    minWidthPx: 48,
  },
  {
    id: 'poReceived',
    label: 'Ric.',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 56,
    minWidthPx: 48,
  },
  {
    id: 'poRemaining',
    label: 'Res.',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 56,
    minWidthPx: 48,
  },
  { id: 'quantity', label: 'Q.tà', numeric: true, defaultWidthPx: 72, minWidthPx: 56 },
  { id: 'unitCost', label: 'Costo', numeric: true, defaultWidthPx: 88, minWidthPx: 72 },
  {
    id: 'sellingPrice',
    label: 'Prezzo di vendita',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 112,
    minWidthPx: 88,
  },
  {
    id: 'compareAtPrice',
    label: 'Prezzo barrato',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 112,
    minWidthPx: 88,
  },
  { id: 'vat', label: 'IVA', numeric: true, defaultWidthPx: 64, minWidthPx: 56 },
  { id: 'lot', label: 'Lotto', defaultVisible: false, defaultWidthPx: 96, minWidthPx: 72 },
  { id: 'expiry', label: 'Scadenza', defaultVisible: false, defaultWidthPx: 112, minWidthPx: 96 },
  { id: 'serials', label: 'Seriali', defaultVisible: false, defaultWidthPx: 120, minWidthPx: 96 },
  { id: 'loadsStock', label: 'Mag.', defaultWidthPx: 52, minWidthPx: 48 },
  { id: 'lineTotal', label: 'Totale', numeric: true, defaultWidthPx: 96, minWidthPx: 72 },
  { id: 'actions', label: 'Azioni', defaultWidthPx: 52, minWidthPx: 48 },
];

export const GOODS_RECEIPT_LINE_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: [
    'product',
    'quantity',
    'unitCost',
    'vat',
    'loadsStock',
    'lineTotal',
    'actions',
  ],
  [PresetId.Warehouse]: [
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
  [PresetId.Supplier]: ['product', 'quantity', 'unitCost', 'vat', 'lineTotal', 'actions'],
  [PresetId.Accountant]: ['product', 'quantity', 'unitCost', 'vat', 'lineTotal'],
  [PresetId.Analysis]: ['product', 'quantity', 'unitCost', 'lineTotal'],
  [PresetId.Operational]: [
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
  return columnId === 'variant' ? 'product' : columnId;
}
