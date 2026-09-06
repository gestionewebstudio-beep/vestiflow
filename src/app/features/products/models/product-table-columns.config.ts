import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

/*
  ⭐ **UNA SOLA colonna resta senza larghezza, ed è il NOME.**

  Con `table-layout: fixed` le colonne non dichiarate **si dividono in parti
  uguali** lo spazio che avanza. Non è un peso proporzionale: è una divisione
  secca.

  ⛔ **Prima erano tutte tranne «Varianti»**, e il risultato si vedeva subito: il
  nome del prodotto — il dato per cui si guarda l'elenco — era largo quanto
  «Stato» e «Origine», e veniva tagliato a metà mentre quelle avevano spazio da
  buttare. Segnalato dal proprietario il 30/08/2026: «la colonna del nome ha
  problemi di impaginazione».

  ⭐ **Dichiarare le ALTRE è il modo di dare peso al nome.** Ogni larghezza scritta
  qui è spazio che smette di essere conteso, e il residuo va tutto a chi non la
  dichiara. Per questo il nome non ne ha e non deve averne: prende quello che
  avanza, e cresce con la finestra.

  ⛔ **E vanno tarate sul CONTENUTO, non sull'intestazione** — corretto il
  30/08/2026, dopo che il proprietario ha segnalato due volte il nome tagliato.
  Le prime misure erano generose: 96px per «Stagione», che mostra un trattino, e
  120 per «Shopify». Sommavano 818px su una tabella da ~1020, e al nome restavano
  ~160 — cioè la colonna più importante era la più stretta, di nuovo.

      prima   150+160+96+92+96+104+120 = 818   →   al nome ~160
      ora     130+130+70+70+76+80+100  = 656   →   al nome ~320

  ⚠️ **I numeri non sono definitivi**: l'operatore li cambia trascinando la
  maniglia, e `14` §G1 dice che la modifica **non si conserva** — è un
  aggiustamento del momento, non una preferenza.
*/
export const PRODUCT_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'select', label: 'Selezione', defaultVisible: true, filter: false },
  // Identificatore anagrafico interno (§Codice articolo): colonna disponibile
  // nella selezione colonne, non mostrata di default.
  colonna('articleCode', { defaultVisible: false, defaultWidthPx: 110 }),
  /*
    ⚠️ **Nessuna di queste dichiara `display: 'truncate'`, ed è voluto.** Dal
    30/08/2026 il taglio a colonna è della grammatica degli elenchi
    (`summary-grammar`): vale per OGNI cella di OGNI elenco, non per le colonne
    che se lo ricordano. Dichiararlo qui rimetterebbe un `max-inline-size` a
    concorrere con la larghezza della colonna, cioè due misure per la stessa cosa.
  */
  { id: 'name', label: 'Nome', pinnable: true, defaultVisible: true, cardTitle: true },
  { id: 'brand', label: 'Venditore/Brand', defaultVisible: true, defaultWidthPx: 130 },
  colonna('category', { defaultVisible: true, defaultWidthPx: 130 }),
  { id: 'season', label: 'Stagione', defaultVisible: true, defaultWidthPx: 70 },
  { id: 'variants', label: 'Varianti', numeric: true, defaultVisible: true, defaultWidthPx: 70 },
  /*
    ⭐ **Il PREZZO, acceso di serie** — chiesto dal proprietario il 31/08/2026:
    «i dati non sono coerenti con l'esigenza che può avere questa pagina».

    Un catalogo operativo si consulta per sapere quanto costa una cosa, e il
    prezzo non c'era in nessuna colonna: c'erano brand, categoria, stagione,
    stato, origine e Shopify — sei colonne di classificazione e nessun numero.

    ⚠️ **È il prezzo del PRODOTTO**, non della variante: l'elenco è di prodotti, e
    dove le varianti divergono la cella lo dichiara invece di scegliere per conto
    proprio (vedi `cellText`).
  */
  { id: 'sellingPrice', label: 'Prezzo', numeric: true, defaultVisible: true, defaultWidthPx: 92 },
  colonna('status', { defaultVisible: true, defaultWidthPx: 76 }),
  colonna('source', { defaultVisible: true, defaultWidthPx: 80 }),
  { id: 'shopify', label: 'Shopify', defaultVisible: true, defaultWidthPx: 100 },
];

export const PRODUCT_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: [
    'select',
    'name',
    'brand',
    'category',
    'season',
    'variants',
    'sellingPrice',
    'status',
    'source',
    'shopify',
  ],
  [PresetId.Warehouse]: ['select', 'name', 'category', 'variants', 'sellingPrice', 'status'],
  [PresetId.Accountant]: ['name', 'brand', 'category', 'status'],
  [PresetId.Supplier]: ['name', 'brand', 'category', 'variants', 'status'],
  [PresetId.Analysis]: ['name', 'brand', 'category', 'season', 'variants', 'status'],
  [PresetId.Operational]: ['select', 'name', 'brand', 'variants', 'sellingPrice', 'status'],
};

export const PRODUCT_LIST_VIEW = TableViewId.ProductsList;
