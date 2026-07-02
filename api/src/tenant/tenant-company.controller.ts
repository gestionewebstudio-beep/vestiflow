import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantPermission } from '../auth/tenant-permission.constants';
import { RequirePermissions } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { TenantCompanyDto } from './dto/tenant-company.dto';
import type { TenantFeatureSettingsDto } from './dto/tenant-feature-settings.dto';
import { UpdateTenantFeatureSettingsDto } from './dto/tenant-feature-settings.dto';
import { TenantCompanyService } from './tenant-company.service';
import { TenantFeatureSettingsService } from './tenant-feature-settings.service';

@Controller('tenant')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class TenantCompanyController {
  constructor(
    private readonly tenantCompany: TenantCompanyService,
    private readonly featureSettings: TenantFeatureSettingsService,
  ) {}

  @Get('company')
  @RequirePermissions(TenantPermission.SettingsCompany)
  getCompany(@CurrentTenant() tenantId: string): Promise<TenantCompanyDto> {
    return this.tenantCompany.getCompany(tenantId);
  }

  @Get('feature-settings')
  @RequirePermissions(TenantPermission.SettingsCompany)
  getFeatureSettings(@CurrentTenant() tenantId: string): Promise<TenantFeatureSettingsDto> {
    return this.featureSettings.getOrCreate(tenantId);
  }

  @Patch('feature-settings')
  @RequirePermissions(TenantPermission.SettingsCompany)
  updateFeatureSettings(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateTenantFeatureSettingsDto,
  ): Promise<TenantFeatureSettingsDto> {
    return this.featureSettings.update(tenantId, dto);
  }
}
