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
  findMany: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
  createMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

/**
 * Tx finta con un delegate per ogni modello toccato dall'import. I delegate
 * sono MEMOIZZATI: `tx.user` deve restituire sempre lo stesso oggetto, o le
 * asserzioni guarderebbero una mock diversa da quella invocata dal service.
 */
// ⚠️ I delegate usati dai test si dichiarano QUI: il Proxy ne restituisce
//    sempre uno, ma senza la dichiarazione l'accesso cade sull'index
//    signature e `noUncheckedIndexedAccess` lo tipizza `| undefined`.
type MockTx = Record<string, MockDelegate> & {
  user: MockDelegate;
  tenant: MockDelegate;
  paymentOption: MockDelegate;
  paymentMethodCode: MockDelegate;
};

function createAutoMockTx(): MockTx {
  const delegates = new Map<string, MockDelegate>();
  const grezzi = new Map<string, ReturnType<typeof vi.fn>>();
  return new Proxy({} as MockTx, {
    get(_target, prop) {
      if (typeof prop !== 'string') {
        return undefined;
      }
      // ⚠️ `$executeRawUnsafe` e compagni sono FUNZIONI, non delegate: il
      //    ripristino dichiara i vincoli differiti e accende il permesso di
      //    riga cosi', e senza questo ramo il Proxy restituiva un oggetto —
      //    «tx.$executeRawUnsafe is not a function», che col backup non
      //    c'entra niente. Sono memoizzate come i delegate.
      if (prop.startsWith('$')) {
        let grezzo = grezzi.get(prop);
        if (!grezzo) {
          grezzo = vi.fn().mockResolvedValue([]);
          grezzi.set(prop, grezzo);
        }
        return grezzo;
      }
      let delegate = delegates.get(prop);
      if (!delegate) {
        delegate = {
          findMany: vi
            .fn()
            .mockResolvedValue(prop === 'paymentMethodCode' ? [{ id: 'mc-05', code: 'MP05' }] : []),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
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
    isPlatformAdmin: vi.fn((email: string) => email.trim().toLowerCase() === PLATFORM_ADMIN_EMAIL),
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
      { invalidateTenant: vi.fn() } as never,
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

  /**
   * ⭐ **Un archivio più VECCHIO dell'app non è «aggiorna VestiFlow».**
   *
   * ⛔ Il cancello confrontava la versione e rifiutava con un messaggio solo —
   * «Versione backup non supportata (N). Aggiorna VestiFlow.» — che per il caso
   * più frequente dice il contrario del vero: l'app è nuova, è **l'archivio** a
   * essere vecchio, e aggiornare non serve a niente.
   *
   * ⚠️ La distinzione conta nel momento in cui serve davvero: chi sta
   * ripristinando ha un problema, e un messaggio che manda nella direzione
   * sbagliata gli fa perdere il tempo che non ha.
   */
  it('⭐ un archivio più VECCHIO dice che è vecchio, non «aggiorna»', async () => {
    const zip = await buildTenantBackupZip({
      manifest: { formatVersion: 2 },
    });

    await expect(service.importFromZipBuffer(tenantId, currentUserId, zip)).rejects.toThrow(
      /prodotto da una versione precedente/i,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('⛔ e uno più NUOVO continua a dire di aggiornare', async () => {
    const zip = await buildTenantBackupZip({
      manifest: { formatVersion: TENANT_BACKUP_FORMAT_VERSION + 1 },
    });

    await expect(service.importFromZipBuffer(tenantId, currentUserId, zip)).rejects.toThrow(
      /aggiorna vestiflow/i,
    );
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
            tenantId,
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

  it('rifiuta righe di un altro tenant prima del purge', async () => {
    const zip = await buildTenantBackupZip({
      manifest: { tenantId },
      entities: {
        products: [{ id: 'prod-1', tenantId: 'tenant-vittima', name: 'Merce iniettata' }],
      },
    });
    await expect(service.importFromZipBuffer(tenantId, currentUserId, zip)).rejects.toThrow(
      /altro negozio/,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
  // ── Modalità normative FatturaPA (C2A, `docs/25` §7) ──────────────────
  //
  // ⛔ Il contratto è «ripristino nello STESSO tenant»: il catalogo globale
  //    `payment_method_codes` non entra nel backup e non ne esce. Questi test
  //    provano il percorso vero — archivio, lettura, importatore, ordine di
  //    purge — non una `createMany` chiamata a mano.

  it('importa una riga PRECEDENTE a C2A, senza la proprietà: nessun errore', async () => {
    const zip = await buildTenantBackupZip({
      manifest: { tenantId, tenantName: 'Negozio Demo' },
      entities: {
        // Come lo scriveva un backup di ieri: `methodCodeId` non esiste.
        paymentOptions: [{ id: 'po-1', tenantId, kind: 'method', name: 'Contanti', sortOrder: 1 }],
      },
    });

    await service.importFromZipBuffer(tenantId, currentUserId, zip);

    const righe = tx.paymentOption.createMany.mock.calls[0]?.[0]?.data as Record<string, unknown>[];
    expect(righe).toHaveLength(1);
    expect(righe[0]).not.toHaveProperty('methodCodeId');
  });

  it('un backup SUCCESSIVO conserva il collegamento alla modalità', async () => {
    const zip = await buildTenantBackupZip({
      manifest: {
        tenantId,
        tenantName: 'Negozio Demo',
        globalReferences: { vatNatures: [], paymentMethodCodes: [{ id: 'mc-05', code: 'MP05' }] },
      },
      entities: {
        paymentOptions: [
          {
            id: 'po-1',
            tenantId,
            kind: 'method',
            name: 'Bonifico (MP05)',
            sortOrder: 5,
            methodCodeId: 'mc-05',
          },
        ],
      },
    });

    await service.importFromZipBuffer(tenantId, currentUserId, zip);

    const righe = tx.paymentOption.createMany.mock.calls[0]?.[0]?.data as Record<string, unknown>[];
    expect(righe[0]).toMatchObject({ methodCodeId: 'mc-05' });
  });

  it('il purge NON tocca il catalogo globale, e l_import non lo ricrea', async () => {
    const zip = await buildTenantBackupZip({
      manifest: { tenantId, tenantName: 'Negozio Demo' },
      entities: {
        paymentOptions: [{ id: 'po-1', tenantId, kind: 'method', name: 'Contanti', sortOrder: 1 }],
      },
    });

    await service.importFromZipBuffer(tenantId, currentUserId, zip);

    // Il catalogo è di sistema e globale: né cancellato dal purge del tenant,
    // né duplicato dal ripristino.
    expect(tx.paymentMethodCode.deleteMany).not.toHaveBeenCalled();
    expect(tx.paymentMethodCode.createMany).not.toHaveBeenCalled();
    expect(tx.paymentOption.deleteMany).toHaveBeenCalled();
  });

  it('una modalità inesistente fa fallire TUTTO il ripristino, non una parte', async () => {
    const zip = await buildTenantBackupZip({
      manifest: { tenantId, tenantName: 'Negozio Demo' },
      entities: {
        paymentOptions: [
          {
            id: 'po-1',
            tenantId,
            kind: 'method',
            name: 'Bonifico (MP05)',
            sortOrder: 5,
            methodCodeId: 'mc-che-non-esiste',
          },
        ],
      },
    });

    // La FK del database rifiuta: il service non la intercetta, e l'errore
    // esce dalla transazione — che è ciò che produce il rollback.

    await expect(service.importFromZipBuffer(tenantId, currentUserId, zip)).rejects.toThrow(
      /catalogo globale/i,
    );
  });
});
