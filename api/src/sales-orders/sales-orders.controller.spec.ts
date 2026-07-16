import { describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';
import { TENANT_PERMISSIONS_KEY } from '../common/auth/tenant-permissions.decorator';
import type { ManualSalesOrdersService } from './manual-sales-orders.service';
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
  const manualOrders = {
    getMeta: vi.fn(),
    save: vi.fn(),
    listActiveReservations: vi.fn(),
    conclude: vi.fn(),
  };

  const controller = new SalesOrdersController(
    salesOrders as unknown as SalesOrdersService,
    salesOrdersExport as unknown as SalesOrdersExportService,
    manualOrders as unknown as ManualSalesOrdersService,
  );

  it('protegge list e getById con permesso reports.view', () => {
    const listPerms = Reflect.getMetadata(
      TENANT_PERMISSIONS_KEY,
      SalesOrdersController.prototype.list,
    ) as string[];
    const detailPerms = Reflect.getMetadata(
      TENANT_PERMISSIONS_KEY,
      SalesOrdersController.prototype.getById,
    ) as string[];
    expect(listPerms).toContain(TenantPermission.ReportsView);
    expect(detailPerms).toContain(TenantPermission.ReportsView);
  });

  it('list delega al service', async () => {
    const query = { page: 1, pageSize: 10 };
    salesOrders.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });

    await controller.list(tenantId, query);

    expect(salesOrders.list).toHaveBeenCalledWith(tenantId, query);
  });

  it('getById delega al service', async () => {
    salesOrders.getById.mockResolvedValue({ id: 'order-1' });

    await expect(controller.getById(tenantId, 'order-1')).resolves.toEqual({ id: 'order-1' });
  });

  it('exportCsv restituisce StreamableFile CSV', async () => {
    const file = await controller.exportCsv(tenantId, {});

    expect(salesOrdersExport.exportCsv).toHaveBeenCalledWith(tenantId, {});
    expect(file.options.disposition).toContain('vendite-vestiflow');
  });

  it('protegge le rotte ordine manuale con permesso documents.manage', () => {
    for (const handler of [
      SalesOrdersController.prototype.getManualMeta,
      SalesOrdersController.prototype.saveManual,
      SalesOrdersController.prototype.listManualReservations,
      SalesOrdersController.prototype.concludeManual,
    ]) {
      const perms = Reflect.getMetadata(TENANT_PERMISSIONS_KEY, handler) as string[];
      expect(perms).toContain(TenantPermission.DocumentsManage);
    }
  });

  it('saveManual delega al service ordini manuali', async () => {
    const user = { id: 'user-1' };
    const dto = { customerId: 'cust-1', documentDate: '2026-07-16', lines: [] };
    manualOrders.save.mockResolvedValue({ order: { id: 'ord-1' }, reservations: [], warnings: [] });

    await controller.saveManual(
      tenantId,
      user as never,
      dto as never,
    );

    expect(manualOrders.save).toHaveBeenCalledWith(tenantId, dto, user);
  });
});
