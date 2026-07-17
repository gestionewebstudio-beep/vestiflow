import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

export const CUSTOMER_ORDER_LINES_VIEW = TableViewId.CustomerOrderLines;

// Stesse larghezze "per contenuto" della tabella righe Arrivo merce (v4):
// SKU/EAN respirano, quantità e IVA restano strette, il nome prodotto domina.
export const CUSTOMER_ORDER_LINE_COLUMNS: readonly TableColumnDef[] = [
  // Identificatore anagrafico interno (§Codice articolo): colonna
  // selezionabile, non mostrata di default.
  {
    id: 'articleCode',
    label: 'Codice articolo',
    defaultVisible: false,
    defaultWidthPx: 96,
    minWidthPx: 64,
  },
  { id: 'sku', label: 'SKU', defaultWidthPx: 104, minWidthPx: 64 },
  { id: 'barcode', label: 'EAN', defaultWidthPx: 124, minWidthPx: 72 },
  { id: 'product', label: 'Nome prodotto', defaultWidthPx: 300, minWidthPx: 160 },
  { id: 'quantity', label: 'Q.tà', numeric: true, defaultWidthPx: 56, minWidthPx: 44 },
  {
    id: 'stockAvailable',
    label: 'Q.tà disponibile',
    numeric: true,
    defaultWidthPx: 76,
    minWidthPx: 52,
  },
  { id: 'unitOfMeasure', label: 'U.m.', defaultWidthPx: 44, minWidthPx: 36 },
  // Costo d'acquisto (§8): colonna sensibile, nascosta di default e visibile
  // SOLO agli operatori con permesso "Visualizza costi d'acquisto" — senza
  // permesso la definizione non viene proprio registrata nel selettore.
  {
    id: 'purchaseCost',
    label: 'Costo',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 84,
    minWidthPx: 56,
  },
  // Glossario VestiFlow (§7): "Prezzo" come nella scheda prodotto.
  { id: 'unitPrice', label: 'Prezzo', numeric: true, defaultWidthPx: 92, minWidthPx: 56 },
  { id: 'discount', label: 'Sconto', numeric: true, defaultWidthPx: 64, minWidthPx: 44 },
  {
    id: 'discountedPrice',
    label: 'Prezzo scontato',
    numeric: true,
    defaultWidthPx: 92,
    minWidthPx: 56,
  },
  { id: 'vat', label: 'IVA', numeric: true, defaultWidthPx: 56, minWidthPx: 40 },
  { id: 'commitsStock', label: 'Imp.', defaultWidthPx: 48, minWidthPx: 40 },
  { id: 'lineTotal', label: 'Totale', numeric: true, defaultWidthPx: 88, minWidthPx: 56 },
  { id: 'actions', label: 'Azioni', defaultWidthPx: 72, minWidthPx: 56 },
];

// I preset partono dalle colonne visibili di default: quelle opzionali
// (defaultVisible: false, es. Codice articolo) restano selezionabili a mano.
const ALL_COLUMN_IDS = CUSTOMER_ORDER_LINE_COLUMNS.filter(
  (column) => column.defaultVisible !== false,
).map((column) => column.id);

export const CUSTOMER_ORDER_LINE_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: ALL_COLUMN_IDS,
  [PresetId.Warehouse]: [
    'sku',
    'barcode',
    'product',
    'quantity',
    'stockAvailable',
    'unitOfMeasure',
    'commitsStock',
    'actions',
  ],
  [PresetId.Accountant]: [
    'sku',
    'product',
    'quantity',
    'unitPrice',
    'discount',
    'vat',
    'lineTotal',
  ],
  [PresetId.Supplier]: ALL_COLUMN_IDS,
  [PresetId.Analysis]: ['sku', 'product', 'quantity', 'unitPrice', 'discountedPrice', 'lineTotal'],
  [PresetId.Operational]: ALL_COLUMN_IDS,
};

// ── Preventivo (stessa maschera dell'Ordine cliente, §Preventivi) ───────────
// Il preventivo non impegna e non blocca disponibilità di magazzino: niente
// colonne «Q.tà disponibile» e «Impegna» — il resto della tabella è identico.
export const QUOTE_LINES_VIEW = TableViewId.QuoteLines;

const QUOTE_EXCLUDED_COLUMN_IDS: readonly string[] = ['stockAvailable', 'commitsStock'];

export const QUOTE_LINE_COLUMNS: readonly TableColumnDef[] = CUSTOMER_ORDER_LINE_COLUMNS.filter(
  (column) => !QUOTE_EXCLUDED_COLUMN_IDS.includes(column.id),
);

const QUOTE_ALL_COLUMN_IDS = QUOTE_LINE_COLUMNS.filter(
  (column) => column.defaultVisible !== false,
).map((column) => column.id);

export const QUOTE_LINE_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: QUOTE_ALL_COLUMN_IDS,
  [PresetId.Warehouse]: ['sku', 'barcode', 'product', 'quantity', 'unitOfMeasure', 'actions'],
  [PresetId.Accountant]: [
    'sku',
    'product',
    'quantity',
    'unitPrice',
    'discount',
    'vat',
    'lineTotal',
  ],
  [PresetId.Supplier]: QUOTE_ALL_COLUMN_IDS,
  [PresetId.Analysis]: ['sku', 'product', 'quantity', 'unitPrice', 'discountedPrice', 'lineTotal'],
  [PresetId.Operational]: QUOTE_ALL_COLUMN_IDS,
};
