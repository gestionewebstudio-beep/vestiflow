import { DocumentType } from '@prisma/client';

/**
 * Tipi documento la cui modalità netto/ivato è governata dalla **convenzione
 * aziendale sui prezzi di vendita** (`TenantFeatureSettings.salesPricesIncludeVat`).
 *
 * ⚠️ Fino al 16/08/2026 questa costante portava un nome che dichiarava un
 * VALORE — «questi partono ivati». Era
 * la regola scritta nel codice che l'impostazione aziendale ha sostituito: la
 * lista è la stessa, ma adesso non dichiara più un valore — dichiara **chi
 * risponde alla convenzione**. Il valore lo decide il titolare.
 *
 * Serve in due punti, ed è lo stesso elenco per costruzione:
 *   · la modalità proposta a un documento di vendita nuovo;
 *   · quali memorie degli operatori azzerare quando la convenzione cambia.
 *
 * ⭐ **`store_sale` / `store_return` sono ENTRATI il 21/08/2026**, con la nuova
 * maschera Vendita/Reso al banco (`11` A4). Prima erano esonerati — «sempre
 * ivati», cablato in `store-sales.service.ts` — e la revisione era già
 * dichiarata in sospeso qui: «Fisico/POS» e «netto/ivato» sono due assi
 * diversi, e un grossista che vende al banco può volerla netta. Ora il banco
 * usa il contratto comune: convenzione aziendale, memoria dell'operatore,
 * modalità persistita sul documento e modificabile.
 *
 * ESONERI — chi NON sta in questa lista, e perché:
 *
 *   · famiglia acquisto (`goods_receipt`, `supplier_order`, `supplier_invoice`,
 *     `manual_load`, `initial_load`): i costi partono **sempre netti** e non
 *     hanno né convenzione aziendale né memoria dell'operatore. Per un'azienda
 *     che detrae l'IVA il costo *è* il netto; l'inserimento ivato resta una
 *     comodità del singolo documento, dove il selettore rimane.
 *   · tipi senza prezzi (`transfer`, `adjustment`, `inventory`): non usano la
 *     modalità.
 */
export const SALES_PRICE_MODE_TYPES: readonly DocumentType[] = [
  DocumentType.proforma,
  DocumentType.invoice,
  DocumentType.invoice_accompanying,
  // ⚠️ Vale per la nota di credito creata VUOTA. Una nota **generata da una
  // fattura** eredita il modello economico della fattura d'origine: se quella
  // era a prezzi netti, la nota resta netta. La convenzione non la sovrascrive —
  // sarebbe una modifica retroattiva mascherata da preferenza.
  DocumentType.credit_note,
  DocumentType.sales_ddt,
  DocumentType.quote,
  DocumentType.manual_unload,
  // L'Ordine cliente non vive in `documents` ma ha un tipo suo per numerazione
  // e modalità prezzo (§Fetta 3): senza, erediterebbe quella del Preventivo.
  DocumentType.customer_order,
  // Vendita e Reso al banco: nessuna eccezione, nessun forcing «sempre ivato»
  // (`11` A4). Entrando qui prendono anche l'azzeramento delle memorie quando
  // la convenzione aziendale cambia — che è la parte che rende l'impostazione
  // credibile, non un dettaglio.
  DocumentType.store_sale,
  DocumentType.store_return,
];

/** Il tipo risponde alla convenzione aziendale sui prezzi di vendita? */
export function followsSalesPriceMode(type: DocumentType): boolean {
  return (SALES_PRICE_MODE_TYPES as readonly string[]).includes(type);
}
