import { DocumentType } from '@prisma/client';

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
];

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
    pricesIncludeVat: false,
    defaultNotes: type === DocumentType.proforma ? PROFORMA_DEFAULT_NOTES : null,
  };
}
