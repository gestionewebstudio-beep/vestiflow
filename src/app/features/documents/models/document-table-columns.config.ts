import { colonna } from '@shared/table-columns/column-catalog';
import { conColonneCondivise } from './document-shared-columns';
import {
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * ⭐ **Le colonne dell'elenco documenti che il SERVER sa ordinare** (`14` §H15).
 *
 * L'elenco è paginato: ordinare le venti righe caricate darebbe la prima pagina
 * rimescolata e la chiamerebbe «la più recente». L'ordinamento passa quindi
 * dalla query, e questo insieme è lo **specchio** della whitelist di
 * `api/src/documents/documents-sort.util.ts`.
 *
 * ⛔ **È una lista di ciò che SI PUÒ, non di ciò che non si può**, e la
 * direzione conta: una colonna nuova nasce **non ordinabile** e resta tale
 * finché qualcuno non la insegna anche al server. Marcando invece le escluse,
 * la colonna aggiunta domani prometterebbe un ordinamento che risponde `400`.
 *
 * ⚠️ **Resta fuori la sola «Controparte»**, e non per decisione: non è un campo
 * — `customerName` sulle vendite, `supplierName` sugli acquisti — quindi è
 * ordinabile **da completare**, con una colonna generata in Postgres. Mai con
 * un `CASE` SQL, che sarebbe una seconda fonte di verità.
 *
 * ⭐ **Tipo e Stato invece ci sono**: qui c'era scritto che il database li
 * avrebbe ordinati «in inglese», ed era falso — Postgres ordina un `ENUM` per
 * ordine di dichiarazione, e nello schema quello è il ciclo di vita (bozza →
 * confermato → … → annullato) e la famiglia del tipo.
 */
export const DOCUMENT_LIST_SORTABLE_COLUMNS: ReadonlySet<string> = new Set([
  'documentDate',
  'reference',
  'lineCount',
  'total',
  'type',
  'status',
]);

/*
  ⛔ **Qui c'era `COLONNE_DOCUMENTALI_EXTRA`**, un array sparso con lo spread in
  cinque cataloghi. Due difetti, trovati da una revisione avversariale poche ore
  dopo averlo scritto:

  1. le tre colonne **non avevano un renderer** — nessun `case` in `cellText` —
     quindi accendendole si ottenevano tre colonne SEMPRE VUOTE su cinque
     elenchi. Nulla falliva: una colonna senza renderer è una stringa in un array;
  2. uno spread non sa che cosa c'è nell'array che lo ospita, e dove il profilo
     dichiarava già `location` («Sede») il selettore mostrava **due voci gemelle**.

  ⭐ Ora stanno in `document-shared-columns.ts`, dove **dichiarazione e resa sono
  lo stesso oggetto** e la funzione `conColonneCondivise` riceve il catalogo e
  non ripete ciò che c'è.
*/

export const DOCUMENT_LIST_COLUMN_DEFS: readonly TableColumnDef[] = conColonneCondivise([
  colonna('documentDate', {
    pinnable: true,
    defaultVisible: true,
    display: 'code',
    filter: 'range',
  }),
  colonna('type', { defaultVisible: true }),
  colonna('reference', { label: 'Numero', defaultVisible: true, display: 'code', cardTitle: true }),
  colonna('counterparty', { defaultVisible: true, display: 'truncate' }),
  colonna('status', { defaultVisible: true }),
  colonna('lineCount', { defaultVisible: true }),
  colonna('total', { defaultVisible: true }),
]);

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
  [TableViewPresetId.Analysis]: [
    'documentDate',
    'reference',
    'type',
    'status',
    'lineCount',
    'total',
  ],
  [TableViewPresetId.Operational]: ['documentDate', 'type', 'reference', 'status', 'counterparty'],
};

/**
 * Colonne delle liste dedicate ai documenti di vendita (Preventivi, Proforma,
 * DDT vendita): niente colonna "Tipo" — la pagina è già dedicata a un solo
 * tipo — e controparte etichettata "Cliente". Le Fatture fanno eccezione e
 * usano INVOICE_LIST_COLUMN_DEFS, perché condividono un elenco fra due tipi.
 */
export const SALES_DOCUMENT_LIST_COLUMN_DEFS: readonly TableColumnDef[] = conColonneCondivise([
  colonna('documentDate', {
    pinnable: true,
    defaultVisible: true,
    display: 'code',
    filter: 'range',
  }),
  colonna('reference', { label: 'Numero', defaultVisible: true, display: 'code', cardTitle: true }),
  colonna('counterparty', { label: 'Cliente', defaultVisible: true, display: 'truncate' }),
  colonna('status', { defaultVisible: true }),
  colonna('lineCount', { defaultVisible: true }),
  { id: 'subtotal', label: 'Imponibile', numeric: true, defaultVisible: true },
  { id: 'tax', label: 'IVA', numeric: true, defaultVisible: true },
  colonna('total', { defaultVisible: true }),
]);

export const SALES_DOCUMENT_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'documentDate',
    'reference',
    'counterparty',
    'status',
    'lineCount',
    'subtotal',
    'tax',
    'total',
  ],
  [TableViewPresetId.Warehouse]: ['documentDate', 'reference', 'counterparty', 'lineCount'],
  [TableViewPresetId.Accountant]: [
    'documentDate',
    'reference',
    'counterparty',
    'status',
    'subtotal',
    'tax',
    'total',
  ],
  [TableViewPresetId.Supplier]: ['documentDate', 'reference', 'counterparty', 'total'],
  [TableViewPresetId.Analysis]: ['documentDate', 'reference', 'status', 'lineCount', 'total'],
  [TableViewPresetId.Operational]: ['documentDate', 'reference', 'status', 'counterparty'],
};

/**
 * Fatture: unica lista di vendita con la colonna "Tipo", perché l'elenco è
 * condiviso da Fattura e Fattura accompagnatoria (numeratore unico). La
 * colonna sta subito dopo il Numero, dove l'operatore la cerca leggendo la riga.
 */
export const INVOICE_LIST_COLUMN_DEFS: readonly TableColumnDef[] = conColonneCondivise([
  colonna('documentDate', {
    pinnable: true,
    defaultVisible: true,
    display: 'code',
    filter: 'range',
  }),
  colonna('reference', { label: 'Numero', defaultVisible: true, display: 'code', cardTitle: true }),
  colonna('type', { defaultVisible: true }),
  colonna('counterparty', { label: 'Cliente', defaultVisible: true, display: 'truncate' }),
  colonna('status', { defaultVisible: true }),
  colonna('lineCount', { defaultVisible: true }),
  { id: 'subtotal', label: 'Imponibile', numeric: true, defaultVisible: true },
  { id: 'tax', label: 'IVA', numeric: true, defaultVisible: true },
  colonna('total', { defaultVisible: true }),
]);

export const INVOICE_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'documentDate',
    'reference',
    'type',
    'counterparty',
    'status',
    'lineCount',
    'subtotal',
    'tax',
    'total',
  ],
  [TableViewPresetId.Warehouse]: ['documentDate', 'reference', 'type', 'counterparty', 'lineCount'],
  [TableViewPresetId.Accountant]: [
    'documentDate',
    'reference',
    'type',
    'counterparty',
    'status',
    'subtotal',
    'tax',
    'total',
  ],
  [TableViewPresetId.Supplier]: ['documentDate', 'reference', 'type', 'counterparty', 'total'],
  [TableViewPresetId.Analysis]: [
    'documentDate',
    'reference',
    'type',
    'status',
    'lineCount',
    'total',
  ],
  [TableViewPresetId.Operational]: ['documentDate', 'reference', 'type', 'status', 'counterparty'],
};

/**
 * Preventivi: nessun ciclo di stato documento — la colonna "Stato" non esiste.
 * In coda le due colonne opzionali (nascoste di default, attivabili da
 * «Colonne»): «Cod. soggetto» (codice cliente dall'anagrafica) e «Commento»
 * (commento interno del documento).
 */
export const QUOTE_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  ...SALES_DOCUMENT_LIST_COLUMN_DEFS.filter((column) => column.id !== 'status'),
  { id: 'supplierCode', label: 'Cod. soggetto', defaultVisible: false, display: 'code' },
  colonna('notes', { defaultVisible: false }),
];

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
  colonna('documentDate', {
    label: 'Data documento',
    pinnable: true,
    defaultVisible: true,
    display: 'code',
  }),
  {
    id: 'registrationDate',
    label: 'Data registrazione',
    defaultVisible: true,
    display: 'code',
    filter: 'range',
  },
  // «N.» è il numero interno, da non confondere con quello della
  // fattura del fornitore (colonna accanto).
  colonna('reference', {
    label: 'N.',
    headerTooltip: 'Numero interno di catalogazione VestiFlow',
    defaultVisible: true,
    cardTitle: true,
  }),
  colonna('counterparty', { label: 'Fornitore', defaultVisible: true, display: 'truncate' }),
  { id: 'invoiceNumber', label: 'N. fattura', defaultVisible: true, display: 'code' },
  colonna('notes', { defaultVisible: true }),
  colonna('total', { defaultVisible: true }),
  { id: 'outstanding', label: 'Ancora da saldare', numeric: true, defaultVisible: true },
  colonna('paymentMethod', { defaultVisible: true }),
] as const;

export const PURCHASE_INVOICE_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'documentDate',
    'registrationDate',
    'reference',
    'counterparty',
    'invoiceNumber',
    'notes',
    'total',
    'outstanding',
    'paymentMethod',
  ],
  [TableViewPresetId.Warehouse]: [
    'documentDate',
    'reference',
    'counterparty',
    'invoiceNumber',
    'notes',
  ],
  [TableViewPresetId.Accountant]: [
    'documentDate',
    'reference',
    'registrationDate',
    'counterparty',
    'invoiceNumber',
    'total',
    'outstanding',
  ],
  [TableViewPresetId.Supplier]: [
    'documentDate',
    'reference',
    'counterparty',
    'invoiceNumber',
    'total',
    'outstanding',
    'paymentMethod',
  ],
  [TableViewPresetId.Analysis]: [
    'documentDate',
    'reference',
    'total',
    'outstanding',
    'paymentMethod',
  ],
  [TableViewPresetId.Operational]: [
    'documentDate',
    'reference',
    'registrationDate',
    'counterparty',
    'invoiceNumber',
    'notes',
  ],
};

/**
 * Vendita/Reso al banco: elenco condiviso dai due tipi creati dalla loro maschera,
 * quindi con la colonna "Tipo". Niente colonna "Stato" — nascono già
 * confermati e non hanno ciclo di vita (§11 documento funzionale).
 */
export const STORE_SALE_LIST_COLUMN_DEFS: readonly TableColumnDef[] = conColonneCondivise([
  colonna('documentDate', {
    pinnable: true,
    defaultVisible: true,
    display: 'code',
    filter: 'range',
  }),
  colonna('reference', { label: 'Numero', defaultVisible: true, display: 'code', cardTitle: true }),
  colonna('type', { defaultVisible: true }),
  colonna('counterparty', { label: 'Cliente', defaultVisible: true, display: 'truncate' }),
  colonna('total', { defaultVisible: true }),
  colonna('paymentMethod', { label: 'Metodo pagamento', defaultVisible: true }),
  colonna('lineCount', { defaultVisible: true }),
  colonna('location', { defaultVisible: false }),
]);

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
  [TableViewPresetId.Analysis]: [
    'documentDate',
    'reference',
    'type',
    'total',
    'paymentMethod',
    'lineCount',
  ],
  [TableViewPresetId.Operational]: [
    'documentDate',
    'reference',
    'type',
    'counterparty',
    'paymentMethod',
  ],
};

export const GOODS_RECEIPT_LIST_COLUMN_DEFS: readonly TableColumnDef[] = conColonneCondivise([
  // Colonne visibili di default (ordine di lettura della riga).
  colonna('documentDate', {
    pinnable: true,
    defaultVisible: true,
    display: 'code',
    filter: 'range',
  }),
  // «N.» è il numero interno, non quello del documento fornitore.
  colonna('reference', {
    label: 'N.',
    headerTooltip: 'Numero interno di catalogazione VestiFlow',
    defaultVisible: true,
    cardTitle: true,
  }),
  colonna('counterparty', { label: 'Soggetto', defaultVisible: true, display: 'truncate' }),
  colonna('lineCount', { defaultVisible: true }),
  colonna('total', { label: 'Tot. documento', defaultVisible: true }),
  { id: 'linkStatus', label: 'Stato', defaultVisible: true },
  colonna('location', { defaultVisible: true }),
  { id: 'externalDocNumber', label: 'Doc. fornitore', defaultVisible: true, display: 'code' },
  // Colonne opzionali (attivabili da «Colonne»): dati di dettaglio non
  // necessari alla lettura rapida della riga.
  { id: 'supplierCode', label: 'Cod. soggetto', defaultVisible: false, display: 'code' },
  colonna('paymentMethod', { defaultVisible: false }),
  { id: 'causal', label: 'Causale carico', defaultVisible: false },
  colonna('notes', { defaultVisible: false }),
  { id: 'subtotal', label: 'Tot. netto', numeric: true, defaultVisible: false },
  // Niente colonna "Stato documento": l'Arrivo merce non ha più il ciclo
  // Bozza/Confermato selezionabile (il salvataggio conferma sempre) e
  // l'annullamento è già esposto dalla colonna "Stato" (collegamento fattura).
  // Niente colonna "Tipo": nella lista Arrivi merce il tipo interno è sempre
  // "Arrivo merce" (il selettore è stato rimosso dal form).
]);

export const GOODS_RECEIPT_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: [
    'documentDate',
    'reference',
    'counterparty',
    'lineCount',
    'total',
    'linkStatus',
    'location',
    'externalDocNumber',
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
