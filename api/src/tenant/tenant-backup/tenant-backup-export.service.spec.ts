import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SupabaseService } from '../../auth/supabase.service';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  readStreamToBuffer,
  readZipEntry,
  readZipManifest,
} from '../../test/fixtures/tenant-backup.fixture';
import { TENANT_BACKUP_DATA_DIR, TENANT_BACKUP_FORMAT_VERSION } from './tenant-backup.constants';
import { TenantBackupExportService } from './tenant-backup-export.service';

function createExportPrismaMock(tenant: { id: string; name: string }) {
  const emptyList = vi.fn().mockResolvedValue([]);
  const emptyUnique = vi.fn().mockResolvedValue(null);

  return {
    tenant: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(tenant),
    },
    user: { findMany: emptyList },
    store: { findMany: emptyList },
    location: { findMany: emptyList },
    userStore: { findMany: emptyList },
    documentTypeSetting: { findMany: emptyList },
    tenantFeatureSettings: { findUnique: emptyUnique },
    documentSequence: { findMany: emptyList },
    supplier: { findMany: emptyList },
    customer: { findMany: emptyList },
    product: { findMany: emptyList },
    productVariant: { findMany: emptyList },
    productImage: { findMany: emptyList },
    supplierVariantLink: { findMany: emptyList },
    inventoryLevel: { findMany: emptyList },
    inventoryLot: { findMany: emptyList },
    inventorySerial: { findMany: emptyList },
    stockMovement: { findMany: emptyList },
    inventoryCountSession: { findMany: emptyList },
    inventoryCountLine: { findMany: emptyList },
    supplierOrder: { findMany: emptyList },
    supplierOrderLine: { findMany: emptyList },
    salesOrder: { findMany: emptyList },
    salesOrderLine: { findMany: emptyList },
    corrispettiviDelivery: { findMany: emptyList },
    document: { findMany: emptyList },
    documentLine: { findMany: emptyList },
    documentRevision: { findMany: emptyList },
    documentAttachment: { findMany: emptyList },
    supplierAttachment: { findMany: emptyList },
    shopifyConnection: { findUnique: emptyUnique },
    shopifyCredential: { findUnique: emptyUnique },
    tikTokConnection: { findUnique: emptyUnique },
    tikTokCredential: { findUnique: emptyUnique },
    userTableViewPreference: { findMany: emptyList },
  };
}

describe('TenantBackupExportService', () => {
  const tenantId = 'tenant-1';
  const tenant = { id: tenantId, name: 'Negozio Demo' };

  let prisma: ReturnType<typeof createExportPrismaMock>;
  let service: TenantBackupExportService;
  const supabase = {
    getStorageClient: vi.fn().mockReturnValue(null),
  };
  const config = {
    get: vi.fn().mockReturnValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = createExportPrismaMock(tenant);
    supabase.getStorageClient.mockReturnValue(null);
    service = new TenantBackupExportService(
      prisma as unknown as PrismaService,
      supabase as unknown as SupabaseService,
      config as unknown as ConfigService,
    );
  });

  it('genera ZIP con manifest e dati tenant', async () => {
    const { stream, filename } = await service.createExportStream(tenantId);
    const zipBuffer = await readStreamToBuffer(stream);

    expect(filename).toMatch(/^vestiflow-backup-Negozio-Demo-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(prisma.tenant.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: tenantId } });

    const manifest = await readZipManifest(zipBuffer);
    expect(manifest).toMatchObject({
      formatVersion: TENANT_BACKUP_FORMAT_VERSION,
      product: 'vestiflow',
      tenantId,
      tenantName: tenant.name,
      attachmentFiles: 0,
    });
    expect(manifest.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const tenantJson = await readZipEntry(zipBuffer, `${TENANT_BACKUP_DATA_DIR}/tenant.json`);
    const tenantRows = JSON.parse(tenantJson) as Array<{ id: string; name: string }>;
    expect(tenantRows).toHaveLength(1);
    expect(tenantRows[0]).toMatchObject({ id: tenantId, name: tenant.name });
  });

  it('non scarica allegati quando storage client assente', async () => {
    const download = vi.fn();
    supabase.getStorageClient.mockReturnValue(null);
    prisma.productImage.findMany.mockResolvedValue([{ storagePath: 'tenant-1/products/photo.webp' }]);

    const { stream } = await service.createExportStream(tenantId);
    const zipBuffer = await readStreamToBuffer(stream);
    const manifest = await readZipManifest(zipBuffer);

    expect(manifest.entityCounts.productImages).toBe(1);
    expect(supabase.getStorageClient).toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });
});
