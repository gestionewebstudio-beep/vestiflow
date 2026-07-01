import { DocumentType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  documentPrintKind,
  documentReferenceLabel,
  isPrintableDocumentType,
} from './document-print.util';

describe('document-print.util', () => {
  it('isPrintableDocumentType include DDT vendita e proforma', () => {
    expect(isPrintableDocumentType(DocumentType.sales_ddt)).toBe(true);
    expect(isPrintableDocumentType(DocumentType.proforma)).toBe(true);
    expect(isPrintableDocumentType(DocumentType.manual_unload)).toBe(false);
  });

  it('documentReferenceLabel usa riferimento o bozza', () => {
    expect(documentReferenceLabel('DDT-2026-0001', 'A')).toBe('DDT-2026-0001');
    expect(documentReferenceLabel(null, 'B')).toBe('Bozza · serie B');
  });

  it('documentPrintKind classifica transfer e goods receipt', () => {
    expect(documentPrintKind(DocumentType.transfer)).toBe('transfer');
    expect(documentPrintKind(DocumentType.goods_receipt)).toBe('goods_receipt');
    expect(documentPrintKind(DocumentType.sales_ddt)).toBe('sales');
  });
});
