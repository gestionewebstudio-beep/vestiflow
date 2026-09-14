import { describe, expect, it, vi } from 'vitest';

import {
  extractShopifyOrderLocationId,
  resolveShopifyOrderLocationId,
} from './shopify-order-location.util';

describe('extractShopifyOrderLocationId', () => {
  it('usa location_id diretto sull ordine', () => {
    expect(extractShopifyOrderLocationId({ location_id: 12345 })).toBe(
      'gid://shopify/Location/12345',
    );
  });

  it('fallback su fulfillment location', () => {
    expect(
      extractShopifyOrderLocationId({
        fulfillments: [{ location_id: 99 }],
      }),
    ).toBe('gid://shopify/Location/99');
  });

  it('ritorna null se manca location', () => {
    expect(extractShopifyOrderLocationId({})).toBeNull();
  });

  /**
   * ⭐ Misurato sul negozio vero il 13/09/2026 (prova 3, ordine #1012): un ordine
   *    nato da bozza porta in testata la location dello staff («Magazzino test
   *    3», non abbinata) e nell'evasione quella da cui la merce è USCITA («Shop
   *    location»). La testata vinceva, e la Vendita online restava senza sede.
   */
  it('con un’evasione, la location dell’evasione VINCE su quella di testata', () => {
    expect(
      extractShopifyOrderLocationId({
        location_id: 113512546599,
        fulfillments: [{ id: 1, status: 'success', location_id: 113512284455 }],
      }),
    ).toBe('gid://shopify/Location/113512284455');
  });

  it('un’evasione annullata non conta: si torna alla testata', () => {
    expect(
      extractShopifyOrderLocationId({
        location_id: 12345,
        fulfillments: [{ id: 1, status: 'cancelled', location_id: 99 }],
      }),
    ).toBe('gid://shopify/Location/12345');
  });
});

/**
 * ⛔ Qui c'era il ripiego alfabetico: senza una location collegata, l'ordine
 *    finiva sulla prima sede licenziata per nome. Tolto il 12/09/2026 (B7).
 */
describe('resolveShopifyOrderLocationId — nessuna sede indovinata', () => {
  /**
   * Un prisma finto con la COPPIA (la fonte, B7) e la colonna-cache delle
   * connessioni nate prima. `sedeCollegata` risponde per entrambe; il ripiego
   * per nome — `{ id: 'prima-per-nome' }` — è ciò che NON deve mai uscire.
   */
  function prismaCon(sedeCollegata: { id: string } | null) {
    const coppia = vi.fn(async () => (sedeCollegata ? { locationId: sedeCollegata.id } : null));
    const findFirst = vi.fn(async (args: { where: Record<string, unknown> }) =>
      'shopifyLocationId' in args.where ? sedeCollegata : { id: 'prima-per-nome' },
    );
    return {
      prisma: {
        shopifyLocationPair: { findFirst: coppia },
        location: { findFirst },
      } as never,
      findFirst,
      coppia,
    };
  }

  it('con la location del payload collegata a una sede: quella sede', async () => {
    const { prisma } = prismaCon({ id: 'sede-collegata' });
    await expect(resolveShopifyOrderLocationId(prisma, 'ten-1', { location_id: 55 })).resolves.toBe(
      'sede-collegata',
    );
  });

  it('senza location nel payload: null, e NESSUNA lettura di ripiego', async () => {
    const { prisma, findFirst, coppia } = prismaCon({ id: 'sede-collegata' });
    await expect(resolveShopifyOrderLocationId(prisma, 'ten-1', {})).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
    expect(coppia).not.toHaveBeenCalled();
  });

  it('con una location non collegata: null, non la prima sede per nome', async () => {
    const { prisma, findFirst } = prismaCon(null);
    await expect(
      resolveShopifyOrderLocationId(prisma, 'ten-1', { location_id: 99 }),
    ).resolves.toBeNull();
    // Due letture — la coppia, poi la colonna-cache — entrambe per identificativo.
    // Nessuna `orderBy: name`.
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0]?.[0].where).toHaveProperty('shopifyLocationId');
    expect(findFirst.mock.calls[0]?.[0].where).not.toHaveProperty('orderBy');
  });
});
