import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { InventoryExportService } from './inventory-export.service';

describe('InventoryExportService', () => {
  it('exportCsv serializza giacenze con filtro stockStatus', async () => {
    const prisma = {
      inventoryLevel: {
        findMany: vi.fn().mockResolvedValue([
          {
            available: 0,
            onHand: 0,
            committed: 0,
            incoming: 0,
            minThreshold: 2,
            variant: {
              sku: 'SKU-1',
              optionValues: [{ name: 'Taglia', value: 'M' }],
              product: { name: 'Maglietta' },
            },
            location: { name: 'Shop' },
          },
          {
            available: 5,
            onHand: 5,
            committed: 0,
            incoming: 0,
            minThreshold: 2,
            variant: {
              sku: 'SKU-2',
              optionValues: [],
              product: { name: 'Pantaloni' },
            },
            location: { name: 'Shop' },
          },
        ]),
      },
    };
    const service = new InventoryExportService(prisma as unknown as PrismaService);

    const csv = await service.exportCsv('tenant-1', { stockStatus: 'empty' } as never);

    expect(csv).toContain('SKU-1');
    expect(csv).not.toContain('SKU-2');
  });

  it('exportCsv include giacenze ok e low senza filtro stockStatus', async () => {
    const prisma = {
      inventoryLevel: {
        findMany: vi.fn().mockResolvedValue([
          {
            available: 1,
            onHand: 1,
            committed: 0,
            incoming: 0,
            minThreshold: 2,
            variant: {
              sku: 'SKU-LOW',
              optionValues: [],
              product: { name: 'Scarpe' },
            },
            location: { name: 'Shop' },
          },
        ]),
      },
    };
    const service = new InventoryExportService(prisma as unknown as PrismaService);

    const csv = await service.exportCsv('tenant-1', {} as never);

    expect(csv).toContain('SKU-LOW');
  });
});
