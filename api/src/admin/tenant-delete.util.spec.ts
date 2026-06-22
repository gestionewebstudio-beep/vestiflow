import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import { deleteTenantData } from './tenant-delete.util';

describe('deleteTenantData', () => {
  it('elimina entita tenant in ordine sicuro', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const deleteOne = vi.fn().mockResolvedValue({});
    const tx = {
      inventoryCountLine: { deleteMany },
      inventoryCountSession: { deleteMany },
      supplierOrder: { deleteMany },
      salesOrder: { deleteMany },
      stockMovement: { deleteMany },
      inventoryLevel: { deleteMany },
      productImage: { deleteMany },
      productVariant: { deleteMany },
      product: { deleteMany },
      user: { deleteMany },
      location: { deleteMany },
      store: { deleteMany },
      customer: { deleteMany },
      supplier: { deleteMany },
      shopifyCredential: { deleteMany },
      shopifyOAuthState: { deleteMany },
      shopifyConnection: { deleteMany },
      tikTokCredential: { deleteMany },
      tikTokOAuthState: { deleteMany },
      tikTokConnection: { deleteMany },
      tenant: { delete: deleteOne },
    };

    await deleteTenantData(tx as never, 'tenant-1');

    expect(deleteMany).toHaveBeenCalledTimes(20);
    expect(deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
    expect(deleteOne).toHaveBeenCalledWith({ where: { id: 'tenant-1' } });
  });
});
