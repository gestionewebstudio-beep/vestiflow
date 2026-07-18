import {
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

export const INVENTORY_LEVEL_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'title', label: 'Articolo', pinnable: true, defaultVisible: true },
  // «Codice» mostra il Cod. articolo VestiFlow (fallback SKU variante se assente).
  { id: 'sku', label: 'Codice', defaultVisible: true },
  { id: 'locationName', label: 'Location', defaultVisible: true },
  { id: 'available', label: 'Disponibile', numeric: true, defaultVisible: true },
  { id: 'onHand', label: 'Giacenza', numeric: true, defaultVisible: true },
  { id: 'committed', label: 'Impegnata', numeric: true, defaultVisible: true },
  { id: 'incoming', label: 'In arrivo', numeric: true, defaultVisible: false },
  { id: 'minThreshold', label: 'Soglia min.', numeric: true, defaultVisible: false },
  { id: 'status', label: 'Stato', defaultVisible: true },
] as const;

/** Vista situazione magazzino (§7.4): tutte le quantità visibili. */
export const INVENTORY_LEVEL_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'title',
    'sku',
    'locationName',
    'available',
    'onHand',
    'committed',
    'status',
  ],
  [TableViewPresetId.Warehouse]: [
    'title',
    'sku',
    'locationName',
    'available',
    'onHand',
    'committed',
    'incoming',
    'minThreshold',
  ],
  [TableViewPresetId.Accountant]: ['sku', 'title', 'locationName', 'onHand', 'available'],
  [TableViewPresetId.Supplier]: ['title', 'sku', 'incoming', 'available', 'locationName'],
  [TableViewPresetId.Analysis]: [
    'title',
    'sku',
    'locationName',
    'available',
    'onHand',
    'committed',
    'incoming',
    'status',
  ],
  [TableViewPresetId.Operational]: ['title', 'sku', 'locationName', 'available', 'status'],
};
