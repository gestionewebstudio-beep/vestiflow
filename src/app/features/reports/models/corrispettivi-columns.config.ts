import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * Le colonne del **Registro Corrispettivi**.
 *
 * ⚠️ **Due sono presenti ma spente di serie**, ed è una decisione del 17/08/2026
 * — non una rimozione:
 *
 * - **Cliente**: il Registro non è un archivio clienti, e molte righe un cliente
 *   legittimamente non ce l'hanno — una chiusura di cassa non sa a chi ha
 *   venduto. Una colonna quasi sempre «—» occupa spazio per non dire niente.
 * - **Pagamento**: oggi crea soprattutto incoerenza — «Pagato» su una riga,
 *   «Rimborsato» su un'altra, «—» su una terza perché quella sorgente un ciclo
 *   di pagamento non ce l'ha. Si riprende col blocco Pagamenti/Tesoreria, dove
 *   si deciderà se debba essere predefinita.
 *
 * **I dati restano**: `customerName` e `financialStatus` continuano ad arrivare
 * dall'API e a uscire nell'export. Qui si governa la PRESENTAZIONE — ed è il
 * motivo per cui le due colonne stanno nel selettore invece di sparire: chi le
 * vuole le riaccende, senza che nessuno tocchi il codice.
 */
export const CORRISPETTIVI_REGISTER_COLUMN_DEFS: readonly TableColumnDef[] = [
  // `display: 'code'` è come il motore dice «non va a capo, e le cifre sono
  // tabulari»: una data spezzata su due righe non è una data. Il Registro lo
  // otteneva con una classe sua (`__cell--date`), persa nella migrazione.
  { id: 'occurredAt', label: 'Data', defaultVisible: true, filter: 'range', display: 'code' },
  { id: 'kind', label: 'Tipo', defaultVisible: true },
  { id: 'orderNumber', label: 'Numero', pinnable: true, defaultVisible: true },
  colonna('source', { defaultVisible: true }),
  colonna('location', { defaultVisible: true }),
  { id: 'taxable', label: 'Imponibile', numeric: true, defaultVisible: true },
  { id: 'tax', label: 'IVA', numeric: true, defaultVisible: true },
  colonna('total', { defaultVisible: true }),
  // ── Disponibili nel selettore, spente di serie: vedi la nota in testa ────
  //
  // Sono ESATTAMENTE le due tolte dalla vista, e nessun'altra: il selettore non
  // è il posto dove far entrare colonne che nessuno ha chiesto.
  colonna('customerName', { defaultVisible: false }),
  { id: 'financialStatus', label: 'Pagamento', defaultVisible: false },
] as const;

const DEFAULT_IDS = CORRISPETTIVI_REGISTER_COLUMN_DEFS.filter(
  (column) => column.defaultVisible !== false,
).map((column) => column.id);

/**
 * ⚠️ **Il preset «Commercialista» è l'unico con una ragione propria**: è il
 * sottoinsieme che si riconcilia col file esportato — data, tipo, numero,
 * origine e i tre importi. Gli altri restano il predefinito perché inventare
 * cinque tagli diversi di un registro fiscale sarebbe arredamento.
 */
export const CORRISPETTIVI_REGISTER_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: DEFAULT_IDS,
  [TableViewPresetId.Warehouse]: ['occurredAt', 'kind', 'orderNumber', 'location', 'total'],
  [TableViewPresetId.Accountant]: [
    'occurredAt',
    'kind',
    'orderNumber',
    'source',
    'taxable',
    'tax',
    'total',
  ],
  [TableViewPresetId.Supplier]: DEFAULT_IDS,
  [TableViewPresetId.Analysis]: ['occurredAt', 'source', 'location', 'taxable', 'tax', 'total'],
  [TableViewPresetId.Operational]: DEFAULT_IDS,
};
