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

  it('⛔ gli stati e l’origine non si ordinano lato server', () => {
    for (const colonna of ['state', 'source', 'financialStatus', 'fulfillmentStatus']) {
      expect(() => parseSalesOrderSort(`${colonna}:asc`)).toThrow(BadRequestException);
    }
  });

  it('⭐ il tie-break chiude sempre l’ordine', () => {
    expect(parseSalesOrderSort('orderNumber:asc,placedAt:desc').at(-1)).toEqual({ id: 'asc' });
  });
});
