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
  'refundTotal',
  'updatedTotal',
  'source',
  'financialStatus',
  'fulfillmentStatus',
]);

/*
  ⭐ **I pesi sono MISURATI a 1440 il 13/09/2026** (proprietario: «intestazioni e importi
  leggibili anche a 1440, senza rimpicciolire il testo»). Le larghezze sono proporzioni: col
  ripiego per tipo (testo 200, numerica 92) le colonne CORTE — un numero d'ordine, una data,
  «Evaso» — pesavano quanto un nome cliente, e «2.249,85 €» si tagliava in una cella da 59px.
  Le corte cedono peso (numero 120, data 110, stati 150; Pagamento 180 per «Rimborso
  parziale»), le numeriche lo prendono (Totale 130, Rettifiche 140, Tot. aggiornato 200): a 1440
  con le dieci colonne di serie di Shopify intestazioni e importi entrano interi (guardia:
  e2e `ordini-shopify-rettifiche`); a 1280 si taglia «Rimborso parziale». L'operatore regola
  trascinando, e la sua regolazione resta.
*/
export const SALES_ORDER_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  {
    id: 'orderNumber',
    label: 'Ordine',
    pinnable: true,
    defaultVisible: true,
    cardTitle: true,
    defaultWidthPx: 120,
  },
  colonna('source', { defaultVisible: true }),
  { id: 'placedAt', label: 'Data', defaultVisible: true, filter: 'date', defaultWidthPx: 110 },
  { id: 'customerCode', label: 'Cod. cliente', defaultVisible: false },
  colonna('customerName', { defaultVisible: true }),
  colonna('total', { defaultVisible: true, defaultWidthPx: 130 }),
  // ⭐ Le RETTIFICHE del canale e il TOTALE AGGIORNATO (valore originario − rettifiche):
  //    il totale resta quello originario, mai riscritto (proprietario, 13/09/2026, #1014).
  //    Spente di serie sugli ordini manuali, che rettifiche non ne hanno; accese su Shopify.
  //    «Tot. aggiornato» come «Tot. netto». ⚠️ I pesi sono MISURATI (13/09/2026): con le
  //    tredici colonne di serie dell'elenco Shopify una colonna numerica (92) rende 65px a
  //    1920 e 46 a 1440, e «RETTIFICHE» (70px di testo più il chevron) si leggeva «RETTIFI».
  //    Con tredici colonne a 1440 si tagliavano anche a peso maggiore, come «Totale»: per
  //    questo DDT, Aggiornato e Sync sono spente di serie (sotto) e i pesi sono quelli del
  //    commento in testa. Nei file di export il nome è per esteso.
  {
    id: 'refundTotal',
    label: 'Rettifiche',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 140,
  },
  {
    id: 'updatedTotal',
    label: 'Tot. aggiornato',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 200,
  },
  { id: 'netTotal', label: 'Tot. netto', numeric: true, defaultVisible: false },
  { id: 'state', label: 'Stato', defaultVisible: true, defaultWidthPx: 150 },
  { id: 'financialStatus', label: 'Pagamento', defaultVisible: true, defaultWidthPx: 180 },
  { id: 'fulfillmentStatus', label: 'Evasione', defaultVisible: true, defaultWidthPx: 150 },
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
  [TableViewPresetId.Analysis]: [
    'placedAt',
    'orderNumber',
    'customerName',
    'netTotal',
    'total',
    'state',
  ],
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
  ...SALES_ORDER_LIST_COLUMN_DEFS.filter((column) => column.id !== 'source').map((column) =>
    column.id === 'refundTotal' || column.id === 'updatedTotal'
      ? { ...column, defaultVisible: true }
      : column,
  ),
  // ⭐ Spente di serie (proprietario, 13/09/2026): con tredici colonne a 1440 le intestazioni
  //    numeriche si tagliavano. Si riaccendono da «Colonne». ⚠️ Le preferenze GIÀ SALVATE non
  //    cambiano: `reconcileStateWithDefs` conserva le colonne nascoste scelte dall'operatore
  //    e applica i default solo alle colonne che lo stato salvato non conosce.
  colonna('ddt', { defaultVisible: false }),
  { id: 'updatedAt', label: 'Aggiornato', defaultVisible: false, filter: 'date' },
  { id: 'syncState', label: 'Sync', defaultVisible: false },
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
  [TableViewPresetId.Analysis]: [
    'placedAt',
    'orderNumber',
    'customerName',
    'netTotal',
    'total',
    'state',
  ],
  [TableViewPresetId.Operational]: SHOPIFY_DEFAULT_IDS,
};
