import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

export const SUPPLIER_ORDER_LINES_VIEW = TableViewId.SupplierOrderLines;

export const SUPPLIER_ORDER_LINE_COLUMNS: readonly TableColumnDef[] = [
  { id: 'variant', label: 'Articolo / SKU', defaultWidthPx: 220, minWidthPx: 140 },
  { id: 'quantity', label: 'Q.tà', numeric: true, defaultWidthPx: 72, minWidthPx: 56 },
  { id: 'unitCost', label: 'Costo', numeric: true, defaultWidthPx: 88, minWidthPx: 72 },
  { id: 'lineTotal', label: 'Subtotale', numeric: true, defaultWidthPx: 96, minWidthPx: 72 },
  { id: 'actions', label: 'Azioni', defaultWidthPx: 52, minWidthPx: 48 },
];

export const SUPPLIER_ORDER_LINE_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: ['variant', 'quantity', 'unitCost', 'lineTotal', 'actions'],
  [PresetId.Warehouse]: ['variant', 'quantity', 'unitCost', 'lineTotal', 'actions'],
  [PresetId.Supplier]: ['variant', 'quantity', 'unitCost', 'lineTotal', 'actions'],
  [PresetId.Accountant]: ['variant', 'quantity', 'unitCost', 'lineTotal'],
  [PresetId.Analysis]: ['variant', 'quantity', 'lineTotal'],
  [PresetId.Operational]: ['variant', 'quantity', 'unitCost', 'lineTotal', 'actions'],
};
