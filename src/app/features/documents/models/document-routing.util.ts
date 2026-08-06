import { DocumentStatus, DocumentType } from '@core/models/document.model';
import type {
  DocumentStatus as DocumentStatusValue,
  DocumentType as DocumentTypeValue,
} from '@core/models/document.model';

import { isGoodsReceiptDocumentType } from './document-goods-receipt.util';
import {
  isAdjustmentDocumentType,
  isManualUnloadDocumentType,
} from './document-stock-operation.util';
import { isSalesFormDocumentType } from '@domain/documents/models/document-sales.util';
import { isTransferDocumentType } from './document-transfer.util';

/**
 * Percorso di modifica di un documento per tipo (usato da lista, dettaglio e
 * dopo la duplicazione). Centralizza il routing altrimenti duplicato tra
 * `document-list.component.ts` e `document-detail.component.ts`.
 */
export function documentEditPath(doc: {
  readonly id: string;
  readonly type: DocumentTypeValue;
}): string {
  if (doc.type === DocumentType.Quote) {
    return `/app/documents/quote/${doc.id}/edit`;
  }
  // DDT vendita: maschera dell'Ordine cliente in modalità sales-ddt (prompt DDT).
  if (doc.type === DocumentType.SalesDdt) {
    return `/app/documents/sales-ddt/${doc.id}/edit`;
  }
  if (isSalesFormDocumentType(doc.type)) {
    return `/app/documents/sales/${doc.id}/edit`;
  }
  if (isTransferDocumentType(doc.type)) {
    return `/app/documents/transfer/${doc.id}/edit`;
  }
  if (isManualUnloadDocumentType(doc.type)) {
    return `/app/documents/manual-unload/${doc.id}/edit`;
  }
  if (isAdjustmentDocumentType(doc.type)) {
    return `/app/documents/adjustment/${doc.id}/edit`;
  }
  if (doc.type === DocumentType.SupplierInvoice) {
    return `/app/documents/registrazione-fattura/${doc.id}/edit`;
  }
  return `/app/documents/${doc.id}/edit`;
}

/**
 * Percorso di apertura canonico di un documento fuori dalle sue liste (ricerca
 * globale, link trasversali). Replica le scelte di `openDocument` della lista:
 * la famiglia carico e le registrazioni fattura attive si aprono nel form
 * (unica vista completa), i documenti di vendita nell'anteprima dettaglio
 * dedicata, il resto nel dettaglio generico.
 */
export function documentOpenPath(doc: {
  readonly id: string;
  readonly type: DocumentTypeValue;
  readonly status: DocumentStatusValue;
}): string {
  if (isGoodsReceiptDocumentType(doc.type)) {
    return `/app/documents/${doc.id}/edit`;
  }
  if (doc.type === DocumentType.SupplierInvoice) {
    return doc.status === DocumentStatus.Cancelled
      ? `/app/documents/${doc.id}`
      : `/app/documents/registrazione-fattura/${doc.id}/edit`;
  }
  switch (doc.type) {
    case DocumentType.Quote:
      return `/app/documents/quote/${doc.id}`;
    case DocumentType.Proforma:
      return `/app/documents/proforma/${doc.id}`;
    case DocumentType.SalesDdt:
      return `/app/documents/sales-ddt/${doc.id}`;
    case DocumentType.InvoiceDraft:
    case DocumentType.InvoiceAccompanying:
      return `/app/documents/fattura/${doc.id}`;
    case DocumentType.StoreSale:
    case DocumentType.StoreReturn:
      return `/app/documents/vendite-negozio/${doc.id}`;
    case DocumentType.ManualUnload:
      return `/app/documents/manual-unload/${doc.id}`;
    default:
      return `/app/documents/${doc.id}`;
  }
}

/**
 * Rotta del form «nuovo» per la duplicazione «apre il form precompilato»
 * (Fase 3, no bozze): duplicare naviga qui con `?duplicateFrom=<id>` e il form
 * copia il contenuto dell'originale in un documento nuovo. Ritorna `null` per i
 * tipi il cui form non supporta ancora il prefill di duplicazione: quelli
 * restano sul percorso legacy (crea copia e naviga alla modifica).
 */
export function documentDuplicateFormRoute(type: DocumentTypeValue): string | null {
  // Famiglia carico (arrivo merce, carico manuale, carico iniziale): tutti
  // gestiti dalla stessa maschera, che imposta il tipo dalla copia.
  if (isGoodsReceiptDocumentType(type)) {
    return '/app/documents/goods-receipt/new';
  }
  switch (type) {
    case DocumentType.Proforma:
      return '/app/documents/proforma/new';
    case DocumentType.InvoiceDraft:
      return '/app/documents/fattura/new';
    case DocumentType.InvoiceAccompanying:
      return '/app/documents/fattura-accompagnatoria/new';
    case DocumentType.SalesDdt:
      return '/app/documents/sales-ddt/new';
    case DocumentType.Quote:
      return '/app/documents/quote/new';
    case DocumentType.ManualUnload:
      return '/app/documents/manual-unload/new';
    case DocumentType.Transfer:
      return '/app/documents/transfer/new';
    case DocumentType.Adjustment:
      return '/app/documents/adjustment/new';
    case DocumentType.SupplierInvoice:
      return '/app/documents/registrazione-fattura/new';
    default:
      return null;
  }
}
