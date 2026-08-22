import { DocumentType } from '@prisma/client';

/** Tipi documento che generano carichi di magazzino alla conferma (§2.1, §3). */
export const DOCUMENT_STOCK_LOAD_TYPES: readonly DocumentType[] = [
  DocumentType.goods_receipt,
  DocumentType.manual_load,
  DocumentType.initial_load,
] as const;

/** Tipi arrivo merce collegabili a una registrazione fattura (documenti fornitore). */
export const INVOICE_LINKABLE_RECEIPT_TYPES: readonly DocumentType[] = [
  DocumentType.goods_receipt,
] as const;

/**
 * Tipi documento che generano scarichi di magazzino alla conferma (§2, §5).
 *
 * La Fattura accompagnatoria è l'unico tipo condizionale dell'elenco: scarica
 * SOLO se non ha DDT agganciati, perché con un DDT le giacenze sono già scese.
 * La condizione non è esprimibile qui (dipende dai link del singolo
 * documento): la verifica vive in `invoiceAccompanyingUnloadsStock`.
 */
export const DOCUMENT_STOCK_UNLOAD_TYPES: readonly DocumentType[] = [
  DocumentType.sales_ddt,
  DocumentType.manual_unload,
  DocumentType.invoice_accompanying,
] as const;

/**
 * Fattura accompagnatoria: lo scarico avviene solo **senza DDT agganciato**.
 * Con almeno un DDT la merce è già uscita, e un secondo scarico la porterebbe
 * in negativo per la stessa merce.
 *
 * ⚠️ **Il 22/08/2026 questo commento era stato marcato SUPERATO sostenendo che
 * la condizione non potesse mai scattare** — perché la matrice di `docs/12`
 * dichiara che l'accompagnatoria non include «mai DDT», quindi il contatore
 * varrebbe sempre 0. **Misurato, ed è falso**: `SALES_INVOICE_DOCUMENT_TYPES`
 * include `invoice_accompanying`, la maschera offre «Riferimento DDT
 * (opzionale)» anche lì, il client manda `linkedSalesDdtIds` per tutta la
 * famiglia e questo server li accetta senza controllo di tipo.
 *
 * ⛔ **Il difetto è l'opposto, ed è APERTO**: il codice permette un aggancio che
 * la matrice documentale vieta. Finché non è deciso chi cede — la matrice o il
 * codice (`docs/07` §5-bis) — **questa guardia non si tocca**: è l'unica cosa
 * che impedisce il doppio scarico nel caso che il codice consente.
 *
 * ⭐ Resta vero, e indipendente da quella decisione, che il percorso «include o
 * deriva da una Vendita al banco» non è interrogato da nessuna parte, e che una
 * firma a un parametro non può esprimerlo. Quella parte appartiene al blocco
 * Includi/Genera (`docs/DA-FARE.md`).
 */
export function invoiceAccompanyingUnloadsStock(linkedSalesDdtCount: number): boolean {
  return linkedSalesDdtCount === 0;
}

/** Tipi documento con rettifica inventario alla conferma (§2 adjustment). */
export const DOCUMENT_STOCK_ADJUSTMENT_TYPES: readonly DocumentType[] = [
  DocumentType.adjustment,
] as const;

/** Tipi documento con trasferimento origine → destinazione alla conferma (§10.2). */
export const DOCUMENT_STOCK_TRANSFER_TYPES: readonly DocumentType[] = [
  DocumentType.transfer,
] as const;

export function documentTypeLoadsStockOnConfirm(type: DocumentType): boolean {
  return (DOCUMENT_STOCK_LOAD_TYPES as readonly string[]).includes(type);
}

export function documentTypeUnloadsStockOnConfirm(type: DocumentType): boolean {
  return (DOCUMENT_STOCK_UNLOAD_TYPES as readonly string[]).includes(type);
}

export function documentTypeTransfersStockOnConfirm(type: DocumentType): boolean {
  return (DOCUMENT_STOCK_TRANSFER_TYPES as readonly string[]).includes(type);
}

export function documentTypeAdjustsStockOnConfirm(type: DocumentType): boolean {
  return (DOCUMENT_STOCK_ADJUSTMENT_TYPES as readonly string[]).includes(type);
}
