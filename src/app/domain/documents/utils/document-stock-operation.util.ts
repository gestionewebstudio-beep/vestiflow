import { DocumentType } from '@core/models/document.model';
import type { DocumentType as DocumentTypeValue } from '@core/models/document.model';

export function isManualUnloadDocumentType(type: DocumentTypeValue): boolean {
  return type === DocumentType.ManualUnload;
}

export function isAdjustmentDocumentType(type: DocumentTypeValue): boolean {
  return type === DocumentType.Adjustment;
}

export function isStockOperationDocumentType(type: DocumentTypeValue): boolean {
  return isManualUnloadDocumentType(type) || isAdjustmentDocumentType(type);
}
