import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * ⭐ **Le colonne dei due registri della Cassa** — dichiarate il 04/09/2026.
 *
 * ⛔ Erano **scritte a mano nei template**: nnove `<th>` nelle Operazioni e
 * dieci nelle Sessioni, senza selettore Colonne, senza larghezze regolabili e
 * senza vista a card.
 *
 * ⭐ **Le etichette comuni vengono dal catalogo** (`column-catalog`): «Sede»,
 * «Stato», «Origine», «Tipo», «Pagamento», «Totale» sono le stesse parole degli
 * altri undici elenchi. Scriverle di nuovo qui avrebbe significato che
 * rinominarne una lascia indietro la Cassa.
 *
 * ⚠️ **Ogni colonna dichiara il proprio tipo di filtro**, e il tipo dipende
 * dal DATO: `values` dove i valori sono pochi e si spuntano (Tipo, Sede,
 * Stato, Operatore), `text` dove si cerca scrivendone un pezzo (Numero,
 * Origine), `date` sulle date, `range` sugli importi.
 *
 * ⛔ **L'ordinamento invece resta spento**, ed e' la stessa ragione delle
 * Vendite online: l'API dei due registri non ha un parametro `sort`, e
 * riordinare le righe caricate riordinerebbe una pagina.
 *
 * ⚠️ **I filtri restringono le righe CARICATE**, che oggi sono al massimo
 * cento (`pageSize: 100`, senza impaginazione). Sopra quella soglia le righe
 * mancano gia' prima del filtro: e' un difetto dell'elenco, non del filtro,
 * ed e` segnato fra i problemi aperti.
 */
export const CASH_OPERATIONS_COLUMN_DEFS: readonly TableColumnDef[] = [
  colonna('createdAt', { label: 'Data', filter: 'date', defaultVisible: true, cardTitle: true }),
  colonna('type', { filter: 'values', defaultVisible: true }),
  colonna('reference', {
    label: 'Numero',
    display: 'code',
    filter: 'text',
    defaultVisible: true,
  }),
  colonna('location', { filter: 'values', defaultVisible: true }),
  { id: 'operator', label: 'Operatore', filter: 'values', defaultVisible: true },
  colonna('paymentMethod', { filter: 'values', defaultVisible: true }),
  colonna('source', { filter: 'text', defaultVisible: true }),
  colonna('status', { filter: 'values', defaultVisible: true }),
  colonna('total', { filter: 'range', defaultVisible: true }),
] as const;

export const CASH_OPERATIONS_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'createdAt',
    'type',
    'reference',
    'location',
    'operator',
    'paymentMethod',
    'source',
    'status',
    'total',
  ],
  // Chi sta al banco: quando, che cosa, quanto. I riferimenti incrociati no.
  [TableViewPresetId.Operational]: ['createdAt', 'type', 'reference', 'operator', 'total'],
  [TableViewPresetId.Warehouse]: ['createdAt', 'type', 'reference', 'location', 'status'],
  [TableViewPresetId.Accountant]: ['createdAt', 'reference', 'paymentMethod', 'status', 'total'],
  [TableViewPresetId.Supplier]: ['createdAt', 'type', 'reference', 'location'],
  [TableViewPresetId.Analysis]: ['createdAt', 'type', 'location', 'paymentMethod', 'total'],
};

/**
 * ⚠️ **«Vendite» e «Resi» portano due grandezze in una cella** — «3 · 45,00 €»
 * — ed e' come si leggevano prima del passaggio al motore. Spezzarle in quattro
 * colonne sarebbe una decisione di prodotto, non una pulizia.
 */
export const CASH_SESSIONS_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'openedAt', label: 'Apertura', filter: 'date', defaultVisible: true, cardTitle: true },
  colonna('location', { filter: 'values', defaultVisible: true }),
  { id: 'openedBy', label: 'Aperta da', filter: 'values', defaultVisible: true },
  colonna('status', { filter: 'values', defaultVisible: true }),
  { id: 'float', label: 'Fondo', numeric: true, filter: 'range', defaultVisible: true },
  { id: 'sales', label: 'Vendite', numeric: true, filter: 'text', defaultVisible: true },
  { id: 'returns', label: 'Resi', numeric: true, filter: 'text', defaultVisible: true },
  { id: 'deposits', label: 'Versamenti', numeric: true, filter: 'range', defaultVisible: true },
  { id: 'withdrawals', label: 'Prelievi', numeric: true, filter: 'range', defaultVisible: true },
  { id: 'closedAt', label: 'Chiusura', filter: 'date', defaultVisible: true },
] as const;

export const CASH_SESSIONS_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'openedAt',
    'location',
    'openedBy',
    'status',
    'float',
    'sales',
    'returns',
    'deposits',
    'withdrawals',
    'closedAt',
  ],
  [TableViewPresetId.Operational]: ['openedAt', 'location', 'openedBy', 'status', 'closedAt'],
  [TableViewPresetId.Warehouse]: ['openedAt', 'location', 'status', 'sales', 'returns'],
  [TableViewPresetId.Accountant]: ['openedAt', 'location', 'float', 'sales', 'returns', 'closedAt'],
  [TableViewPresetId.Supplier]: ['openedAt', 'location', 'status'],
  [TableViewPresetId.Analysis]: [
    'openedAt',
    'location',
    'sales',
    'returns',
    'deposits',
    'withdrawals',
  ],
};
