import { DocumentType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  documentTypeDefaultLoadsStock,
  isProformaConvertTarget,
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
});
