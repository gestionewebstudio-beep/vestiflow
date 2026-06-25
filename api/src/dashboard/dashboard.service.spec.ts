import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const ownerUser = testOwnerUser();
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
      location: {
        findMany: vi.fn().mockResolvedValue(locations),
        findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }),
      },
      $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const service = new DashboardService(prisma as unknown as PrismaService);
    const summary = await service.getSummary('tenant-1', 'loc-1', ownerUser);

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

  it('getSummary senza locationId aggrega solo sedi licenziate attive', async () => {
    const prisma = {
      product: { count: vi.fn().mockResolvedValue(0) },
      supplierOrder: { count: vi.fn().mockResolvedValue(0) },
      inventoryLevel: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { available: 10 } }),
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        fields: { minThreshold: 'minThreshold' },
      },
      location: {
        findMany: vi.fn().mockResolvedValue([{ id: 'loc-1' }, { id: 'loc-2' }]),
        findFirst: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const service = new DashboardService(prisma as unknown as PrismaService);
    await service.getSummary('tenant-1', undefined, ownerUser);

    expect(prisma.inventoryLevel.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          locationId: { in: ['loc-1', 'loc-2'] },
        }),
      }),
    );
  });
});
