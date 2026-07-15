import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZipArchive } from 'archiver';
import type { Archiver } from 'archiver';
import type { Readable } from 'node:stream';
import { PassThrough } from 'node:stream';

import { SupabaseService } from '../../auth/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TENANT_BACKUP_ATTACHMENTS_DIR,
  TENANT_BACKUP_DATA_DIR,
  TENANT_BACKUP_ENTITY_FILES,
  TENANT_BACKUP_FORMAT_VERSION,
  TENANT_BACKUP_MANIFEST_FILE,
  type TenantBackupEntityFile,
} from './tenant-backup.constants';
import type { TenantBackupManifest } from './tenant-backup-manifest.model';
import { serializeBackupRows } from './tenant-backup-serialize.util';

interface AttachmentRef {
  readonly bucket: string;
  readonly storagePath: string;
  readonly zipPath: string;
}

@Injectable()
export class TenantBackupExportService {
  private readonly logger = new Logger(TenantBackupExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async createExportStream(tenantId: string): Promise<{ stream: Readable; filename: string }> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const entityCounts: Partial<Record<TenantBackupEntityFile, number>> = {};
    const attachmentRefs: AttachmentRef[] = [];

    const archive = new ZipArchive({ zlib: { level: 9 } }) as Archiver;
    const output = new PassThrough();
    archive.on('error', (error: Error) => {
      output.destroy(error);
    });
    archive.pipe(output);

    for (const key of TENANT_BACKUP_ENTITY_FILES) {
      if (key === 'tenant') {
        continue;
      }
      const rows = await this.fetchEntityRows(tenantId, key);
      entityCounts[key] = rows.length;
      archive.append(serializeBackupRows([...rows]), {
        name: `${TENANT_BACKUP_DATA_DIR}/${key}.json`,
      });
      this.collectAttachmentRefs(key, rows, attachmentRefs);
    }

    const tenantRow = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    entityCounts.tenant = 1;
    archive.append(serializeBackupRows([tenantRow]), {
      name: `${TENANT_BACKUP_DATA_DIR}/tenant.json`,
    });

    await this.appendStorageFiles(archive, attachmentRefs);

    const manifest: TenantBackupManifest = {
      formatVersion: TENANT_BACKUP_FORMAT_VERSION,
      product: 'vestiflow',
      exportedAt: new Date().toISOString(),
      tenantId,
      tenantName: tenant.name,
      entityCounts,
      attachmentFiles: attachmentRefs.length,
      notes: [
        'Backup logico del tenant VestiFlow. Ripristino solo tramite import nello stesso tenant.',
        'OAuth state ephemeral esclusi. Dopo restore verificare connessione Shopify/TikTok.',
      ],
    };
    archive.append(`${JSON.stringify(manifest, null, 2)}\n`, { name: TENANT_BACKUP_MANIFEST_FILE });

    void archive.finalize().catch((error: unknown) => {
      this.logger.error('Finalizzazione ZIP backup fallita', error);
      output.destroy(error instanceof Error ? error : new Error(String(error)));
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const safeName = tenant.name.replace(/[^\w-]+/g, '-').slice(0, 40);
    return {
      stream: output,
      filename: `vestiflow-backup-${safeName}-${stamp}.zip`,
    };
  }

  private async fetchEntityRows(
    tenantId: string,
    key: TenantBackupEntityFile,
  ): Promise<readonly Record<string, unknown>[]> {
    switch (key) {
      case 'tenant':
        return [];
      case 'users':
        return this.prisma.user.findMany({ where: { tenantId } });
      case 'stores':
        return this.prisma.store.findMany({ where: { tenantId } });
      case 'locations':
        return this.prisma.location.findMany({ where: { tenantId } });
      case 'userStores':
        return this.prisma.userStore.findMany({
          where: { user: { tenantId } },
        });
      case 'documentTypeSettings':
        return this.prisma.documentTypeSetting.findMany({ where: { tenantId } });
      case 'vatCodes':
        return this.prisma.vatCode.findMany({ where: { tenantId } });
      case 'tenantFeatureSettings': {
        const row = await this.prisma.tenantFeatureSettings.findUnique({ where: { tenantId } });
        return row ? [row] : [];
      }
      case 'documentSequences':
        return this.prisma.documentSequence.findMany({ where: { tenantId } });
      case 'paymentOptions':
        return this.prisma.paymentOption.findMany({ where: { tenantId } });
      case 'parties':
        return this.prisma.party.findMany({ where: { tenantId } });
      case 'suppliers':
        return this.prisma.supplier.findMany({ where: { tenantId } });
      case 'customers':
        return this.prisma.customer.findMany({ where: { tenantId } });
      case 'products':
        return this.prisma.product.findMany({ where: { tenantId } });
      case 'productVariants':
        return this.prisma.productVariant.findMany({ where: { tenantId } });
      case 'productImages':
        return this.prisma.productImage.findMany({ where: { tenantId } });
      case 'supplierVariantLinks':
        return this.prisma.supplierVariantLink.findMany({ where: { tenantId } });
      case 'inventoryLevels':
        return this.prisma.inventoryLevel.findMany({ where: { tenantId } });
      case 'inventoryLots':
        return this.prisma.inventoryLot.findMany({ where: { tenantId } });
      case 'inventorySerials':
        return this.prisma.inventorySerial.findMany({ where: { tenantId } });
      case 'stockMovements':
        return this.prisma.stockMovement.findMany({ where: { tenantId } });
      case 'inventoryCountSessions':
        return this.prisma.inventoryCountSession.findMany({ where: { tenantId } });
      case 'inventoryCountLines':
        return this.prisma.inventoryCountLine.findMany({
          where: { session: { tenantId } },
        });
      case 'supplierOrders':
        return this.prisma.supplierOrder.findMany({ where: { tenantId } });
      case 'supplierOrderLines':
        return this.prisma.supplierOrderLine.findMany({
          where: { order: { tenantId } },
        });
      case 'salesOrders':
        return this.prisma.salesOrder.findMany({ where: { tenantId } });
      case 'salesOrderLines':
        return this.prisma.salesOrderLine.findMany({
          where: { order: { tenantId } },
        });
      case 'stockReservations':
        return this.prisma.stockReservation.findMany({ where: { tenantId } });
      case 'stockReservationEvents':
        return this.prisma.stockReservationEvent.findMany({ where: { tenantId } });
      case 'onlineOrderEvents':
        return this.prisma.onlineOrderEvent.findMany({ where: { tenantId } });
      case 'corrispettiviDeliveries':
        return this.prisma.corrispettiviDelivery.findMany({ where: { tenantId } });
      case 'documents':
        return this.prisma.document.findMany({ where: { tenantId } });
      case 'documentLines':
        return this.prisma.documentLine.findMany({ where: { document: { tenantId } } });
      case 'documentRevisions':
        return this.prisma.documentRevision.findMany({ where: { tenantId } });
      case 'documentAttachments':
        return this.prisma.documentAttachment.findMany({ where: { tenantId } });
      case 'supplierAttachments':
        return this.prisma.supplierAttachment.findMany({ where: { tenantId } });
      case 'shopifyConnections': {
        const row = await this.prisma.shopifyConnection.findUnique({ where: { tenantId } });
        return row ? [row] : [];
      }
      case 'shopifyCredentials': {
        const row = await this.prisma.shopifyCredential.findUnique({ where: { tenantId } });
        return row ? [row] : [];
      }
      case 'tiktokConnections': {
        const row = await this.prisma.tikTokConnection.findUnique({ where: { tenantId } });
        return row ? [row] : [];
      }
      case 'tiktokCredentials': {
        const row = await this.prisma.tikTokCredential.findUnique({ where: { tenantId } });
        return row ? [row] : [];
      }
      case 'userTableViewPreferences':
        return this.prisma.userTableViewPreference.findMany({ where: { tenantId } });
      default:
        return [];
    }
  }

  private collectAttachmentRefs(
    key: TenantBackupEntityFile,
    rows: readonly Record<string, unknown>[],
    refs: AttachmentRef[],
  ): void {
    const productBucket =
      this.config.get<string>('SUPABASE_PRODUCT_MEDIA_BUCKET') ?? 'product-media';
    const documentBucket =
      this.config.get<string>('SUPABASE_DOCUMENT_ATTACHMENTS_BUCKET') ?? 'document-attachments';
    const supplierBucket =
      this.config.get<string>('SUPABASE_SUPPLIER_ATTACHMENTS_BUCKET') ?? 'supplier-attachments';
    const avatarBucket =
      this.config.get<string>('SUPABASE_USER_AVATARS_BUCKET') ?? 'user-avatars';

    for (const row of rows) {
      if (key === 'productImages') {
        this.pushAttachmentRef(refs, productBucket, row['storagePath'], productBucket);
      }
      if (key === 'documentAttachments') {
        this.pushAttachmentRef(refs, documentBucket, row['storagePath'], documentBucket);
      }
      if (key === 'supplierAttachments') {
        this.pushAttachmentRef(refs, supplierBucket, row['storagePath'], supplierBucket);
      }
      if (key === 'users') {
        this.pushAttachmentRef(refs, avatarBucket, row['avatarStoragePath'], avatarBucket);
      }
    }
  }

  private pushAttachmentRef(
    refs: AttachmentRef[],
    bucket: string,
    storagePath: unknown,
    folder: string,
  ): void {
    if (typeof storagePath !== 'string' || !storagePath.trim()) {
      return;
    }
    const path = storagePath.trim();
    refs.push({
      bucket,
      storagePath: path,
      zipPath: `${TENANT_BACKUP_ATTACHMENTS_DIR}/${folder}/${path}`,
    });
  }

  private async appendStorageFiles(archive: Archiver, refs: AttachmentRef[]): Promise<void> {
    const client = this.supabase.getStorageClient();
    if (!client || refs.length === 0) {
      return;
    }

    for (const ref of refs) {
      const { data, error } = await client.storage.from(ref.bucket).download(ref.storagePath);
      if (error || !data) {
        this.logger.warn(`Allegato non scaricato ${ref.bucket}/${ref.storagePath}: ${error?.message}`);
        continue;
      }
      const buffer = Buffer.from(await data.arrayBuffer());
      archive.append(buffer, { name: ref.zipPath });
    }
  }
}
