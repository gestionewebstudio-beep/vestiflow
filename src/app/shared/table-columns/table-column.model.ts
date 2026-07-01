/** Identificativi viste tabellari con preferenze colonne (Step 5). */
export const TableViewId = {
  StockMovements: 'stock_movements',
  InventoryLevels: 'inventory_levels',
  DocumentsList: 'documents_list',
  SuppliersList: 'suppliers_list',
} as const;
export type TableViewId = (typeof TableViewId)[keyof typeof TableViewId];

/** Viste salvate predefinite (§7.1 piano funzionale). */
export const TableViewPresetId = {
  Default: 'default',
  Warehouse: 'warehouse',
  Accountant: 'accountant',
  Supplier: 'supplier',
  Analysis: 'analysis',
  Operational: 'operational',
} as const;
export type TableViewPresetId = (typeof TableViewPresetId)[keyof typeof TableViewPresetId];

export const TABLE_VIEW_PRESET_LABELS: Record<TableViewPresetId, string> = {
  [TableViewPresetId.Default]: 'Default',
  [TableViewPresetId.Warehouse]: 'Magazzino',
  [TableViewPresetId.Accountant]: 'Commercialista',
  [TableViewPresetId.Supplier]: 'Fornitore',
  [TableViewPresetId.Analysis]: 'Analisi',
  [TableViewPresetId.Operational]: 'Operativa',
};

export interface TableColumnDef {
  readonly id: string;
  readonly label: string;
  readonly numeric?: boolean;
  /** Colonna visibile di default se nessuna preferenza salvata. */
  readonly defaultVisible?: boolean;
  readonly pinnable?: boolean;
}

export interface TableViewState {
  readonly presetId: TableViewPresetId | 'custom';
  readonly columnOrder: readonly string[];
  readonly hiddenColumnIds: readonly string[];
  readonly pinnedColumnIds: readonly string[];
}

export type TableViewPresetMap = Record<TableViewPresetId, readonly string[]>;

export interface ResolvedTableColumn extends TableColumnDef {
  readonly pinned: boolean;
}
