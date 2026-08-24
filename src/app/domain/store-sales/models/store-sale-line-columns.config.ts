import {
  TableViewId,
  TableViewPresetId as PresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

export const STORE_SALE_LINES_VIEW = TableViewId.StoreSaleLines;

/**
 * Le colonne della riga documento al banco — **poche ed essenziali**.
 *
 * ```text
 * SKU · EAN · Articolo · Q.tà · Prezzo · Sconto · IVA · Totale
 * ```
 *
 * ⛔ **La colonna COSTO non esiste, nemmeno nascosta.** Non è «spenta per
 * default»: non compare nel selettore colonne, quindi nessuno può accenderla.
 * Il costo d'acquisto al banco non ha ragione di stare davanti a chi batte gli
 * scontrini — spesso davanti al cliente.
 *
 * ⚠️ **Per questo la configurazione è PROPRIA e non ereditata.** Riusare quella
 * dell'Arrivo merce o dell'Ordine cliente e poi spegnere il costo lo lascerebbe
 * raggiungibile dal selettore: la sola via per non offrirlo è non dichiararlo.
 *
 * ⛔ **Propria è la LISTA, non l'implementazione**: le celle e le primitive
 * restano quelle condivise (`document-line-*-cell`, `TableColumnDef`,
 * `TableViewPresetMap`). Qui si dichiara *cosa* si mostra, non *come*.
 *
 * Le larghezze seguono il contenuto, come nelle altre viste: l'IVA porta due
 * cifre e non ha bisogno di più di 72px, lo SKU deve respirare.
 */
export const STORE_SALE_LINE_COLUMNS: readonly TableColumnDef[] = [
  // ⭐ Visibile di DEFAULT: la ricerca del banco lavora per barcode, SKU o nome,
  // e lo SKU sulla riga fa verificare a colpo d'occhio di aver preso la
  // variante giusta — con taglie e colori è l'errore più facile da fare.
  //
  // ⚠️ Sta PRIMA di Articolo perché quello è l'ordine delle celle nella riga
  // condivisa (`document-line-row`): l'elenco segue le celle, non viceversa.
  { id: 'sku', label: 'SKU', defaultWidthPx: 104, minWidthPx: 64 },
  // ⛔ **Identica agli altri cinque documenti**, larghezze comprese. Qui era nata
  // `defaultVisible: false` con larghezze proprie: una terza forma che nessun
  // altro documento ha, decisa senza guardare come si comportano gli altri.
  // L'EAN si vede di default ovunque, e al banco non fa eccezione.
  { id: 'barcode', label: 'EAN', defaultWidthPx: 124, minWidthPx: 72 },
  { id: 'product', label: 'Articolo', defaultWidthPx: 280, minWidthPx: 160 },
  // La VARIANTE accanto al nome. Al banco serve piu' che altrove: la taglia e'
  // la prima cosa che si controlla passando il capo, e fino a ieri viveva
  // dentro il nome perche' il client scriveva `summary.title` — il display
  // completo — mentre il server salvava il solo nome.
  { id: 'variantLabel', label: 'Variante', defaultWidthPx: 120, minWidthPx: 80 },
  { id: 'quantity', label: 'Q.tà', numeric: true, defaultWidthPx: 80, minWidthPx: 56 },
  { id: 'unitPrice', label: 'Prezzo', numeric: true, defaultWidthPx: 112, minWidthPx: 80 },
  { id: 'discount', label: 'Sconto', numeric: true, defaultWidthPx: 88, minWidthPx: 64 },
  { id: 'vat', label: 'IVA', defaultWidthPx: 72, minWidthPx: 56 },
  { id: 'lineTotal', label: 'Totale', numeric: true, defaultWidthPx: 112, minWidthPx: 80 },
  // ⛔ **Queste due il banco le RENDEVA senza dichiararle**, e la conseguenza si
  // misurava: la testata mostrava dodici colonne mentre il catalogo ne
  // dichiarava nove, quindi le quote percentuali erano calcolate su un totale
  // che non le comprendeva e sommavano **116,84%**. Con `table-layout: fixed`
  // il browser riscala tutto per farcelo stare: ogni colonna rendeva il 14% più
  // stretta di quanto dichiarava, e nessun minimo proteggeva niente.
  //
  // ⭐ Dichiararle le allinea anche all'Ordine cliente, che è il riferimento:
  // là stanno nel catalogo e nel selettore Colonne come tutte le altre.
  { id: 'commitsStock', label: 'Scarica giacenze', defaultWidthPx: 96, minWidthPx: 72 },
  { id: 'actions', label: 'Azioni', defaultWidthPx: 96, minWidthPx: 56 },
];

/**
 * Un preset solo, ed è quello predefinito.
 *
 * ⚠️ Le altre viste ne hanno tre o quattro (Magazzino, Contabile…) perché hanno
 * colonne che a un ruolo servono e a un altro no. Qui le colonne sono sette e
 * **servono tutte a chi sta al banco**: presetti diversi darebbero all'operatore
 * una scelta senza contenuto.
 */
const TUTTE = STORE_SALE_LINE_COLUMNS.map((column) => column.id);

export const STORE_SALE_LINE_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: TUTTE,
  // ⚠️ La mappa è esaustiva per tipo — un preset nuovo non compila finché ogni
  // vista non gli ha dato un contenuto. Qui gli altri cinque puntano tutti alle
  // stesse sette colonne, e non è pigrizia: al banco servono tutte a chiunque,
  // e offrire viste che non tolgono niente sarebbe una scelta senza contenuto.
  [PresetId.Warehouse]: TUTTE,
  [PresetId.Accountant]: TUTTE,
  [PresetId.Supplier]: TUTTE,
  [PresetId.Analysis]: TUTTE,
  [PresetId.Operational]: TUTTE,
};
