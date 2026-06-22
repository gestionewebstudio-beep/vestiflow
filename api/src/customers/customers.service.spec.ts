import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  const tenantId = 'tenant-1';

  function createPrismaMock() {
    return {
      customer: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
  }

  it('list pagina clienti con ricerca opzionale', async () => {
    const prisma = createPrismaMock();
    const items = [{ id: 'cust-1', email: 'mario@example.com' }];
    prisma.customer.findMany.mockResolvedValue(items);
    prisma.customer.count.mockResolvedValue(1);
    const service = new CustomersService(prisma as unknown as PrismaService);

    const result = await service.list(tenantId, {
      page: 1,
      pageSize: 20,
      search: 'mario',
    } as never);

    expect(result).toEqual({ items, total: 1, page: 1, pageSize: 20 });
  });

  it('getById ritorna il cliente del tenant', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });
    const service = new CustomersService(prisma as unknown as PrismaService);

    await expect(service.getById(tenantId, 'cust-1')).resolves.toEqual({ id: 'cust-1' });
  });

  it('getById lancia NotFoundException se assente', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findFirst.mockResolvedValue(null);
    const service = new CustomersService(prisma as unknown as PrismaService);

    await expect(service.getById(tenantId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
