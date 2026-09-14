import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewId,
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * L'elenco dei CODICI IVA, raggruppato per Natura (`docs/26` A6 · D3).
 *
 * ⛔ **Era una `<table>` a mano per gruppo**, con tre `<select>` nativi in barra
 *    (Natura, Ambito, Stato) e una griglia di riga propria. Entrato nel motore
 *    l'11/09/2026: sezioni comprimibili per Natura — la capacità aggiunta al
 *    motore apposta, spenta altrove — e i tre filtri diventano filtri di
 *    colonna con lo stesso significato. La Ricerca resta in barra.
 *
 * ⭐ **«Natura» è anche una COLONNA**, pur essendo il titolo della sezione: il
 *    filtro vive nella colonna (`regole-stile-ui`, «i filtri di un elenco stanno
 *    nelle sue colonne»), e senza colonna non ci sarebbe dove metterlo. Chi la
 *    trova ridondante la spegne da Colonne — e con lei il filtro, com'è giusto.
 *
 * ⚠️ Aliquota e % indetraibile sono numeri ma NON si sommano: percentuali di
 *    codici diversi non fanno un numero (`summable: false`). Nessuna riga totali.
 */
export const VAT_CODES_VIEW = TableViewId.VatCodes;

export const VAT_CODES_COLUMN_DEFS: readonly TableColumnDef[] = [
  {
    id: 'vatCode',
    label: 'Codice IVA',
    display: 'code',
    filter: 'text',
    defaultVisible: true,
    cardTitle: true,
    defaultWidthPx: 150,
  },
  {
    id: 'ratePercent',
    label: 'Aliquota',
    numeric: true,
    summable: false,
    filter: 'range',
    defaultVisible: true,
    defaultWidthPx: 90,
  },
  {
    id: 'nonDeductiblePercent',
    label: '% indetraibile',
    numeric: true,
    summable: false,
    filter: 'range',
    defaultVisible: true,
    defaultWidthPx: 110,
  },
  { id: 'description', label: 'Descrizione', filter: 'text', defaultVisible: true },
  { id: 'vatNotes', label: 'Note', filter: 'text', defaultVisible: true },
  { id: 'natura', label: 'Natura', filter: 'values', defaultVisible: true, defaultWidthPx: 170 },
  {
    id: 'usageScope',
    label: 'Ambito',
    filter: 'values',
    defaultVisible: true,
    defaultWidthPx: 140,
  },
  colonna('status', { filter: 'values', defaultVisible: true, defaultWidthPx: 110 }),
] as const;

const TUTTE = [
  'vatCode',
  'ratePercent',
  'nonDeductiblePercent',
  'description',
  'vatNotes',
  'natura',
  'usageScope',
  'status',
] as const;

export const VAT_CODES_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [...TUTTE],
  [TableViewPresetId.Operational]: [
    'vatCode',
    'ratePercent',
    'description',
    'usageScope',
    'status',
  ],
  [TableViewPresetId.Warehouse]: ['vatCode', 'ratePercent', 'description', 'status'],
  [TableViewPresetId.Accountant]: [...TUTTE],
  [TableViewPresetId.Supplier]: ['vatCode', 'ratePercent', 'description', 'usageScope'],
  [TableViewPresetId.Analysis]: [...TUTTE],
};
