import { colonna } from '@shared/table-columns/column-catalog';
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
/**
 * ⭐ **Le colonne che il SERVER sa ordinare** (`14` §H15), specchio della
 * whitelist di `api/src/sales-orders/sales-orders-sort.util.ts`.
 *
 * ⛔ È una lista di ciò che SI PUÒ: una colonna nuova nasce non ordinabile e lo
 * resta finché non la impara anche il server, invece di promettere un ordine
 * che risponde `400`.
 *
 * ⭐ **Origine, Pagamento ed Evasione ci sono**: sono enum, e Postgres li ordina
 * per ordine di DICHIARAZIONE — che qui è una progressione (da saldare →
 * autorizzato → pagato; non evaso → parziale → evaso), non un alfabeto.
 *
 * ⚠️ **«Stato» resta fuori per una ragione tecnica, non funzionale**: non è un
 * campo del database, lo compone il client da più dati dell'ordine. Ordinarlo
 * lato server significherebbe riscrivere quella logica nell'API — due fonti di
 * verità per la stessa risposta.
 */
export const SALES_ORDER_LIST_SORTABLE_COLUMNS: ReadonlySet<string> = new Set([
  'orderNumber',
  'placedAt',
  'customerName',
  'total',
  'source',
  'financialStatus',
  'fulfillmentStatus',
]);

export const SALES_ORDER_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'orderNumber', label: 'Ordine', pinnable: true, defaultVisible: true, cardTitle: true },
  colonna('source', { defaultVisible: true }),
  { id: 'placedAt', label: 'Data', defaultVisible: true, filter: 'range' },
  { id: 'customerCode', label: 'Cod. cliente', defaultVisible: false },
  colonna('customerName', { defaultVisible: true }),
  colonna('total', { defaultVisible: true }),
  { id: 'netTotal', label: 'Tot. netto', numeric: true, defaultVisible: false },
  { id: 'state', label: 'Stato', defaultVisible: true },
  { id: 'financialStatus', label: 'Pagamento', defaultVisible: true },
  { id: 'fulfillmentStatus', label: 'Evasione', defaultVisible: true },
  colonna('location', { defaultVisible: true }),
  colonna('notes', { defaultVisible: false }),
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
  colonna('ddt', { defaultVisible: true }),
  { id: 'updatedAt', label: 'Aggiornato', defaultVisible: true, filter: 'range' },
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
