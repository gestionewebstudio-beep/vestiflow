import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/**
 * Le colonne che una riga documento può avere. **L'elenco è uno solo**: una
 * maschera non ne inventa una propria — sceglie quali mostrare.
 *
 * ⛔ È il perno della decisione del 22/08/2026 (`11` A15): Ordine cliente,
 * Vendita e Reso al banco usano la STESSA riga, e le differenze si ottengono
 * **per colonna**, non per implementazione parallela.
 */
export const DOCUMENT_LINE_COLUMNS = [
  'articleCode',
  'sku',
  'barcode',
  // La quarta chiave d'identità, dove esiste un fornitore: Arrivo merce e
  // Ordine fornitore. Su una vendita non ha significato — il documento
  // semplicemente non la dichiara.
  'supplierCode',
  'product',
  // La VARIANTE accanto al nome, non dentro: «M / Rosso».
  //
  // ⭐ Sta QUI, nell'elenco comune, e non nel config di una maschera: la
  // rendono la riga e l'intestazione condivise, quindi Ordine cliente e
  // Vendita al banco la ricevono insieme. È esattamente il perno che il
  // commento qui sopra descrive — le differenze si ottengono per colonna.
  'variantLabel',
  // ⛔ **`description` non è `product`.** Il nome è ciò che l'articolo È — e
  // arriva dall'anagrafica; la descrizione è ciò che l'operatore scrive su
  // QUESTA riga, e su un arrivo merce serve a dire «seconda scelta», «campione
  // omaggio», «reso da riparazione». Oggi la mostra solo l'Arrivo merce.
  'description',
  'quantity',
  // ⛔ Due domande DIVERSE sulla giacenza, e l'Ordine fornitore le mostra
  // entrambe: comprando si guarda quanta merce c'è, vendendo quanta se ne può
  // promettere.
  // ⭐ Le tre dell'ORDINE COLLEGATO, in sola lettura: quanto era stato
  // ordinato, quanto è già arrivato, quanto manca. Esistono solo dove un
  // arrivo è agganciato a un ordine fornitore, e sono la ragione per cui chi
  // riceve la merce sa se sta chiudendo la fornitura o solo una parte.
  'poOrdered',
  'poReceived',
  'poRemaining',
  'stockOnHand',
  'stockAvailable',
  'unitOfMeasure',
  // ⛔ **`purchaseCost` e `unitCost` NON sono la stessa colonna.**
  //
  //   purchaseCost   il costo d'ANAGRAFICA, in sola lettura: sull'Ordine
  //                  cliente serve a leggere il margine
  //   unitCost       il costo DIGITATO sul documento, che si scrive e si
  //                  salva: è il campo centrale di un acquisto
  //
  // Condividono la forma — un importo — e non l'identità.
  'purchaseCost',
  'unitCost',
  'discountedCost',
  // ⛔ E `sellingPrice` non è `unitPrice`: il primo è il prezzo di vendita
  // del CATALOGO, che l'Arrivo merce mostra per poterlo riscrivere in
  // anagrafica; il secondo è il prezzo applicato a QUESTA riga. Un documento
  // può mostrarli insieme, e vogliono dire due cose diverse.
  'sellingPrice',
  'shopifyPrice',
  'compareAtPrice',
  'unitPrice',
  'discount',
  'discountedPrice',
  'vat',
  // ⭐ Lotto e scadenza nascono quando la merce ENTRA: ordinandola non
  // esistono ancora, vendendola sono già state decise. Stanno accanto ai
  // seriali perché è la stessa famiglia — l'identità del singolo pezzo.
  'lot',
  'expiry',
  'serials',
  'commitsStock',
  // ⛔ **`loadsStock` NON è `commitsStock`**, e condividere la cella non
  // autorizza a condividere l'id: il catalogo rappresenta il SIGNIFICATO della
  // colonna, non il componente che la disegna.
  //
  //   commitsStock   «impegna» — la merce resta, ma è promessa a qualcuno
  //   loadsStock     «carica» o «scarica» — la merce si muove davvero
  //
  // Sono due domande diverse, e un documento può avere l'una senza l'altra: un
  // ordine cliente impegna e non muove, un DDT muove e non impegna. Fonderle
  // renderebbe impossibile un documento che le mostri entrambe.
  'loadsStock',
  'lineTotal',
  'actions',
] as const;

export type DocumentLineColumnId = (typeof DOCUMENT_LINE_COLUMNS)[number];

/** I campi che il giro del fuoco attraversa: il nome viaggia con l'evento. */
export type DocumentLineFocusField =
  | 'articleCode'
  | 'sku'
  | 'barcode'
  | 'supplierCode'
  | 'product'
  | 'quantity'
  | 'unitOfMeasure'
  | 'unitPrice'
  | 'discount'
  | 'unitCost'
  | 'vat'
  // Le sei che il catalogo ha appena guadagnato. Il giro del fuoco deve
  // attraversare OGNI cella editabile: una colonna che si vede ma che il Tab
  // salta e' peggio di una colonna assente — l'operatore la trova col mouse e
  // poi non sa come uscirne.
  | 'description'
  | 'sellingPrice'
  | 'shopifyPrice'
  | 'compareAtPrice'
  | 'lot'
  | 'expiry'
  | 'serials';

/** Le tre celle codice, che condividono contratto e comportamento. */
export type DocumentLineCodeField = 'articleCode' | 'sku' | 'barcode' | 'supplierCode';

/**
 * Lo stato del pannello suggerimenti di UNA cella. La riga non lo calcola e non
 * lo possiede: lo riceve e lo rende.
 */
export interface DocumentLineCellSuggest {
  readonly items: readonly VariantSummary[];
  readonly open: boolean;
  readonly activeIndex: number;
}

export const NESSUN_SUGGERIMENTO: DocumentLineCellSuggest = {
  items: [],
  open: false,
  activeIndex: 0,
};

/**
 * Tutto ciò che la riga **mostra e non calcola**.
 *
 * ⭐ È qui che passa il confine fra riga comune e dominio: la riga rende
 * `stockAvailable`, `commitsStock` o l'impegnata come rende qualunque altra
 * colonna — ciò che resta fuori è **il significato**: chi decide se una spunta
 * impegna, scarica o carica, e chi calcola il totale, è la maschera.
 */
export interface DocumentLineRowView {
  /**
   * Riga di RIFERIMENTO a un documento collegato (`07` §12): niente quantità,
   * niente prezzi — una fascia unica col titolo modificabile.
   */
  readonly isReference: boolean;
  /** Riga incompleta: la classe che la segna è la stessa di ogni maschera. */
  readonly complete: boolean;
  /** L'articolo è agganciato all'anagrafica: le celle codice lo dicono. */
  readonly linked: boolean;
  readonly linkedArticleCode: string;

  readonly quantityInvalid: boolean;
  readonly productInvalid: boolean;
  readonly exceedsAvailability: boolean;
  /** Avviso di disponibilità, mai blocco: `null` = nessun avviso. */
  readonly availabilityHint: string | null;

  /** Valori CALCOLATI, già formattati da chi li possiede. */
  /**
   * Le tre dell'ordine collegato, **già formattate**: sono in sola lettura per
   * definizione — le calcola il documento confrontando ordinato e ricevuto.
   * Vuote dove non c'è un ordine agganciato.
   */
  readonly poOrdered: string;
  readonly poReceived: string;
  readonly poRemaining: string;
  readonly stockOnHand: string;
  readonly stockAvailable: string;
  readonly purchaseCost: string;
  /** Il costo di riga dopo lo sconto, calcolato dal documento. */
  readonly discountedCost: string;
  /**
   * I tre prezzi d'anagrafica, **già formattati**, per i documenti che li
   * mostrano senza poterli scrivere. Chi li scrive ha i controlli e questi
   * campi non li guarda.
   */
  readonly sellingPrice: string;
  readonly shopifyPrice: string;
  readonly compareAtPrice: string;
  readonly discountedPrice: string;
  readonly lineTotal: string;
  /** Totale prima dello sconto; `null` = nessuno sconto, non si mostra. */
  readonly grossTotal: string | null;

  readonly vatOptions: readonly SelectMenuOption[];
  readonly vatValue: string;
  readonly vatTooltip: string;

  readonly unitValue: string;

  /** Pannelli suggerimenti delle tre celle codice e della cella prodotto. */
  readonly articleCodeSuggest: DocumentLineCellSuggest;
  readonly skuSuggest: DocumentLineCellSuggest;
  readonly barcodeSuggest: DocumentLineCellSuggest;
  /** La quarta cella codice, dove il documento ha un fornitore. */
  readonly supplierCodeSuggest: DocumentLineCellSuggest;
  readonly productSuggest: DocumentLineCellSuggest;
}

/** Riga vuota: comoda a chi ha poche colonne e non calcola il resto. */
export const DOCUMENT_LINE_ROW_VIEW_VUOTA: DocumentLineRowView = {
  isReference: false,
  complete: true,
  linked: false,
  linkedArticleCode: '',
  quantityInvalid: false,
  productInvalid: false,
  exceedsAvailability: false,
  availabilityHint: null,
  poOrdered: '',
  poReceived: '',
  poRemaining: '',
  stockOnHand: '',
  stockAvailable: '',
  purchaseCost: '',
  discountedCost: '',
  sellingPrice: '',
  shopifyPrice: '',
  compareAtPrice: '',
  discountedPrice: '',
  lineTotal: '',
  grossTotal: null,
  vatOptions: [],
  vatValue: '',
  vatTooltip: '',
  unitValue: '',
  articleCodeSuggest: NESSUN_SUGGERIMENTO,
  skuSuggest: NESSUN_SUGGERIMENTO,
  barcodeSuggest: NESSUN_SUGGERIMENTO,
  supplierCodeSuggest: NESSUN_SUGGERIMENTO,
  productSuggest: NESSUN_SUGGERIMENTO,
};

/** Un evento di cella che porta con sé il campo da cui è partito. */
export interface DocumentLineFieldEvent<T> {
  readonly field: DocumentLineFocusField;
  readonly value: T;
}

/** La direzione con cui si scorre l'elenco dei suggerimenti. */
export type DocumentLineSuggestionDirection = 'next' | 'prev';

/** La presa d'atto di un suggerimento scelto. */
export interface DocumentLineSuggestionPick {
  readonly field: DocumentLineFocusField;
  readonly variantId: string;
}
