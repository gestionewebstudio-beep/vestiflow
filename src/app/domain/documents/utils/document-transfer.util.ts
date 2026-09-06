import { DocumentType } from '@core/models/document.model';

export function isTransferDocumentType(type: DocumentType): boolean {
  return type === DocumentType.Transfer;
}
