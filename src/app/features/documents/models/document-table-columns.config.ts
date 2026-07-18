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
 * DDT vendita, Bozze fattura): niente colonna "Tipo" — la pagina è già
 * dedicata a un solo tipo — e controparte etichettata "Cliente".
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

export const GOODS_RECEIPT_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'documentDate', label: 'Data', pinnable: true, defaultVisible: true },
  { id: 'reference', label: 'N.', defaultVisible: true },
  { id: 'counterparty', label: 'Soggetto', defaultVisible: true },
  { id: 'linkStatus', label: 'Stato', defaultVisible: true },
  { id: 'causal', label: 'Causale carico', defaultVisible: true },
  { id: 'externalDocNumber', label: 'Doc. fornitore', defaultVisible: false },
  { id: 'notes', label: 'Commento', defaultVisible: false },
  { id: 'lineCount', label: 'Righe', numeric: true, defaultVisible: true },
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
    'causal',
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
    'total',
  ],
  [TableViewPresetId.Supplier]: [
    'documentDate',
    'reference',
    'counterparty',
    'causal',
    'linkStatus',
    'total',
  ],
  [TableViewPresetId.Analysis]: ['documentDate', 'reference', 'lineCount', 'total'],
  [TableViewPresetId.Operational]: [
    'documentDate',
    'reference',
    'counterparty',
    'causal',
    'lineCount',
    'location',
  ],
};
