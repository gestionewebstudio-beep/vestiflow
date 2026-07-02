export interface TenantBackupImportResultDto {
  readonly tenantId: string;
  readonly importedAt: string;
  readonly entityCounts: Readonly<Record<string, number>>;
  readonly attachmentFilesUploaded: number;
}

export interface TenantBackupImportResult {
  readonly tenantId: string;
  readonly importedAt: string;
  readonly entityCounts: Readonly<Record<string, number>>;
  readonly attachmentFilesUploaded: number;
}

export function tenantBackupImportResultFromDto(
  dto: TenantBackupImportResultDto,
): TenantBackupImportResult {
  return {
    tenantId: dto.tenantId,
    importedAt: dto.importedAt,
    entityCounts: dto.entityCounts,
    attachmentFilesUploaded: dto.attachmentFilesUploaded,
  };
}
