import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import unzipper from 'unzipper';

import type { User } from '@prisma/client';
import { SupabaseService } from '../../auth/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TENANT_BACKUP_ATTACHMENTS_DIR,
  TENANT_BACKUP_DATA_DIR,
  TENANT_BACKUP_DELETE_ORDER,
  TENANT_BACKUP_ENTITY_FILES,
  TENANT_BACKUP_FORMAT_VERSION,
  TENANT_BACKUP_IMPORT_ORDER,
  TENANT_BACKUP_MANIFEST_FILE,
  type TenantBackupEntityFile,
} from './tenant-backup.constants';
import type { TenantBackupImportResult, TenantBackupManifest } from './tenant-backup-manifest.model';
import { parseBackupRows } from './tenant-backup-serialize.util';

type PrismaTx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

@Injectable()
export class TenantBackupImportService {
  private readonly logger = new Logger(TenantBackupImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async importFromZipBuffer(
    tenantId: string,
    currentUserId: string,
    zipBuffer: Buffer,
  ): Promise<TenantBackupImportResult> {
    const tempDir = join(tmpdir(), `vestiflow-tenant-import-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });

    try {
      await this.extractZip(zipBuffer, tempDir);
      const manifest = await this.readManifest(tempDir);
      this.assertManifestCompatible(manifest, tenantId);

      const entityData = await this.readEntityFiles(tempDir);
      const entityCounts: Partial<Record<TenantBackupEntityFile, number>> = {};

      const currentDbUser = await this.prisma.user.findFirstOrThrow({
        where: { id: currentUserId, tenantId },
      });

      await this.prisma.$transaction(
        async (tx) => {
          await this.purgeTenantData(tx, tenantId, currentUserId);
          await this.importTenantProfile(tx, tenantId, entityData.tenant);
          await this.importUsers(tx, tenantId, currentDbUser, entityData.users ?? []);

          for (const key of TENANT_BACKUP_IMPORT_ORDER) {
            if (key === 'users') {
              continue;
            }
            const rows = entityData[key] ?? [];
            entityCounts[key] = rows.length;
            if (rows.length === 0) {
              continue;
            }
            await this.createEntityRows(tx, key, rows);
          }
        },
        { timeout: 300_000, maxWait: 30_000 },
      );

      const attachmentFilesUploaded = await this.restoreAttachments(tempDir, tenantId);

      return {
        tenantId,
        importedAt: new Date().toISOString(),
        entityCounts,
        attachmentFilesUploaded,
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async extractZip(buffer: Buffer, targetDir: string): Promise<void> {
    const directory = await unzipper.Open.buffer(buffer);
    await directory.extract({ path: targetDir });
  }

  private async readManifest(tempDir: string): Promise<TenantBackupManifest> {
    const raw = await readFile(join(tempDir, TENANT_BACKUP_MANIFEST_FILE), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new BadRequestException('Manifest backup non valido.');
    }
    return parsed as TenantBackupManifest;
  }

  private assertManifestCompatible(manifest: TenantBackupManifest, tenantId: string): void {
    if (manifest.formatVersion !== TENANT_BACKUP_FORMAT_VERSION) {
      throw new BadRequestException(
        `Versione backup non supportata (${manifest.formatVersion}). Aggiorna VestiFlow.`,
      );
    }
    if (manifest.tenantId !== tenantId) {
      throw new ConflictException(
        'Il backup appartiene a un altro negozio. Importa solo pacchetti del tenant corrente.',
      );
    }
  }

  private async readEntityFiles(
    tempDir: string,
  ): Promise<Partial<Record<TenantBackupEntityFile, Record<string, unknown>[]>>> {
    const result: Partial<Record<TenantBackupEntityFile, Record<string, unknown>[]>> = {};

    for (const key of TENANT_BACKUP_ENTITY_FILES) {
      const filePath = join(tempDir, TENANT_BACKUP_DATA_DIR, `${key}.json`);
      try {
        const raw = await readFile(filePath, 'utf8');
        result[key] = parseBackupRows<Record<string, unknown>>(raw);
      } catch {
        result[key] = [];
      }
    }

    return result;
  }

  private async purgeTenantData(tx: PrismaTx, tenantId: string, preserveUserId: string): Promise<void> {
    await tx.shopifyOAuthState.deleteMany({ where: { tenantId } });
    await tx.tikTokOAuthState.deleteMany({ where: { tenantId } });

    for (const key of TENANT_BACKUP_DELETE_ORDER) {
      if (key === 'users') {
        await tx.user.deleteMany({ where: { tenantId, id: { not: preserveUserId } } });
        continue;
      }
      await this.deleteEntityRows(tx, key, tenantId);
    }
  }

  private async deleteEntityRows(tx: PrismaTx, key: TenantBackupEntityFile, tenantId: string): Promise<void> {
    switch (key) {
      case 'userStores':
        await tx.userStore.deleteMany({ where: { user: { tenantId } } });
        return;
      case 'inventoryCountLines':
        await tx.inventoryCountLine.deleteMany({ where: { session: { tenantId } } });
        return;
      case 'supplierOrderLines':
        await tx.supplierOrderLine.deleteMany({ where: { order: { tenantId } } });
        return;
      case 'salesOrderLines':
        await tx.salesOrderLine.deleteMany({ where: { order: { tenantId } } });
        return;
      case 'documentLines':
        await tx.documentLine.deleteMany({ where: { document: { tenantId } } });
        return;
      case 'tenantFeatureSettings':
        await tx.tenantFeatureSettings.deleteMany({ where: { tenantId } });
        return;
      case 'shopifyConnections':
        await tx.shopifyConnection.deleteMany({ where: { tenantId } });
        return;
      case 'shopifyCredentials':
        await tx.shopifyCredential.deleteMany({ where: { tenantId } });
        return;
      case 'tiktokConnections':
        await tx.tikTokConnection.deleteMany({ where: { tenantId } });
        return;
      case 'tiktokCredentials':
        await tx.tikTokCredential.deleteMany({ where: { tenantId } });
        return;
      default:
        await this.deleteByTenantId(tx, key, tenantId);
    }
  }

  private async deleteByTenantId(
    tx: PrismaTx,
    key: TenantBackupEntityFile,
    tenantId: string,
  ): Promise<void> {
    switch (key) {
      case 'stores':
        await tx.store.deleteMany({ where: { tenantId } });
        return;
      case 'locations':
        await tx.location.deleteMany({ where: { tenantId } });
        return;
      case 'documentTypeSettings':
        await tx.documentTypeSetting.deleteMany({ where: { tenantId } });
        return;
      case 'documentSequences':
        await tx.documentSequence.deleteMany({ where: { tenantId } });
        return;
      case 'suppliers':
        await tx.supplier.deleteMany({ where: { tenantId } });
        return;
      case 'customers':
        await tx.customer.deleteMany({ where: { tenantId } });
        return;
      case 'products':
        await tx.product.deleteMany({ where: { tenantId } });
        return;
      case 'productVariants':
        await tx.productVariant.deleteMany({ where: { tenantId } });
        return;
      case 'productImages':
        await tx.productImage.deleteMany({ where: { tenantId } });
        return;
      case 'supplierVariantLinks':
        await tx.supplierVariantLink.deleteMany({ where: { tenantId } });
        return;
      case 'inventoryLevels':
        await tx.inventoryLevel.deleteMany({ where: { tenantId } });
        return;
      case 'inventoryLots':
        await tx.inventoryLot.deleteMany({ where: { tenantId } });
        return;
      case 'inventorySerials':
        await tx.inventorySerial.deleteMany({ where: { tenantId } });
        return;
      case 'stockMovements':
        await tx.stockMovement.deleteMany({ where: { tenantId } });
        return;
      case 'inventoryCountSessions':
        await tx.inventoryCountSession.deleteMany({ where: { tenantId } });
        return;
      case 'supplierOrders':
        await tx.supplierOrder.deleteMany({ where: { tenantId } });
        return;
      case 'salesOrders':
        await tx.salesOrder.deleteMany({ where: { tenantId } });
        return;
      case 'corrispettiviDeliveries':
        await tx.corrispettiviDelivery.deleteMany({ where: { tenantId } });
        return;
      case 'documents':
        await tx.document.deleteMany({ where: { tenantId } });
        return;
      case 'documentRevisions':
        await tx.documentRevision.deleteMany({ where: { tenantId } });
        return;
      case 'documentAttachments':
        await tx.documentAttachment.deleteMany({ where: { tenantId } });
        return;
      case 'supplierAttachments':
        await tx.supplierAttachment.deleteMany({ where: { tenantId } });
        return;
      case 'userTableViewPreferences':
        await tx.userTableViewPreference.deleteMany({ where: { tenantId } });
        return;
      default:
        return;
    }
  }

  private async importTenantProfile(
    tx: PrismaTx,
    tenantId: string,
    rows: Record<string, unknown>[] | undefined,
  ): Promise<void> {
    const row = rows?.[0];
    if (!row) {
      return;
    }
    const { id: _id, createdAt: _c, ...rest } = row;
    await tx.tenant.update({
      where: { id: tenantId },
      data: rest as never,
    });
  }

  private async importUsers(
    tx: PrismaTx,
    tenantId: string,
    currentUser: User,
    rows: Record<string, unknown>[],
  ): Promise<void> {
    const backupSelf = rows.find(
      (row) =>
        typeof row['authUserId'] === 'string' &&
        currentUser.authUserId &&
        row['authUserId'] === currentUser.authUserId,
    );
    const others = rows.filter(
      (row) =>
        typeof row['authUserId'] !== 'string' ||
        !currentUser.authUserId ||
        row['authUserId'] !== currentUser.authUserId,
    );

    if (others.length > 0) {
      await tx.user.createMany({
        data: others.map((row) => ({ ...row, tenantId })) as never[],
      });
    }

    if (backupSelf) {
      const { id: _id, ...rest } = backupSelf;
      await tx.user.update({
        where: { id: currentUser.id },
        data: { ...rest, tenantId, id: currentUser.id } as never,
      });
    }
  }

  private async createEntityRows(
    tx: PrismaTx,
    key: TenantBackupEntityFile,
    rows: Record<string, unknown>[],
  ): Promise<void> {
    const data = rows as never[];
    switch (key) {
      case 'stores':
        await tx.store.createMany({ data });
        return;
      case 'locations':
        await tx.location.createMany({ data });
        return;
      case 'userStores':
        await tx.userStore.createMany({ data });
        return;
      case 'documentTypeSettings':
        await tx.documentTypeSetting.createMany({ data });
        return;
      case 'tenantFeatureSettings':
        await tx.tenantFeatureSettings.createMany({ data });
        return;
      case 'documentSequences':
        await tx.documentSequence.createMany({ data });
        return;
      case 'suppliers':
        await tx.supplier.createMany({ data });
        return;
      case 'customers':
        await tx.customer.createMany({ data });
        return;
      case 'products':
        await tx.product.createMany({ data });
        return;
      case 'productVariants':
        await tx.productVariant.createMany({ data });
        return;
      case 'productImages':
        await tx.productImage.createMany({ data });
        return;
      case 'supplierVariantLinks':
        await tx.supplierVariantLink.createMany({ data });
        return;
      case 'inventoryLevels':
        await tx.inventoryLevel.createMany({ data });
        return;
      case 'inventoryLots':
        await tx.inventoryLot.createMany({ data });
        return;
      case 'inventorySerials':
        await tx.inventorySerial.createMany({ data });
        return;
      case 'stockMovements':
        await tx.stockMovement.createMany({ data });
        return;
      case 'inventoryCountSessions':
        await tx.inventoryCountSession.createMany({ data });
        return;
      case 'inventoryCountLines':
        await tx.inventoryCountLine.createMany({ data });
        return;
      case 'supplierOrders':
        await tx.supplierOrder.createMany({ data });
        return;
      case 'supplierOrderLines':
        await tx.supplierOrderLine.createMany({ data });
        return;
      case 'salesOrders':
        await tx.salesOrder.createMany({ data });
        return;
      case 'salesOrderLines':
        await tx.salesOrderLine.createMany({ data });
        return;
      case 'corrispettiviDeliveries':
        await tx.corrispettiviDelivery.createMany({ data });
        return;
      case 'documents':
        await tx.document.createMany({ data });
        return;
      case 'documentLines':
        await tx.documentLine.createMany({ data });
        return;
      case 'documentRevisions':
        await tx.documentRevision.createMany({ data });
        return;
      case 'documentAttachments':
        await tx.documentAttachment.createMany({ data });
        return;
      case 'supplierAttachments':
        await tx.supplierAttachment.createMany({ data });
        return;
      case 'shopifyConnections':
        await tx.shopifyConnection.createMany({ data });
        return;
      case 'shopifyCredentials':
        await tx.shopifyCredential.createMany({ data });
        return;
      case 'tiktokConnections':
        await tx.tikTokConnection.createMany({ data });
        return;
      case 'tiktokCredentials':
        await tx.tikTokCredential.createMany({ data });
        return;
      case 'userTableViewPreferences':
        await tx.userTableViewPreference.createMany({ data });
        return;
      default:
        return;
    }
  }

  private async restoreAttachments(tempDir: string, _tenantId: string): Promise<number> {
    const client = this.supabase.getStorageClient();
    if (!client) {
      return 0;
    }

    const attachmentsRoot = join(tempDir, TENANT_BACKUP_ATTACHMENTS_DIR);
    let uploaded = 0;

    const buckets = [
      this.config.get<string>('SUPABASE_PRODUCT_MEDIA_BUCKET') ?? 'product-media',
      this.config.get<string>('SUPABASE_DOCUMENT_ATTACHMENTS_BUCKET') ?? 'document-attachments',
      this.config.get<string>('SUPABASE_SUPPLIER_ATTACHMENTS_BUCKET') ?? 'supplier-attachments',
      this.config.get<string>('SUPABASE_USER_AVATARS_BUCKET') ?? 'user-avatars',
    ];

    for (const bucket of buckets) {
      const bucketDir = join(attachmentsRoot, bucket);
      try {
        uploaded += await this.uploadAttachmentTree(client, bucket, bucketDir, bucketDir);
      } catch (error) {
        this.logger.warn(`Restore storage ${bucket}: ${error instanceof Error ? error.message : error}`);
      }
    }

    return uploaded;
  }

  private async uploadAttachmentTree(
    client: NonNullable<ReturnType<SupabaseService['getStorageClient']>>,
    bucket: string,
    bucketRootDir: string,
    currentDir: string,
  ): Promise<number> {
    const { readdir, stat, readFile } = await import('node:fs/promises');
    let count = 0;

    let entries: string[];
    try {
      entries = await readdir(currentDir);
    } catch {
      return 0;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const info = await stat(fullPath);
      if (info.isDirectory()) {
        count += await this.uploadAttachmentTree(client, bucket, bucketRootDir, fullPath);
        continue;
      }

      const objectPath = fullPath
        .slice(bucketRootDir.length + 1)
        .split(/[/\\]/)
        .join('/');

      const buffer = await readFile(fullPath);
      const { error } = await client.storage.from(bucket).upload(objectPath, buffer, {
        upsert: true,
        contentType: this.guessContentType(objectPath),
      });
      if (error) {
        this.logger.warn(`Upload ${bucket}/${objectPath}: ${error.message}`);
        continue;
      }
      count += 1;
    }

    return count;
  }

  private guessContentType(path: string): string {
    const lower = path.toLowerCase();
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.xml')) return 'application/xml';
    return 'application/octet-stream';
  }
}
