import { BadRequestException } from '@nestjs/common';

import { DEFAULT_SALES_ORDER_ORDER, parseSalesOrderSort } from './sales-orders-sort.util';

describe('parseSalesOrderSort', () => {
  it('senza parametro resta l’ordine di sempre: il più recente in cima', () => {
    expect(parseSalesOrderSort(undefined)).toEqual(DEFAULT_SALES_ORDER_ORDER);
  });

  it('traduce le quattro colonne supportate', () => {
    expect(parseSalesOrderSort('customerName:asc')).toEqual([
      { customerName: 'asc' },
      { id: 'asc' },
    ]);
    expect(parseSalesOrderSort('total:desc')).toEqual([{ totalMinor: 'desc' }, { id: 'asc' }]);
  });

  it('⭐ origine, pagamento ed evasione si ordinano: sono enum con un ordine proprio', () => {
    expect(parseSalesOrderSort('source:asc')).toEqual([{ source: 'asc' }, { id: 'asc' }]);
    expect(parseSalesOrderSort('financialStatus:asc')).toEqual([
      { financialStatus: 'asc' },
      { id: 'asc' },
    ]);
    expect(parseSalesOrderSort('fulfillmentStatus:desc')).toEqual([
      { fulfillmentStatus: 'desc' },
      { id: 'asc' },
    ]);
  });

  it('⛔ «Stato» no: non è un campo, lo compone il client da più dati', () => {
    expect(() => parseSalesOrderSort('state:asc')).toThrow(BadRequestException);
  });

  it('⭐ il tie-break chiude sempre l’ordine', () => {
    expect(parseSalesOrderSort('orderNumber:asc,placedAt:desc').at(-1)).toEqual({ id: 'asc' });
  });
});
