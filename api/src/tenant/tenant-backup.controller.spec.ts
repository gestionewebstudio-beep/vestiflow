import { BadRequestException, StreamableFile } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../common/auth/roles.decorator';
import { testOwnerUser } from '../test/fixtures/user-profile.fixture';
import type { TenantBackupExportService } from './tenant-backup/tenant-backup-export.service';
import type { TenantBackupImportService } from './tenant-backup/tenant-backup-import.service';
import { TenantBackupController } from './tenant-backup.controller';

describe('TenantBackupController', () => {
  const exportService = {
    createExportStream: vi.fn(),
  };
  const importService = {
    importFromZipBuffer: vi.fn(),
  };

  const controller = new TenantBackupController(
    exportService as unknown as TenantBackupExportService,
    importService as unknown as TenantBackupImportService,
  );

  it('limita export e import al ruolo owner', () => {
    const exportRoles = Reflect.getMetadata(
      ROLES_KEY,
      TenantBackupController.prototype.exportBackup,
    ) as UserRole[];
    const importRoles = Reflect.getMetadata(
      ROLES_KEY,
      TenantBackupController.prototype.importBackup,
    ) as UserRole[];

    expect(exportRoles).toEqual([UserRole.owner]);
    expect(importRoles).toEqual([UserRole.owner]);
  });

  it('exportBackup delega al service e restituisce StreamableFile', async () => {
    const stream = new PassThrough();
    exportService.createExportStream.mockResolvedValue({
      stream,
      filename: 'vestiflow-backup-test.zip',
    });

    const result = await controller.exportBackup('tenant-1');

    expect(exportService.createExportStream).toHaveBeenCalledWith('tenant-1');
    expect(result).toBeInstanceOf(StreamableFile);
  });

  it('importBackup richiede confirm=REPLACE', () => {
    const user = testOwnerUser();

    expect(() =>
      controller.importBackup(
        'tenant-1',
        user,
        { buffer: Buffer.from('x') } as Express.Multer.File,
        undefined,
      ),
    ).toThrow(BadRequestException);

    expect(importService.importFromZipBuffer).not.toHaveBeenCalled();
  });

  it('importBackup rifiuta file mancante o vuoto', () => {
    const user = testOwnerUser();

    expect(() => controller.importBackup('tenant-1', user, undefined, 'REPLACE')).toThrow(
      BadRequestException,
    );

    expect(() =>
      controller.importBackup(
        'tenant-1',
        user,
        { buffer: Buffer.alloc(0) } as Express.Multer.File,
        'REPLACE',
      ),
    ).toThrow(BadRequestException);
  });

  it('importBackup rifiuta file non ZIP', () => {
    const user = testOwnerUser();

    expect(() =>
      controller.importBackup(
        'tenant-1',
        user,
        {
          buffer: Buffer.from('not-a-zip'),
          mimetype: 'text/plain',
          originalname: 'backup.txt',
        } as Express.Multer.File,
        'REPLACE',
      ),
    ).toThrow(BadRequestException);
  });

  it('importBackup delega al service con confirm REPLACE', async () => {
    const user = testOwnerUser();
    const buffer = Buffer.from('zip-content');
    const importResult = {
      tenantId: 'tenant-1',
      importedAt: '2026-01-01T00:00:00.000Z',
      entityCounts: {},
      attachmentFilesUploaded: 0,
    };
    importService.importFromZipBuffer.mockResolvedValue(importResult);

    await expect(
      controller.importBackup(
        'tenant-1',
        user,
        {
          buffer,
          mimetype: 'application/zip',
          originalname: 'backup.zip',
        } as Express.Multer.File,
        'REPLACE',
      ),
    ).resolves.toEqual(importResult);

    expect(importService.importFromZipBuffer).toHaveBeenCalledWith('tenant-1', user.id, buffer);
  });
});
