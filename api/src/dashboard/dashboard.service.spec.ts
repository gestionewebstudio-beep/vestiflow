import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  it('getSummary aggrega KPI, availableUnits e compone i titoli varianti sotto soglia', async () => {
    const levels = [
      {
        variantId: 'var-1',
        locationId: 'loc-1',
        available: 4,
        minThreshold: 5,
        variant: {
          sku: 'SKU-1',
          optionValues: [
            { name: 'Taglia', value: 'M' },
            { name: 'Colore', value: 'Rosso' },
          ],
          product: { name: 'Maglietta' },
        },
        location: { name: 'Shop location' },
      },
    ];
    const locations = [{ id: 'loc-1', name: 'Shop location' }];

    const prisma = {
      product: { count: vi.fn().mockResolvedValue(12) },
      supplierOrder: { count: vi.fn().mockResolvedValue(3) },
      inventoryLevel: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { available: 42 } }),
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue(levels),
        fields: { minThreshold: 'minThreshold' },
      },
      location: { findMany: vi.fn().mockResolvedValue(locations) },
      $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const service = new DashboardService(prisma as unknown as PrismaService);
    const summary = await service.getSummary('tenant-1', 'loc-1');

    expect(summary.productCount).toBe(12);
    expect(summary.incomingSupplierOrders).toBe(3);
    expect(summary.availableUnits).toBe(42);
    expect(summary.lowStockCount).toBe(1);
    expect(summary.levels[0]?.title).toBe('Maglietta — M / Rosso');
    expect(summary.locations).toEqual(locations);
    expect(prisma.inventoryLevel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-1', locationId: 'loc-1' }),
      }),
    );
  });
});
