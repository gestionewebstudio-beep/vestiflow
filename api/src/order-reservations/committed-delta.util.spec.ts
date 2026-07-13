import { describe, expect, it, vi } from 'vitest';

import { applyCommittedDelta } from './committed-delta.util';

function createTx() {
  return {
    inventoryLevel: {
      upsert: vi.fn().mockResolvedValue({ id: 'lvl-1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('applyCommittedDelta', () => {
  const tenantId = 'tenant-1';
  const variantId = 'var-1';
  const locationId = 'loc-1';

  it('garantisce la riga e non aggiorna nulla con delta 0', async () => {
    const tx = createTx();

    await applyCommittedDelta(tx as never, tenantId, variantId, locationId, 0);

    expect(tx.inventoryLevel.upsert).toHaveBeenCalledOnce();
    expect(tx.inventoryLevel.updateMany).not.toHaveBeenCalled();
  });

  it('impegno: committed +delta, available -delta, onHand invariata', async () => {
    const tx = createTx();

    await applyCommittedDelta(tx as never, tenantId, variantId, locationId, 3);

    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith({
      where: { tenantId, variantId, locationId },
      data: { committed: { increment: 3 }, available: { increment: -3 } },
    });
    const callArg = tx.inventoryLevel.updateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(callArg.data).not.toHaveProperty('onHand');
  });

  it('test A §23: nuovo impegno oltre la disponibile registrato SENZA guardia (Disponibile può andare a -2)', async () => {
    const tx = createTx();

    // Scenario prompt §3: Giacenza 5, Impegnata 4, Disponibile 1, nuovo
    // impegno 3 → Impegnata 7, Disponibile -2. Nessuna condizione sul where
    // e nessuna eccezione: l'operazione va sempre registrata.
    await expect(
      applyCommittedDelta(tx as never, tenantId, variantId, locationId, 3),
    ).resolves.toBeUndefined();

    const callArg = tx.inventoryLevel.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(callArg.where).toEqual({ tenantId, variantId, locationId });
    expect(callArg.where).not.toHaveProperty('available');
  });

  it('rilascio impegno: committed -delta, available +delta', async () => {
    const tx = createTx();

    await applyCommittedDelta(tx as never, tenantId, variantId, locationId, -2);

    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith({
      where: { tenantId, variantId, locationId },
      data: { committed: { increment: -2 }, available: { increment: 2 } },
    });
  });
});
