import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

export const SUPPLIER_ORDER_LINES_VIEW = TableViewId.SupplierOrderLines;

// Colonne righe Ordine fornitore.
//
// La riga è quella dell'Ordine cliente — ricerca articolo, inserimento, e
// creazione di un articolo nuovo al volo — meno ciò che su un ordine al
// fornitore non ha significato:
//
// - NIENTE «Impegna magazzino»: l'ordine fornitore non incide su giacenze né
//   disponibilità, quindi la colonna non avrebbe un valore da mostrare;
// - NIENTE «Prezzo al pubblico» né «Prezzo barrato»: qui la colonna che conta è
//   il COSTO, e affiancargli un altro numero monetario che significa l'opposto è
//   un invito a sbagliare — tanto più che il costo ha il selettore netto/ivato e
//   il prezzo no. Se servono si inseriscono nel pannello anagrafica quando si
//   crea l'articolo, che è il loro posto naturale.
//
// Cod. articolo, SKU, EAN e Cod. fornitore non sono colonne informative: sono le
// quattro CHIAVI DI RICERCA dell'articolo, e quando l'articolo non esiste ancora
// sono il dato che finirà in anagrafica (vedi il prefill del pannello prodotto).
export const SUPPLIER_ORDER_LINE_COLUMNS: readonly TableColumnDef[] = [
  { id: 'articleCode', label: 'Cod. articolo', defaultWidthPx: 96, minWidthPx: 64 },
  { id: 'sku', label: 'SKU', defaultWidthPx: 104, minWidthPx: 64 },
  { id: 'barcode', label: 'EAN', defaultWidthPx: 124, minWidthPx: 72 },
  { id: 'supplierCode', label: 'Cod. fornitore', defaultWidthPx: 104, minWidthPx: 72 },
  { id: 'product', label: 'Nome prodotto', defaultWidthPx: 280, minWidthPx: 160 },
  { id: 'quantity', label: 'Q.tà', numeric: true, defaultWidthPx: 64, minWidthPx: 48 },
  { id: 'unitOfMeasure', label: 'U.m.', defaultWidthPx: 52, minWidthPx: 40 },
  // Giacenza: utile ma non sempre, e allarga la tabella — resta a richiesta.
  {
    id: 'stockOnHand',
    label: 'Q.tà giacenza',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 64,
    minWidthPx: 52,
  },
  // Disponibilità: visibile di default come nell'Ordine cliente. È il numero che
  // fa decidere QUANTO ordinare, cioè la ragione per cui si è aperta la maschera.
  { id: 'stockAvailable', label: 'Q.tà disp.', numeric: true, defaultWidthPx: 62, minWidthPx: 48 },
  // Il costo si legge netto o ivato secondo il selettore in intestazione; il
  // valore memorizzato è sempre il netto (vedi `supplier-order-form`).
  { id: 'unitCost', label: 'Costo', numeric: true, defaultWidthPx: 92, minWidthPx: 56 },
  // Sconto a cascata: «4+10%» vale 13,6%. Sugli acquisti gli sconti a cascata
  // dei fornitori sono la norma, non l'eccezione.
  { id: 'discount', label: 'Sconto', numeric: true, defaultWidthPx: 64, minWidthPx: 44 },
  {
    id: 'discountedCost',
    label: 'Costo scontato',
    numeric: true,
    defaultWidthPx: 92,
    minWidthPx: 56,
  },
  // La cella ospita una tendina (codice + freccia), non solo un numero.
  { id: 'vat', label: 'IVA', numeric: true, defaultWidthPx: 96, minWidthPx: 76 },
  { id: 'lineTotal', label: 'Totale', numeric: true, defaultWidthPx: 88, minWidthPx: 56 },
  // Due pulsanti da 30px (duplica + elimina) più gap e rientri.
  { id: 'actions', label: 'Azioni', defaultWidthPx: 84, minWidthPx: 76 },
];

// I preset partono dalle colonne visibili di default: quelle opzionali
// (defaultVisible: false) restano selezionabili a mano dal tasto Colonne.
const ALL_COLUMN_IDS = SUPPLIER_ORDER_LINE_COLUMNS.filter(
  (column) => column.defaultVisible !== false,
).map((column) => column.id);

export const SUPPLIER_ORDER_LINE_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: ALL_COLUMN_IDS,
  [PresetId.Warehouse]: [
    'articleCode',
    'sku',
    'barcode',
    'product',
    'quantity',
    'unitOfMeasure',
    'stockOnHand',
    'stockAvailable',
    'actions',
  ],
  [PresetId.Supplier]: [
    'sku',
    'barcode',
    'supplierCode',
    'product',
    'quantity',
    'unitCost',
    'discount',
    'discountedCost',
    'vat',
    'lineTotal',
    'actions',
  ],
  [PresetId.Accountant]: ['sku', 'product', 'quantity', 'unitCost', 'discount', 'vat', 'lineTotal'],
  [PresetId.Analysis]: ['sku', 'product', 'quantity', 'unitCost', 'discountedCost', 'lineTotal'],
  [PresetId.Operational]: ALL_COLUMN_IDS,
};

/**
 * Alias colonna legacy salvata nelle preferenze utente.
 *
 * Serve solo per le colonne RINOMINATE: quelle rimosse («Prezzo al pubblico»,
 * «Prezzo barrato») non hanno bisogno di niente, perché `reconcileStateWithDefs`
 * scarta dalle preferenze salvate ogni id che non compare più fra le
 * definizioni registrate.
 */
export function normalizeSupplierOrderColumnId(columnId: string): string {
  if (columnId === 'variant') {
    return 'product';
  }
  return columnId;
}
