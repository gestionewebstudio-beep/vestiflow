import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantPermission } from '../auth/tenant-permission.constants';
import { RequirePermissions } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { TenantCompanyDto } from './dto/tenant-company.dto';
import { TenantCompanyService } from './tenant-company.service';

@Controller('tenant')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class TenantCompanyController {
  constructor(private readonly tenantCompany: TenantCompanyService) {}

  @Get('company')
  @RequirePermissions(TenantPermission.SettingsCompany)
  getCompany(@CurrentTenant() tenantId: string): Promise<TenantCompanyDto> {
    return this.tenantCompany.getCompany(tenantId);
  }
}
