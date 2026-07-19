import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

export const PRODUCT_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'select', label: 'Selezione', defaultVisible: true },
  // Identificatore anagrafico interno (§Codice articolo): colonna disponibile
  // nella selezione colonne, non mostrata di default.
  { id: 'articleCode', label: 'Codice articolo', defaultVisible: false },
  { id: 'name', label: 'Nome', pinnable: true, defaultVisible: true },
  { id: 'brand', label: 'Venditore/Brand', defaultVisible: true },
  { id: 'category', label: 'Categoria', defaultVisible: true },
  { id: 'season', label: 'Stagione', defaultVisible: true },
  { id: 'variants', label: 'Varianti', numeric: true, defaultVisible: true },
  { id: 'status', label: 'Stato', defaultVisible: true },
  { id: 'source', label: 'Origine', defaultVisible: true },
  { id: 'shopify', label: 'Shopify', defaultVisible: true },
  { id: 'actions', label: 'Azioni', defaultVisible: true },
];

export const PRODUCT_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: [
    'select',
    'name',
    'brand',
    'category',
    'season',
    'variants',
    'status',
    'source',
    'shopify',
    'actions',
  ],
  [PresetId.Warehouse]: ['select', 'name', 'category', 'variants', 'status', 'actions'],
  [PresetId.Accountant]: ['name', 'brand', 'category', 'status'],
  [PresetId.Supplier]: ['name', 'brand', 'category', 'variants', 'status'],
  [PresetId.Analysis]: ['name', 'brand', 'category', 'season', 'variants', 'status'],
  [PresetId.Operational]: ['select', 'name', 'brand', 'variants', 'status', 'actions'],
};

export const PRODUCT_LIST_VIEW = TableViewId.ProductsList;
