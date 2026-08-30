/** Identificativi viste tabellari con preferenze colonne (Step 5). */
export const TableViewId = {
  StockMovements: 'stock_movements',
  InventoryLevels: 'inventory_levels',
  InventorySituation: 'inventory_situation',
  DocumentsList: 'documents_list',
  GoodsReceiptDocumentsList: 'goods_receipt_documents_list',
  QuoteDocumentsList: 'quote_documents_list',
  ProformaDocumentsList: 'proforma_documents_list',
  SalesDdtDocumentsList: 'sales_ddt_documents_list',
  ManualUnloadDocumentsList: 'manual_unload_documents_list',
  InvoiceDraftDocumentsList: 'invoice_draft_documents_list',
  PurchaseInvoiceDocumentsList: 'purchase_invoice_documents_list',
  StoreSaleDocumentsList: 'store_sale_documents_list',
  SuppliersList: 'suppliers_list',
  GoodsReceiptLines: 'goods_receipt_lines',
  SupplierOrderLines: 'supplier_order_lines',
  CustomerOrderLines: 'customer_order_lines',
  QuoteLines: 'quote_lines',
  SalesDdtLines: 'sales_ddt_lines',
  ManualUnloadLines: 'manual_unload_lines',
  // I due movimenti di magazzino hanno la stessa riga, ma vista propria per
  // ciascuno: chi allarga una colonna nel Trasferimento non se la ritrova
  // allargata nella Rettifica, che è un'altra schermata.
  TransferLines: 'transfer_lines',
  StockAdjustmentLines: 'stock_adjustment_lines',
  // Proforma, Fattura e Fattura accompagnatoria condividono una vista sola:
  // sono la stessa maschera con le stesse colonne, e l'unica che cambia
  // («Scarica mag.») è già condizionata al tipo nel template.
  SalesDocumentLines: 'sales_document_lines',
  // Vendita e Reso al banco condividono la vista: sono la stessa maschera, e
  // le poche colonne essenziali sono le stesse per entrambi.
  StoreSaleLines: 'store_sale_lines',
  ProductsList: 'products_list',
  CustomersList: 'customers_list',
  SalesOrdersList: 'sales_orders_list',
  ShopifyOrdersList: 'shopify_orders_list',
  // ⭐ Aggiunte il 30/08/2026: erano i **due soli elenchi senza selettore
  //    Colonne**, con le colonne cablate nel componente. Il proprietario le ha
  //    volute allineate — «dobbiamo avere il tasto delle colonne, che in alcuni
  //    riepiloghi è sparito, e che siano attivabili».
  SupplierOrdersList: 'supplier_orders_list',
  OnlineSalesList: 'online_sales_list',
  // Registro Corrispettivi: Cliente, Email, Pagamento e Nota vivono qui, spente
  // di serie. Non sono state rimosse — si riaccendono dal selettore Colonne.
  CorrispettiviRegister: 'corrispettivi_register',
} as const;
export type TableViewId = (typeof TableViewId)[keyof typeof TableViewId];

/** Viste salvate predefinite (§7.1 piano funzionale). */
export const TableViewPresetId = {
  Default: 'default',
  Warehouse: 'warehouse',
  Accountant: 'accountant',
  Supplier: 'supplier',
  Analysis: 'analysis',
  Operational: 'operational',
} as const;
export type TableViewPresetId = (typeof TableViewPresetId)[keyof typeof TableViewPresetId];

export const TABLE_VIEW_PRESET_LABELS: Record<TableViewPresetId, string> = {
  [TableViewPresetId.Default]: 'Default',
  [TableViewPresetId.Warehouse]: 'Magazzino',
  [TableViewPresetId.Accountant]: 'Commercialista',
  [TableViewPresetId.Supplier]: 'Fornitore',
  [TableViewPresetId.Analysis]: 'Analisi',
  [TableViewPresetId.Operational]: 'Operativa',
};

/**
 * ⭐ **La forma del filtro di una colonna** (`14` §11.1).
 *
 * I filtri di un elenco non si dichiarano a parte: **sono le sue colonne**
 * (`14` §0.2). Questa è l'unica cosa che una colonna deve dire in più — come
 * si filtra il suo contenuto, non se è filtrabile.
 *
 * - `values` — insieme di valori distinti, a selezione multipla. È la forma
 *   del benchmark Danea e quella dei Corrispettivi: Stato, Pagamento, Sede,
 *   Cliente. I valori si leggono dall'insieme caricato, non da un endpoint.
 * - `text` — testo libero: contiene / non contiene. Commenti, riferimenti.
 * - `range` — da–a su numeri, denaro e date. Totali, quantità.
 */
export type TableColumnFilterKind = 'values' | 'text' | 'range';

export interface TableColumnDef {
  readonly id: string;
  readonly label: string;
  /** Spiegazione mostrata al passaggio del mouse su un'intestazione abbreviata. */
  readonly headerTooltip?: string;
  /**
   * **Solo PRESENTAZIONE**: allinea a destra e usa `tabular-nums` (classe
   * `--numeric` in tabella, `class="num"` negli export). Non descrive il tipo
   * del dato, non valida, non formatta il valore.
   *
   * ⛔ **Digitare numeri per cercare non rende il dato numerico** (deciso dal
   * proprietario il 22/08/2026). Il Codice IVA si scrive `22`, `22r`, `10sp`:
   * è alfanumerico, quindi `numeric: false` — e resta vero che nella sua cella
   * si digitano cifre per filtrare i codici, perché quella è la ricerca a
   * precedenza-codice della cella, non il tipo della colonna.
   *
   * ⚠️ Era l'unica proprietà di questo modello senza spiegazione, ed è la causa
   * radice di una divergenza vera: la colonna IVA era `numeric: true` in tre
   * documenti e `false` in due.
   */
  readonly numeric?: boolean;

  /**
   * ⭐ **La colonna si SOMMA nella riga totali** — e la risposta di serie è sì
   * per ogni colonna `numeric`.
   *
   * _Deciso dal proprietario il 30/08/2026, sul riferimento Danea: «quando
   * attivi una colonna contabile ti mostra il totale di quella», e «anche la
   * somma della colonna righe: se sono selezionate tre allora esce 3»._
   *
   * ⛔ **È un opt-OUT, come i filtri di colonna** (`14` §0.2): una colonna
   * numerica nuova entra nei totali senza che nessuno se ne ricordi. Chi non
   * deve sommarsi lo dichiara — `summable: false` — ed è il caso delle
   * **percentuali e dei valori unitari**: sommare un'aliquota o un prezzo
   * unitario dà un numero che non risponde a nessuna domanda.
   *
   * ⚠️ **Non basta `numeric` da sola**, e la ragione sta scritta sopra:
   * `numeric` dice «allinea a destra», non «è una quantità». Ma su una colonna
   * di elenco le due cose coincidono quasi sempre, e partire dal sì evita
   * l'elenco di annotazioni che nessuno tiene aggiornato.
   *
   * ⭐ **Il totale segue la COLONNA, non una configurazione a parte**: se
   * l'imponibile è spento dal selettore Colonne, la sua somma non compare. È
   * anche il modo in cui un titolare che non vuole mostrare gli importi li
   * toglie — una decisione sola invece di due che possono contraddirsi.
   */
  readonly summable?: boolean;

  /** Colonna visibile di default se nessuna preferenza salvata. */
  readonly defaultVisible?: boolean;
  readonly pinnable?: boolean;
  /** Larghezza iniziale in px (griglia editabile). */
  readonly defaultWidthPx?: number;
  readonly minWidthPx?: number;
  /**
   * Capacità della colonna nel **motore dei riepiloghi** (`14` §H2).
   *
   * ⚠️ **Opt-out, non opt-in**: una colonna nasce ordinabile e ridimensionabile,
   * e dichiara solo ciò che non deve essere. Il difetto da evitare è la colonna
   * che «si è dimenticata» di essere ordinabile, che nessuno nota.
   *
   * ⚠️ `sortable` conta solo dove la PAGINA accende l'ordinamento: un elenco la
   * cui API non sa ordinare non deve marcare `false` ogni colonna — semplicemente
   * non lo accende.
   */
  readonly sortable?: boolean;
  readonly resizable?: boolean;

  /**
   * Come si VESTE la cella — non che cosa contiene.
   *
   * ⭐ Esiste perchè tre riepiloghi ripetevano le stesse due ricette
   * tipografiche: `regole-stile-ui` §6 le prescrive per tutta l’app, quindi
   * non erano della pagina. Alla terza ripetizione sono salite qui.
   *
   * ⚠️ **Non è il campo `type` che `14` §H2 ha rifiutato.** Quello descriveva
   * COME CONFRONTARE il valore e serviva a un comparatore che allora non
   * esisteva; questo descrive come si rende, e non ha niente a che vedere con
   * l’ordinamento. Una cella può essere `code` e ordinarsi come data.
   *
   * - `code` — codici, riferimenti, numeri di documento: cifre incolonnate
   *   (`tabular-nums`) e mai a capo. È la ricetta di §6 per SKU ed EAN.
   * - `truncate` — descrizioni lunghe: ellissi oltre la larghezza della cella,
   *   col testo intero nel `title`. Senza, una riga si alza e la tabella balla.
   *
   * L’allineamento a destra resta di `numeric`: sono due cose diverse, e una
   * colonna può avere entrambe.
   */
  readonly display?: 'code' | 'truncate';

  /**
   * Come si filtra questa colonna — `false` per non filtrarla affatto.
   *
   * ⚠️ **Opt-out, non opt-in**, come `sortable` qui sopra e per la stessa
   * ragione: il difetto da evitare è la colonna che «si è dimenticata» di
   * essere filtrabile, che nessuno nota finché non serve. Omesso, il motore
   * deduce la forma da `numeric` e `display` — vedi
   * `resolveColumnFilterKind`.
   *
   * ⛔ **Non c'è il vincolo che rende `sortable` una whitelist lato pagina**:
   * là serve che il SERVER sappia ordinare, qui il filtro legge l'insieme già
   * caricato (`14` §11.4, nessun elenco impagina).
   */
  readonly filter?: TableColumnFilterKind | false;
}

export interface TableViewState {
  readonly presetId: TableViewPresetId | 'custom';
  readonly columnOrder: readonly string[];
  readonly hiddenColumnIds: readonly string[];
  readonly pinnedColumnIds: readonly string[];
  readonly columnWidths: Readonly<Record<string, number>>;
}

export type TableViewPresetMap = Record<TableViewPresetId, readonly string[]>;

export interface ResolvedTableColumn extends TableColumnDef {
  readonly pinned: boolean;
}
