import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

export const CUSTOMER_ORDER_LINES_VIEW = TableViewId.CustomerOrderLines;

// Stesse larghezze "per contenuto" della tabella righe Arrivo merce (v4):
// SKU/EAN respirano, quantità e IVA restano strette, il nome prodotto domina.
export const CUSTOMER_ORDER_LINE_COLUMNS: readonly TableColumnDef[] = [
  { id: 'sku', label: 'SKU', defaultWidthPx: 104, minWidthPx: 64 },
  { id: 'barcode', label: 'EAN', defaultWidthPx: 124, minWidthPx: 72 },
  { id: 'product', label: 'Nome prodotto', defaultWidthPx: 300, minWidthPx: 160 },
  { id: 'quantity', label: 'Q.tà', numeric: true, defaultWidthPx: 56, minWidthPx: 44 },
  {
    id: 'stockAvailable',
    label: 'Q.tà disponibile',
    numeric: true,
    defaultWidthPx: 76,
    minWidthPx: 52,
  },
  { id: 'unitOfMeasure', label: 'U.m.', defaultWidthPx: 44, minWidthPx: 36 },
  { id: 'unitPrice', label: 'Prezzo unitario', numeric: true, defaultWidthPx: 92, minWidthPx: 56 },
  { id: 'discount', label: 'Sconto', numeric: true, defaultWidthPx: 64, minWidthPx: 44 },
  {
    id: 'discountedPrice',
    label: 'Prezzo scontato',
    numeric: true,
    defaultWidthPx: 92,
    minWidthPx: 56,
  },
  { id: 'vat', label: 'IVA', numeric: true, defaultWidthPx: 56, minWidthPx: 40 },
  { id: 'commitsStock', label: 'Imp.', defaultWidthPx: 48, minWidthPx: 40 },
  { id: 'lineTotal', label: 'Totale riga', numeric: true, defaultWidthPx: 88, minWidthPx: 56 },
  { id: 'actions', label: 'Azioni', defaultWidthPx: 72, minWidthPx: 56 },
];

const ALL_COLUMN_IDS = CUSTOMER_ORDER_LINE_COLUMNS.map((column) => column.id);

export const CUSTOMER_ORDER_LINE_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: ALL_COLUMN_IDS,
  [PresetId.Warehouse]: [
    'sku',
    'barcode',
    'product',
    'quantity',
    'stockAvailable',
    'unitOfMeasure',
    'commitsStock',
    'actions',
  ],
  [PresetId.Accountant]: [
    'sku',
    'product',
    'quantity',
    'unitPrice',
    'discount',
    'vat',
    'lineTotal',
  ],
  [PresetId.Supplier]: ALL_COLUMN_IDS,
  [PresetId.Analysis]: ['sku', 'product', 'quantity', 'unitPrice', 'discountedPrice', 'lineTotal'],
  [PresetId.Operational]: ALL_COLUMN_IDS,
};
