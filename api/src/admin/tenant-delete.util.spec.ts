import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import { deleteTenantData } from './tenant-delete.util';

describe('deleteTenantData', () => {
  it('elimina entita tenant in ordine sicuro', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const deleteOne = vi.fn().mockResolvedValue({});
    const tx = new Proxy(
      {},
      {
        get: (_target, model) => ({
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          deleteMany:
            model === 'paymentMethodCode' || model === 'vatNature'
              ? vi.fn(() => {
                  throw new Error('Global catalog touched');
                })
              : deleteMany,
          delete: deleteOne,
        }),
      },
    );

    await deleteTenantData(tx as never, 'tenant-1');

    expect(deleteMany).toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
    expect(deleteOne).toHaveBeenCalledWith({ where: { id: 'tenant-1' } });
  });
});
