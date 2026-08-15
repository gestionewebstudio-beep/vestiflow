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
import {
  isSalesFormDocumentType,
  type SalesFormDocumentType,
} from '@domain/documents/models/document-sales.util';
import { isTransferDocumentType } from './document-transfer.util';

/**
 * Segmento di indirizzo della maschera vendita, per tipo. **Fonte unica**: da
 * qui nascono la rotta di creazione (`<segmento>/new`), quella di modifica
 * (`<segmento>/:id/edit`), il percorso di duplicazione e i link dell'elenco.
 *
 * È una mappa esaustiva e non un elenco, apposta: aggiungere un tipo alla
 * maschera vendita senza dargli un indirizzo non compila. Un elenco avrebbe
 * lasciato passare il tipo senza rotta, e il sintomo sarebbe arrivato molto
 * dopo — una voce di menu che porta a una pagina che non esiste.
 */
export const SALES_FORM_ROUTE_SEGMENT: Readonly<Record<SalesFormDocumentType, string>> = {
  [DocumentType.Proforma]: 'proforma',
  [DocumentType.InvoiceDraft]: 'fattura',
  [DocumentType.InvoiceAccompanying]: 'fattura-accompagnatoria',
  [DocumentType.CreditNote]: 'nota-di-credito',
};

/** Il segmento del tipo, o `null` se quel tipo non usa la maschera vendita. */
export function salesFormRouteSegment(type: DocumentTypeValue): string | null {
  return isSalesFormDocumentType(type)
    ? SALES_FORM_ROUTE_SEGMENT[type as SalesFormDocumentType]
    : null;
}

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
  // Un indirizzo per tipo: il form deve conoscere il tipo PRIMA di leggere il
  // documento, altrimenti fino alla risposta si comporta da proforma (`07-…§18`).
  const salesSegment = salesFormRouteSegment(doc.type);
  if (salesSegment) {
    return `/app/documents/${salesSegment}/${doc.id}/edit`;
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
    // I tre tipi della famiglia si aprono sullo STESSO elenco: il progressivo è
    // uno solo, e un dettaglio su una pagina propria suggerirebbe il contrario.
    case DocumentType.InvoiceDraft:
    case DocumentType.InvoiceAccompanying:
    case DocumentType.CreditNote:
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
  // Maschera vendita: il percorso viene dalla mappa dei segmenti, così un tipo
  // nuovo lo eredita senza che nessuno debba ricordarsi di aggiungerlo qui.
  const salesSegment = salesFormRouteSegment(type);
  if (salesSegment) {
    return `/app/documents/${salesSegment}/new`;
  }
  switch (type) {
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

/**
 * Il tipo dichiarato dai `data` della rotta, o un errore se manca.
 *
 * Non è difensivismo: la maschera vendita serve quattro tipi con regole fiscali
 * diverse, e senza il tipo dovrebbe indovinarlo. Indovinava — ricadeva su
 * Proforma — ed è il difetto che le rotte per tipo hanno chiuso (`07-…§18`).
 * Qui l'assenza smette di essere un caso da gestire e diventa quello che è:
 * una rotta scritta male, che deve rompersi in modo visibile.
 */
export function requireSalesDocumentType(data: Record<string, unknown>): SalesFormDocumentType {
  const type = data['salesDocumentType'];
  if (typeof type === 'string' && isSalesFormDocumentType(type as DocumentTypeValue)) {
    return type as SalesFormDocumentType;
  }
  throw new Error(
    'Rotta senza `salesDocumentType`: la maschera vendita non può dedurre il tipo del ' +
      'documento. Aggiungilo ai `data` della rotta (vedi documents.routes.ts).',
  );
}
