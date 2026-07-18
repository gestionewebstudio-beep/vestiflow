import { DocumentType } from '@core/models/document.model';
import type { DocumentType as DocumentTypeValue } from '@core/models/document.model';

import {
  isAdjustmentDocumentType,
  isManualUnloadDocumentType,
} from './document-stock-operation.util';
import { isSalesFormDocumentType } from './document-sales.util';
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
