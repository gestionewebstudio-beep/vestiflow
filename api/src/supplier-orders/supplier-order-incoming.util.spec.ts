import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../inventory/inventory-incoming.util', () => ({
  applyIncomingDelta: vi.fn(),
}));

import { applyIncomingDelta } from '../inventory/inventory-incoming.util';

import {
  applyIncomingForSupplierOrder,
  reverseIncomingForSupplierOrder,
} from './supplier-order-incoming.util';

describe('supplier-order-incoming.util', () => {
  beforeEach(() => {
    vi.mocked(applyIncomingDelta).mockReset();
  });

  it('applyIncomingForSupplierOrder incrementa solo il residuo non ricevuto', async () => {
    await applyIncomingForSupplierOrder({} as never, 'tenant-1', 'loc-1', [
      { variantId: 'var-1', orderedQuantity: 10, receivedQuantity: 3 },
      { variantId: 'var-2', orderedQuantity: 5, receivedQuantity: 5 },
    ]);

    expect(applyIncomingDelta).toHaveBeenCalledTimes(1);
    expect(applyIncomingDelta).toHaveBeenCalledWith({} as never, 'tenant-1', 'var-1', 'loc-1', 7);
  });

  it('reverseIncomingForSupplierOrder decrementa il residuo', async () => {
    await reverseIncomingForSupplierOrder({} as never, 'tenant-1', 'loc-1', [
      { variantId: 'var-1', orderedQuantity: 8, receivedQuantity: 2 },
    ]);

    expect(applyIncomingDelta).toHaveBeenCalledWith({} as never, 'tenant-1', 'var-1', 'loc-1', -6);
  });
});
