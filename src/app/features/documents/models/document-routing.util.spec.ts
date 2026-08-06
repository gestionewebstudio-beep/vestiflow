import { describe, expect, it } from 'vitest';

import { DocumentStatus, DocumentType } from '@core/models/document.model';

import { documentOpenPath } from './document-routing.util';

describe('documentOpenPath', () => {
  const doc = (type: DocumentType, status: DocumentStatus = DocumentStatus.Confirmed) => ({
    id: 'doc-1',
    type,
    status,
  });

  it('famiglia carico: apre il form, unica vista completa', () => {
    expect(documentOpenPath(doc(DocumentType.GoodsReceipt))).toBe('/app/documents/doc-1/edit');
    expect(documentOpenPath(doc(DocumentType.ManualLoad))).toBe('/app/documents/doc-1/edit');
    expect(documentOpenPath(doc(DocumentType.InitialLoad))).toBe('/app/documents/doc-1/edit');
  });

  it('registrazione fattura attiva nel form del modulo, annullata nel dettaglio generico', () => {
    expect(documentOpenPath(doc(DocumentType.SupplierInvoice))).toBe(
      '/app/documents/registrazione-fattura/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.SupplierInvoice, DocumentStatus.Cancelled))).toBe(
      '/app/documents/doc-1',
    );
  });

  it('documenti di vendita: anteprima dettaglio dedicata per tipo', () => {
    expect(documentOpenPath(doc(DocumentType.Quote))).toBe('/app/documents/quote/doc-1');
    expect(documentOpenPath(doc(DocumentType.Proforma))).toBe('/app/documents/proforma/doc-1');
    expect(documentOpenPath(doc(DocumentType.SalesDdt))).toBe('/app/documents/sales-ddt/doc-1');
    expect(documentOpenPath(doc(DocumentType.InvoiceDraft))).toBe('/app/documents/fattura/doc-1');
    expect(documentOpenPath(doc(DocumentType.InvoiceAccompanying))).toBe(
      '/app/documents/fattura/doc-1',
    );
    expect(documentOpenPath(doc(DocumentType.StoreSale))).toBe(
      '/app/documents/vendite-negozio/doc-1',
    );
    expect(documentOpenPath(doc(DocumentType.StoreReturn))).toBe(
      '/app/documents/vendite-negozio/doc-1',
    );
    expect(documentOpenPath(doc(DocumentType.ManualUnload))).toBe(
      '/app/documents/manual-unload/doc-1',
    );
  });

  it('tipi operativi restanti: dettaglio generico', () => {
    expect(documentOpenPath(doc(DocumentType.Transfer))).toBe('/app/documents/doc-1');
    expect(documentOpenPath(doc(DocumentType.Adjustment))).toBe('/app/documents/doc-1');
  });
});
