import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SupabaseService } from '../../auth/supabase.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { buildTenantBackupZip } from '../../test/fixtures/tenant-backup.fixture';
import { TENANT_BACKUP_FORMAT_VERSION } from './tenant-backup.constants';
import { TenantBackupImportService } from './tenant-backup-import.service';

interface MockDelegate {
  deleteMany: ReturnType<typeof vi.fn>;
  createMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

/**
 * Tx finta con un delegate per ogni modello toccato dall'import. I delegate
 * sono MEMOIZZATI: `tx.user` deve restituire sempre lo stesso oggetto, o le
 * asserzioni guarderebbero una mock diversa da quella invocata dal service.
 */
function createAutoMockTx(): Record<string, MockDelegate> & {
  user: MockDelegate;
  tenant: MockDelegate;
} {
  const delegates = new Map<string, MockDelegate>();
  return new Proxy({} as Record<string, MockDelegate> & { user: MockDelegate; tenant: MockDelegate }, {
    get(_target, prop) {
      if (typeof prop !== 'string') {
        return undefined;
      }
      let delegate = delegates.get(prop);
      if (!delegate) {
        delegate = {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
          update: vi.fn().mockResolvedValue({}),
        };
        delegates.set(prop, delegate);
      }
      return delegate;
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
    email: 'titolare@negozio.it',
    role: UserRole.owner,
  };

  const PLATFORM_ADMIN_EMAIL = 'admin@vestiflow.it';
  const platformAdmin = {
    isPlatformAdmin: vi.fn(
      (email: string) => email.trim().toLowerCase() === PLATFORM_ADMIN_EMAIL,
    ),
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
      platformAdmin as never,
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

  // ── Scalata di privilegi via file ritoccato (§sicurezza) ──────────────
  // L'admin di piattaforma si riconosce dall'email del profilo: un backup che
  // ne contiene una è sempre un tentativo di scalata, non un dato di negozio.

  it('rifiuta un backup che contiene un utente con email di admin piattaforma', async () => {
    const zip = await buildTenantBackupZip({
      manifest: { tenantId },
      entities: {
        users: [
          {
            id: 'user-backup',
            tenantId,
            authUserId: 'auth-other',
            email: PLATFORM_ADMIN_EMAIL,
            role: UserRole.clerk,
          },
        ],
      },
    });

    await expect(service.importFromZipBuffer(tenantId, currentUserId, zip)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.user.createMany).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('non riscrive email e authUserId di chi importa, nemmeno se il file li cambia', async () => {
    const zip = await buildTenantBackupZip({
      manifest: { tenantId },
      entities: {
        users: [
          {
            id: 'id-falsificato',
            tenantId: 'tenant-altrui',
            authUserId: 'auth-owner',
            email: 'scalata@altro.it',
            displayName: 'Titolare',
            role: UserRole.owner,
          },
        ],
      },
    });

    await service.importFromZipBuffer(tenantId, currentUserId, zip);

    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: currentUserId },
        data: expect.objectContaining({
          id: currentUserId,
          tenantId,
          email: currentUser.email,
          authUserId: currentUser.authUserId,
          displayName: 'Titolare',
        }),
      }),
    );
  });

  it('impone il tenant corrente su OGNI riga: nessuna scrittura in un altro negozio', async () => {
    const zip = await buildTenantBackupZip({
      manifest: { tenantId },
      entities: {
        // Il tenantId altrui è visibile negli URL degli allegati: un file
        // ritoccato proverebbe a scrivere prodotti nel negozio di un altro.
        products: [
          { id: 'prod-1', tenantId: 'tenant-vittima', name: 'Merce iniettata' },
          { id: 'prod-2', tenantId, name: 'Merce legittima' },
        ],
      },
    });

    await service.importFromZipBuffer(tenantId, currentUserId, zip);

    const call = tx['product']?.createMany.mock.calls[0]?.[0] as { data: { tenantId: string }[] };
    const rows = call.data;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.tenantId === tenantId)).toBe(true);
  });

  it('non ripristina i termini di contratto del tenant dal file', async () => {
    const zip = await buildTenantBackupZip({
      manifest: { tenantId },
      entities: {
        tenant: [
          {
            id: tenantId,
            name: 'Negozio Demo',
            licensedLocationCount: 99,
            locationSelectionLocked: false,
            locationSelectionChangeGranted: true,
          },
        ],
      },
    });

    await service.importFromZipBuffer(tenantId, currentUserId, zip);

    const call = tx.tenant.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    const data = call.data;
    expect(data).toMatchObject({ name: 'Negozio Demo' });
    expect(data).not.toHaveProperty('licensedLocationCount');
    expect(data).not.toHaveProperty('locationSelectionLocked');
    expect(data).not.toHaveProperty('locationSelectionChangeGranted');
  });
});
