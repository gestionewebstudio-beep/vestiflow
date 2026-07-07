// Etichette e toni display per tipi e stati documento (it-IT).

import { DocumentStatus, DocumentType, type DocumentRecord } from '@core/models/document.model';
import type { BadgeTone } from '@shared/components/badge/badge.component';

import { isOperationalDocumentType } from './document-operational.util';

const TYPE_LABELS: Record<DocumentType, string> = {
  [DocumentType.SupplierOrder]: 'Ordine fornitore',
  [DocumentType.GoodsReceipt]: 'Arrivo merce',
  [DocumentType.SupplierDdt]: 'DDT fornitore',
  [DocumentType.SupplierInvoiceAccompanying]: 'Fattura accompagnatoria',
  [DocumentType.SupplierInvoice]: 'Fattura fornitore',
  [DocumentType.ManualLoad]: 'Carico manuale',
  [DocumentType.InitialLoad]: 'Carico iniziale',
  [DocumentType.SalesDdt]: 'DDT vendita',
  [DocumentType.Transfer]: 'Trasferimento',
  [DocumentType.ManualUnload]: 'Scarico manuale',
  [DocumentType.Adjustment]: 'Rettifica',
  [DocumentType.Inventory]: 'Inventario',
  [DocumentType.Proforma]: 'Proforma',
  [DocumentType.InvoiceDraft]: 'Bozza fattura',
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  [DocumentStatus.Draft]: 'Bozza',
  [DocumentStatus.Confirmed]: 'Confermato',
  [DocumentStatus.Printed]: 'Stampato',
  [DocumentStatus.Sent]: 'Inviato',
  [DocumentStatus.ExternallyRegistered]: 'Registrato esternamente',
  [DocumentStatus.Cancelled]: 'Annullato',
};

const STATUS_TONES: Record<DocumentStatus, BadgeTone> = {
  [DocumentStatus.Draft]: 'neutral',
  [DocumentStatus.Confirmed]: 'success',
  [DocumentStatus.Printed]: 'info',
  [DocumentStatus.Sent]: 'info',
  [DocumentStatus.ExternallyRegistered]: 'vestiflow',
  [DocumentStatus.Cancelled]: 'error',
};

export function documentTypeLabel(type: DocumentType): string {
  return TYPE_LABELS[type];
}

export function documentStatusLabel(status: DocumentStatus): string {
  return STATUS_LABELS[status];
}

/** Etichetta stato contestuale al tipo (es. bozza fattura / stati fiscali B6). */
export function documentStatusLabelForType(
  type: DocumentType,
  status: DocumentStatus,
  doc: Pick<DocumentRecord, 'externallyIssuedAt'>,
): string {
  if (type === DocumentType.InvoiceDraft) {
    if (status === DocumentStatus.ExternallyRegistered) {
      return 'Registrata esternamente';
    }
    if (status === DocumentStatus.Sent && doc.externallyIssuedAt) {
      return 'Emessa esternamente';
    }
    if (status === DocumentStatus.Sent) {
      return 'Inviata al commercialista';
    }
    if (
      status === DocumentStatus.Confirmed ||
      status === DocumentStatus.Printed ||
      status === DocumentStatus.Draft
    ) {
      return status === DocumentStatus.Draft ? 'Bozza' : 'Da emettere';
    }
  }
  return documentStatusLabel(status);
}

export function documentStatusTone(status: DocumentStatus): BadgeTone {
  return STATUS_TONES[status];
}

/**
 * Etichetta stato per UI: null = nessun badge (es. documenti operativi salvati non numerati).
 */
export function documentStatusDisplayLabel(
  type: DocumentType,
  status: DocumentStatus,
  doc: Pick<DocumentRecord, 'externallyIssuedAt'> = { externallyIssuedAt: undefined },
): string | null {
  if (isOperationalDocumentType(type)) {
    if (status === DocumentStatus.Draft) {
      return null;
    }
    if (status === DocumentStatus.Cancelled) {
      return 'Annullato';
    }
    if (status === DocumentStatus.Confirmed) {
      return 'Confermato';
    }
    return documentStatusLabel(status);
  }
  return documentStatusLabelForType(type, status, doc);
}

export function documentStatusDisplayTone(
  type: DocumentType,
  status: DocumentStatus,
): BadgeTone | null {
  if (isOperationalDocumentType(type) && status === DocumentStatus.Draft) {
    return null;
  }
  return documentStatusTone(status);
}

/** Etichetta breve del documento in lista. */
export function documentReferenceLabel(
  type: DocumentType,
  reference: string | undefined,
  series: string,
): string {
  if (reference) {
    return reference;
  }
  if (isOperationalDocumentType(type)) {
    return `Serie ${series} (non numerato)`;
  }
  return `Bozza · serie ${series}`;
}
