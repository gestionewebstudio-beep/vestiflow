import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { DocumentsService } from '../documents/documents.service';
import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { InventoryCountService } from './inventory-count.service';

describe('InventoryCountService', () => {
  const tenantId = 'tenant-1';
  const ownerUser = testOwnerUser();

  function createService() {
    const prisma = {
      location: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      inventoryLevel: { findMany: vi.fn() },
      inventoryCountSession: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
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
      {} as DocumentsService,
    );
    return { service, prisma };
  }

  it('list restituisce pagina vuota', async () => {
    const { service, prisma } = createService();
    prisma.$transaction.mockResolvedValue([[], 0]);

    const result = await service.list(tenantId, { page: 1, pageSize: 10 });

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 10 });
  });

  it('getById lancia NotFoundException se assente', async () => {
    const { service, prisma } = createService();
    prisma.inventoryCountSession.findFirst.mockResolvedValue(null);

    await expect(service.getById(tenantId, 'missing', ownerUser)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getById blocca lettura di una sessione su sede non autorizzata (gap chiuso)', async () => {
    const { service, prisma } = createService();
    prisma.inventoryCountSession.findFirst.mockResolvedValue({
      id: 'count-1',
      locationId: 'loc-other',
      location: { name: 'Altra sede' },
      lines: [],
    });

    const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });
    await expect(service.getById(tenantId, 'count-1', clerk)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('getById consente lettura di una sessione sulla sede assegnata', async () => {
    const { service, prisma } = createService();
    prisma.inventoryCountSession.findFirst.mockResolvedValue({
      id: 'count-1',
      locationId: 'loc-1',
      location: { name: 'Sede 1' },
      lines: [],
    });

    const clerk = testClerkUser({ assignedLocationIds: ['loc-1'] });
    await expect(service.getById(tenantId, 'count-1', clerk)).resolves.toMatchObject({
      id: 'count-1',
    });
  });

  it('create rifiuta location inesistente', async () => {
    const { service, prisma } = createService();
    prisma.location.findFirst.mockResolvedValue(null);

    await expect(
      service.create(tenantId, { locationId: 'missing', name: 'Conteggio' }, ownerUser),
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
      service.create(tenantId, { locationId: 'loc-1', name: ' Conteggio ' }, ownerUser),
    ).resolves.toMatchObject({ id: 'count-1', lines: expect.any(Array) });
  });

  it('deleteCancelled elimina solo sessioni annullate', async () => {
    const { service, prisma } = createService();
    prisma.inventoryCountSession.findFirst.mockResolvedValue({
      id: 'count-1',
      status: 'cancelled',
    });
    prisma.inventoryCountSession.delete = vi.fn().mockResolvedValue(undefined);

    await expect(service.deleteCancelled(tenantId, 'count-1', ownerUser)).resolves.toBeUndefined();
    expect(prisma.inventoryCountSession.delete).toHaveBeenCalledWith({ where: { id: 'count-1' } });
  });

  it('deleteCancelled rifiuta sessioni non annullate', async () => {
    const { service, prisma } = createService();
    prisma.inventoryCountSession.findFirst.mockResolvedValue({
      id: 'count-1',
      status: 'in_progress',
    });

    await expect(service.deleteCancelled(tenantId, 'count-1', ownerUser)).rejects.toThrow(
      'Solo le sessioni annullate possono essere eliminate.',
    );
  });
});
