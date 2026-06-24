import { describe, expect, it } from 'vitest';

import { buildPlacedAtFilter, buildSalesOrderWhere } from './sales-order-query.util';

describe('sales-order-query.util', () => {
  it('buildPlacedAtFilter restituisce undefined senza date', () => {
    expect(buildPlacedAtFilter()).toBeUndefined();
  });

  it('buildPlacedAtFilter delimita giornata UTC inclusiva', () => {
    const filter = buildPlacedAtFilter('2026-06-01', '2026-06-15');
    expect(filter?.gte).toEqual(new Date('2026-06-01T00:00:00.000Z'));
    expect(filter?.lte).toEqual(new Date('2026-06-15T23:59:59.999Z'));
  });

  it('buildSalesOrderWhere include placedAt e search', () => {
    const where = buildSalesOrderWhere('tenant-1', {
      search: '1001',
      placedFrom: '2026-01-01',
      placedTo: '2026-01-31',
      financialStatus: 'paid',
      source: 'online',
    });

    expect(where.tenantId).toBe('tenant-1');
    expect(where.placedAt).toBeDefined();
    expect(where.OR).toHaveLength(3);
    expect(where.financialStatus).toBeDefined();
    expect(where.source).toBeDefined();
  });
});
