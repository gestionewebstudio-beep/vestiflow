import { DocumentType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  documentTypeAdjustsStockOnConfirm,
  documentTypeLoadsStockOnConfirm,
  documentTypeTransfersStockOnConfirm,
  documentTypeUnloadsStockOnConfirm,
  invoiceAccompanyingUnloadsStock,
} from './document-stock.constants';

describe('document-stock.constants', () => {
  it('identifica i tipi con carico alla conferma', () => {
    expect(documentTypeLoadsStockOnConfirm(DocumentType.goods_receipt)).toBe(true);
    expect(documentTypeLoadsStockOnConfirm(DocumentType.manual_load)).toBe(true);
    expect(documentTypeLoadsStockOnConfirm(DocumentType.initial_load)).toBe(true);
    expect(documentTypeLoadsStockOnConfirm(DocumentType.sales_ddt)).toBe(false);
  });

  it('identifica i tipi con scarico alla conferma', () => {
    expect(documentTypeUnloadsStockOnConfirm(DocumentType.sales_ddt)).toBe(true);
    expect(documentTypeUnloadsStockOnConfirm(DocumentType.manual_unload)).toBe(true);
    expect(documentTypeUnloadsStockOnConfirm(DocumentType.invoice_accompanying)).toBe(true);
    expect(documentTypeUnloadsStockOnConfirm(DocumentType.goods_receipt)).toBe(false);
    // La Fattura semplice non muove mai il magazzino.
    expect(documentTypeUnloadsStockOnConfirm(DocumentType.invoice_draft)).toBe(false);
  });

  it('la Fattura accompagnatoria scarica solo senza DDT agganciato', () => {
    // Senza DDT la merce esce con la fattura stessa.
    expect(invoiceAccompanyingUnloadsStock(0)).toBe(true);
    // Con un DDT agganciato le giacenze sono già scese: niente secondo scarico.
    expect(invoiceAccompanyingUnloadsStock(1)).toBe(false);
    expect(invoiceAccompanyingUnloadsStock(3)).toBe(false);
  });

  it('identifica i tipi con rettifica alla conferma', () => {
    expect(documentTypeAdjustsStockOnConfirm(DocumentType.adjustment)).toBe(true);
    expect(documentTypeAdjustsStockOnConfirm(DocumentType.manual_unload)).toBe(false);
  });

  it('identifica i tipi con trasferimento alla conferma', () => {
    expect(documentTypeTransfersStockOnConfirm(DocumentType.transfer)).toBe(true);
    expect(documentTypeTransfersStockOnConfirm(DocumentType.goods_receipt)).toBe(false);
  });
});
