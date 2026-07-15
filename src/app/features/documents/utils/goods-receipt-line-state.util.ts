/**
 * Stati logici delle righe dell'Arrivo merce (specifica §5):
 * la classificazione decide cosa è persistibile e quando.
 *
 * - EMPTY_UI: riga di comodo dell'interfaccia, mai persistita.
 * - SEARCHING: query di ricerca contestuale in corso, mai persistita.
 * - CREATE_NEW: nome digitato senza articolo collegato — al salvataggio
 *   crea l'articolo (creazione implicita: nessun gesto dedicato).
 * - PARTIAL: dati significativi ma nessun articolo collegato né nome valido.
 * - VALID_NO_STOCK / VALID_LOAD_STOCK: riga completa, con o senza carico.
 */
export const GoodsReceiptLineState = {
  EmptyUi: 'empty_ui',
  Searching: 'searching',
  CreateNew: 'create_new',
  Partial: 'partial',
  ValidNoStock: 'valid_no_stock',
  ValidLoadStock: 'valid_load_stock',
} as const;

export type GoodsReceiptLineState =
  (typeof GoodsReceiptLineState)[keyof typeof GoodsReceiptLineState];

/** Valore grezzo di una riga del form Arrivo merce (subset rilevante). */
export interface GoodsReceiptLineDraft {
  readonly id?: string;
  readonly variantId: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly productName: string;
  readonly description?: string;
  readonly quantity: number | string;
  readonly unitCost?: string;
  readonly sellingPrice?: string;
  readonly compareAtPrice?: string;
  readonly vatRatePercent?: string;
  readonly loadsStock?: boolean;
}

function draftQuantity(draft: GoodsReceiptLineDraft): number {
  const qty = Number(draft.quantity);
  return Number.isFinite(qty) ? qty : 0;
}

/** Riga vuota di UI: nessun dato identificativo o economico digitato. */
export function lineDraftIsEmpty(draft: GoodsReceiptLineDraft): boolean {
  return (
    !draft.variantId &&
    !draft.sku?.trim() &&
    !draft.barcode?.trim() &&
    !draft.productName.trim() &&
    !draft.unitCost?.trim() &&
    !draft.sellingPrice?.trim() &&
    !draft.compareAtPrice?.trim()
  );
}

/** Dati "significativi": qualcosa oltre i default della riga di comodo. */
export function lineDraftHasSignificantData(draft: GoodsReceiptLineDraft): boolean {
  return Boolean(
    draft.sku?.trim() ||
    draft.barcode?.trim() ||
    draft.productName.trim() ||
    draft.unitCost?.trim() ||
    draft.sellingPrice?.trim() ||
    draft.compareAtPrice?.trim() ||
    draft.vatRatePercent?.trim(),
  );
}

/**
 * Stato logico della riga. `searchActive` indica che la ricerca contestuale
 * (autocomplete nome o lookup SKU/EAN) è aperta su questa riga.
 */
export function resolveGoodsReceiptLineState(
  draft: GoodsReceiptLineDraft,
  options?: { readonly searchActive?: boolean },
): GoodsReceiptLineState {
  if (draft.variantId) {
    if (draftQuantity(draft) <= 0) {
      return GoodsReceiptLineState.Partial;
    }
    return draft.loadsStock
      ? GoodsReceiptLineState.ValidLoadStock
      : GoodsReceiptLineState.ValidNoStock;
  }
  if (lineDraftIsEmpty(draft)) {
    return GoodsReceiptLineState.EmptyUi;
  }
  if (options?.searchActive) {
    return GoodsReceiptLineState.Searching;
  }
  if (lineDraftHasCreatableName(draft)) {
    return GoodsReceiptLineState.CreateNew;
  }
  return GoodsReceiptLineState.Partial;
}

/**
 * Nome sufficiente per la creazione dell'articolo dalla riga: il solo nome
 * basta, lo SKU è facoltativo (specifica §SKU). La creazione è implicita:
 * ogni riga non collegata con nome valido crea l'articolo al salvataggio.
 */
export function lineDraftHasCreatableName(draft: GoodsReceiptLineDraft): boolean {
  return draft.productName.trim().length >= 2;
}

/**
 * Persistibilità al salvataggio esplicito ("Salva documento" / uscita /
 * Invio-aggiungi riga): righe con articolo e quantità, righe non collegate
 * con nome valido (creazione implicita dell'articolo, anche a quantità 0:
 * creano la sola anagrafica), oppure righe parziali con dati significativi
 * (persistite come righe economiche senza movimento, specifica §5/§13).
 */
export function lineDraftPersistableForExplicitSave(draft: GoodsReceiptLineDraft): boolean {
  const qty = draftQuantity(draft);
  if (draft.variantId) {
    return qty > 0;
  }
  if (lineDraftHasCreatableName(draft)) {
    return true;
  }
  if (qty <= 0) {
    return false;
  }
  return lineDraftHasSignificantData(draft);
}
