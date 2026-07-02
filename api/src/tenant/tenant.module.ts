import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { LocationLicensingModule } from '../inventory/location-licensing.module';
import { TenantBackupController } from './tenant-backup.controller';
import { TenantBackupExportService } from './tenant-backup/tenant-backup-export.service';
import { TenantBackupImportService } from './tenant-backup/tenant-backup-import.service';
import { TenantCompanyController } from './tenant-company.controller';
import { TenantCompanyService } from './tenant-company.service';
import { TenantFeatureSettingsService } from './tenant-feature-settings.service';

@Module({
  imports: [AuthModule, LocationLicensingModule],
  controllers: [TenantCompanyController, TenantBackupController],
  providers: [
    TenantCompanyService,
    TenantFeatureSettingsService,
    TenantBackupExportService,
    TenantBackupImportService,
  ],
  exports: [TenantFeatureSettingsService],
})
export class TenantModule {}
