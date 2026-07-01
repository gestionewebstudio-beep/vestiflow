/** Viste tabella ammesse (allineate al frontend TableViewId). */
export const TABLE_VIEW_IDS = [
  'stock_movements',
  'inventory_levels',
  'documents_list',
  'suppliers_list',
] as const;

export type TableViewId = (typeof TABLE_VIEW_IDS)[number];

export const TABLE_VIEW_PRESET_IDS = [
  'default',
  'warehouse',
  'accountant',
  'supplier',
  'analysis',
  'operational',
  'custom',
] as const;

export type TableViewPresetId = (typeof TABLE_VIEW_PRESET_IDS)[number];

export const MAX_TABLE_VIEW_STATE_JSON_BYTES = 65_536;
export const MAX_TABLE_VIEW_COLUMN_IDS = 100;
export const MAX_TABLE_VIEW_COLUMN_ID_LENGTH = 64;
