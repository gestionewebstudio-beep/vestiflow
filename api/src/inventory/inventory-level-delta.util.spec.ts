import { describe, expect, it, vi } from 'vitest';

import { applyInventoryDelta, origineDaCanaleOrdine } from './inventory-level-delta.util';

/**
 * La CLASSIFICAZIONE degli impegni: da quale canale viene un ordine decide se
 * il suo effetto vada trasmesso o no.
 *
 * ⛔ **Serve una prova sua.** Le prove di integrazione chiamano l'origine a
 *    mano, quindi non esercitano questa funzione: falsificandola restavano
 *    verdi. È la decisione che classifica **ogni** prenotazione, e senza questo
 *    blocco nessuno se ne accorgerebbe se qualcuno la invertisse.
 */
describe('origineDaCanaleOrdine', () => {
  it("⭐ gli ordini SHOPIFY sono di canale: là l'effetto è già avvenuto", () => {
    expect(origineDaCanaleOrdine('shopify_online')).toBe('canale');
    // ⚠️ La cassa Shopify sta con la vetrina: il criterio è CHI ha già
    //    applicato l'effetto, non dove è avvenuta la vendita.
    expect(origineDaCanaleOrdine('shopify_pos')).toBe('canale');
  });

  it('⭐ gli ordini di VestiFlow sono locali: Shopify non ne sa niente', () => {
    expect(origineDaCanaleOrdine('manual')).toBe('locale');
    expect(origineDaCanaleOrdine('store')).toBe('locale');
  });
});

function createTx() {
  return {
    inventoryLevel: {
      upsert: vi.fn().mockResolvedValue({ id: 'lvl-1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    // ⭐ La registrazione dell'origine avviene nella STESSA transazione della
    //    variazione: il doppio deve esporre lo stesso `tx`, o la prova
    //    misurerebbe due scritture separate — che è proprio ciò che non deve essere.
    shopifyInventorySyncState: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('applyInventoryDelta', () => {
  const tenantId = 'tenant-1';
  const variantId = 'var-1';
  const locationId = 'loc-1';

  it('garantisce la riga e non aggiorna nulla con delta 0', async () => {
    const tx = createTx();

    await applyInventoryDelta(tx as never, tenantId, variantId, locationId, 0, 'locale');

    expect(tx.inventoryLevel.upsert).toHaveBeenCalledOnce();
    expect(tx.inventoryLevel.updateMany).not.toHaveBeenCalled();
  });

  it('incrementa in modo atomico per delta positivo', async () => {
    const tx = createTx();

    await applyInventoryDelta(tx as never, tenantId, variantId, locationId, 3, 'locale');

    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith({
      where: { tenantId, variantId, locationId },
      data: { onHand: { increment: 3 }, available: { increment: 3 } },
    });
  });

  it('decrementa SENZA guardia di disponibilità (policy §3: mai bloccare)', async () => {
    const tx = createTx();

    await applyInventoryDelta(tx as never, tenantId, variantId, locationId, -2, 'locale');

    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith({
      where: { tenantId, variantId, locationId },
      data: { onHand: { increment: -2 }, available: { increment: -2 } },
    });
  });

  it('test B §23: scarico oltre la giacenza registrato senza eccezioni (saldi negativi ammessi)', async () => {
    const tx = createTx();

    // Anche con giacenza 0 nel DB il decremento va a buon fine: nessun throw,
    // nessuna condizione `available >= |delta|` nel where.
    await expect(
      applyInventoryDelta(tx as never, tenantId, variantId, locationId, -50, 'locale'),
    ).resolves.toBeUndefined();

    const callArg = tx.inventoryLevel.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(callArg.where).toEqual({ tenantId, variantId, locationId });
    expect(callArg.where).not.toHaveProperty('available');
  });

  it('include sempre il tenantId nel where (hardening multi-tenant)', async () => {
    const tx = createTx();

    await applyInventoryDelta(tx as never, tenantId, variantId, locationId, -1, 'locale');

    const callArg = tx.inventoryLevel.updateMany.mock.calls[0]?.[0] as {
      where: { tenantId: string };
    };
    expect(callArg.where.tenantId).toBe(tenantId);
  });

  it('non scrive mai valori assoluti (solo increment atomici)', async () => {
    const tx = createTx();

    await applyInventoryDelta(tx as never, tenantId, variantId, locationId, -1, 'locale');

    const callArg = tx.inventoryLevel.updateMany.mock.calls[0]?.[0] as {
      data: { available: unknown };
    };
    expect(callArg.data.available).toEqual({ increment: -1 });
  });

  /**
   * La SEPARAZIONE DELLE ORIGINI. `docs/DA-FARE.md` §31.
   *
   * ⛔ Il difetto che chiude: guardando una variazione di `available` non si
   *    poteva dire se venisse da una vendita al banco — da trasmettere — o
   *    dall'acquisizione di un ordine online, che Shopify ha già applicato.
   */
  describe('origine della variazione', () => {
    const origineScritta = (tx: ReturnType<typeof createTx>) =>
      (tx.shopifyInventorySyncState.updateMany.mock.calls[0]?.[0] as {
        where: unknown;
        data: Record<string, unknown>;
      }) ?? null;

    it("⭐ 'locale': l'effetto va TRASMESSO, quindi si accumula in L", async () => {
      const tx = createTx();

      await applyInventoryDelta(tx as never, tenantId, variantId, locationId, -2, 'locale');

      const scritta = origineScritta(tx);
      expect(scritta?.where).toEqual({ tenantId, variantId, locationId });
      // ⭐ **E il marcatore di coda si accende QUI**, nella stessa scrittura: se
      //    il processo muore prima che il push parta, quel lavoro deve essere
      //    già ritrovabile da solo (§31.14, caso 1).
      expect(scritta?.data).toEqual({
        localPendingDelta: { increment: -2 },
        localPushPending: true,
      });
      expect(scritta?.data).not.toHaveProperty('channelAcquiredDelta');
    });

    it("⛔ 'canale': NON accende il marcatore di coda", async () => {
      // Un effetto già applicato dal canale non si rimanda: metterlo in coda
      // significherebbe restituirglielo.
      const tx = createTx();

      await applyInventoryDelta(tx as never, tenantId, variantId, locationId, -2, 'canale');

      expect(origineScritta(tx)?.data).not.toHaveProperty('localPushPending');
    });

    it("⭐ 'canale': l'effetto c'è GIÀ là, quindi si accumula in C e non si rimanda", async () => {
      const tx = createTx();

      await applyInventoryDelta(tx as never, tenantId, variantId, locationId, -2, 'canale');

      const scritta = origineScritta(tx);
      expect(scritta?.data).toEqual({ channelAcquiredDelta: { increment: -2 } });
      expect(scritta?.data).not.toHaveProperty('localPendingDelta');
    });

    it('⛔ NELLA STESSA transazione della variazione: stesso `tx`, non due scritture', async () => {
      const tx = createTx();

      await applyInventoryDelta(tx as never, tenantId, variantId, locationId, 4, 'locale');

      // Se la giacenza si muove, il contatore si muove con lei: stesso client.
      expect(tx.inventoryLevel.updateMany).toHaveBeenCalledOnce();
      expect(tx.shopifyInventorySyncState.updateMany).toHaveBeenCalledOnce();
    });

    it('delta 0: nessuna variazione e nessuna origine', async () => {
      const tx = createTx();

      await applyInventoryDelta(tx as never, tenantId, variantId, locationId, 0, 'locale');

      expect(tx.shopifyInventorySyncState.updateMany).not.toHaveBeenCalled();
    });

    it('⛔ non CREA la riga di stato: quella nasce dal collegamento, non da una vendita', async () => {
      const tx = createTx();

      await applyInventoryDelta(tx as never, tenantId, variantId, locationId, 1, 'locale');

      // `updateMany` e non `upsert`: su una coppia non collegata non si scrive nulla.
      expect(tx.shopifyInventorySyncState).not.toHaveProperty('upsert');
    });
  });
});
