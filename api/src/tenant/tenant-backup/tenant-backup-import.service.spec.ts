import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SupabaseService } from '../../auth/supabase.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { buildTenantBackupZip } from '../../test/fixtures/tenant-backup.fixture';
import { TENANT_BACKUP_FORMAT_VERSION } from './tenant-backup.constants';
import { TenantBackupImportService } from './tenant-backup-import.service';

function createAutoMockTx(): Record<string, { deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }> {
  return new Proxy({} as Record<string, { deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }>, {
    get(_target, prop) {
      if (typeof prop !== 'string') {
        return undefined;
      }
      return {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn().mockResolvedValue({}),
      };
    },
  });
}

describe('TenantBackupImportService', () => {
  const tenantId = 'tenant-1';
  const currentUserId = 'user-owner';
  const currentUser = {
    id: currentUserId,
    tenantId,
    authUserId: 'auth-owner',
    role: UserRole.owner,
  };

  const tx = createAutoMockTx();
  const prisma = {
    user: {
      findFirstOrThrow: vi.fn().mockResolvedValue(currentUser),
    },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
  };
  const supabase = {
    getStorageClient: vi.fn().mockReturnValue(null),
  };
  const config = {
    get: vi.fn().mockReturnValue(undefined),
  };

  let service: TenantBackupImportService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TenantBackupImportService(
      prisma as unknown as PrismaService,
      supabase as unknown as SupabaseService,
      config as unknown as ConfigService,
    );
  });

  it('rifiuta versione manifest non supportata', async () => {
    const zip = await buildTenantBackupZip({
      manifest: { formatVersion: TENANT_BACKUP_FORMAT_VERSION + 99 },
    });

    await expect(service.importFromZipBuffer(tenantId, currentUserId, zip)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rifiuta backup di un altro tenant', async () => {
    const zip = await buildTenantBackupZip({
      manifest: { tenantId: 'tenant-other' },
    });

    await expect(service.importFromZipBuffer(tenantId, currentUserId, zip)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rifiuta manifest non oggetto', async () => {
    const zip = await buildTenantBackupZip({
      manifestRaw: '"manifest-non-valido"\n',
    });

    await expect(service.importFromZipBuffer(tenantId, currentUserId, zip)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('importa backup compatibile e restituisce riepilogo', async () => {
    const zip = await buildTenantBackupZip({
      manifest: { tenantId, tenantName: 'Negozio Demo' },
      entities: {
        tenant: [{ id: tenantId, name: 'Negozio Demo', createdAt: '2026-01-01T00:00:00.000Z' }],
        stores: [{ id: 'store-1', tenantId, name: 'Sede' }],
        users: [
          {
            id: 'user-backup',
            tenantId,
            authUserId: 'auth-other',
            role: UserRole.clerk,
          },
        ],
      },
    });

    const result = await service.importFromZipBuffer(tenantId, currentUserId, zip);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      tenantId,
      attachmentFilesUploaded: 0,
      entityCounts: {
        stores: 1,
      },
    });
    expect(result.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
