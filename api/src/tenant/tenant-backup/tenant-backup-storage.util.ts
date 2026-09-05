import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { BackupData, BackupRow } from './tenant-backup-entities.util';

export interface BackupAttachmentRef {
  readonly bucket: string;
  readonly storagePath: string;
  readonly zipPath: string;
  readonly row: BackupRow;
  readonly pathField: string;
  readonly urlField?: string;
}

export function backupAttachmentRefs(
  data: BackupData,
  tenantId: string,
  config: ConfigService,
): BackupAttachmentRef[] {
  const refs: BackupAttachmentRef[] = [];
  const groups = [
    ['productImages', 'SUPABASE_PRODUCT_MEDIA_BUCKET', 'product-media', 'storagePath', 'url'],
    [
      'documentAttachments',
      'SUPABASE_DOCUMENT_ATTACHMENTS_BUCKET',
      'document-attachments',
      'storagePath',
    ],
    ['attachments', 'SUPABASE_DOCUMENT_ATTACHMENTS_BUCKET', 'document-attachments', 'storagePath'],
    [
      'supplierAttachments',
      'SUPABASE_SUPPLIER_ATTACHMENTS_BUCKET',
      'supplier-attachments',
      'storagePath',
    ],
    ['users', 'SUPABASE_USER_AVATARS_BUCKET', 'user-avatars', 'avatarStoragePath', 'avatarUrl'],
  ] as const;
  for (const [key, setting, fallback, pathField, urlField] of groups) {
    const bucket = config.get<string>(setting) ?? fallback;
    for (const row of data[key] ?? []) {
      const path = row[pathField];
      if (path === null || path === undefined || path === '') continue;
      if (
        typeof path !== 'string' ||
        !path.startsWith(`${tenantId}/`) ||
        path.includes('\\') ||
        path.split('/').some((part) => !part || part === '.' || part === '..')
      ) {
        throw new BadRequestException(
          'Il backup contiene un percorso allegato non valido per questo negozio.',
        );
      }
      refs.push({
        bucket,
        storagePath: path,
        zipPath: `attachments/${bucket}/${path}`,
        row,
        pathField,
        urlField,
      });
    }
  }
  return refs;
}

export async function downloadBackupAttachments(
  client: SupabaseClient | null,
  refs: BackupAttachmentRef[],
) {
  const files = new Map<string, Buffer>();
  if (refs.length && !client)
    throw new ServiceUnavailableException(
      'Storage non disponibile: backup incompleto, esportazione annullata.',
    );
  for (const ref of refs) {
    if (files.has(ref.zipPath)) continue;
    const { data, error } = await client!.storage.from(ref.bucket).download(ref.storagePath);
    if (error || !data)
      throw new ServiceUnavailableException(
        'Un allegato non è disponibile: esportazione annullata.',
      );
    files.set(ref.zipPath, Buffer.from(await data.arrayBuffer()));
  }
  return files;
}
