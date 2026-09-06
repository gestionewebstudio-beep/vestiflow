import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZipArchive } from 'archiver';
import type { Archiver } from 'archiver';
import type { Readable } from 'node:stream';
import { PassThrough } from 'node:stream';

import { SupabaseService } from '../../auth/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TENANT_BACKUP_DATA_DIR,
  TENANT_BACKUP_ENTITY_FILES,
  TENANT_BACKUP_FORMAT_VERSION,
  TENANT_BACKUP_MANIFEST_FILE,
  type TenantBackupEntityFile,
} from './tenant-backup.constants';
import type { TenantBackupManifest } from './tenant-backup-manifest.model';
import { serializeBackupRows } from './tenant-backup-serialize.util';

import { readTenantBackupData } from './tenant-backup-entities.util';
import { backupAttachmentRefs, downloadBackupAttachments } from './tenant-backup-storage.util';

@Injectable()
export class TenantBackupExportService {
  private readonly logger = new Logger(TenantBackupExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async createExportStream(tenantId: string): Promise<{ stream: Readable; filename: string }> {
    const snapshot = await this.prisma.$transaction(
      async (tx) => ({
        data: await readTenantBackupData(tx, tenantId),
        globalReferences: {
          vatNatures: await tx.vatNature.findMany({ select: { id: true, key: true } }),
          paymentMethodCodes: await tx.paymentMethodCode.findMany({
            select: { id: true, code: true },
          }),
        },
      }),
      { isolationLevel: 'RepeatableRead', timeout: 300_000 },
    );
    const tenant = snapshot.data.tenant![0]!;
    const entityCounts: Partial<Record<TenantBackupEntityFile, number>> = {};
    const refs = backupAttachmentRefs(snapshot.data, tenantId, this.config);
    const files = await downloadBackupAttachments(this.supabase.getStorageClient(), refs);
    const archive = new ZipArchive({ zlib: { level: 9 } }) as Archiver;
    const output = new PassThrough();
    archive.on('error', (error: Error) => output.destroy(error));
    archive.pipe(output);
    for (const key of TENANT_BACKUP_ENTITY_FILES) {
      const rows = snapshot.data[key] ?? [];
      entityCounts[key] = rows.length;
      archive.append(serializeBackupRows(rows), { name: `${TENANT_BACKUP_DATA_DIR}/${key}.json` });
    }
    for (const [name, buffer] of files) archive.append(buffer, { name });

    const manifest: TenantBackupManifest = {
      formatVersion: TENANT_BACKUP_FORMAT_VERSION,
      product: 'vestiflow',
      exportedAt: new Date().toISOString(),
      tenantId,
      tenantName: String(tenant['name']),
      globalReferences: snapshot.globalReferences,
      entityCounts,
      attachmentFiles: files.size,
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
    const safeName = String(tenant['name'])
      .replace(/[^\w-]+/g, '-')
      .slice(0, 40);
    return {
      stream: output,
      filename: `vestiflow-backup-${safeName}-${stamp}.zip`,
    };
  }
}
