import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewId,
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * Le due tabelle dell'IMPORT GIACENZE da CSV: l'anteprima (cosa cambierà) e
 * l'esito (cosa è cambiato).
 *
 * ⛔ **Erano due `<table>` scritte a mano** (`docs/26` A2), gemelle di quelle
 *    dell'import prodotti: niente ordinamento né filtri, e sul telefono il
 *    ripiego generico. Entrate nel motore comune l'11/09/2026, nella stessa
 *    forma di A1.
 *
 * ⭐ **Qui la riga totali C'È**: Attuale, Nuovo e Delta sono quantità, cioè
 *    grandezze additive (`regole-stile-ui` §6 — «una colonna numerica visibile
 *    ha il suo totale»). La somma dei delta dice di quanti pezzi l'import
 *    muove il magazzino: è il numero che chi guarda l'anteprima vuole sapere
 *    prima di premere Importa. Le righe con errore hanno `null` e non entrano.
 *
 * ⚠️ «Location» è diventata **«Sede»**: il catalogo la fissa e non si
 *    sovrascrive, perché è la parola che l'operatore ritrova in ogni elenco.
 */
export const INVENTORY_IMPORT_PREVIEW_VIEW = TableViewId.InventoryImportPreview;
export const INVENTORY_IMPORT_RESULT_VIEW = TableViewId.InventoryImportResult;

export const INVENTORY_IMPORT_PREVIEW_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'variantTitle', label: 'Variante', filter: 'text', defaultVisible: true, cardTitle: true },
  colonna('sku', { display: 'code', defaultVisible: true, defaultWidthPx: 140 }),
  colonna('location', { filter: 'values', defaultVisible: true, defaultWidthPx: 160 }),
  {
    id: 'currentAvailable',
    label: 'Attuale',
    numeric: true,
    filter: 'range',
    defaultVisible: true,
    defaultWidthPx: 90,
  },
  {
    id: 'newAvailable',
    label: 'Nuovo',
    numeric: true,
    filter: 'range',
    defaultVisible: true,
    defaultWidthPx: 90,
  },
  {
    id: 'delta',
    label: 'Delta',
    numeric: true,
    filter: 'range',
    defaultVisible: true,
    defaultWidthPx: 90,
  },
  colonna('status', { filter: 'values', defaultVisible: true, defaultWidthPx: 110 }),
  { id: 'message', label: 'Note', filter: 'text', defaultVisible: true },
] as const;

export const INVENTORY_IMPORT_PREVIEW_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'variantTitle',
    'sku',
    'location',
    'currentAvailable',
    'newAvailable',
    'delta',
    'status',
    'message',
  ],
  // Chi importa guarda prima cosa NON passa e di quanto cambia.
  [TableViewPresetId.Operational]: [
    'variantTitle',
    'sku',
    'location',
    'delta',
    'status',
    'message',
  ],
  [TableViewPresetId.Warehouse]: [
    'variantTitle',
    'sku',
    'location',
    'currentAvailable',
    'newAvailable',
    'delta',
    'status',
  ],
  [TableViewPresetId.Accountant]: ['variantTitle', 'sku', 'location', 'delta', 'status'],
  [TableViewPresetId.Supplier]: ['variantTitle', 'sku', 'location', 'newAvailable', 'status'],
  [TableViewPresetId.Analysis]: [
    'variantTitle',
    'sku',
    'location',
    'currentAvailable',
    'newAvailable',
    'delta',
    'status',
    'message',
  ],
};

export const INVENTORY_IMPORT_RESULT_COLUMN_DEFS: readonly TableColumnDef[] = [
  colonna('sku', { display: 'code', defaultVisible: true, cardTitle: true, defaultWidthPx: 160 }),
  colonna('location', { filter: 'values', defaultVisible: true, defaultWidthPx: 180 }),
  // ⚠️ Diceva «Esito»: il catalogo tiene FISSA l'etichetta di `status` («Stato»).
  colonna('status', { filter: 'values', defaultVisible: true, defaultWidthPx: 120 }),
  { id: 'message', label: 'Dettaglio', filter: 'text', defaultVisible: true },
] as const;

export const INVENTORY_IMPORT_RESULT_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: ['sku', 'location', 'status', 'message'],
  [TableViewPresetId.Operational]: ['sku', 'location', 'status', 'message'],
  [TableViewPresetId.Warehouse]: ['sku', 'location', 'status'],
  [TableViewPresetId.Accountant]: ['sku', 'location', 'status', 'message'],
  [TableViewPresetId.Supplier]: ['sku', 'status'],
  [TableViewPresetId.Analysis]: ['sku', 'location', 'status', 'message'],
};
