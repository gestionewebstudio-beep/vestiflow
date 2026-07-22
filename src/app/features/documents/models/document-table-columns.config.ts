import {
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

export const DOCUMENT_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'documentDate', label: 'Data', pinnable: true, defaultVisible: true },
  { id: 'type', label: 'Tipo', defaultVisible: true },
  { id: 'reference', label: 'Numero', defaultVisible: true },
  { id: 'counterparty', label: 'Controparte', defaultVisible: true },
  { id: 'status', label: 'Stato', defaultVisible: true },
  { id: 'lineCount', label: 'Righe', numeric: true, defaultVisible: true },
  { id: 'total', label: 'Totale', numeric: true, defaultVisible: true },
] as const;

export const DOCUMENT_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'documentDate',
    'type',
    'reference',
    'counterparty',
    'status',
    'lineCount',
    'total',
  ],
  [TableViewPresetId.Warehouse]: ['documentDate', 'type', 'reference', 'counterparty', 'lineCount'],
  [TableViewPresetId.Accountant]: [
    'documentDate',
    'type',
    'reference',
    'counterparty',
    'status',
    'total',
  ],
  [TableViewPresetId.Supplier]: ['documentDate', 'type', 'reference', 'counterparty', 'total'],
  [TableViewPresetId.Analysis]: ['documentDate', 'type', 'status', 'lineCount', 'total'],
  [TableViewPresetId.Operational]: ['documentDate', 'type', 'reference', 'status', 'counterparty'],
};

/**
 * Colonne delle liste dedicate ai documenti di vendita (Preventivi, Proforma,
 * DDT vendita): niente colonna "Tipo" — la pagina è già dedicata a un solo
 * tipo — e controparte etichettata "Cliente". Le Fatture fanno eccezione e
 * usano INVOICE_LIST_COLUMN_DEFS, perché condividono un elenco fra due tipi.
 */
export const SALES_DOCUMENT_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'documentDate', label: 'Data', pinnable: true, defaultVisible: true },
  { id: 'reference', label: 'Numero', defaultVisible: true },
  { id: 'counterparty', label: 'Cliente', defaultVisible: true },
  { id: 'status', label: 'Stato', defaultVisible: true },
  { id: 'lineCount', label: 'Righe', numeric: true, defaultVisible: true },
  { id: 'total', label: 'Totale', numeric: true, defaultVisible: true },
] as const;

export const SALES_DOCUMENT_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'documentDate',
    'reference',
    'counterparty',
    'status',
    'lineCount',
    'total',
  ],
  [TableViewPresetId.Warehouse]: ['documentDate', 'reference', 'counterparty', 'lineCount'],
  [TableViewPresetId.Accountant]: ['documentDate', 'reference', 'counterparty', 'status', 'total'],
  [TableViewPresetId.Supplier]: ['documentDate', 'reference', 'counterparty', 'total'],
  [TableViewPresetId.Analysis]: ['documentDate', 'status', 'lineCount', 'total'],
  [TableViewPresetId.Operational]: ['documentDate', 'reference', 'status', 'counterparty'],
};

/**
 * Fatture: unica lista di vendita con la colonna "Tipo", perché l'elenco è
 * condiviso da Fattura e Fattura accompagnatoria (numeratore unico). La
 * colonna sta subito dopo il Numero, dove l'operatore la cerca leggendo la riga.
 */
export const INVOICE_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'documentDate', label: 'Data', pinnable: true, defaultVisible: true },
  { id: 'reference', label: 'Numero', defaultVisible: true },
  { id: 'type', label: 'Tipo', defaultVisible: true },
  { id: 'counterparty', label: 'Cliente', defaultVisible: true },
  { id: 'status', label: 'Stato', defaultVisible: true },
  { id: 'lineCount', label: 'Righe', numeric: true, defaultVisible: true },
  { id: 'total', label: 'Totale', numeric: true, defaultVisible: true },
] as const;

export const INVOICE_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'documentDate',
    'reference',
    'type',
    'counterparty',
    'status',
    'lineCount',
    'total',
  ],
  [TableViewPresetId.Warehouse]: ['documentDate', 'reference', 'type', 'counterparty', 'lineCount'],
  [TableViewPresetId.Accountant]: [
    'documentDate',
    'reference',
    'type',
    'counterparty',
    'status',
    'total',
  ],
  [TableViewPresetId.Supplier]: ['documentDate', 'reference', 'type', 'counterparty', 'total'],
  [TableViewPresetId.Analysis]: ['documentDate', 'type', 'status', 'lineCount', 'total'],
  [TableViewPresetId.Operational]: ['documentDate', 'reference', 'type', 'status', 'counterparty'],
};

/** Preventivi: nessun ciclo di stato documento — la colonna "Stato" non esiste. */
export const QUOTE_LIST_COLUMN_DEFS: readonly TableColumnDef[] =
  SALES_DOCUMENT_LIST_COLUMN_DEFS.filter((column) => column.id !== 'status');

export const QUOTE_LIST_COLUMN_PRESETS: TableViewPresetMap = presetsWithoutColumn(
  SALES_DOCUMENT_LIST_COLUMN_PRESETS,
  'status',
);

function presetsWithoutColumn(presets: TableViewPresetMap, columnId: string): TableViewPresetMap {
  const result = {} as Record<TableViewPresetId, readonly string[]>;
  for (const preset of Object.values(TableViewPresetId)) {
    result[preset] = presets[preset].filter((id) => id !== columnId);
  }
  return result;
}

/**
 * Elenco Registrazioni fattura fornitore: colonne della spec (Data documento,
 * Data registrazione, Fornitore, N. fattura, Commento, Totale, Ancora da
 * saldare, Pagamento) — mai la colonna "Tipo".
 */
export const PURCHASE_INVOICE_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'documentDate', label: 'Data documento', pinnable: true, defaultVisible: true },
  { id: 'registrationDate', label: 'Data registrazione', defaultVisible: true },
  { id: 'counterparty', label: 'Fornitore', defaultVisible: true },
  { id: 'invoiceNumber', label: 'N. fattura', defaultVisible: true },
  { id: 'notes', label: 'Commento', defaultVisible: true },
  { id: 'total', label: 'Totale', numeric: true, defaultVisible: true },
  { id: 'outstanding', label: 'Ancora da saldare', numeric: true, defaultVisible: true },
  { id: 'paymentMethod', label: 'Pagamento', defaultVisible: true },
] as const;

export const PURCHASE_INVOICE_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'documentDate',
    'registrationDate',
    'counterparty',
    'invoiceNumber',
    'notes',
    'total',
    'outstanding',
    'paymentMethod',
  ],
  [TableViewPresetId.Warehouse]: ['documentDate', 'counterparty', 'invoiceNumber', 'notes'],
  [TableViewPresetId.Accountant]: [
    'documentDate',
    'registrationDate',
    'counterparty',
    'invoiceNumber',
    'total',
    'outstanding',
  ],
  [TableViewPresetId.Supplier]: [
    'documentDate',
    'counterparty',
    'invoiceNumber',
    'total',
    'outstanding',
    'paymentMethod',
  ],
  [TableViewPresetId.Analysis]: ['documentDate', 'total', 'outstanding', 'paymentMethod'],
  [TableViewPresetId.Operational]: [
    'documentDate',
    'registrationDate',
    'counterparty',
    'invoiceNumber',
    'notes',
  ],
};

/**
 * Vendita/Reso in negozio: elenco condiviso dai due tipi creati dalla cassa,
 * quindi con la colonna "Tipo". Niente colonna "Stato" — nascono già
 * confermati e non hanno ciclo di vita (§11 documento funzionale).
 */
export const STORE_SALE_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'documentDate', label: 'Data', pinnable: true, defaultVisible: true },
  { id: 'reference', label: 'Numero', defaultVisible: true },
  { id: 'type', label: 'Tipo', defaultVisible: true },
  { id: 'counterparty', label: 'Cliente', defaultVisible: true },
  { id: 'total', label: 'Totale', numeric: true, defaultVisible: true },
  { id: 'paymentMethod', label: 'Metodo pagamento', defaultVisible: true },
  { id: 'lineCount', label: 'Righe', numeric: true, defaultVisible: true },
  { id: 'location', label: 'Negozio', defaultVisible: false },
] as const;

export const STORE_SALE_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'documentDate',
    'reference',
    'type',
    'counterparty',
    'total',
    'paymentMethod',
    'lineCount',
  ],
  [TableViewPresetId.Warehouse]: [
    'documentDate',
    'reference',
    'type',
    'counterparty',
    'lineCount',
    'location',
  ],
  [TableViewPresetId.Accountant]: [
    'documentDate',
    'reference',
    'type',
    'counterparty',
    'total',
    'paymentMethod',
  ],
  [TableViewPresetId.Supplier]: ['documentDate', 'reference', 'type', 'counterparty', 'total'],
  [TableViewPresetId.Analysis]: ['documentDate', 'type', 'total', 'paymentMethod', 'lineCount'],
  [TableViewPresetId.Operational]: [
    'documentDate',
    'reference',
    'type',
    'counterparty',
    'paymentMethod',
  ],
};

export const GOODS_RECEIPT_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'documentDate', label: 'Data', pinnable: true, defaultVisible: true },
  { id: 'reference', label: 'N.', defaultVisible: true },
  { id: 'counterparty', label: 'Soggetto', defaultVisible: true },
  // Colonne opzionali (attivabili da «Colonne»): dati di dettaglio non
  // necessari alla lettura rapida della riga.
  { id: 'supplierCode', label: 'Cod. soggetto', defaultVisible: false },
  { id: 'linkStatus', label: 'Stato', defaultVisible: true },
  { id: 'paymentMethod', label: 'Pagamento', defaultVisible: false },
  { id: 'causal', label: 'Causale carico', defaultVisible: false },
  { id: 'externalDocNumber', label: 'Doc. fornitore', defaultVisible: false },
  { id: 'notes', label: 'Commento', defaultVisible: false },
  { id: 'lineCount', label: 'Righe', numeric: true, defaultVisible: true },
  { id: 'subtotal', label: 'Tot. netto', numeric: true, defaultVisible: false },
  { id: 'total', label: 'Tot. documento', numeric: true, defaultVisible: true },
  { id: 'location', label: 'Magazzino', defaultVisible: true },
  // Niente colonna "Stato documento": l'Arrivo merce non ha più il ciclo
  // Bozza/Confermato selezionabile (il salvataggio conferma sempre) e
  // l'annullamento è già esposto dalla colonna "Stato" (collegamento fattura).
  // Niente colonna "Tipo": nella lista Arrivi merce il tipo interno è sempre
  // "Arrivo merce" (il selettore è stato rimosso dal form).
] as const;

export const GOODS_RECEIPT_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'documentDate',
    'reference',
    'counterparty',
    'linkStatus',
    'lineCount',
    'total',
    'location',
  ],
  [TableViewPresetId.Warehouse]: [
    'documentDate',
    'reference',
    'counterparty',
    'lineCount',
    'location',
  ],
  [TableViewPresetId.Accountant]: [
    'documentDate',
    'reference',
    'counterparty',
    'linkStatus',
    'subtotal',
    'total',
    'paymentMethod',
  ],
  [TableViewPresetId.Supplier]: [
    'documentDate',
    'reference',
    'counterparty',
    'supplierCode',
    'causal',
    'paymentMethod',
    'total',
  ],
  [TableViewPresetId.Analysis]: ['documentDate', 'reference', 'lineCount', 'subtotal', 'total'],
  [TableViewPresetId.Operational]: [
    'documentDate',
    'reference',
    'counterparty',
    'causal',
    'lineCount',
    'location',
  ],
};
