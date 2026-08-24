import {
  TableViewPresetId as PresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * Le colonne della riga di un movimento di magazzino: le usano il Trasferimento
 * e la Rettifica inventario, che hanno la stessa riga campo per campo.
 *
 * Le larghezze sono quelle degli altri documenti per le colonne omonime — un
 * Cod. articolo non è più stretto perché sta in un trasferimento. Cambia solo
 * il nome prodotto, che qui è più largo: senza prezzo, sconto, IVA e totale a
 * contendergli lo spazio, la riga ne ha da dare.
 */
export const STOCK_MOVEMENT_LINE_COLUMNS: readonly TableColumnDef[] = [
  { id: 'articleCode', label: 'Cod. articolo', defaultWidthPx: 96, minWidthPx: 64 },
  { id: 'sku', label: 'SKU', defaultWidthPx: 104, minWidthPx: 64 },
  { id: 'barcode', label: 'EAN', defaultWidthPx: 124, minWidthPx: 72 },
  { id: 'product', label: 'Nome prodotto', defaultWidthPx: 300, minWidthPx: 160 },
  // La VARIANTE ha una colonna sua, accanto al nome e non dentro: «M / Rosso».
  //
  // ⛔ Prima stava impastata nella descrizione — e siccome la descrizione
  // riceveva `nome · titolo` e il titolo contiene già il nome, la riga diceva
  // «Maglia · Maglia — M / Rosso». Su un articolo senza varianti, «Cintura ·
  // Cintura».
  //
  // Larga meno del nome perché contiene i soli VALORI delle opzioni, non i
  // loro nomi: «M / Rosso», non «Taglia: M / Colore: Rosso».
  { id: 'variantLabel', label: 'Variante', defaultWidthPx: 130, minWidthPx: 80 },
  { id: 'quantity', label: 'Quantità', numeric: true, defaultWidthPx: 80, minWidthPx: 56 },
  // I seriali sono l'eccezione, non la regola: la colonna c'è per chi tratta
  // merce serializzata, ma non deve mangiarsi la riga di chi non la tratta.
  { id: 'serials', label: 'Seriali', defaultWidthPx: 150, minWidthPx: 90 },
  { id: 'actions', label: 'Azioni', defaultWidthPx: 44, minWidthPx: 44 },
];

const TUTTE = STOCK_MOVEMENT_LINE_COLUMNS.map((column) => column.id);

/**
 * Le viste salvate. Sono poche colonne e nessuna è di prezzo, quindi le viste
 * contabili qui non hanno senso: quella di magazzino toglie i seriali, che è
 * l'unica scelta che cambia davvero il lavoro.
 */
export const STOCK_MOVEMENT_LINE_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: TUTTE,
  [PresetId.Warehouse]: [
    'articleCode',
    'sku',
    'barcode',
    'product',
    'variantLabel',
    'quantity',
    'actions',
  ],
  [PresetId.Accountant]: TUTTE,
  [PresetId.Supplier]: TUTTE,
  [PresetId.Analysis]: TUTTE,
  [PresetId.Operational]: [
    'sku',
    'barcode',
    'product',
    'variantLabel',
    'quantity',
    'serials',
    'actions',
  ],
};

/**
 * I campi che il giro del Tab attraversa su una riga di movimento, **nell'ordine
 * in cui li attraversa**.
 *
 * ⭐ Sta qui, accanto alle colonne, perché è la stessa cosa vista da un altro
 * lato: il Tab segue le colonne, e le colonne le condividono Trasferimento e
 * Rettifica. Duplicarlo in due maschere significherebbe che un campo aggiunto a
 * una lo salta nell'altra, senza un errore.
 *
 * ⚠️ **È un SOTTOINSIEME** di `DocumentLineFocusField`, che la riga comune
 * emette: quella parla di dieci campi — ci sono anche prezzo, sconto, IVA e
 * unità — e un movimento ne ha sei, perché le altre colonne non esistono.
 * Il restringimento va fatto, non forzato con un cast: un campo che qui non
 * c'è arriverebbe allo store del fuoco, che lo cercherebbe nel DOM e si
 * fermerebbe a metà riga in silenzio.
 */
export const MOVEMENT_LINE_FOCUS_FIELDS = [
  'articleCode',
  'sku',
  'barcode',
  'product',
  'quantity',
  'serials',
] as const;

export type MovementLineFocusField = (typeof MOVEMENT_LINE_FOCUS_FIELDS)[number];
