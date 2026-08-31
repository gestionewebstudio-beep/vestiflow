import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewId,
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * Colonne dell'elenco sessioni di inventario fisico.
 *
 * ⭐ **Prima non esisteva**: la tabella aveva sette `<th>` scritti a mano, quindi
 * niente selettore Colonne, niente larghezze, niente filtri di colonna. È l'ultimo
 * elenco a prendere il modello comune (30/08/2026).
 *
 * ⚠️ **Nessuna colonna dichiarata `cardTitle` oltre al nome**: sotto `lg` la card
 * si legge dal nome della sessione, che è quello che l'operatore ha scritto lui.
 */
export const INVENTORY_COUNT_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'name', label: 'Sessione', pinnable: true, defaultVisible: true, cardTitle: true },
  colonna('location', { defaultVisible: true, defaultWidthPx: 160 }),
  colonna('status', { defaultVisible: true, defaultWidthPx: 110 }),
  /*
    ⚠️ **«Progresso» NON è `numeric`**: è «3 / 39», due numeri e una barra —
    allinearlo a destra come una quantità lo farebbe leggere come un totale.
  */
  { id: 'progress', label: 'Progresso', defaultVisible: true, defaultWidthPx: 110 },
  /*
    ⭐ **Tre colonne che il modello portava e nessuna mostrava** (31/08/2026):
    quando l'inventario è stato chiuso, chi l'ha fatto, e le sue note. Su un
    conteggio periodico sono le tre domande che si pongono a posteriori.
  */
  { id: 'completedAt', label: 'Completato il', filter: 'date', defaultVisible: false },
  { id: 'createdByName', label: 'Operatore', defaultVisible: false },
  colonna('notes', { defaultVisible: false }),
  { id: 'deltas', label: 'Differenze', numeric: true, defaultVisible: true, defaultWidthPx: 110 },
  colonna('createdAt', { defaultVisible: true, defaultWidthPx: 150 }),
];

export const INVENTORY_COUNT_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: ['name', 'location', 'status', 'progress', 'deltas', 'createdAt'],
  [TableViewPresetId.Warehouse]: ['name', 'location', 'status', 'progress', 'deltas'],
  [TableViewPresetId.Accountant]: ['name', 'location', 'status', 'deltas', 'createdAt'],
  [TableViewPresetId.Supplier]: ['name', 'location', 'status'],
  [TableViewPresetId.Analysis]: ['name', 'status', 'progress', 'deltas'],
  [TableViewPresetId.Operational]: ['name', 'location', 'status', 'progress'],
};

export const INVENTORY_COUNT_VIEW = TableViewId.InventoryCounts;
