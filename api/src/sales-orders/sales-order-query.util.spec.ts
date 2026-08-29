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

  /**
   * ⭐ **Due mondi, e restano due** (`18` §2.4-bis). Ogni voce del filtro copre
   * sia gli ordini manuali — dove l'autorità è `commercialState` — sia quelli di
   * canale, dove restano i campi del canale. Fonderli reinterpreterebbe dati
   * Shopify, che è precisamente ciò che la norma vieta.
   */
  const ramoStato = (state: string) =>
    andBlocks(buildSalesOrderWhere('tenant-1', { state })).find((block) =>
      Array.isArray(block.OR),
    )?.OR as Record<string, unknown>[] | undefined;

  it('stato «annullato»: manuale dallo stato, canale da cancelledAt', () => {
    expect(ramoStato('cancelled')).toEqual([
      { source: 'manual', commercialState: 'cancelled' },
      { source: { not: 'manual' }, cancelledAt: { not: null } },
    ]);
  });

  it('stato «concluso»: manuale dallo stato, canale da fulfillmentStatus', () => {
    expect(ramoStato('concluded')).toEqual([
      { source: 'manual', commercialState: 'concluded' },
      {
        source: { not: 'manual' },
        cancelledAt: null,
        fulfillmentStatus: 'fulfilled',
      },
    ]);
  });

  it('stato «aperto»: manuale Confermato, canale non evaso', () => {
    expect(ramoStato('open')).toEqual([
      { source: 'manual', commercialState: 'confirmed' },
      {
        source: { not: 'manual' },
        cancelledAt: null,
        fulfilledAt: null,
        NOT: { fulfillmentStatus: 'fulfilled' },
      },
    ]);
  });

  /**
   * ⭐ Nessun equivalente di canale: un ordine Shopify arriva già piazzato, non
   * ha una fase «da confermare». La voce filtra i soli manuali, senza `OR`.
   */
  it('stato «da confermare» esiste solo per i manuali', () => {
    const blocks = andBlocks(buildSalesOrderWhere('tenant-1', { state: 'to_confirm' }));
    expect(blocks).toContainEqual({ source: 'manual', commercialState: 'to_confirm' });
  });

  /**
   * ⛔ **L'eleggibilità è passata dallo stato, non più dal collegamento.**
   * Qui c'era `cancelledAt: null` + `documentId: null`: il commento del codice
   * dichiarava «è il COLLEGAMENTO a rendere un ordine non più includibile — non
   * lo stato». Dal 28/08/2026 la regola è lo stato, e `documentId` resta come
   * guardia d'integrità (`12` §0.4-bis).
   */
  it('«includibili»: stato Confermato E nessun collegamento', () => {
    const blocks = andBlocks(buildSalesOrderWhere('tenant-1', { includable: true }));
    expect(blocks).toContainEqual({
      source: 'manual',
      commercialState: 'confirmed',
      documentId: null,
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
