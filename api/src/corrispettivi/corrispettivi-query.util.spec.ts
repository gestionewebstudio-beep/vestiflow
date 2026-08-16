import {
  SalesOrderRefundKind as PrismaRefundKind,
  SalesOrderSource as PrismaSource,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  buildCorrispettiviRefundWhere,
  buildCorrispettiviStoreSaleWhere,
  buildCorrispettiviWhere,
} from './corrispettivi-query.util';

describe('buildCorrispettiviWhere', () => {
  const tenantId = 'tenant-1';

  // Lo stato fiscale non esiste più (16/08/2026): il Registro classifica per
  // ORIGINE, che è un fatto della vendita. Shopify POS compare come vendita
  // fisica/POS, non viene escluso — la scelta la fa il filtro di ambito.
  it('ambito e canale restringono le origini, insieme', () => {
    expect(buildCorrispettiviWhere(tenantId, { ambito: 'fisico_pos', canale: 'shopify' }).source)
      .toEqual({ in: [PrismaSource.shopify_pos] });
    expect(buildCorrispettiviWhere(tenantId, { ambito: 'online', canale: 'shopify' }).source)
      .toEqual({ in: [PrismaSource.shopify_online] });
  });

  it('canale Shopify con ambito libero prende ecommerce e POS', () => {
    const source = buildCorrispettiviWhere(tenantId, { canale: 'shopify' }).source as {
      in: string[];
    };
    expect(source.in).toContain(PrismaSource.shopify_online);
    expect(source.in).toContain(PrismaSource.shopify_pos);
  });

  it('senza filtro di ambito il Registro non esclude nessuna origine', () => {
    expect(buildCorrispettiviWhere(tenantId, {}).source).toBeUndefined();
  });

  // ── La Vendita al banco: terza sorgente del Registro (`11` §5) ─────────

  it('la Vendita al banco entra nel Registro quando i filtri non la escludono', () => {
    const where = buildCorrispettiviStoreSaleWhere(tenantId, {});
    expect(where).not.toBeNull();
    expect(where?.type).toBe('store_sale');
    // Una vendita annullata non è un corrispettivo.
    expect(where?.status).toEqual({ not: 'cancelled' });
  });

  it('la data del Registro è quella del documento, non quella di creazione', () => {
    const where = buildCorrispettiviStoreSaleWhere(tenantId, {
      placedFrom: '2026-06-01',
      placedTo: '2026-06-30',
    });
    expect(where?.documentDate).toEqual({
      gte: new Date('2026-06-01T00:00:00.000Z'),
      lte: new Date('2026-06-30T23:59:59.999Z'),
    });
  });

  it('i filtri che escludono il canale VestiFlow la lasciano fuori', () => {
    expect(buildCorrispettiviStoreSaleWhere(tenantId, { canale: 'shopify' })).toBeNull();
    expect(buildCorrispettiviStoreSaleWhere(tenantId, { ambito: 'online' })).toBeNull();
  });

  it('Fisico/POS + VestiFlow la tiene dentro', () => {
    expect(
      buildCorrispettiviStoreSaleWhere(tenantId, { ambito: 'fisico_pos', canale: 'vestiflow' }),
    ).not.toBeNull();
  });

  it('uno stato di pagamento la esclude: è una domanda che riguarda gli ordini', () => {
    expect(buildCorrispettiviStoreSaleWhere(tenantId, { financialStatus: 'paid' })).toBeNull();
    expect(buildCorrispettiviStoreSaleWhere(tenantId, { refundsOnly: true })).toBeNull();
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

  it('segue ambito e canale dell ordine collegato', () => {
    expect(buildCorrispettiviRefundWhere(tenantId, { ambito: 'online' }).order).toEqual({
      source: { in: [PrismaSource.shopify_online] },
    });
    expect(buildCorrispettiviRefundWhere(tenantId, { ambito: 'fisico_pos', canale: 'shopify' }).order)
      .toEqual({ source: { in: [PrismaSource.shopify_pos] } });
    expect(buildCorrispettiviRefundWhere(tenantId, {}).order).toBeUndefined();
  });

  it('ignora i filtri che descrivono un ordine e non una rettifica', () => {
    const where = buildCorrispettiviRefundWhere(tenantId, {
      financialStatus: 'paid',
      search: 'Rossi',
    });

    expect(where).toEqual({ tenantId, kind: { not: PrismaRefundKind.cancellation } });
  });
});
