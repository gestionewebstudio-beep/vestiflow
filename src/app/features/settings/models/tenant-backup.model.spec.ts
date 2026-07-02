import { describe, expect, it } from 'vitest';

import { tenantBackupImportResultFromDto } from './tenant-backup.model';

describe('tenantBackupImportResultFromDto', () => {
  it('mappa il DTO di import backup tenant', () => {
    const result = tenantBackupImportResultFromDto({
      tenantId: 'tenant-1',
      importedAt: '2026-01-01T00:00:00.000Z',
      entityCounts: { stores: 2, products: 10 },
      attachmentFilesUploaded: 3,
    });

    expect(result).toEqual({
      tenantId: 'tenant-1',
      importedAt: '2026-01-01T00:00:00.000Z',
      entityCounts: { stores: 2, products: 10 },
      attachmentFilesUploaded: 3,
    });
  });
});
