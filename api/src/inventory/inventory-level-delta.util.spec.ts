import { describe, expect, it, vi } from 'vitest';

import { applyInventoryDelta } from './inventory-level-delta.util';

function createTx() {
  return {
    inventoryLevel: {
      upsert: vi.fn().mockResolvedValue({ id: 'lvl-1' }),
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

    await applyInventoryDelta(tx as never, tenantId, variantId, locationId, 0);

    expect(tx.inventoryLevel.upsert).toHaveBeenCalledOnce();
    expect(tx.inventoryLevel.updateMany).not.toHaveBeenCalled();
  });

  it('incrementa in modo atomico per delta positivo', async () => {
    const tx = createTx();

    await applyInventoryDelta(tx as never, tenantId, variantId, locationId, 3);

    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith({
      where: { tenantId, variantId, locationId },
      data: { onHand: { increment: 3 }, available: { increment: 3 } },
    });
  });

  it('decrementa SENZA guardia di disponibilità (policy §3: mai bloccare)', async () => {
    const tx = createTx();

    await applyInventoryDelta(tx as never, tenantId, variantId, locationId, -2);

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
      applyInventoryDelta(tx as never, tenantId, variantId, locationId, -50),
    ).resolves.toBeUndefined();

    const callArg = tx.inventoryLevel.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(callArg.where).toEqual({ tenantId, variantId, locationId });
    expect(callArg.where).not.toHaveProperty('available');
  });

  it('include sempre il tenantId nel where (hardening multi-tenant)', async () => {
    const tx = createTx();

    await applyInventoryDelta(tx as never, tenantId, variantId, locationId, -1);

    const callArg = tx.inventoryLevel.updateMany.mock.calls[0]?.[0] as {
      where: { tenantId: string };
    };
    expect(callArg.where.tenantId).toBe(tenantId);
  });

  it('non scrive mai valori assoluti (solo increment atomici)', async () => {
    const tx = createTx();

    await applyInventoryDelta(tx as never, tenantId, variantId, locationId, -1);

    const callArg = tx.inventoryLevel.updateMany.mock.calls[0]?.[0] as {
      data: { available: unknown };
    };
    expect(callArg.data.available).toEqual({ increment: -1 });
  });
});
