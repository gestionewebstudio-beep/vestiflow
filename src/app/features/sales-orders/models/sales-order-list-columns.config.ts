import {
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * Colonne dell'elenco Ordini cliente. «Impegnata» non c'è più: mostrava un
 * numero su cui non si poteva agire. Cod. cliente, Commento e Tot. netto sono
 * disponibili nel selettore ma nascoste di serie, per non allargare la tabella
 * a chi non le usa.
 */
export const SALES_ORDER_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'orderNumber', label: 'Ordine', pinnable: true, defaultVisible: true },
  { id: 'source', label: 'Origine', defaultVisible: true },
  { id: 'placedAt', label: 'Data', defaultVisible: true },
  { id: 'customerCode', label: 'Cod. cliente', defaultVisible: false },
  { id: 'customerName', label: 'Cliente', defaultVisible: true },
  { id: 'total', label: 'Totale', numeric: true, defaultVisible: true },
  { id: 'netTotal', label: 'Tot. netto', numeric: true, defaultVisible: false },
  { id: 'state', label: 'Stato', defaultVisible: true },
  { id: 'financialStatus', label: 'Pagamento', defaultVisible: true },
  { id: 'fulfillmentStatus', label: 'Evasione', defaultVisible: true },
  { id: 'location', label: 'Location', defaultVisible: true },
  { id: 'notes', label: 'Commento', defaultVisible: false },
  // Nascosta di serie (mockup restyling): l'info è marginale, attivabile dal
  // selettore Colonne quando serve.
  { id: 'onlineSale', label: 'Vendita online', defaultVisible: false },
] as const;

const DEFAULT_IDS = SALES_ORDER_LIST_COLUMN_DEFS.filter(
  (column) => column.defaultVisible !== false,
).map((column) => column.id);

export const SALES_ORDER_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: DEFAULT_IDS,
  [TableViewPresetId.Warehouse]: [
    'orderNumber',
    'placedAt',
    'customerName',
    'fulfillmentStatus',
    'location',
  ],
  [TableViewPresetId.Accountant]: [
    'orderNumber',
    'placedAt',
    'customerCode',
    'customerName',
    'netTotal',
    'total',
    'financialStatus',
  ],
  [TableViewPresetId.Supplier]: DEFAULT_IDS,
  [TableViewPresetId.Analysis]: ['placedAt', 'customerName', 'netTotal', 'total', 'state'],
  [TableViewPresetId.Operational]: [
    'orderNumber',
    'placedAt',
    'customerName',
    'state',
    'fulfillmentStatus',
    'location',
  ],
};

/**
 * Ordini Shopify: stesso elenco con in più le colonne del canale. Vive qui per
 * restare allineato al set principale quando questo cambia.
 */
// La colonna «Corrispettivo» è caduta il 14/08/2026 insieme a
// `corrispettivo_entries`: mostrava il numero COR-… e uno stato che nel
// registro derivato non esistono più — lì il corrispettivo è un periodo, non
// un documento con un identificativo. Vedi specifica 08 §10.
export const SHOPIFY_ORDER_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  ...SALES_ORDER_LIST_COLUMN_DEFS.filter((column) => column.id !== 'source'),
  { id: 'ddt', label: 'DDT', defaultVisible: true },
  { id: 'updatedAt', label: 'Aggiornato', defaultVisible: true },
  { id: 'syncState', label: 'Sync', defaultVisible: true },
] as const;

const SHOPIFY_DEFAULT_IDS = SHOPIFY_ORDER_LIST_COLUMN_DEFS.filter(
  (column) => column.defaultVisible !== false,
).map((column) => column.id);

export const SHOPIFY_ORDER_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: SHOPIFY_DEFAULT_IDS,
  [TableViewPresetId.Warehouse]: ['orderNumber', 'placedAt', 'customerName', 'fulfillmentStatus'],
  [TableViewPresetId.Accountant]: [
    'orderNumber',
    'placedAt',
    'customerName',
    'total',
    'financialStatus',
  ],
  [TableViewPresetId.Supplier]: SHOPIFY_DEFAULT_IDS,
  [TableViewPresetId.Analysis]: ['placedAt', 'customerName', 'netTotal', 'total', 'state'],
  [TableViewPresetId.Operational]: SHOPIFY_DEFAULT_IDS,
};
