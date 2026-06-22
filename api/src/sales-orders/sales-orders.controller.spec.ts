import { describe, expect, it, vi } from 'vitest';

import type { SalesOrdersExportService } from './sales-orders-export.service';
import type { SalesOrdersService } from './sales-orders.service';
import { SalesOrdersController } from './sales-orders.controller';

describe('SalesOrdersController', () => {
  const tenantId = 'tenant-1';
  const salesOrders = {
    list: vi.fn(),
    getById: vi.fn(),
  };
  const salesOrdersExport = {
    exportCsv: vi.fn().mockResolvedValue('order,total\n'),
  };

  const controller = new SalesOrdersController(
    salesOrders as unknown as SalesOrdersService,
    salesOrdersExport as unknown as SalesOrdersExportService,
  );

  it('list delega al service', async () => {
    const query = { page: 1, pageSize: 10 };
    salesOrders.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });

    await controller.list(tenantId, query as never);

    expect(salesOrders.list).toHaveBeenCalledWith(tenantId, query);
  });

  it('getById delega al service', async () => {
    salesOrders.getById.mockResolvedValue({ id: 'order-1' });

    await expect(controller.getById(tenantId, 'order-1')).resolves.toEqual({ id: 'order-1' });
  });

  it('exportCsv restituisce StreamableFile CSV', async () => {
    const file = await controller.exportCsv(tenantId, {} as never);

    expect(salesOrdersExport.exportCsv).toHaveBeenCalledWith(tenantId, {});
    expect(file.options.disposition).toContain('vendite-vestiflow');
  });
});
