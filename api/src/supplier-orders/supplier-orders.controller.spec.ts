import { describe, expect, it, vi } from 'vitest';

import type { SupplierOrdersService } from './supplier-orders.service';
import { SupplierOrdersController } from './supplier-orders.controller';

describe('SupplierOrdersController', () => {
  const tenantId = 'tenant-1';
  const supplierOrders = {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    receive: vi.fn(),
    send: vi.fn(),
    delete: vi.fn(),
  };

  const controller = new SupplierOrdersController(
    supplierOrders as unknown as SupplierOrdersService,
    {} as never,
  );

  it('list delega al service', async () => {
    const query = { page: 1, pageSize: 20 };
    supplierOrders.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    await controller.list(tenantId, query);

    expect(supplierOrders.list).toHaveBeenCalledWith(tenantId, query);
  });

  it('getById delega al service', async () => {
    supplierOrders.getById.mockResolvedValue({ id: 'po-1' });

    await expect(controller.getById(tenantId, 'po-1')).resolves.toEqual({ id: 'po-1' });
  });

  it('create delega al service', async () => {
    const dto = { supplierId: 'sup-1', lines: [] };
    supplierOrders.create.mockResolvedValue({ id: 'po-new' });

    await controller.create(tenantId, dto as never);

    expect(supplierOrders.create).toHaveBeenCalledWith(tenantId, dto);
  });

  it('send delega al service', async () => {
    supplierOrders.send.mockResolvedValue({ id: 'po-1', status: 'sent' });

    await controller.send(tenantId, 'po-1');

    expect(supplierOrders.send).toHaveBeenCalledWith(tenantId, 'po-1');
  });

  it('receive delega al service', async () => {
    const dto = { lines: [{ lineId: 'line-1', receivedQuantity: 2 }] };
    supplierOrders.receive.mockResolvedValue({ id: 'po-1' });

    await controller.receive(tenantId, 'po-1', dto as never);

    expect(supplierOrders.receive).toHaveBeenCalledWith(tenantId, 'po-1', dto);
  });

  it('delete delega al service', async () => {
    supplierOrders.delete.mockResolvedValue(undefined);

    await controller.delete(tenantId, 'po-1');

    expect(supplierOrders.delete).toHaveBeenCalledWith(tenantId, 'po-1');
  });
});
