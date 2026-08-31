import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

/*
  ⭐ **UNA SOLA colonna resta senza larghezza, ed è il NOME.**

  Con `table-layout: fixed` le colonne non dichiarate **si dividono in parti
  uguali** lo spazio che avanza. Non è un peso proporzionale: è una divisione
  secca.

  ⛔ **Prima erano tutte tranne «Varianti»**, e il risultato si vedeva subito: il
  nome del prodotto — il dato per cui si guarda l'elenco — era largo quanto
  «Stato» e «Origine», e veniva tagliato a metà mentre quelle avevano spazio da
  buttare. Segnalato dal proprietario il 30/08/2026: «la colonna del nome ha
  problemi di impaginazione».

  ⭐ **Dichiarare le ALTRE è il modo di dare peso al nome.** Ogni larghezza scritta
  qui è spazio che smette di essere conteso, e il residuo va tutto a chi non la
  dichiara. Per questo il nome non ne ha e non deve averne: prende quello che
  avanza, e cresce con la finestra.

  ⚠️ **I numeri non sono definitivi**: sono misurati sul contenuto tipico, e
  l'operatore li cambia trascinando la maniglia. `14` §G1 dice che la modifica
  **non si conserva** — è un aggiustamento del momento, non una preferenza.
*/
export const PRODUCT_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'select', label: 'Selezione', defaultVisible: true, filter: false },
  // Identificatore anagrafico interno (§Codice articolo): colonna disponibile
  // nella selezione colonne, non mostrata di default.
  colonna('articleCode', { defaultVisible: false, defaultWidthPx: 128 }),
  /*
    ⚠️ **Nessuna di queste dichiara `display: 'truncate'`, ed è voluto.** Dal
    30/08/2026 il taglio a colonna è della grammatica degli elenchi
    (`summary-grammar`): vale per OGNI cella di OGNI elenco, non per le colonne
    che se lo ricordano. Dichiararlo qui rimetterebbe un `max-inline-size` a
    concorrere con la larghezza della colonna, cioè due misure per la stessa cosa.
  */
  { id: 'name', label: 'Nome', pinnable: true, defaultVisible: true },
  { id: 'brand', label: 'Venditore/Brand', defaultVisible: true, defaultWidthPx: 150 },
  colonna('category', { defaultVisible: true, defaultWidthPx: 160 }),
  { id: 'season', label: 'Stagione', defaultVisible: true, defaultWidthPx: 96 },
  { id: 'variants', label: 'Varianti', numeric: true, defaultVisible: true },
  colonna('status', { defaultVisible: true, defaultWidthPx: 96 }),
  colonna('source', { defaultVisible: true, defaultWidthPx: 104 }),
  { id: 'shopify', label: 'Shopify', defaultVisible: true, defaultWidthPx: 120 },
];

export const PRODUCT_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: [
    'select',
    'name',
    'brand',
    'category',
    'season',
    'variants',
    'status',
    'source',
    'shopify',
  ],
  [PresetId.Warehouse]: ['select', 'name', 'category', 'variants', 'status'],
  [PresetId.Accountant]: ['name', 'brand', 'category', 'status'],
  [PresetId.Supplier]: ['name', 'brand', 'category', 'variants', 'status'],
  [PresetId.Analysis]: ['name', 'brand', 'category', 'season', 'variants', 'status'],
  [PresetId.Operational]: ['select', 'name', 'brand', 'variants', 'status'],
};

export const PRODUCT_LIST_VIEW = TableViewId.ProductsList;
