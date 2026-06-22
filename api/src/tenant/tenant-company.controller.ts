import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { TenantCompanyDto } from './dto/tenant-company.dto';
import { TenantCompanyService } from './tenant-company.service';

@Controller('tenant')
@UseGuards(JwtAuthGuard)
export class TenantCompanyController {
  constructor(private readonly tenantCompany: TenantCompanyService) {}

  @Get('company')
  getCompany(@CurrentTenant() tenantId: string): Promise<TenantCompanyDto> {
    return this.tenantCompany.getCompany(tenantId);
  }
}
