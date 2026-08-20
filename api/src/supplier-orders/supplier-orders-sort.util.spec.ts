import { BadRequestException } from '@nestjs/common';

import { DEFAULT_SUPPLIER_ORDER_ORDER, parseSupplierOrderSort } from './supplier-orders-sort.util';

describe('parseSupplierOrderSort', () => {
  it('senza parametro resta l’ordine di sempre', () => {
    expect(parseSupplierOrderSort(undefined)).toEqual(DEFAULT_SUPPLIER_ORDER_ORDER);
  });

  it('⭐ «Fornitore» si ordina: qui la controparte è UN campo', () => {
    expect(parseSupplierOrderSort('supplier:asc')).toEqual([
      { supplierName: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('più chiavi restano nell’ordine di priorità', () => {
    expect(parseSupplierOrderSort('expected:asc,total:desc')).toEqual([
      { expectedAt: 'asc' },
      { totalMinor: 'desc' },
      { id: 'asc' },
    ]);
  });

  it('⛔ «Stato» non è ordinabile lato server, come sui documenti', () => {
    expect(() => parseSupplierOrderSort('status:asc')).toThrow(BadRequestException);
  });

  it('⭐ l’ordine finisce sempre con il tie-break', () => {
    expect(parseSupplierOrderSort('reference:desc').at(-1)).toEqual({ id: 'asc' });
  });
});
