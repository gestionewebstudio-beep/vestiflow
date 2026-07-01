import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { UserTableViewsService } from './user-table-views.service';

describe('UserTableViewsService', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const viewId = 'documents_list';

  it('getTableView legge preferenza per tenant/utente/vista', async () => {
    const row = {
      id: 'pref-1',
      stateJson:
        '{"presetId":"default","columnOrder":["a"],"hiddenColumnIds":[],"pinnedColumnIds":[]}',
    };
    const prisma = {
      userTableViewPreference: {
        findUnique: vi.fn().mockResolvedValue(row),
        upsert: vi.fn(),
      },
    };
    const service = new UserTableViewsService(prisma as unknown as PrismaService);

    await expect(service.getTableView(tenantId, userId, viewId)).resolves.toEqual(row);
    expect(prisma.userTableViewPreference.findUnique).toHaveBeenCalledWith({
      where: { tenantId_userId_viewId: { tenantId, userId, viewId } },
    });
  });

  it('getTableView ritorna null se stateJson corrotto', async () => {
    const prisma = {
      userTableViewPreference: {
        findUnique: vi.fn().mockResolvedValue({ id: 'pref-1', stateJson: '{"presetId":"bad"}' }),
        upsert: vi.fn(),
      },
    };
    const service = new UserTableViewsService(prisma as unknown as PrismaService);

    await expect(service.getTableView(tenantId, userId, viewId)).resolves.toBeNull();
  });

  it('upsertTableView normalizza stateJson valido', async () => {
    const saved = {
      id: 'pref-1',
      stateJson:
        '{"presetId":"default","columnOrder":[],"hiddenColumnIds":[],"pinnedColumnIds":[]}',
    };
    const prisma = {
      userTableViewPreference: {
        findUnique: vi.fn(),
        upsert: vi.fn().mockResolvedValue(saved),
      },
    };
    const service = new UserTableViewsService(prisma as unknown as PrismaService);

    await expect(
      service.upsertTableView(
        tenantId,
        userId,
        viewId,
        '{"presetId":"default","columnOrder":[],"hiddenColumnIds":[],"pinnedColumnIds":[]}',
      ),
    ).resolves.toEqual(saved);
  });

  it('upsertTableView rifiuta viewId non valido', async () => {
    const prisma = {
      userTableViewPreference: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    };
    const service = new UserTableViewsService(prisma as unknown as PrismaService);

    await expect(
      service.upsertTableView(
        tenantId,
        userId,
        'invalid-view',
        '{"presetId":"default","columnOrder":[],"hiddenColumnIds":[],"pinnedColumnIds":[]}',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
