import { Module } from '@nestjs/common';

import { LocationLicensingModule } from '../inventory/location-licensing.module';
import { TenantCompanyController } from './tenant-company.controller';
import { TenantCompanyService } from './tenant-company.service';

@Module({
  imports: [LocationLicensingModule],
  controllers: [TenantCompanyController],
  providers: [TenantCompanyService],
})
export class TenantModule {}
