import { DocumentType } from '@prisma/client';
import type { PurchaseCostEntryMode } from '@prisma/client';

/**
 * Tipi documento la cui modalità prezzo parte «ivato» al primo utilizzo:
 * documenti di vendita + scarico manuale (scelta cliente). Tutti gli altri
 * (famiglia acquisto, ordine fornitore) partono «netto». I tipi senza prezzi
 * (trasferimento, rettifica) non usano la modalità.
 */
export const PRICE_MODE_VAT_INCLUDED_DEFAULT_TYPES: readonly DocumentType[] = [
  DocumentType.proforma,
  DocumentType.invoice_draft,
  DocumentType.invoice_accompanying,
  // ⚠️ Vale per la nota di credito creata VUOTA. Una nota **generata da una
  // fattura** eredita il modello economico della fattura d'origine: se quella
  // era a prezzi netti, la nota resta netta. Il default non la sovrascrive —
  // sarebbe una modifica retroattiva mascherata da preferenza.
  DocumentType.credit_note,
  DocumentType.sales_ddt,
  DocumentType.quote,
  DocumentType.manual_unload,
];

/** Modalità prezzo al primo utilizzo: vendita → ivato (true), acquisto → netto (false). */
export function firstUsePricesIncludeVat(type: DocumentType): boolean {
  return (PRICE_MODE_VAT_INCLUDED_DEFAULT_TYPES as readonly string[]).includes(type);
}

/** Ponte fra la modalità prezzo (vendita) e la modalità costo (acquisto). */
export function pricesIncludeVatToCostEntryMode(
  pricesIncludeVat: boolean,
): PurchaseCostEntryMode {
  return pricesIncludeVat ? 'vat_included' : 'vat_excluded';
}

export function costEntryModeToPricesIncludeVat(mode: PurchaseCostEntryMode): boolean {
  return mode === 'vat_included';
}
