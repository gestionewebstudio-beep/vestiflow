import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../common/platform-admin/platform-admin.guard';
import { AdminTenantsService } from './admin-tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import type { ProvisionedTenantDto } from './dto/provisioned-tenant.dto';
import type { TenantSummaryDto } from './dto/tenant-summary.dto';

@Controller('admin/tenants')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminTenantsController {
  constructor(private readonly adminTenants: AdminTenantsService) {}

  @Get()
  listTenants(): Promise<TenantSummaryDto[]> {
    return this.adminTenants.listTenants();
  }

  @Post()
  createTenant(@Body() dto: CreateTenantDto): Promise<ProvisionedTenantDto> {
    return this.adminTenants.createTenant(dto);
  }
}
