import { DocumentType } from '@prisma/client';

import { DOCUMENT_STOCK_LOAD_TYPES } from './document-stock.constants';
import { documentNumberingType, PROFORMA_DEFAULT_NOTES } from './document-type.util';

/** Tutti i tipi documento gestiti, in ordine di presentazione. */
export const DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.supplier_order,
  DocumentType.goods_receipt,
  DocumentType.supplier_invoice,
  DocumentType.manual_load,
  DocumentType.initial_load,
  DocumentType.sales_ddt,
  DocumentType.transfer,
  DocumentType.manual_unload,
  DocumentType.adjustment,
  DocumentType.inventory,
  DocumentType.quote,
  DocumentType.proforma,
  DocumentType.invoice_draft,
  DocumentType.invoice_accompanying,
  DocumentType.credit_note,
  DocumentType.store_sale,
  DocumentType.store_return,
];

/**
 * Tipi documento interni generati SOLO dal dominio (fase 2 vendite online):
 * mai creabili/modificabili come documenti dagli utenti. Esistono nell'enum
 * per riusare numeratori (DocumentSequence) e collegamento movimenti
 * (sourceDocumentType), ma non hanno righe nella tabella documents.
 */
export const INTERNAL_ONLY_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.online_sale,
  DocumentType.corrispettivo,
  // Ordine cliente manuale: vive in SalesOrder, l'enum serve solo al
  // numeratore dedicato (DocumentSequence) — mai righe in `documents`.
  DocumentType.customer_order,
] as const;

export function isInternalOnlyDocumentType(type: DocumentType): boolean {
  return (INTERNAL_ONLY_DOCUMENT_TYPES as readonly string[]).includes(type);
}

/**
 * Tipi documento creati SOLO dal flusso dedicato (fase 3: cassa negozio).
 * Sono documenti reali con righe, ma non passano da POST /documents: la
 * creazione avviene in StoreSalesService con movimenti nella stessa
 * transazione. Modifica/annullamento generici bloccati per coerenza stock.
 */
export const FLOW_ONLY_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.store_sale,
  DocumentType.store_return,
] as const;

export function isFlowOnlyDocumentType(type: DocumentType): boolean {
  return (FLOW_ONLY_DOCUMENT_TYPES as readonly string[]).includes(type);
}

/**
 * Tipi documento "arrivo merce / carico" (§10) gestiti dal flusso dedicato
 * `GoodsReceiptWorkflowService.saveGoodsReceipt` (POST documents/goods-receipt/save),
 * che copre sia la creazione sia la modifica con le validazioni corrette
 * (fornitore obbligatorio per i tipi collegabili a fattura, location di
 * carico, codici IVA, ecc.) in un'unica transazione con i movimenti di
 * magazzino. Il percorso generico POST /documents li blocca per evitare un
 * secondo percorso di creazione che bypassa queste validazioni (bozze prive
 * di fornitore/location valide). Riusa lo stesso elenco di
 * `document-stock.constants` per non duplicare la lista dei tipi.
 */
export const DEDICATED_WORKFLOW_DOCUMENT_TYPES: readonly DocumentType[] = DOCUMENT_STOCK_LOAD_TYPES;

export function isDedicatedWorkflowDocumentType(type: DocumentType): boolean {
  return (DEDICATED_WORKFLOW_DOCUMENT_TYPES as readonly string[]).includes(type);
}

/**
 * Tipi documento per cui ha senso configurare un contatore di numerazione
 * (Impostazioni → numeratori) ed è VestiFlow-owned. Il progressivo è letto
 * dalla tabella che possiede il numero: `documents`, oppure `sales_orders`
 * (Ordine cliente) e `supplier_orders` (Ordine fornitore).
 *
 * Esclusi:
 * - `invoice_accompanying`: condivide il numeratore con `invoice_draft`
 *   (vedi documentNumberingType), quindi un solo contatore la copre.
 * - i tipi interni (online_sale, corrispettivo): già fuori da DOCUMENT_TYPES.
 * - gli ordini di canale (Shopify/POS) non hanno contatore: il numero è del
 *   canale; solo gli ordini cliente MANUALI usano il contatore customer_order.
 */
export const COUNTER_CONFIGURABLE_DOCUMENT_TYPES: readonly DocumentType[] = [
  ...DOCUMENT_TYPES.filter((type) => documentNumberingType(type) === type),
  DocumentType.customer_order,
];

export function isCounterConfigurableDocumentType(type: DocumentType): boolean {
  return (COUNTER_CONFIGURABLE_DOCUMENT_TYPES as readonly string[]).includes(type);
}

/**
 * Tipi mostrati come card nelle Impostazioni documenti. Oltre ai DOCUMENT_TYPES
 * c'è l'Ordine cliente (vive in SalesOrder ma configura prefisso e serie qui).
 * L'Ordine fornitore è già in DOCUMENT_TYPES.
 */
export const SETTINGS_CARD_DOCUMENT_TYPES: readonly DocumentType[] = [
  ...DOCUMENT_TYPES,
  DocumentType.customer_order,
];

/** Prefisso numerazione di default per tipo (§2.3). Sovrascrivibile in impostazioni. */
export const DEFAULT_NUMBER_PREFIX: Readonly<Record<DocumentType, string>> = {
  [DocumentType.supplier_order]: 'OF',
  [DocumentType.goods_receipt]: 'CAR',
  [DocumentType.supplier_invoice]: 'FF',
  [DocumentType.manual_load]: 'CM',
  [DocumentType.initial_load]: 'CI',
  [DocumentType.sales_ddt]: 'DDT',
  [DocumentType.transfer]: 'TR',
  [DocumentType.manual_unload]: 'SCA',
  [DocumentType.adjustment]: 'RET',
  [DocumentType.inventory]: 'INV',
  [DocumentType.proforma]: 'PRO',
  [DocumentType.invoice_draft]: 'FT',
  // Numeratore condiviso con `invoice_draft`: il prefisso qui è solo il
  // fallback usato se il numeratore della Fattura non è personalizzato.
  [DocumentType.invoice_accompanying]: 'FT',
  // Stesso numeratore, stesso fallback: il progressivo è uno solo per i tre
  // tipi, e il riferimento si distingue per il tipo scritto in colonna, non
  // per il prefisso. Un prefisso diverso qui darebbe due serie di riferimenti
  // sullo stesso progressivo — FT-0005 e NC-0006 — che si leggono come due
  // numerazioni diverse mentre sono la stessa.
  //
  // NON è una decisione sul prefisso della famiglia: quella è aperta, e la
  // porta `docs/04` §11 («Il riferimento non è il numero»), che ha deciso di
  // togliere sigla e zeri dal numero visibile di TUTTI i documenti. Finché il
  // prefisso esiste, la Nota di credito segue la famiglia; quando §11 sarà
  // eseguita, questa riga cadrà insieme alle altre.
  [DocumentType.credit_note]: 'FT',
  [DocumentType.online_sale]: 'VO',
  [DocumentType.corrispettivo]: 'COR',
  [DocumentType.customer_order]: 'OC',
  [DocumentType.store_sale]: 'VN',
  [DocumentType.store_return]: 'RN',
  [DocumentType.quote]: 'PRE',
};

/** Titolo di stampa di default per tipo (§2.2). Sovrascrivibile in impostazioni. */
export const DEFAULT_PRINT_TITLE: Readonly<Record<DocumentType, string>> = {
  [DocumentType.supplier_order]: 'Ordine fornitore',
  [DocumentType.goods_receipt]: 'Arrivo merce',
  [DocumentType.supplier_invoice]: 'Fattura fornitore',
  [DocumentType.manual_load]: 'Carico manuale',
  [DocumentType.initial_load]: 'Carico iniziale',
  [DocumentType.sales_ddt]: 'Documento di trasporto',
  [DocumentType.transfer]: 'Trasferimento interno',
  [DocumentType.manual_unload]: 'Scarico di magazzino',
  [DocumentType.adjustment]: 'Rettifica inventario',
  [DocumentType.inventory]: 'Inventario fisico',
  [DocumentType.proforma]: 'Proforma - documento non fiscale',
  [DocumentType.invoice_draft]: 'Fattura',
  [DocumentType.invoice_accompanying]: 'Fattura accompagnatoria',
  [DocumentType.credit_note]: 'Nota di credito',
  [DocumentType.online_sale]: 'Vendita online',
  [DocumentType.corrispettivo]: 'Corrispettivo',
  [DocumentType.customer_order]: 'Ordine cliente',
  [DocumentType.store_sale]: 'Vendita in negozio',
  [DocumentType.store_return]: 'Reso vendita al banco',
  [DocumentType.quote]: 'Preventivo',
};

export interface ResolvedDocumentTypeSetting {
  readonly type: DocumentType;
  readonly printTitle: string;
  readonly autoNumbering: boolean;
  readonly numberPrefix: string;
  readonly defaultSeries: string;
  readonly pricesIncludeVat: boolean;
  readonly defaultNotes: string | null;
}

/** Impostazione di default per un tipo, usata quando il tenant non l'ha ancora personalizzata. */
export function defaultTypeSetting(type: DocumentType): ResolvedDocumentTypeSetting {
  return {
    type,
    printTitle: DEFAULT_PRINT_TITLE[type],
    autoNumbering: true,
    numberPrefix: DEFAULT_NUMBER_PREFIX[type],
    defaultSeries: 'A',
    // Cassa negozio: prezzi al pubblico IVA inclusa (scorporo interno).
    pricesIncludeVat: isFlowOnlyDocumentType(type),
    defaultNotes: type === DocumentType.proforma ? PROFORMA_DEFAULT_NOTES : null,
  };
}
