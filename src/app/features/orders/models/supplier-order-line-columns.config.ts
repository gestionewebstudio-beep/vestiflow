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
// - «Prezzo di vendita» e «Prezzo barrato» ci sono, ma SPENTE di default
//   (deciso 11/08/2026, allineando al documento funzionale §9.1 che le vuole
//   «attivabili dal selettore colonne»).
//
//   Erano state tolte del tutto, con questa ragione: qui la colonna che conta è
//   il COSTO, e affiancargli un altro numero monetario che significa l'opposto è
//   un invito a sbagliare — tanto più che il costo ha il selettore netto/ivato e
//   il prezzo no. L'argomento resta valido, ed è il motivo per cui restano
//   SPENTE: chi non le chiede non se le trova accanto al costo; chi le accende
//   sa cosa sta guardando. «Attivabile» e «visibile» non sono la stessa cosa.
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
  // Larghezza cresciuta con la cella: era una colonna di sola lettura larga
  // quanto «pz», ora ospita un campo con il suo indizio di apertura.
  { id: 'unitOfMeasure', label: 'U.m.', defaultWidthPx: 60, minWidthPx: 48 },
  // Giacenza: utile ma non sempre, e allarga la tabella — resta a richiesta.
  {
    id: 'stockOnHand',
    label: 'Q.tà giacenza',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 64,
    minWidthPx: 52,
  },
  // Disponibilità: OPZIONALE, come vuole il documento funzionale §9.1. Diceva
  // «visibile di default perché è il numero che fa decidere quanto ordinare» —
  // vero, ma il documento la elenca fra le attivabili, e le due colonne di
  // giacenza insieme valevano 223px dei 349 di sfondamento della tabella.
  {
    id: 'stockAvailable',
    label: 'Q.tà disp.',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 62,
    minWidthPx: 48,
  },
  // Prezzi di vendita: attivabili, mai accesi da soli (vedi la nota in testa).
  {
    id: 'sellingPrice',
    label: 'Prezzo di vendita',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 104,
    minWidthPx: 72,
  },
  {
    id: 'compareAtPrice',
    label: 'Prezzo barrato',
    numeric: true,
    defaultVisible: false,
    defaultWidthPx: 104,
    minWidthPx: 72,
  },
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
  { id: 'vat', label: 'IVA', defaultWidthPx: 96, minWidthPx: 76 },
  { id: 'lineTotal', label: 'Totale', numeric: true, defaultWidthPx: 88, minWidthPx: 56 },
  // Un solo pulsante (elimina): le frecce di riordino vivono nella colonna
  // indice. Stessa misura di `stock-movement-line-columns`.
  { id: 'actions', label: 'Azioni', defaultWidthPx: 44, minWidthPx: 44 },
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
 * Serve solo per le colonne RINOMINATE: quelle rimosse («Prezzo di vendita»,
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
