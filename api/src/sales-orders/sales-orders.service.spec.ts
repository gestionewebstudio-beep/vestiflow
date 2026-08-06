import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { SalesOrdersService } from './sales-orders.service';

describe('SalesOrdersService', () => {
  const tenantId = 'tenant-1';

  function createPrismaMock() {
    return {
      salesOrder: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
  }

  it('list pagina ordini con filtri e calcola Impegnata/location dalle prenotazioni attive', async () => {
    const prisma = createPrismaMock();
    prisma.salesOrder.findMany.mockResolvedValue([
      {
        id: 'order-1',
        orderNumber: '1001',
        onlineSale: null,
        reservations: [
          { remainingQuantity: 2, location: { name: 'Negozio Roma' } },
          { remainingQuantity: 1, location: { name: 'Negozio Roma' } },
        ],
      },
    ]);
    prisma.salesOrder.count.mockResolvedValue(1);
    const service = new SalesOrdersService(prisma as unknown as PrismaService);

    const result = await service.list(tenantId, {
      page: 1,
      pageSize: 10,
      search: '1001',
      financialStatus: 'paid',
      source: 'shopify',
    });

    expect(result.items).toEqual([
      {
        id: 'order-1',
        orderNumber: '1001',
        onlineSale: null,
        customer: null,
        committedQuantity: 3,
        locationName: 'Negozio Roma',
      },
    ]);
    expect(result.total).toBe(1);
  });

  it('getById include righe e cliente', async () => {
    const prisma = createPrismaMock();
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      lines: [],
      customer: { party: { email: 'buyer@example.com' } },
    });
    const service = new SalesOrdersService(prisma as unknown as PrismaService);

    await expect(service.getById(tenantId, 'order-1')).resolves.toMatchObject({
      id: 'order-1',
    });
  });

  it('getById lancia NotFoundException se assente', async () => {
    const prisma = createPrismaMock();
    prisma.salesOrder.findFirst.mockResolvedValue(null);
    const service = new SalesOrdersService(prisma as unknown as PrismaService);

    await expect(service.getById(tenantId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
