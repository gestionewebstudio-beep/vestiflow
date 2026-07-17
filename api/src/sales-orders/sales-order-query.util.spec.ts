import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { buildPlacedAtFilter, buildSalesOrderWhere } from './sales-order-query.util';

/** Estrae i blocchi della clausola AND (vuoto se assente). */
function andBlocks(where: Prisma.SalesOrderWhereInput): Prisma.SalesOrderWhereInput[] {
  const and = where.AND;
  if (!and) {
    return [];
  }
  return Array.isArray(and) ? and : [and];
}

describe('sales-order-query.util', () => {
  it('buildPlacedAtFilter restituisce undefined senza date', () => {
    expect(buildPlacedAtFilter()).toBeUndefined();
  });

  it('buildPlacedAtFilter delimita giornata UTC inclusiva', () => {
    const filter = buildPlacedAtFilter('2026-06-01', '2026-06-15');
    expect(filter?.gte).toEqual(new Date('2026-06-01T00:00:00.000Z'));
    expect(filter?.lte).toEqual(new Date('2026-06-15T23:59:59.999Z'));
  });

  it('senza filtri restituisce solo il tenant', () => {
    const where = buildSalesOrderWhere('tenant-1', {});
    expect(where.tenantId).toBe('tenant-1');
    expect(where.AND).toBeUndefined();
  });

  it('buildSalesOrderWhere include placedAt e ricerca', () => {
    const where = buildSalesOrderWhere('tenant-1', {
      search: '1001',
      placedFrom: '2026-01-01',
      placedTo: '2026-01-31',
      financialStatus: 'paid',
      source: 'online',
    });

    expect(where.tenantId).toBe('tenant-1');
    const blocks = andBlocks(where);
    const searchBlock = blocks.find((block) => Array.isArray(block.OR));
    expect(searchBlock?.OR).toHaveLength(3);
    expect(blocks.some((block) => block.placedAt)).toBe(true);
    expect(blocks.some((block) => block.financialStatus)).toBe(true);
    expect(blocks.some((block) => block.source)).toBe(true);
  });

  it('filtra per evasione, cliente e location dell\'impegno attivo', () => {
    const where = buildSalesOrderWhere('tenant-1', {
      fulfillmentStatus: 'partial',
      customerId: 'cust-1',
      locationId: 'loc-1',
    });

    const blocks = andBlocks(where);
    expect(blocks).toContainEqual({ fulfillmentStatus: { in: ['partially_fulfilled'] } });
    expect(blocks).toContainEqual({ customerId: 'cust-1' });
    expect(blocks).toContainEqual({
      reservations: { some: { status: 'active', locationId: 'loc-1' } },
    });
  });

  it('stato «annullato» filtra sugli ordini con cancelledAt', () => {
    const blocks = andBlocks(buildSalesOrderWhere('tenant-1', { state: 'cancelled' }));
    expect(blocks).toContainEqual({ cancelledAt: { not: null } });
  });

  it('stato «concluso» copre fulfilledAt oppure fulfillmentStatus fulfilled', () => {
    const blocks = andBlocks(buildSalesOrderWhere('tenant-1', { state: 'concluded' }));
    const stateBlock = blocks.find((block) => block.cancelledAt === null && Array.isArray(block.OR));
    expect(stateBlock?.OR).toEqual([
      { fulfilledAt: { not: null } },
      { fulfillmentStatus: 'fulfilled' },
    ]);
  });

  it('stato «aperto» esclude annullati e conclusi', () => {
    const blocks = andBlocks(buildSalesOrderWhere('tenant-1', { state: 'open' }));
    expect(blocks).toContainEqual({
      cancelledAt: null,
      fulfilledAt: null,
      NOT: { fulfillmentStatus: 'fulfilled' },
    });
  });

  it('combina stato «concluso» e ricerca senza sovrascrivere gli OR', () => {
    const where = buildSalesOrderWhere('tenant-1', { state: 'concluded', search: 'rossi' });
    const blocks = andBlocks(where);
    const orBlocks = blocks.filter((block) => Array.isArray(block.OR));
    // Uno per lo stato concluso, uno per la ricerca: nessuna collisione di chiave.
    expect(orBlocks).toHaveLength(2);
  });
});
