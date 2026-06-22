import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { PrismaService } from '../prisma/prisma.service';
import { InventoryCountService } from './inventory-count.service';

describe('InventoryCountService', () => {
  const tenantId = 'tenant-1';

  function createService() {
    const prisma = {
      location: { findFirst: vi.fn() },
      inventoryLevel: { findMany: vi.fn() },
      inventoryCountSession: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      inventoryCountLine: {
        createMany: vi.fn(),
        groupBy: vi.fn(),
      },
      $transaction: vi.fn(),
      $queryRaw: vi.fn(),
    };
    const service = new InventoryCountService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );
    return { service, prisma };
  }

  it('list restituisce pagina vuota', async () => {
    const { service, prisma } = createService();
    prisma.$transaction.mockResolvedValue([[], 0]);

    const result = await service.list(tenantId, { page: 1, pageSize: 10 } as never);

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 10 });
  });

  it('getById lancia NotFoundException se assente', async () => {
    const { service, prisma } = createService();
    prisma.inventoryCountSession.findFirst.mockResolvedValue(null);

    await expect(service.getById(tenantId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create rifiuta location inesistente', async () => {
    const { service, prisma } = createService();
    prisma.location.findFirst.mockResolvedValue(null);

    await expect(
      service.create(tenantId, { locationId: 'missing', name: 'Conteggio' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create apre sessione con righe da giacenze', async () => {
    const { service, prisma } = createService();
    prisma.location.findFirst.mockResolvedValue({ id: 'loc-1' });
    prisma.inventoryLevel.findMany.mockResolvedValue([
      {
        variantId: 'var-1',
        onHand: 4,
        variant: { id: 'var-1', sku: 'SKU-1', product: { name: 'Giacca' } },
      },
    ]);
    const session = { id: 'count-1', locationId: 'loc-1', name: 'Conteggio' };
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        inventoryCountSession: { create: vi.fn().mockResolvedValue(session) },
        inventoryCountLine: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }),
    );
    prisma.inventoryCountSession.findFirst.mockResolvedValue({
      ...session,
      location: { name: 'Shop' },
      lines: [{ id: 'line-1', sku: 'SKU-1', systemQuantity: 4 }],
    });

    await expect(
      service.create(tenantId, { locationId: 'loc-1', name: ' Conteggio ' } as never),
    ).resolves.toMatchObject({ id: 'count-1', lines: expect.any(Array) });
  });
});
