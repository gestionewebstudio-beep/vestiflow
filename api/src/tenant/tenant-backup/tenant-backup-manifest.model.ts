import type { TenantBackupEntityFile } from './tenant-backup.constants';

export interface TenantBackupManifest {
  readonly formatVersion: number;
  readonly product: 'vestiflow';
  readonly exportedAt: string;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly entityCounts: Partial<Record<TenantBackupEntityFile, number>>;
  readonly attachmentFiles: number;
  readonly notes: readonly string[];
}

export interface TenantBackupImportResult {
  readonly tenantId: string;
  readonly importedAt: string;
  readonly entityCounts: Partial<Record<TenantBackupEntityFile, number>>;
  readonly attachmentFilesUploaded: number;
}
