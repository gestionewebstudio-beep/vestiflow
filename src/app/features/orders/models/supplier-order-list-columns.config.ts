import {
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * ⭐ **Le colonne dell'elenco Ordini fornitore** — dichiarate il 30/08/2026.
 *
 * ⛔ Erano **cablate nel componente** come `ResolvedTableColumn[]`: sei colonne
 * fisse, nessun selettore Colonne, nessuna preferenza salvata. Insieme a Vendite
 * online erano i due soli elenchi senza — e da quando i totali seguono le
 * colonne (`14` §0.2), un elenco senza selettore è un elenco in cui non si
 * scelgono né i dati né i totali.
 *
 * ⚠️ **`summable` è un opt-out**: `total` è numerica e si somma senza dirlo;
 * `lines` pure — «quante righe in tutto» è una domanda vera in magazzino, ed è
 * il comportamento del riferimento Danea.
 */
export const SUPPLIER_ORDER_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'reference', label: 'Riferimento', pinnable: true, defaultVisible: true },
  { id: 'supplier', label: 'Fornitore', defaultVisible: true },
  { id: 'status', label: 'Stato', defaultVisible: true },
  { id: 'lines', label: 'Righe', numeric: true, defaultVisible: true },
  { id: 'expected', label: 'Attesa il', defaultVisible: true },
  { id: 'total', label: 'Totale', numeric: true, defaultVisible: true },
] as const;

export const SUPPLIER_ORDER_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: ['reference', 'supplier', 'status', 'lines', 'expected', 'total'],
  [TableViewPresetId.Warehouse]: ['reference', 'supplier', 'status', 'lines', 'expected'],
  [TableViewPresetId.Accountant]: ['reference', 'supplier', 'status', 'total'],
  [TableViewPresetId.Supplier]: ['reference', 'supplier', 'expected', 'lines'],
  [TableViewPresetId.Analysis]: ['reference', 'supplier', 'status', 'total'],
  [TableViewPresetId.Operational]: ['reference', 'supplier', 'status', 'expected'],
};
