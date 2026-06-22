import { describe, expect, it, vi } from 'vitest';

import type { CustomersExportService } from './customers-export.service';
import type { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';

describe('CustomersController', () => {
  const tenantId = 'tenant-1';
  const customers = {
    list: vi.fn(),
    getById: vi.fn(),
  };
  const customersExport = {
    exportCsv: vi.fn().mockResolvedValue('email,nome\n'),
  };

  const controller = new CustomersController(
    customers as unknown as CustomersService,
    customersExport as unknown as CustomersExportService,
  );

  it('list delega al service', async () => {
    const query = { page: 1, pageSize: 20 };
    customers.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    await controller.list(tenantId, query as never);

    expect(customers.list).toHaveBeenCalledWith(tenantId, query);
  });

  it('getById delega al service', async () => {
    customers.getById.mockResolvedValue({ id: 'cust-1' });

    await expect(controller.getById(tenantId, 'cust-1')).resolves.toEqual({ id: 'cust-1' });
    expect(customers.getById).toHaveBeenCalledWith(tenantId, 'cust-1');
  });

  it('exportCsv restituisce StreamableFile CSV', async () => {
    const query = { search: 'mario' };
    const file = await controller.exportCsv(tenantId, query as never);

    expect(customersExport.exportCsv).toHaveBeenCalledWith(tenantId, query);
    expect(file.options.type).toContain('text/csv');
  });
});
