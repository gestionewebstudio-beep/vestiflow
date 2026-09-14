import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewId,
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * Le due tabelle dell'IMPORT PRODOTTI da CSV: l'anteprima (cosa entrerà) e
 * l'esito (cosa è entrato).
 *
 * ⛔ **Erano due `<table>` scritte a mano** (`docs/26` A1): niente ordinamento,
 *    niente filtri di colonna, niente maniglie, e sul telefono il ripiego
 *    generico etichetta:valore che allineava a destra un messaggio con un
 *    indirizzo dentro. Entrate nel motore comune l'11/09/2026 — la stessa
 *    strada dei due registri della Cassa.
 *
 * ⚠️ **Nessuna riga totali**: «Varianti» è l'unica colonna numerica e la somma
 *    delle varianti di articoli diversi non è un numero che dica qualcosa
 *    (`summable: false`). Niente azioni: è un rapporto, non un elenco su cui
 *    si lavora.
 */
export const PRODUCT_IMPORT_PREVIEW_VIEW = TableViewId.ProductImportPreview;
export const PRODUCT_IMPORT_RESULT_VIEW = TableViewId.ProductImportResult;

export const PRODUCT_IMPORT_PREVIEW_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'name', label: 'Prodotto', filter: 'text', defaultVisible: true, cardTitle: true },
  {
    id: 'handle',
    label: 'Handle',
    display: 'code',
    filter: 'text',
    defaultVisible: true,
    defaultWidthPx: 180,
  },
  {
    id: 'variantCount',
    label: 'Varianti',
    numeric: true,
    summable: false,
    filter: 'range',
    defaultVisible: true,
    defaultWidthPx: 90,
  },
  colonna('status', { filter: 'values', defaultVisible: true, defaultWidthPx: 130 }),
  { id: 'issues', label: 'Note', filter: 'text', defaultVisible: true },
] as const;

export const PRODUCT_IMPORT_PREVIEW_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: ['name', 'handle', 'variantCount', 'status', 'issues'],
  // Chi importa guarda prima cosa NON passa: stato e note, il resto dopo.
  [TableViewPresetId.Operational]: ['name', 'status', 'issues'],
  [TableViewPresetId.Warehouse]: ['name', 'handle', 'variantCount', 'status'],
  [TableViewPresetId.Accountant]: ['name', 'handle', 'status', 'issues'],
  [TableViewPresetId.Supplier]: ['name', 'handle', 'status'],
  [TableViewPresetId.Analysis]: ['name', 'handle', 'variantCount', 'status', 'issues'],
};

export const PRODUCT_IMPORT_RESULT_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'name', label: 'Prodotto', filter: 'text', defaultVisible: true, cardTitle: true },
  colonna('articleCode', { filter: 'text', defaultVisible: true, defaultWidthPx: 160 }),
  // ⚠️ Diceva «Esito»: il catalogo tiene FISSA l'etichetta di `status` («Stato»),
  //    perche' lo stesso concetto porti la stessa parola in ogni elenco.
  colonna('status', { filter: 'values', defaultVisible: true, defaultWidthPx: 120 }),
  // ⭐ È qui che compare «Immagini non scaricate (n su m)»: il motore la taglia
  //    a colonna con il testo intero nel `title`, e sulla card sta fra le parole.
  { id: 'message', label: 'Dettaglio', filter: 'text', defaultVisible: true },
] as const;

export const PRODUCT_IMPORT_RESULT_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: ['name', 'articleCode', 'status', 'message'],
  [TableViewPresetId.Operational]: ['name', 'status', 'message'],
  [TableViewPresetId.Warehouse]: ['name', 'articleCode', 'status'],
  [TableViewPresetId.Accountant]: ['name', 'articleCode', 'status', 'message'],
  [TableViewPresetId.Supplier]: ['name', 'status'],
  [TableViewPresetId.Analysis]: ['name', 'articleCode', 'status', 'message'],
};
