import { describe, expect, it } from 'vitest';

import { DocumentStatus, DocumentType } from '@core/models/document.model';
import { SALES_FORM_DOCUMENT_TYPES } from '@domain/documents/models/document-sales.util';

import {
  documentDuplicateFormRoute,
  documentEditPath,
  documentOpenPath,
  requireSalesDocumentType,
} from './document-routing.util';

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
    expect(documentOpenPath(doc(DocumentType.StoreSale))).toBe('/app/vendita-al-banco/doc-1');
    expect(documentOpenPath(doc(DocumentType.StoreReturn))).toBe('/app/vendita-al-banco/doc-1');
    expect(documentOpenPath(doc(DocumentType.ManualUnload))).toBe(
      '/app/documents/manual-unload/doc-1',
    );
  });

  it('tipi operativi restanti: dettaglio generico', () => {
    expect(documentOpenPath(doc(DocumentType.Transfer))).toBe('/app/documents/doc-1');
    expect(documentOpenPath(doc(DocumentType.Adjustment))).toBe('/app/documents/doc-1');
  });
});

/**
 * Il tipo nel percorso di modifica — regressione di `07-…§18`.
 *
 * Il difetto che questi test chiudono: la maschera vendita apriva ogni tipo su
 * `/app/documents/sales/:id/edit`, che il tipo non lo dichiarava. Il form lo
 * ricavava dal documento **caricato** e nel frattempo ricadeva su Proforma —
 * titolo sbagliato, dicitura «non valida ai fini IVA» sopra un documento
 * fiscale, tendina Serie con le serie di un altro tipo.
 *
 * I test parlano della REGOLA, non del caso: «ogni tipo della maschera vendita
 * ha il suo indirizzo» vale anche per il quinto tipo, che oggi non esiste.
 */
describe('documentEditPath — il tipo sta nel percorso', () => {
  it('ogni tipo della maschera vendita ha un indirizzo PROPRIO', () => {
    const paths = SALES_FORM_DOCUMENT_TYPES.map((type) => documentEditPath({ id: 'doc-1', type }));

    expect(new Set(paths).size).toBe(SALES_FORM_DOCUMENT_TYPES.length);
    expect(paths).not.toContain('/app/documents/sales/doc-1/edit');
  });

  it('i tre tipi della famiglia Fattura vanno su tre rotte distinte', () => {
    expect(documentEditPath({ id: 'd', type: DocumentType.InvoiceDraft })).toBe(
      '/app/documents/fattura/d/edit',
    );
    expect(documentEditPath({ id: 'd', type: DocumentType.InvoiceAccompanying })).toBe(
      '/app/documents/fattura-accompagnatoria/d/edit',
    );
    expect(documentEditPath({ id: 'd', type: DocumentType.CreditNote })).toBe(
      '/app/documents/nota-di-credito/d/edit',
    );
  });

  it('il percorso di duplicazione usa gli stessi segmenti, non una seconda tabella', () => {
    for (const type of SALES_FORM_DOCUMENT_TYPES) {
      const editPath = documentEditPath({ id: 'd', type });
      expect(documentDuplicateFormRoute(type)).toBe(editPath.replace('/d/edit', '/new'));
    }
  });
});

describe('requireSalesDocumentType', () => {
  it('restituisce il tipo dichiarato dalla rotta', () => {
    expect(requireSalesDocumentType({ salesDocumentType: DocumentType.CreditNote })).toBe(
      DocumentType.CreditNote,
    );
  });

  it('una rotta senza tipo si rompe, invece di far finta che sia una proforma', () => {
    expect(() => requireSalesDocumentType({})).toThrow(/salesDocumentType/);
    expect(() => requireSalesDocumentType({ salesDocumentType: DocumentType.SalesDdt })).toThrow();
  });
});
