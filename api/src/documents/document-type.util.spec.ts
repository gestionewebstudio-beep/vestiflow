import { DocumentType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  documentNumberingType,
  documentNumberingTypeSet,
  documentTypeDefaultLoadsStock,
  isInvoiceConvertTarget,
  isProformaConvertTarget,
  isSalesInvoiceDocumentType,
  PROFORMA_DEFAULT_NOTES,
} from './document-type.util';

describe('document-type.util', () => {
  it('proforma e bozza fattura non caricano magazzino di default', () => {
    expect(documentTypeDefaultLoadsStock(DocumentType.proforma)).toBe(false);
    expect(documentTypeDefaultLoadsStock(DocumentType.invoice_draft)).toBe(false);
    expect(documentTypeDefaultLoadsStock(DocumentType.goods_receipt)).toBe(true);
  });

  it('accetta conversione proforma verso DDT e bozza fattura', () => {
    expect(isProformaConvertTarget(DocumentType.sales_ddt)).toBe(true);
    expect(isProformaConvertTarget(DocumentType.invoice_draft)).toBe(true);
    expect(isProformaConvertTarget(DocumentType.proforma)).toBe(false);
  });

  it('include disclaimer fiscale proforma', () => {
    expect(PROFORMA_DEFAULT_NOTES).toContain('non valida ai fini IVA');
  });

  it('la nota di credito è una fattura di vendita senza magazzino', () => {
    expect(isSalesInvoiceDocumentType(DocumentType.credit_note)).toBe(true);
    expect(documentTypeDefaultLoadsStock(DocumentType.credit_note)).toBe(false);
  });

  it('la nota di credito numera sotto invoice_draft, come l\'accompagnatoria', () => {
    expect(documentNumberingType(DocumentType.credit_note)).toBe(DocumentType.invoice_draft);
    expect(documentNumberingType(DocumentType.invoice_accompanying)).toBe(
      DocumentType.invoice_draft,
    );
  });

  it('da una fattura si genera solo la nota di credito', () => {
    expect(isInvoiceConvertTarget(DocumentType.credit_note)).toBe(true);
    expect(isInvoiceConvertTarget(DocumentType.sales_ddt)).toBe(false);
  });

  it('il massimo del progressivo fatture si cerca su tutta la famiglia', () => {
    // I documenti sono salvati col tipo concreto: cercare il max sul solo
    // invoice_draft ignorerebbe i numeri presi da accompagnatorie e NC.
    expect(documentNumberingTypeSet(DocumentType.credit_note)).toEqual([
      DocumentType.invoice_draft,
      DocumentType.invoice_accompanying,
      DocumentType.credit_note,
    ]);
    expect(documentNumberingTypeSet(DocumentType.sales_ddt)).toEqual([DocumentType.sales_ddt]);
  });
});
