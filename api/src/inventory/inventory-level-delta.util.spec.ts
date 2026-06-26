import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { applyInventoryDelta } from './inventory-level-delta.util';

function createTx(updateManyCount: number, currentAvailable = 0) {
  return {
    inventoryLevel: {
      upsert: vi.fn().mockResolvedValue({ id: 'lvl-1' }),
      updateMany: vi.fn().mockResolvedValue({ count: updateManyCount }),
      findUnique: vi.fn().mockResolvedValue({ available: currentAvailable }),
    },
  };
}

describe('applyInventoryDelta', () => {
  const tenantId = 'tenant-1';
  const variantId = 'var-1';
  const locationId = 'loc-1';

  it('garantisce la riga e non aggiorna nulla con delta 0', async () => {
    const tx = createTx(1);

    await applyInventoryDelta(tx as never, tenantId, variantId, locationId, 0);

    expect(tx.inventoryLevel.upsert).toHaveBeenCalledOnce();
    expect(tx.inventoryLevel.updateMany).not.toHaveBeenCalled();
  });

  it('incrementa in modo atomico per delta positivo (senza guardia)', async () => {
    const tx = createTx(1);

    await applyInventoryDelta(tx as never, tenantId, variantId, locationId, 3);

    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith({
      where: { tenantId, variantId, locationId },
      data: { onHand: { increment: 3 }, available: { increment: 3 } },
    });
  });

  it('decrementa con guardia condizionale available >= |delta|', async () => {
    const tx = createTx(1);

    await applyInventoryDelta(tx as never, tenantId, variantId, locationId, -2);

    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith({
      where: { tenantId, variantId, locationId, available: { gte: 2 } },
      data: { onHand: { increment: -2 }, available: { increment: -2 } },
    });
  });

  it('lancia 422 quando la guardia non aggiorna righe (disponibilità insufficiente)', async () => {
    const tx = createTx(0, 1);

    await expect(
      applyInventoryDelta(tx as never, tenantId, variantId, locationId, -5),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.inventoryLevel.findUnique).toHaveBeenCalledOnce();
  });

  it('usa il messaggio custom quando fornito', async () => {
    const tx = createTx(0, 2);

    await expect(
      applyInventoryDelta(tx as never, tenantId, variantId, locationId, -3, {
        insufficientMessage: (available) => `Solo ${available} disponibili`,
      }),
    ).rejects.toThrow('Solo 2 disponibili');
  });

  it('non scrive mai valori assoluti (solo increment atomici)', async () => {
    const tx = createTx(1);

    await applyInventoryDelta(tx as never, tenantId, variantId, locationId, -1);

    const callArg = tx.inventoryLevel.updateMany.mock.calls[0]?.[0] as {
      data: { available: unknown };
    };
    expect(callArg.data.available).toEqual({ increment: -1 });
  });
});
