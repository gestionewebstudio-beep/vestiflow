import { DocumentType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  documentTypeAdjustsStockOnConfirm,
  documentTypeAffectsStockOnConfirm,
  documentTypeLoadsStockOnConfirm,
  documentTypeTransfersStockOnConfirm,
  documentTypeUnloadsStockOnConfirm,
} from './document-stock.constants';

describe('document-stock.constants', () => {
  it('identifica i tipi con carico alla conferma', () => {
    expect(documentTypeLoadsStockOnConfirm(DocumentType.goods_receipt)).toBe(true);
    expect(documentTypeLoadsStockOnConfirm(DocumentType.sales_ddt)).toBe(false);
  });

  it('identifica i tipi con scarico alla conferma', () => {
    expect(documentTypeUnloadsStockOnConfirm(DocumentType.sales_ddt)).toBe(true);
    expect(documentTypeUnloadsStockOnConfirm(DocumentType.manual_unload)).toBe(true);
    expect(documentTypeUnloadsStockOnConfirm(DocumentType.goods_receipt)).toBe(false);
  });

  it('identifica i tipi con rettifica alla conferma', () => {
    expect(documentTypeAdjustsStockOnConfirm(DocumentType.adjustment)).toBe(true);
    expect(documentTypeAdjustsStockOnConfirm(DocumentType.manual_unload)).toBe(false);
  });

  it('identifica i tipi con trasferimento alla conferma', () => {
    expect(documentTypeTransfersStockOnConfirm(DocumentType.transfer)).toBe(true);
    expect(documentTypeTransfersStockOnConfirm(DocumentType.goods_receipt)).toBe(false);
  });

  it('documentTypeAffectsStockOnConfirm unisce carico, scarico, trasferimento e rettifica', () => {
    expect(documentTypeAffectsStockOnConfirm(DocumentType.goods_receipt)).toBe(true);
    expect(documentTypeAffectsStockOnConfirm(DocumentType.sales_ddt)).toBe(true);
    expect(documentTypeAffectsStockOnConfirm(DocumentType.manual_unload)).toBe(true);
    expect(documentTypeAffectsStockOnConfirm(DocumentType.adjustment)).toBe(true);
    expect(documentTypeAffectsStockOnConfirm(DocumentType.transfer)).toBe(true);
    expect(documentTypeAffectsStockOnConfirm(DocumentType.proforma)).toBe(false);
  });
});
