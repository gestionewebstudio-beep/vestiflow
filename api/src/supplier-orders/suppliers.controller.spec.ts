import { describe, expect, it, vi } from 'vitest';

import type { SupplierOrdersService } from './supplier-orders.service';
import { SuppliersController } from './suppliers.controller';

describe('SuppliersController', () => {
  const tenantId = 'tenant-1';
  const supplierOrders = {
    listSuppliers: vi.fn(),
    createSupplier: vi.fn(),
  };

  const controller = new SuppliersController(supplierOrders as unknown as SupplierOrdersService);

  it('list delega listSuppliers', async () => {
    supplierOrders.listSuppliers.mockResolvedValue([{ id: 'sup-1', name: 'Fornitore' }]);

    await expect(controller.list(tenantId)).resolves.toEqual([
      { id: 'sup-1', name: 'Fornitore' },
    ]);
  });

  it('create delega createSupplier', async () => {
    const dto = { name: 'Nuovo fornitore' };
    supplierOrders.createSupplier.mockResolvedValue({ id: 'sup-2', ...dto });

    await controller.create(tenantId, dto as never);

    expect(supplierOrders.createSupplier).toHaveBeenCalledWith(tenantId, dto);
  });
});
