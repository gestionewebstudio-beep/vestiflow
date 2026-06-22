import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { SalesOrdersExportService } from './sales-orders-export.service';

describe('SalesOrdersExportService', () => {
  it('exportCsv serializza ordini con importi decimali', async () => {
    const prisma = {
      salesOrder: {
        findMany: vi.fn().mockResolvedValue([
          {
            orderNumber: '1001',
            placedAt: new Date('2026-01-15T10:00:00.000Z'),
            customerName: 'Mario Rossi',
            customer: { email: 'mario@example.com' },
            source: 'shopify',
            financialStatus: 'paid',
            fulfillmentStatus: 'fulfilled',
            currency: 'EUR',
            subtotalMinor: 5000,
            totalMinor: 5900,
            shopifyOrderId: 'gid://shopify/Order/1',
          },
        ]),
      },
    };
    const service = new SalesOrdersExportService(prisma as unknown as PrismaService);

    const csv = await service.exportCsv('tenant-1', {} as never);

    expect(csv).toContain('1001');
    expect(csv).toContain('59.00');
    expect(csv.split('\n')[0]).toContain('Numero ordine');
  });
});
