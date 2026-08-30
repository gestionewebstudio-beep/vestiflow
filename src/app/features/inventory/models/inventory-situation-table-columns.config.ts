import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * Colonne tab Situazione: etichette già in uso in VestiFlow (Giacenze,
 * Prodotti, form varianti). «Codice» mostra il Cod. articolo con fallback SKU,
 * come in Giacenze; Carichi/Scarichi sono i totali movimentati della variante.
 */
export const INVENTORY_SITUATION_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'select', label: 'Selezione', defaultVisible: true, filter: false },
  { id: 'title', label: 'Articolo', pinnable: true, defaultVisible: true },
  colonna('code', { defaultVisible: true }),
  colonna('sku', { defaultVisible: false }),
  colonna('category', { defaultVisible: true }),
  colonna('supplier', { defaultVisible: true }),
  colonna('available', { defaultVisible: true }),
  colonna('onHand', { defaultVisible: true }),
  colonna('committed', { defaultVisible: false }),
  colonna('incoming', { defaultVisible: false }),
  colonna('minThreshold', { defaultVisible: false }),
  { id: 'purchasePrice', label: 'Prezzo acquisto', numeric: true, defaultVisible: true },
  { id: 'sellingPrice', label: 'Prezzo di vendita', numeric: true, defaultVisible: true },
  { id: 'totalIn', label: 'Carichi totali', numeric: true, defaultVisible: false },
  { id: 'totalOut', label: 'Scarichi totali', numeric: true, defaultVisible: false },
  colonna('status', { defaultVisible: true }),
] as const;

export const INVENTORY_SITUATION_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'select',
    'title',
    'code',
    'category',
    'supplier',
    'available',
    'onHand',
    'purchasePrice',
    'sellingPrice',
    'status',
  ],
  [TableViewPresetId.Warehouse]: [
    'select',
    'title',
    'code',
    'available',
    'onHand',
    'committed',
    'incoming',
    'minThreshold',
    'status',
  ],
  [TableViewPresetId.Accountant]: [
    'title',
    'code',
    'category',
    'onHand',
    'purchasePrice',
    'sellingPrice',
  ],
  [TableViewPresetId.Supplier]: [
    'select',
    'title',
    'code',
    'supplier',
    'available',
    'incoming',
    'minThreshold',
    'purchasePrice',
    'status',
  ],
  [TableViewPresetId.Analysis]: [
    'title',
    'code',
    'category',
    'supplier',
    'available',
    'onHand',
    'committed',
    'incoming',
    'totalIn',
    'totalOut',
    'status',
  ],
  [TableViewPresetId.Operational]: ['select', 'title', 'code', 'available', 'status'],
};
