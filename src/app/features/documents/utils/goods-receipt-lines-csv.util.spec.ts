import { describe, expect, it } from 'vitest';

import { parseGoodsReceiptLinesCsv } from './goods-receipt-lines-csv.util';

describe('parseGoodsReceiptLinesCsv', () => {
  it('parsa CSV con virgola e colonne SKU/quantità', () => {
    const content = 'sku,quantity,costo\nABC-1,3,10.50\n';
    const lines = parseGoodsReceiptLinesCsv(content);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.sku).toBe('ABC-1');
    expect(lines[0]?.quantity).toBe(3);
    expect(lines[0]?.unitCostText).toBe('10.50');
  });

  it('parsa costo con virgola decimale in CSV con punto e virgola', () => {
    const content = 'sku;quantity;costo\nABC-1;3;10,50\n';
    const lines = parseGoodsReceiptLinesCsv(content);
    expect(lines[0]?.unitCostText).toBe('10,50');
  });

  it('parsa CSV con punto e virgola (Excel italiano)', () => {
    const content = 'sku;quantità;ean\nSKU-9;2;800123\n';
    const lines = parseGoodsReceiptLinesCsv(content);
    expect(lines[0]?.sku).toBe('SKU-9');
    expect(lines[0]?.barcode).toBe('800123');
    expect(lines[0]?.quantity).toBe(2);
  });
});
