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
  'product',
  // La VARIANTE accanto al nome, non dentro: «M / Rosso».
  //
  // ⭐ Sta QUI, nell'elenco comune, e non nel config di una maschera: la
  // rendono la riga e l'intestazione condivise, quindi Ordine cliente e
  // Vendita al banco la ricevono insieme. È esattamente il perno che il
  // commento qui sopra descrive — le differenze si ottengono per colonna.
  'variantLabel',
  'quantity',
  'stockAvailable',
  'unitOfMeasure',
  'purchaseCost',
  'unitPrice',
  'discount',
  'discountedPrice',
  'vat',
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
  | 'product'
  | 'quantity'
  | 'unitOfMeasure'
  | 'unitPrice'
  | 'discount'
  | 'vat'
  | 'serials';

/** Le tre celle codice, che condividono contratto e comportamento. */
export type DocumentLineCodeField = 'articleCode' | 'sku' | 'barcode';

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
  readonly stockAvailable: string;
  readonly purchaseCost: string;
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
  stockAvailable: '',
  purchaseCost: '',
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
