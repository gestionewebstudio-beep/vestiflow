import { ConfigService } from '@nestjs/config';
import { PlatformAuditActor, Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AdminTenantsService } from '../../admin/admin-tenants.service';
import { AuthProfileCacheService } from '../../auth/auth-profile-cache.service';
import { SupabaseService } from '../../auth/supabase.service';
import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import type { AttoreRegistro } from '../../common/audit/platform-audit.types';
import { PlatformAdminService } from '../../common/platform-admin/platform-admin.service';
import { verificaSedeCancellabile } from '../../shopify/location-delete-safety.util';
import { TenantBackupExportService } from '../../tenant/tenant-backup/tenant-backup-export.service';
import { TenantBackupImportService } from '../../tenant/tenant-backup/tenant-backup-import.service';
import { readStreamToBuffer } from '../fixtures/tenant-backup.fixture';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * LE CHIAVI ESTERNE DI `shopify_inventory_sync_states` (migration 20260915220000 — regole
 * proposte in `DA-FARE` §21-ter, provate qui sul database isolato prima di ogni decisione
 * sul condiviso).
 *
 * ```text
 *   F1  la fixture svuota la tabella: il TRUNCATE … CASCADE ora la raggiunge (la causa del
 *       ripristino intermittente di docs/30 §9)
 *   F2  variante eliminata → il suo stato se ne va (CASCADE, come le giacenze)
 *   F3  sede con uno stato → NON si elimina (RESTRICT), e la guardia applicativa lo dice prima
 *   F4  tenant con stati → la cancellazione amministrativa passa (purga per elenco)
 *   F5  backup/ripristino con uno stato → torna com'era, riferimenti validi
 *   F6  uno stato verso una variante o sede inesistente NON si scrive più (era l'orfano)
 * ```
 */
describe('Stati sync — chiavi esterne', () => {
  let prisma: PrismaClient;
  let admin: AdminTenantsService;
  let exporter: TenantBackupExportService;
  let importer: TenantBackupImportService;
  let varianteId: string;

  const operatore: AttoreRegistro = {
    tipo: PlatformAuditActor.utente,
    userId: IDS.utenteA1,
    name: 'Operatore Piattaforma',
    email: 'admin@vestiflow.it',
  };

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    const config = new ConfigService({ PLATFORM_ADMIN_EMAILS: '' });
    const storage = new SupabaseService(config);
    const audit = new PlatformAuditService(prisma as never, prisma as never);
    admin = new AdminTenantsService(
      prisma as never,
      storage,
      new PlatformAdminService(config),
      config,
      {} as never,
      {} as never,
      new AuthProfileCacheService(),
      audit,
    );
    exporter = new TenantBackupExportService(prisma as never, storage, config);
    importer = new TenantBackupImportService(
      prisma as never,
      storage,
      config,
      new PlatformAdminService(config),
      new AuthProfileCacheService(),
    );
  });

  afterAll(async () => {
    if (prisma) {
      await svuota(prisma).catch(() => undefined);
      await prisma.$disconnect().catch(() => undefined);
    }
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    const prodotto = await prisma.product.create({
      data: {
        tenantId: IDS.tenantA,
        name: 'Articolo FK',
        articleCode: 'FK-1',
        options: [{ name: 'Taglia', values: ['M'] }],
        variants: {
          create: [
            {
              tenantId: IDS.tenantA,
              sku: 'FK-1-M',
              optionValues: [{ name: 'Taglia', value: 'M' }],
              sellingPriceMinor: 1000,
            },
          ],
        },
      },
      include: { variants: true },
    });
    varianteId = prodotto.variants[0]!.id;
  });

  function stato(variantId: string = varianteId, locationId: string = IDS.locA1) {
    return prisma.shopifyInventorySyncState.create({
      data: { tenantId: IDS.tenantA, variantId, locationId, lastPushedAvailable: 3, lastPushedAt: new Date() },
    });
  }

  const conta = () => prisma.shopifyInventorySyncState.count();

  it('F1 · lo svuotamento della fixture raggiunge la tabella: nessun residuo fra una prova e l altra', async () => {
    await stato();
    expect(await conta()).toBe(1);
    await svuota(prisma);
    expect(await conta()).toBe(0);
    await creaDataset(prisma);
  });

  it('F2 · variante eliminata → lo stato della coppia se ne va con lei (CASCADE, come le giacenze)', async () => {
    await stato();
    await prisma.inventoryLevel.create({
      data: { tenantId: IDS.tenantA, variantId: varianteId, locationId: IDS.locA1, onHand: 3, committed: 0, available: 3 },
    });
    await prisma.productVariant.delete({ where: { id: varianteId } });
    expect(await conta()).toBe(0);
    expect(await prisma.inventoryLevel.count({ where: { variantId: varianteId } })).toBe(0);
  });

  it('F3 · sede con uno stato → NON si elimina (RESTRICT); la guardia applicativa la trattiene prima, per nome', async () => {
    await stato(varianteId, IDS.locA2);
    const verifica = await verificaSedeCancellabile(prisma as never, IDS.tenantA, IDS.locA2);
    expect(verifica.puoEssereCancellata).toBe(false);
    expect(verifica.trattenutaDa.join(" ")).toMatch(/stat/i);
    await expect(prisma.location.delete({ where: { id: IDS.locA2 } })).rejects.toMatchObject({
      code: 'P2003',
    });
    expect(await prisma.location.count({ where: { id: IDS.locA2 } })).toBe(1);
    expect(await conta()).toBe(1);
  });

  it('F4 · tenant con stati → la cancellazione amministrativa passa: gli stati escono dalla purga per elenco', async () => {
    await stato();
    await admin.deleteTenant(IDS.tenantA, operatore);
    expect(await prisma.tenant.count({ where: { id: IDS.tenantA } })).toBe(0);
    expect(await conta()).toBe(0);
  });

  it('F5 · backup e ripristino con uno stato → torna com era, con i riferimenti validi', async () => {
    const creato = await stato();
    const zip = await readStreamToBuffer((await exporter.createExportStream(IDS.tenantA)).stream);
    await prisma.shopifyInventorySyncState.update({ where: { id: creato.id }, data: { lastPushedAvailable: 99 } });
    await importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, zip);
    const dopo = await prisma.shopifyInventorySyncState.findUniqueOrThrow({ where: { id: creato.id } });
    expect(dopo).toMatchObject({ variantId: varianteId, locationId: IDS.locA1, lastPushedAvailable: 3 });
    expect(await conta()).toBe(1);
  }, 120_000);

  it('F6 · uno stato verso una variante o una sede inesistente NON si scrive più: era l orfano', async () => {
    const inesistente = '00000000-0000-4000-8000-00000000dead';
    await expect(stato(inesistente, IDS.locA1)).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await expect(stato(varianteId, inesistente)).rejects.toMatchObject({ code: 'P2003' });
    expect(await conta()).toBe(0);
  });
});
