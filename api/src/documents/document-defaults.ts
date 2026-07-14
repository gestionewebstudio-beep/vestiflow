import { DocumentType } from '@prisma/client';

import { DOCUMENT_STOCK_LOAD_TYPES } from './document-stock.constants';
import { PROFORMA_DEFAULT_NOTES } from './document-type.util';

/** Tutti i tipi documento gestiti, in ordine di presentazione. */
export const DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.supplier_order,
  DocumentType.goods_receipt,
  DocumentType.supplier_ddt,
  DocumentType.supplier_invoice_accompanying,
  DocumentType.supplier_invoice,
  DocumentType.manual_load,
  DocumentType.initial_load,
  DocumentType.sales_ddt,
  DocumentType.transfer,
  DocumentType.manual_unload,
  DocumentType.adjustment,
  DocumentType.inventory,
  DocumentType.proforma,
  DocumentType.invoice_draft,
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

/** Prefisso numerazione di default per tipo (§2.3). Sovrascrivibile in impostazioni. */
export const DEFAULT_NUMBER_PREFIX: Readonly<Record<DocumentType, string>> = {
  [DocumentType.supplier_order]: 'OF',
  [DocumentType.goods_receipt]: 'CAR',
  [DocumentType.supplier_ddt]: 'DDTF',
  [DocumentType.supplier_invoice_accompanying]: 'FAC',
  [DocumentType.supplier_invoice]: 'FF',
  [DocumentType.manual_load]: 'CM',
  [DocumentType.initial_load]: 'CI',
  [DocumentType.sales_ddt]: 'DDT',
  [DocumentType.transfer]: 'TR',
  [DocumentType.manual_unload]: 'SCA',
  [DocumentType.adjustment]: 'RET',
  [DocumentType.inventory]: 'INV',
  [DocumentType.proforma]: 'PRO',
  [DocumentType.invoice_draft]: 'BF',
  [DocumentType.online_sale]: 'VO',
  [DocumentType.corrispettivo]: 'COR',
  [DocumentType.store_sale]: 'VN',
  [DocumentType.store_return]: 'RN',
};

/** Titolo di stampa di default per tipo (§2.2). Sovrascrivibile in impostazioni. */
export const DEFAULT_PRINT_TITLE: Readonly<Record<DocumentType, string>> = {
  [DocumentType.supplier_order]: 'Ordine fornitore',
  [DocumentType.goods_receipt]: 'Arrivo merce',
  [DocumentType.supplier_ddt]: 'DDT fornitore',
  [DocumentType.supplier_invoice_accompanying]: 'Fattura accompagnatoria',
  [DocumentType.supplier_invoice]: 'Fattura fornitore',
  [DocumentType.manual_load]: 'Carico manuale',
  [DocumentType.initial_load]: 'Carico iniziale',
  [DocumentType.sales_ddt]: 'Documento di trasporto',
  [DocumentType.transfer]: 'Trasferimento interno',
  [DocumentType.manual_unload]: 'Scarico di magazzino',
  [DocumentType.adjustment]: 'Rettifica inventario',
  [DocumentType.inventory]: 'Inventario fisico',
  [DocumentType.proforma]: 'Proforma - documento non fiscale',
  [DocumentType.invoice_draft]: 'Bozza fattura',
  [DocumentType.online_sale]: 'Vendita online',
  [DocumentType.corrispettivo]: 'Corrispettivo',
  [DocumentType.store_sale]: 'Vendita in negozio',
  [DocumentType.store_return]: 'Reso vendita negozio',
};

export interface ResolvedDocumentTypeSetting {
  readonly type: DocumentType;
  readonly enabled: boolean;
  readonly printTitle: string;
  readonly autoNumbering: boolean;
  readonly numberPrefix: string;
  readonly defaultSeries: string;
  readonly blockAfterConfirm: boolean;
  readonly pricesIncludeVat: boolean;
  readonly defaultNotes: string | null;
}

/** Impostazione di default per un tipo, usata quando il tenant non l'ha ancora personalizzata. */
export function defaultTypeSetting(type: DocumentType): ResolvedDocumentTypeSetting {
  return {
    type,
    enabled: true,
    printTitle: DEFAULT_PRINT_TITLE[type],
    autoNumbering: true,
    numberPrefix: DEFAULT_NUMBER_PREFIX[type],
    defaultSeries: 'A',
    blockAfterConfirm: false,
    // Cassa negozio: prezzi al pubblico IVA inclusa (scorporo interno).
    pricesIncludeVat: isFlowOnlyDocumentType(type),
    defaultNotes: type === DocumentType.proforma ? PROFORMA_DEFAULT_NOTES : null,
  };
}
