import { colonna } from '@shared/table-columns/column-catalog';
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
  colonna('reference', { pinnable: true, defaultVisible: true, cardTitle: true }),
  /*
    ⛔ **L'elenco non aveva la data dell'ordine**, e se n'è accorto il
    proprietario il 31/08/2026 guardando la card sul telefono: in cima c'era un
    trattino, cioè «Attesa il» vuota.

    L'unica colonna di data era `expected` — la **consegna prevista**, che è
    facoltativa e nella pratica quasi sempre vuota. Un registro di ordini senza
    la data dell'ordine non si può ordinare per data, non si può raggruppare per
    giornata, e la sua card non ha nulla da mettere in cima.

    ⚠️ **E rendeva incoerente il raggruppamento appena introdotto**: piegavo
    l'elenco per `orderDate` mentre nessuna colonna la mostrava — cioè
    intestazioni di giornata che non corrispondevano a niente di visibile, che è
    esattamente ciò che `14` §64.2 vieta.
  */
  colonna('documentDate', { defaultVisible: true }),
  colonna('supplier', { defaultVisible: true }),
  colonna('status', { defaultVisible: true }),
  { id: 'lines', label: 'Righe', numeric: true, defaultVisible: true },
  { id: 'expected', label: 'Attesa il', defaultVisible: true },
  colonna('total', { defaultVisible: true }),
  /*
    ⭐ **Tre colonne che il modello portava e nessuna mostrava** (31/08/2026):
    l'elenco aveva il solo totale, e su un ordine d'acquisto imponibile e IVA
    sono le voci che si confrontano con la fattura quando arriva.

    ⚠️ Il **riferimento del fornitore** è il suo numero d'ordine, non il nostro:
    è come lui chiama la stessa cosa, e serve a ritrovarla al telefono con lui.
  */
  { id: 'subtotal', label: 'Imponibile', numeric: true, defaultVisible: false },
  { id: 'tax', label: 'IVA', numeric: true, defaultVisible: false },
  { id: 'supplierReference', label: 'Rif. fornitore', defaultVisible: false },
] as const;

export const SUPPLIER_ORDER_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'reference',
    'documentDate',
    'supplier',
    'status',
    'lines',
    'expected',
    'total',
  ],
  [TableViewPresetId.Warehouse]: [
    'reference',
    'documentDate',
    'supplier',
    'status',
    'lines',
    'expected',
  ],
  [TableViewPresetId.Accountant]: ['reference', 'documentDate', 'supplier', 'status', 'total'],
  [TableViewPresetId.Supplier]: ['reference', 'documentDate', 'supplier', 'expected', 'lines'],
  [TableViewPresetId.Analysis]: ['reference', 'documentDate', 'supplier', 'status', 'total'],
  [TableViewPresetId.Operational]: ['reference', 'documentDate', 'supplier', 'status', 'expected'],
};
