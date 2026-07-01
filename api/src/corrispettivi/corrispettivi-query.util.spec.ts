import { SalesOrderFiscalStatus as PrismaFiscal, SalesOrderSource as PrismaSource } from '@prisma/client';

import { buildCorrispettiviWhere } from './corrispettivi-query.util';

describe('buildCorrispettiviWhere', () => {
  const tenantId = 'tenant-1';

  it('filtra solo online con pendingDeliveryOnly', () => {
    const where = buildCorrispettiviWhere(tenantId, {
      pendingDeliveryOnly: true,
      placedFrom: '2026-06-01',
      placedTo: '2026-06-30',
    });

    expect(where.tenantId).toBe(tenantId);
    expect(where.source).toBe(PrismaSource.shopify_online);
    expect(where.fiscalStatus).toBe(PrismaFiscal.pending_registration);
    expect(where.placedAt).toEqual({
      gte: new Date('2026-06-01T00:00:00.000Z'),
      lte: new Date('2026-06-30T23:59:59.999Z'),
    });
  });

  it('filtra per stato fiscale esplicito', () => {
    const where = buildCorrispettiviWhere(tenantId, {
      fiscalStatus: 'delivered_to_accountant',
    });

    expect(where.fiscalStatus).toBe(PrismaFiscal.delivered_to_accountant);
  });
});
