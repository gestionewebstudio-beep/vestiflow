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
 * ⛔ **SUPERATO — NON USARE COME REQUISITO** (misurato 22/08/2026, `07` §5-bis).
 *
 * Qui c'era: «Fattura accompagnatoria: lo scarico avviene solo senza DDT
 * agganciato. Con almeno un DDT il documento è puramente fiscale.»
 *
 * ⛔ **Quella condizione non può mai scattare.** `12` §matrice dichiara che
 * l'accompagnatoria «mai DDT»: questo contatore vale SEMPRE 0, la funzione
 * risponde SEMPRE true, e l'accompagnatoria scarica sempre. La guardia
 * presidia un percorso che il dominio dichiara impossibile.
 *
 * Il percorso che accade davvero — include o deriva da una **Vendita al
 * banco**, che ha già fatto uscire la merce — non è interrogato da nessuna
 * parte.
 *
 * ⭐ **La firma a un parametro è la regola vecchia scolpita nel tipo**: non si
 * corregge senza cambiarla. Va sostituita da un predicato che risponda a
 * «questa stessa uscita fisica è già stata registrata a monte?», qualunque sia
 * il percorso — e la decisione va estratta UNA volta: la stessa policy esiste
 * in tre copie (`documents.service.ts:2335`, `:2105`, motore del banco).
 *
 * ⚠️ Difetto **latente**: oggi Fattura e accompagnatoria non includono niente
 * dalla maschera e la rotta Vendita al banco → accompagnatoria non esiste. Si
 * arma quando quella catena si apre.
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
