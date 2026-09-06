import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewId,
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * Colonne delle RIGHE di una sessione di inventario fisico — la schermata dove
 * si conta.
 *
 * ⚠️ **Non è un elenco: è una maschera di conteggio.** La colonna «Contato» è un
 * campo dove l'operatore batte i pezzi, e questo cambia due cose rispetto agli
 * altri modelli dell'area:
 *
 * ⛔ **«Contato» non si somma** (`summable: false`): il totale dei pezzi contati
 * su righe di articoli diversi non è un numero che significhi qualcosa — sono
 * mele più pere. Vale anche per «Sistema» e «Delta», che sono la stessa
 * grandezza vista da altri due lati.
 *
 * ⚠️ **«Contato» si può spegnere dal selettore Colonne**, e allora non si conta
 * più. Non c'è oggi un modo per dichiarare una colonna non spegnibile, e non se
 * n'è aggiunto uno: spegnerla è un gesto esplicito, la conseguenza si vede
 * subito e si riaccende dallo stesso pannello. Se diventasse un inciampo vero,
 * il posto dove metterlo è `TableColumnDef`, non questo file.
 */
export const INVENTORY_COUNT_LINE_COLUMN_DEFS: readonly TableColumnDef[] = [
  {
    id: 'productName',
    label: 'Prodotto',
    pinnable: true,
    defaultVisible: true,
    cardTitle: true,
  },
  colonna('sku', { defaultVisible: true, defaultWidthPx: 140 }),
  {
    id: 'systemQuantity',
    label: 'Sistema',
    headerTooltip: 'Giacenza a sistema quando la sessione è stata aperta',
    numeric: true,
    summable: false,
    defaultVisible: true,
    defaultWidthPx: 100,
  },
  {
    id: 'countedQuantity',
    label: 'Contato',
    numeric: true,
    summable: false,
    defaultVisible: true,
    defaultWidthPx: 110,
  },
  {
    id: 'delta',
    label: 'Delta',
    headerTooltip: 'Differenza fra contato e sistema',
    numeric: true,
    summable: false,
    defaultVisible: true,
    defaultWidthPx: 100,
  },
];

/**
 * ⚠️ **I preset sono cinque volte quasi la stessa cosa, ed è corretto qui**: le
 * colonne sono cinque e quattro servono sempre. L'unica che si toglie davvero è
 * lo SKU, quando si conta guardando i nomi.
 *
 * ⛔ **«Contato» sta in tutti**: un preset che la spegne consegnerebbe una
 * schermata di conteggio in cui non si conta.
 */
export const INVENTORY_COUNT_LINE_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: ['productName', 'sku', 'systemQuantity', 'countedQuantity', 'delta'],
  [TableViewPresetId.Warehouse]: [
    'productName',
    'sku',
    'systemQuantity',
    'countedQuantity',
    'delta',
  ],
  [TableViewPresetId.Accountant]: ['productName', 'sku', 'systemQuantity', 'countedQuantity'],
  [TableViewPresetId.Supplier]: ['productName', 'sku', 'countedQuantity'],
  [TableViewPresetId.Analysis]: ['productName', 'systemQuantity', 'countedQuantity', 'delta'],
  [TableViewPresetId.Operational]: ['productName', 'countedQuantity', 'delta'],
};

export const INVENTORY_COUNT_LINES_VIEW = TableViewId.InventoryCountLines;
