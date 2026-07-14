/**
 * Stati logici delle righe dell'Arrivo merce (specifica §5):
 * la classificazione decide cosa è persistibile e quando.
 *
 * - EMPTY_UI: riga di comodo dell'interfaccia, mai persistita.
 * - SEARCHING: query di ricerca contestuale in corso, mai persistita.
 * - CREATE_NEW_EXPLICIT: l'utente ha chiesto "Crea nuovo articolo".
 * - PARTIAL: dati significativi ma nessun articolo collegato.
 * - VALID_NO_STOCK / VALID_LOAD_STOCK: riga completa, con o senza carico.
 */
export const GoodsReceiptLineState = {
  EmptyUi: 'empty_ui',
  Searching: 'searching',
  CreateNewExplicit: 'create_new_explicit',
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
  readonly createNew?: boolean;
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
  if (draft.createNew) {
    return GoodsReceiptLineState.CreateNewExplicit;
  }
  if (lineDraftIsEmpty(draft)) {
    return GoodsReceiptLineState.EmptyUi;
  }
  if (options?.searchActive) {
    return GoodsReceiptLineState.Searching;
  }
  return GoodsReceiptLineState.Partial;
}

/**
 * Query di ricerca contestuale: solo testo nel campo nome, nessun articolo
 * collegato, nessuna riga persistita, nessuna creazione esplicita. Non deve
 * MAI essere persistita come riga documento (§6/§7).
 */
export function lineDraftIsSearchQueryOnly(draft: GoodsReceiptLineDraft): boolean {
  if (draft.variantId || draft.id || draft.createNew) {
    return false;
  }
  if (!draft.productName.trim()) {
    return false;
  }
  return !(
    draft.sku?.trim() ||
    draft.barcode?.trim() ||
    draft.unitCost?.trim() ||
    draft.sellingPrice?.trim() ||
    draft.compareAtPrice?.trim() ||
    draft.vatRatePercent?.trim()
  );
}

/**
 * Nome sufficiente per la creazione esplicita dell'articolo dalla riga
 * (punto A): il solo nome basta, lo SKU è facoltativo (specifica §SKU).
 */
export function lineDraftHasCreatableName(draft: GoodsReceiptLineDraft): boolean {
  return draft.productName.trim().length >= 2;
}

/**
 * Persistibilità al salvataggio esplicito ("Salva documento" / uscita /
 * Invio-aggiungi riga): righe con articolo e quantità, righe in creazione
 * esplicita con nome valido (anche a quantità 0: creano la sola anagrafica,
 * punto A), oppure righe parziali con dati significativi oltre il solo nome
 * (persistite come righe economiche senza movimento, specifica §5/§13).
 * Le query di ricerca sono sempre escluse.
 */
export function lineDraftPersistableForExplicitSave(draft: GoodsReceiptLineDraft): boolean {
  const qty = draftQuantity(draft);
  if (draft.variantId) {
    return qty > 0;
  }
  if (draft.createNew && lineDraftHasCreatableName(draft)) {
    return true;
  }
  if (qty <= 0) {
    return false;
  }
  if (lineDraftIsSearchQueryOnly(draft)) {
    return false;
  }
  return lineDraftHasSignificantData(draft);
}

/**
 * Persistibilità in autosave passivo (debounce): SOLO righe con articolo
 * collegato oppure righe già persistite (id assegnato dal server). Le righe
 * in creazione esplicita (createNew) NON si auto-persistono mai: l'articolo
 * nasce solo sui gesti espliciti — Invio/aggiungi riga, Salva documento,
 * Salva e chiudi (punto C). Le righe già persistite restano nel payload
 * finché sono ancora persistibili (ometterle le cancellerebbe sul server).
 */
export function lineDraftPersistableForAutoSave(draft: GoodsReceiptLineDraft): boolean {
  if (!draft.variantId && !draft.id) {
    return false;
  }
  return lineDraftPersistableForExplicitSave(draft);
}
