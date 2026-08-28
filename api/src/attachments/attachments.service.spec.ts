import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SalesOrderSource } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';
import type { SupabaseService } from '../auth/supabase.service';
import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';

import { AttachmentsService } from './attachments.service';

/**
 * ⛔ **Conoscere un id non concede alcun diritto.**
 *
 * Filtrare un elenco è ergonomia; autorizzare è rifiutare la richiesta diretta
 * per id (`12` §0.8). Fino al 28/08/2026 le sei rotte allegati dell'Ordine
 * cliente risolvevano l'entità **solo per tenant**: un commesso che conoscesse
 * l'id poteva elencare, scaricare, rinominare ed eliminare gli allegati di un
 * ordine di una sede non sua.
 *
 * ⭐ Il controllo vive in `assertEntity`, che è il punto per cui passano tutte
 * e sei — tre direttamente e tre via `findAttachment`. Questi test lo tengono
 * fermo **rotta per rotta**, perché una firma aggiornata e un argomento non
 * passato hanno lo stesso aspetto dall'esterno.
 */

const TENANT = 'tenant-1';
const ORDINE = 'ordine-1';
const SEDE_MIA = 'loc-mia';
const SEDE_ALTRUI = 'loc-altrui';

const commesso = () => testClerkUser({ assignedLocationIds: [SEDE_MIA] });

function createService(
  order: {
    locationId: string | null;
    source?: SalesOrderSource;
  } | null,
) {
  const prisma = {
    salesOrder: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          order === null ? null : { id: ORDINE, source: SalesOrderSource.manual, ...order },
        ),
    },
    attachment: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({
        id: 'att-1',
        tenantId: TENANT,
        entityId: ORDINE,
        mimeType: 'application/pdf',
        storagePath: 'p/x.pdf',
        fileName: 'x.pdf',
        sizeBytes: 10,
      }),
      aggregate: vi.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const supabase = { getStorageClient: vi.fn().mockReturnValue(null) };
  const config = { get: vi.fn().mockReturnValue('bucket') };
  const service = new AttachmentsService(
    prisma as unknown as PrismaService,
    supabase as unknown as SupabaseService,
    config as never,
  );
  return { service, prisma };
}

describe('Allegati — la sede si verifica anche conoscendo l’id', () => {
  it('⛔ stesso tenant, sede altrui: l’elenco è NEGATO', async () => {
    const { service } = createService({ locationId: SEDE_ALTRUI });

    await expect(service.list(TENANT, 'sales_order', ORDINE, commesso())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('✅ la propria sede si legge', async () => {
    const { service } = createService({ locationId: SEDE_MIA });

    await expect(service.list(TENANT, 'sales_order', ORDINE, commesso())).resolves.toEqual([]);
  });

  // ⭐ Il test decisivo, ripetuto per OGNI rotta: una firma aggiornata e un
  // argomento non passato hanno lo stesso aspetto dall'esterno.
  it.each([
    [
      'download',
      (s: AttachmentsService, u: ReturnType<typeof commesso>) =>
        s.download(TENANT, 'sales_order', ORDINE, 'att-1', u),
    ],
    [
      'quota',
      (s: AttachmentsService, u: ReturnType<typeof commesso>) =>
        s.quota(TENANT, 'sales_order', ORDINE, u),
    ],
    [
      'rename',
      (s: AttachmentsService, u: ReturnType<typeof commesso>) =>
        s.rename(TENANT, 'sales_order', ORDINE, 'att-1', 'nuovo.pdf', u),
    ],
    [
      'delete',
      (s: AttachmentsService, u: ReturnType<typeof commesso>) =>
        s.delete(TENANT, 'sales_order', ORDINE, 'att-1', u),
    ],
  ])('⛔ %s su un ordine di sede altrui è NEGATO', async (_nome, azione) => {
    const { service } = createService({ locationId: SEDE_ALTRUI });

    await expect(azione(service, commesso())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('⛔ e il rifiuto arriva PRIMA di leggere l’allegato', async () => {
    const { service, prisma } = createService({ locationId: SEDE_ALTRUI });

    await expect(
      service.download(TENANT, 'sales_order', ORDINE, 'att-1', commesso()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // La query sull'entità serve per conoscerne la sede; quella sull'allegato no.
    expect(prisma.attachment.findFirst).not.toHaveBeenCalled();
  });
});

describe('Allegati — chi può operare ovunque', () => {
  it('il titolare accede a qualunque sede', async () => {
    const { service } = createService({ locationId: SEDE_ALTRUI });

    await expect(
      service.list(TENANT, 'sales_order', ORDINE, testOwnerUser({ assignedLocationIds: [] })),
    ).resolves.toEqual([]);
  });

  it('chi ha inventory.view_all_locations LEGGE qualunque sede', async () => {
    const { service } = createService({ locationId: SEDE_ALTRUI });
    const supervisore = testClerkUser({
      assignedLocationIds: [SEDE_MIA],
      permissions: [TenantPermission.InventoryViewAllLocations],
    });

    await expect(service.list(TENANT, 'sales_order', ORDINE, supervisore)).resolves.toEqual([]);
  });

  // ⭐ Leggere ovunque non è scrivere ovunque: è la ragione per cui esistono due
  // modalità e non una sola.
  it('⛔ ma NON scrive: eliminare un allegato di sede altrui resta negato', async () => {
    const { service } = createService({ locationId: SEDE_ALTRUI });
    const supervisore = testClerkUser({
      assignedLocationIds: [SEDE_MIA],
      permissions: [TenantPermission.InventoryViewAllLocations],
    });

    await expect(
      service.delete(TENANT, 'sales_order', ORDINE, 'att-1', supervisore),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Allegati — i casi limite, dichiarati e non casuali', () => {
  it('record SENZA sede: passa, ed è il contratto — non un ripiego', async () => {
    const { service } = createService({ locationId: null });

    await expect(service.list(TENANT, 'sales_order', ORDINE, commesso())).resolves.toEqual([]);
  });

  // ⚠️ Stessa distinzione di `SalesOrdersService.getById`: applicare lo scope
  // agli ordini di canale li renderebbe irraggiungibili a chi non ha la sede
  // che il canale ha assegnato loro.
  it('ordine di CANALE: lo scope sede non si applica', async () => {
    const { service } = createService({
      locationId: SEDE_ALTRUI,
      source: SalesOrderSource.online,
    });

    await expect(service.list(TENANT, 'sales_order', ORDINE, commesso())).resolves.toEqual([]);
  });

  it('tenant diverso: continua a essere negato come prima, con 404', async () => {
    const { service } = createService(null);

    await expect(service.list(TENANT, 'sales_order', ORDINE, commesso())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('senza utente in contesto non decide: i lavori interni passano', async () => {
    const { service } = createService({ locationId: SEDE_ALTRUI });

    await expect(service.list(TENANT, 'sales_order', ORDINE, undefined)).resolves.toEqual([]);
  });
});
