import { describe, expect, it, vi } from 'vitest';

import { applyIncomingDelta } from './inventory-incoming.util';

describe('applyIncomingDelta', () => {
  it('incrementa incoming senza toccare onHand', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      inventoryLevel: {
        upsert: vi.fn().mockResolvedValue(undefined),
        updateMany,
        findUnique: vi.fn(),
      },
    };

    await applyIncomingDelta(tx as never, 'tenant-1', 'variant-1', 'loc-1', 5);

    expect(updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', variantId: 'variant-1', locationId: 'loc-1' },
      data: { incoming: { increment: 5 } },
    });
  });

  it('decrementa incoming con guardia insufficiente', async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const tx = {
      inventoryLevel: {
        upsert: vi.fn().mockResolvedValue(undefined),
        updateMany,
        findUnique: vi.fn().mockResolvedValue({ incoming: 2 }),
      },
    };

    await expect(
      applyIncomingDelta(tx as never, 'tenant-1', 'variant-1', 'loc-1', -5),
    ).rejects.toThrow('Incoming insufficiente');
  });
});
