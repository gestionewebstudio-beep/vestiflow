import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

export const GOODS_RECEIPT_LINES_VIEW = TableViewId.GoodsReceiptLines;

// Larghezze per CONTENUTO (v4): un campo e' largo quanto il dato che ospita
// — l'IVA porta due cifre, non le serve piu' di 72px; SKU/EAN devono invece
// respirare. Con `table-layout: fixed` attivo questi default sono rispettati.
export const GOODS_RECEIPT_LINE_COLUMNS: readonly TableColumnDef[] = [
  { id: 'sku', label: 'SKU', defaultWidthPx: 104, minWidthPx: 64 },
  { id: 'barcode', label: 'EAN', defaultWidthPx: 124, minWidthPx: 72 },
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
  { id: 'quantity', label: 'Q.tà', numeric: true, defaultWidthPx: 56, minWidthPx: 44 },
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
  { id: 'unitCost', label: 'Costo', numeric: true, defaultWidthPx: 84, minWidthPx: 56 },
  {
    id: 'discount',
    label: 'Sconto',
    numeric: true,
    defaultWidthPx: 56,
    minWidthPx: 44,
  },
  {
    id: 'sellingPrice',
    label: 'Prezzo al pubblico',
    numeric: true,
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
  // IVA a contenuto (da chiusa mostra solo il codice, es. «22»): stretta di
  // default e restringibile fino a 40px; il pannello si allarga da solo.
  { id: 'vat', label: 'IVA', numeric: true, defaultWidthPx: 56, minWidthPx: 40 },
  { id: 'lot', label: 'Lotto', defaultVisible: false, defaultWidthPx: 88, minWidthPx: 64 },
  { id: 'expiry', label: 'Scadenza', defaultVisible: false, defaultWidthPx: 104, minWidthPx: 88 },
  { id: 'serials', label: 'Seriali', defaultVisible: false, defaultWidthPx: 112, minWidthPx: 88 },
  { id: 'loadsStock', label: 'Mag.', defaultWidthPx: 48, minWidthPx: 40 },
  { id: 'lineTotal', label: 'Totale', numeric: true, defaultWidthPx: 88, minWidthPx: 56 },
  // Solo duplica + elimina: le frecce di riordino vivono nella colonna indice.
  { id: 'actions', label: 'Azioni', defaultWidthPx: 72, minWidthPx: 56 },
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
