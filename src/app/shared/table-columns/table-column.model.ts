/** Identificativi viste tabellari con preferenze colonne (Step 5). */
export const TableViewId = {
  StockMovements: 'stock_movements',
  InventoryLevels: 'inventory_levels',
  DocumentsList: 'documents_list',
  GoodsReceiptDocumentsList: 'goods_receipt_documents_list',
  SuppliersList: 'suppliers_list',
  GoodsReceiptLines: 'goods_receipt_lines',
  SupplierOrderLines: 'supplier_order_lines',
  CustomerOrderLines: 'customer_order_lines',
  QuoteLines: 'quote_lines',
  SalesDdtLines: 'sales_ddt_lines',
  ProductsList: 'products_list',
  CustomersList: 'customers_list',
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
  /** Larghezza iniziale in px (griglia editabile). */
  readonly defaultWidthPx?: number;
  readonly minWidthPx?: number;
}

export interface TableViewState {
  readonly presetId: TableViewPresetId | 'custom';
  readonly columnOrder: readonly string[];
  readonly hiddenColumnIds: readonly string[];
  readonly pinnedColumnIds: readonly string[];
  readonly columnWidths: Readonly<Record<string, number>>;
}

export type TableViewPresetMap = Record<TableViewPresetId, readonly string[]>;

export interface ResolvedTableColumn extends TableColumnDef {
  readonly pinned: boolean;
}
