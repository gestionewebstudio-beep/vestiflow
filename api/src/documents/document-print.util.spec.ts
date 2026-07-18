import { DocumentType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  documentPrintKind,
  documentReferenceLabel,
  isPrintableDocumentType,
} from './document-print.util';

describe('document-print.util', () => {
  it('isPrintableDocumentType include DDT vendita, proforma e scarico manuale', () => {
    expect(isPrintableDocumentType(DocumentType.sales_ddt)).toBe(true);
    expect(isPrintableDocumentType(DocumentType.proforma)).toBe(true);
    // Prompt Scarico manuale: stampa documento con prezzi e totali.
    expect(isPrintableDocumentType(DocumentType.manual_unload)).toBe(true);
    expect(isPrintableDocumentType(DocumentType.inventory)).toBe(false);
  });

  it('documentReferenceLabel usa riferimento o bozza', () => {
    expect(documentReferenceLabel('DDT-2026-0001', 'A')).toBe('DDT-2026-0001');
    expect(documentReferenceLabel(null, 'B')).toBe('Bozza · serie B');
  });

  it('documentPrintKind classifica transfer, goods receipt e scarico manuale', () => {
    expect(documentPrintKind(DocumentType.transfer)).toBe('transfer');
    expect(documentPrintKind(DocumentType.goods_receipt)).toBe('goods_receipt');
    expect(documentPrintKind(DocumentType.sales_ddt)).toBe('sales');
    // Scarico manuale: layout vendita (Cliente + prezzi/totali).
    expect(documentPrintKind(DocumentType.manual_unload)).toBe('sales');
  });
});
