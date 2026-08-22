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
 * **Difesa in profondità, non un requisito** (deciso dal proprietario il
 * 22/08/2026).
 *
 * ⛔ **La Fattura accompagnatoria non aggancia DDT**: `docs/12` §matrice dice
 * «mai DDT», e dal 22/08 lo impone anche il server — `syncLinkedSalesDdtsTx`
 * rifiuta l'aggancio, e la maschera non lo offre più (`supportsLinkedSalesDdt`).
 * Il percorso DDT → Accompagnatoria **non è ammesso**.
 *
 * ⭐ **Questa funzione resta comunque**, e resta com'è: se un'accompagnatoria
 * arrivasse qui con dei DDT collegati — dati storici, un percorso che nessuno
 * ha previsto — impedirebbe di scaricare due volte la stessa merce. È l'ultima
 * rete, e una rete non si toglie perché a monte è stato messo un cancello.
 *
 * ⚠️ **Ma non va letta come la regola**: non dice «l'accompagnatoria può avere
 * DDT», dice «se ne avesse, non riscarica». Fino al 22/08 questo commento
 * sosteneva l'opposto — «lo scarico avviene solo senza DDT agganciato» — ed è
 * la formulazione da cui era nata l'idea che l'aggancio fosse previsto.
 *
 * ⏸️ Resta fuori da qui, e appartiene al blocco Includi/Genera
 * (`docs/DA-FARE.md`), il percorso che accade davvero: un'accompagnatoria che
 * **deriva da una Vendita al banco** già scaricata. Una firma a un parametro
 * non può esprimerlo.
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
