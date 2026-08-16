import {
  SalesOrderFiscalStatus as PrismaFiscal,
  SalesOrderRefundKind as PrismaRefundKind,
  SalesOrderSource as PrismaSource,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { buildCorrispettiviRefundWhere, buildCorrispettiviWhere } from './corrispettivi-query.util';

describe('buildCorrispettiviWhere', () => {
  const tenantId = 'tenant-1';

  // Il filtro «solo da consegnare» non esiste più: il flusso di consegna al
  // commercialista è stato ritirato il 16/08/2026. Restano le sole
  // classificazioni fiscali, che non sono passaggi di un flusso.
  it('filtra per classificazione fiscale', () => {
    const where = buildCorrispettiviWhere(tenantId, {
      fiscalStatus: 'excluded_pos_register',
    });

    expect(where.tenantId).toBe(tenantId);
    expect(where.fiscalStatus).toBe(PrismaFiscal.excluded_pos_register);
  });

  it('gli stati del vecchio flusso di consegna non sono più accettati', () => {
    for (const ritirato of ['delivered_to_accountant', 'externally_registered']) {
      expect(buildCorrispettiviWhere(tenantId, { fiscalStatus: ritirato }).fiscalStatus).toBeUndefined();
    }
  });

  it('il periodo si misura sulla data di EVASIONE, non su quella dell ordine', () => {
    const where = buildCorrispettiviWhere(tenantId, {
      placedFrom: '2026-06-01',
      placedTo: '2026-06-30',
    });

    // Prima era `placedAt`: il registro contava gli ordini del periodo, evasi
    // o no. Su agosto 2026 dichiarava 386,49 € invece di 50,00 (01 §2.16).
    expect(where.placedAt).toBeUndefined();
    expect(where.fulfilledAt).toEqual({
      gte: new Date('2026-06-01T00:00:00.000Z'),
      lte: new Date('2026-06-30T23:59:59.999Z'),
      not: null,
    });
  });

  it('senza periodo esclude comunque gli ordini mai evasi', () => {
    expect(buildCorrispettiviWhere(tenantId, {}).fulfilledAt).toEqual({ not: null });
  });

  it('NON filtra gli annullati: una vendita avvenuta non sparisce a posteriori', () => {
    const where = buildCorrispettiviWhere(tenantId, { placedFrom: '2026-08-01' });

    // Un annullamento pre-evasione non ha data di evasione e resta fuori da sé.
    // Uno post-evasione lascia la vendita alla sua data: la rettifica arriva
    // alla propria, e non si riscrive il passato.
    expect(where.cancelledAt).toBeUndefined();
  });
});

describe('buildCorrispettiviRefundWhere', () => {
  const tenantId = 'tenant-1';

  it('misura il periodo sulla data della RETTIFICA', () => {
    const where = buildCorrispettiviRefundWhere(tenantId, {
      placedFrom: '2026-08-01',
      placedTo: '2026-08-31',
    });

    expect(where.tenantId).toBe(tenantId);
    expect(where.occurredAt).toEqual({
      gte: new Date('2026-08-01T00:00:00.000Z'),
      lte: new Date('2026-08-31T23:59:59.999Z'),
    });
  });

  it('lascia fuori gli annullamenti', () => {
    const where = buildCorrispettiviRefundWhere(tenantId, {});

    expect(where.kind).toEqual({ not: PrismaRefundKind.cancellation });
  });

  it('segue il canale dell ordine collegato', () => {
    expect(buildCorrispettiviRefundWhere(tenantId, { onlineOnly: true }).order).toEqual({
      source: PrismaSource.shopify_online,
    });
    expect(buildCorrispettiviRefundWhere(tenantId, { posOnly: true }).order).toEqual({
      source: PrismaSource.shopify_pos,
    });
    expect(buildCorrispettiviRefundWhere(tenantId, {}).order).toBeUndefined();
  });

  it('ignora i filtri che descrivono un ordine e non una rettifica', () => {
    const where = buildCorrispettiviRefundWhere(tenantId, {
      fiscalStatus: 'excluded_pos_register',
      financialStatus: 'paid',
      search: 'Rossi',
    });

    expect(where).toEqual({ tenantId, kind: { not: PrismaRefundKind.cancellation } });
  });
});
