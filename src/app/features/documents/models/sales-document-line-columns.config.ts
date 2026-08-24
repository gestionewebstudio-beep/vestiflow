import {
  TableViewId,
  TableViewPresetId as PresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

export const SALES_DOCUMENT_LINES_VIEW = TableViewId.SalesDocumentLines;

/**
 * Le colonne della riga di un documento di vendita: Proforma, Fattura e Fattura
 * accompagnatoria, che sono la stessa maschera.
 *
 * Le larghezze sono quelle dell'Ordine cliente per le colonne omonime: un
 * Cod. articolo non è più stretto perché sta in una fattura.
 *
 * «Scarica mag.» è dichiarata qui ma vive solo sulla Fattura accompagnatoria
 * senza DDT agganciato — con un DDT le giacenze le ha già scaricate quello, e
 * il template non rende proprio la colonna.
 */
export const SALES_DOCUMENT_LINE_COLUMNS: readonly TableColumnDef[] = [
  { id: 'articleCode', label: 'Cod. articolo', defaultWidthPx: 96, minWidthPx: 64 },
  { id: 'sku', label: 'SKU', defaultWidthPx: 104, minWidthPx: 64 },
  { id: 'barcode', label: 'EAN', defaultWidthPx: 124, minWidthPx: 72 },
  { id: 'product', label: 'Nome prodotto', defaultWidthPx: 260, minWidthPx: 160 },
  // La VARIANTE accanto al nome, non dentro: «M / Rosso».
  //
  // ⛔ L'id è `variantLabel` anche se qui `variant` sarebbe tecnicamente
  // libero — questa vista non ha una `normalize*ColumnId` con l'alias legacy
  // che lo brucia su Ordine fornitore e Arrivo merce. Usarlo creerebbe una
  // TERZA convenzione per la stessa colonna, e il test di coerenza trasversale
  // non la vedrebbe: `COLONNE_DA_CONFRONTARE` non include la variante, quindi
  // la divergenza passerebbe in silenzio — che è il difetto per cui quel test
  // esiste.
  { id: 'variantLabel', label: 'Variante', defaultWidthPx: 120, minWidthPx: 80 },
  // L'unità di misura: la colonna su `document_lines` esiste dall'11/08, ma
  // questa maschera non aveva né il controllo né la colonna. Era l'unica
  // delle quattro senza.
  { id: 'unitOfMeasure', label: 'U.m.', defaultWidthPx: 60, minWidthPx: 48 },
  { id: 'quantity', label: 'Qtà', numeric: true, defaultWidthPx: 72, minWidthPx: 52 },
  { id: 'unitPrice', label: 'Prezzo', numeric: true, defaultWidthPx: 104, minWidthPx: 72 },
  { id: 'discount', label: 'Sconto', numeric: true, defaultWidthPx: 84, minWidthPx: 60 },
  { id: 'vat', label: 'IVA', defaultWidthPx: 120, minWidthPx: 84 },
  { id: 'loadsStock', label: 'Scarica mag.', defaultWidthPx: 88, minWidthPx: 64 },
  { id: 'actions', label: 'Azioni', defaultWidthPx: 44, minWidthPx: 44 },
];

const TUTTE = SALES_DOCUMENT_LINE_COLUMNS.map((column) => column.id);

/**
 * Le viste salvate. Quella del commercialista toglie i codici — a chi registra
 * interessano descrizione, imponibile e aliquota — e quella di magazzino toglie
 * prezzo e sconto, che a chi prepara la merce non servono.
 */
export const SALES_DOCUMENT_LINE_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: TUTTE,
  [PresetId.Warehouse]: [
    'articleCode',
    'sku',
    'barcode',
    'product',
    'variantLabel',
    'unitOfMeasure',
    'quantity',
    'loadsStock',
    'actions',
  ],
  [PresetId.Accountant]: [
    'product',
    'variantLabel',
    'quantity',
    'unitPrice',
    'discount',
    'vat',
    'actions',
  ],
  [PresetId.Supplier]: TUTTE,
  [PresetId.Analysis]: TUTTE,
  [PresetId.Operational]: [
    'sku',
    'product',
    'variantLabel',
    'quantity',
    'unitPrice',
    'discount',
    'vat',
    'actions',
  ],
};
