import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewId,
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * I PROBLEMI aperti della sincronizzazione Shopify, sul motore comune
 * (`docs/26`, come le «non allineate» A3; `docs/27` §4-bis, 13/09/2026).
 *
 * ⛔ Erano un `<ul>` di 84 righe senza ricerca, filtri, ordinamento né azioni,
 *    e 75 di quelle righe erano lo stesso guasto. Qui: filtro a valori su Tipo,
 *    Causa e Sede, testo su Elemento, ordinamento, card sotto `lg`, e per ogni
 *    riga l'azione che chiude il caso (o «nessuna», con il perché).
 *
 * ⚠️ Nessuna riga totali (niente numeri): è un elenco di casi.
 */
export const SHOPIFY_PROBLEMI_VIEW = TableViewId.ShopifyProblemi;

export const SHOPIFY_PROBLEMI_COLUMN_DEFS: readonly TableColumnDef[] = [
  // ⭐ Più larghezza ad articolo e variante, meno alla causa che si ripete su 75
  //    righe e si legge già nel gruppo sopra (proprietario, 13/09/2026).
  // ⭐ Di serie CINQUE colonne — articolo, variante, sede, causa, azione — perché a
  //    1280 la tabella era compressa (proprietario, 13/09/2026, 15:40): «Tipo» si legge
  //    già nel gruppo e si riaccende da «Colonne», come Conseguenza e Rilevato.
  { id: 'tipo', label: 'Tipo', filter: 'values', defaultVisible: false, defaultWidthPx: 110 },
  {
    id: 'elemento',
    label: 'Articolo / ordine',
    filter: 'text',
    defaultVisible: true,
    cardTitle: true,
  },
  {
    id: 'dettaglio',
    label: 'Variante',
    filter: 'text',
    defaultVisible: true,
    defaultWidthPx: 180,
  },
  colonna('location', { filter: 'values', defaultVisible: true, defaultWidthPx: 150 }),
  { id: 'causa', label: 'Causa', filter: 'values', defaultVisible: true, defaultWidthPx: 200 },
  { id: 'conseguenza', label: 'Conseguenza', filter: 'text', defaultVisible: false },
  { id: 'azione', label: 'Azione', filter: 'text', defaultVisible: true, defaultWidthPx: 300 },
  {
    id: 'rilevato',
    label: 'Rilevato',
    filter: 'text',
    defaultVisible: false,
    defaultWidthPx: 130,
  },
] as const;

export const SHOPIFY_PROBLEMI_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: ['elemento', 'dettaglio', 'location', 'causa', 'azione'],
  [TableViewPresetId.Operational]: ['tipo', 'elemento', 'location', 'causa', 'azione'],
  [TableViewPresetId.Warehouse]: ['tipo', 'elemento', 'location', 'causa', 'azione'],
  [TableViewPresetId.Accountant]: ['tipo', 'elemento', 'causa', 'conseguenza', 'azione'],
  [TableViewPresetId.Supplier]: ['tipo', 'elemento', 'causa', 'azione'],
  [TableViewPresetId.Analysis]: [
    'tipo',
    'elemento',
    'dettaglio',
    'location',
    'causa',
    'conseguenza',
    'azione',
    'rilevato',
  ],
};
