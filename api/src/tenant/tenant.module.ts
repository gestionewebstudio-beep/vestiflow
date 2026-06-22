import { Module } from '@nestjs/common';

import { TenantCompanyController } from './tenant-company.controller';
import { TenantCompanyService } from './tenant-company.service';

@Module({
  controllers: [TenantCompanyController],
  providers: [TenantCompanyService],
})
export class TenantModule {}
