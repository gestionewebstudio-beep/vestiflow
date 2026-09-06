import type { TenantBackupEntityFile } from './tenant-backup.constants';

export interface TenantBackupManifest {
  readonly formatVersion: number;
  readonly product: 'vestiflow';
  readonly exportedAt: string;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly entityCounts: Partial<Record<TenantBackupEntityFile, number>>;
  readonly attachmentFiles: number;
  /** Solo identità: i cataloghi globali non vengono importati o cancellati. */
  readonly globalReferences?: {
    readonly vatNatures: readonly { readonly id: string; readonly key: string }[];
    readonly paymentMethodCodes: readonly { readonly id: string; readonly code: string }[];
  };
  readonly notes: readonly string[];
}

export interface TenantBackupImportResult {
  readonly tenantId: string;
  readonly importedAt: string;
  readonly entityCounts: Partial<Record<TenantBackupEntityFile, number>>;
  readonly attachmentFilesUploaded: number;
}
