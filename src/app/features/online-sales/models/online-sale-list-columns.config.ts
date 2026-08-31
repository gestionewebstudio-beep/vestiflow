import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * ⭐ **Le colonne dell'elenco Vendite online** — dichiarate il 30/08/2026.
 *
 * ⛔ Erano **scritte a mano nel template**: dieci `<th>` in HTML, nessun
 * selettore Colonne, nessun ordinamento, nessuna selezione. Con Ordini
 * fornitore erano i due soli elenchi senza selettore — e le tre cose che
 * mancavano vengono tutte dal motore comune.
 *
 * ⚠️ **«Sede», non «Location»** — deciso il 30/08/2026: `location` resta il nome
 * del modello, «Sede» è la parola che l'operatore legge, ed è quella che usa
 * anche il pannello Shopify in italiano.
 */
export const ONLINE_SALE_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  colonna('reference', {
    label: 'Numero',
    numeric: true,
    pinnable: true,
    defaultVisible: true,
    cardTitle: true,
  }),
  { id: 'channel', label: 'Canale', defaultVisible: true },
  { id: 'orderNumber', label: 'Ordine origine', numeric: true, defaultVisible: true },
  { id: 'fulfilledAt', label: 'Data evasione', defaultVisible: true },
  { id: 'customer', label: 'Cliente', defaultVisible: true },
  colonna('location', { defaultVisible: true }),
  colonna('total', { defaultVisible: true }),
  { id: 'inventoryStatus', label: 'Stato magazzino', defaultVisible: true },
  colonna('ddt', { defaultVisible: true }),
  { id: 'refund', label: 'Rimborso', defaultVisible: true },
  /*
    ⭐ **La data dell'ORDINE, oltre a quella di evasione** (31/08/2026): il
    modello le porta entrambe e l'elenco ne mostrava una sola. Sono domande
    diverse — quando è stato comprato, quando è partito — e su un canale online
    la distanza fra le due è il dato che si guarda.
  */
  { id: 'orderPlacedAt', label: 'Data ordine', defaultVisible: false },
  { id: 'refundedAt', label: 'Rimborsato il', defaultVisible: false },
] as const;

export const ONLINE_SALE_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'reference',
    'channel',
    'orderNumber',
    'fulfilledAt',
    'customer',
    'location',
    'total',
    'inventoryStatus',
    'ddt',
    'refund',
  ],
  [TableViewPresetId.Warehouse]: ['reference', 'fulfilledAt', 'location', 'inventoryStatus', 'ddt'],
  [TableViewPresetId.Accountant]: ['reference', 'fulfilledAt', 'customer', 'total', 'refund'],
  [TableViewPresetId.Supplier]: ['reference', 'fulfilledAt', 'location', 'inventoryStatus'],
  [TableViewPresetId.Analysis]: ['reference', 'channel', 'fulfilledAt', 'total', 'refund'],
  [TableViewPresetId.Operational]: [
    'reference',
    'fulfilledAt',
    'customer',
    'inventoryStatus',
    'ddt',
  ],
};
