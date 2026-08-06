import {
  Controller,
  Get,
  Header,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';

import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { tenantBackupUploadMulterOptions } from '../common/upload/multer-upload.options';
import { TenantBackupExportService } from './tenant-backup/tenant-backup-export.service';
import { TenantBackupImportService } from './tenant-backup/tenant-backup-import.service';
import type { TenantBackupImportResult } from './tenant-backup/tenant-backup-manifest.model';

@Controller('tenant/backup')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantBackupController {
  constructor(
    private readonly exportService: TenantBackupExportService,
    private readonly importService: TenantBackupImportService,
  ) {}

  /** Esporta backup completo del tenant (solo titolare). */
  @Get('export')
  @Roles(UserRole.owner)
  @Header('Cache-Control', 'no-store')
  async exportBackup(@CurrentTenant() tenantId: string): Promise<StreamableFile> {
    const { stream, filename } = await this.exportService.createExportStream(tenantId);
    return new StreamableFile(stream, {
      type: 'application/zip',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  /** Ripristina backup tenant da ZIP (solo titolare, sostituisce dati operativi). */
  @Post('import')
  @Roles(UserRole.owner)
  @UseInterceptors(FileInterceptor('file', tenantBackupUploadMulterOptions))
  importBackup(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('confirm') confirm: string | undefined,
  ): Promise<TenantBackupImportResult> {
    if (confirm !== 'REPLACE') {
      throw new BadRequestException(
        'Import bloccato: aggiungi ?confirm=REPLACE per confermare la sostituzione dei dati.',
      );
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('File ZIP backup mancante o vuoto.');
    }
    if (file.mimetype !== 'application/zip' && !file.originalname.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('Il file deve essere un archivio ZIP di backup VestiFlow.');
    }

    return this.importService.importFromZipBuffer(tenantId, user.id, file.buffer);
  }
}
