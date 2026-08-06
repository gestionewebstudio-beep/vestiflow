import {
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

export const STOCK_MOVEMENT_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'createdAt', label: 'Data', pinnable: true, defaultVisible: true },
  { id: 'type', label: 'Tipo', defaultVisible: true },
  // Identificatore anagrafico interno (§Codice articolo): colonna
  // selezionabile, non mostrata di default (fuori dai preset).
  { id: 'articleCode', label: 'Codice articolo', defaultVisible: false },
  { id: 'sku', label: 'Codice', defaultVisible: true },
  { id: 'product', label: 'Prodotto', defaultVisible: true },
  { id: 'signedQuantity', label: 'Quantità', numeric: true, defaultVisible: true },
  { id: 'locationLabel', label: 'Location', defaultVisible: true },
  { id: 'documentRef', label: 'Documento', defaultVisible: false },
  { id: 'reason', label: 'Causale', defaultVisible: true },
  { id: 'origin', label: 'Origine', defaultVisible: false },
  { id: 'createdByName', label: 'Operatore', defaultVisible: true },
] as const;

export const STOCK_MOVEMENT_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'createdAt',
    'type',
    'sku',
    'product',
    'signedQuantity',
    'locationLabel',
    'reason',
    'createdByName',
  ],
  [TableViewPresetId.Warehouse]: [
    'createdAt',
    'sku',
    'product',
    'signedQuantity',
    'locationLabel',
    'documentRef',
    'reason',
  ],
  [TableViewPresetId.Accountant]: [
    'createdAt',
    'type',
    'sku',
    'signedQuantity',
    'reason',
    'documentRef',
  ],
  [TableViewPresetId.Supplier]: ['createdAt', 'sku', 'product', 'signedQuantity', 'locationLabel'],
  [TableViewPresetId.Analysis]: ['createdAt', 'type', 'sku', 'product', 'signedQuantity', 'origin'],
  [TableViewPresetId.Operational]: [
    'createdAt',
    'type',
    'sku',
    'signedQuantity',
    'locationLabel',
    'createdByName',
  ],
};
