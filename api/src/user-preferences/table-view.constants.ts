/**
 * Viste tabella ammesse. Devono restare allineate al frontend
 * (`src/app/shared/table-columns/table-column.model.ts`): un id che manca qui
 * fa rispondere 400 sia alla lettura sia al salvataggio, e le preferenze
 * colonne di quella tabella non vengono mai memorizzate — in silenzio, perche'
 * il frontend ingoia l'errore. Lo verifica `npm run check:table-views`.
 */
export const TABLE_VIEW_IDS = [
  'stock_movements',
  'inventory_levels',
  'inventory_situation',
  'documents_list',
  'goods_receipt_documents_list',
  'quote_documents_list',
  'proforma_documents_list',
  'sales_ddt_documents_list',
  'manual_unload_documents_list',
  'invoice_draft_documents_list',
  'purchase_invoice_documents_list',
  'store_sale_documents_list',
  'suppliers_list',
  'goods_receipt_lines',
  'supplier_order_lines',
  'customer_order_lines',
  'quote_lines',
  'sales_ddt_lines',
  'manual_unload_lines',
  'transfer_lines',
  'stock_adjustment_lines',
  'sales_document_lines',
  'store_sale_lines',
  'products_list',
  'customers_list',
  'sales_orders_list',
  'shopify_orders_list',
  // Aggiunte il 30/08/2026: erano i due soli elenchi senza selettore Colonne.
  'supplier_orders_list',
  'online_sales_list',
  'corrispettivi_register',
  // Aggiunta il 31/08/2026: l'elenco Inventario dichiarava la vista lato
  // frontend e l'API non la conosceva — 400 su lettura e salvataggio, e le
  // colonne scelte non venivano mai memorizzate. L'ha trovata
  // `npm run check:table-views`, che esiste per questo.
  'inventory_counts',
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
