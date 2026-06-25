import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../common/platform-admin/platform-admin.guard';
import type { LocationLicenseSummaryDto } from '../inventory/location-licensing.service';
import { AdminTenantsService } from './admin-tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import type { ProvisionedTenantDto } from './dto/provisioned-tenant.dto';
import type { TenantDetailDto } from './dto/tenant-detail.dto';
import type { TenantSummaryDto } from './dto/tenant-summary.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

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

  @Get(':id')
  getTenantById(@Param('id', ParseUUIDPipe) id: string): Promise<TenantDetailDto> {
    return this.adminTenants.getTenantById(id);
  }

  @Patch(':id')
  updateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<TenantDetailDto> {
    return this.adminTenants.updateTenant(id, dto);
  }

  @Delete(':id')
  deleteTenant(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.adminTenants.deleteTenant(id);
  }

  @Post(':id/grant-location-selection-change')
  grantLocationSelectionChange(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LocationLicenseSummaryDto> {
    return this.adminTenants.grantLocationSelectionChange(id);
  }

  @Post(':id/resend-owner-invite')
  resendOwnerInvite(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ readonly ownerEmail: string }> {
    return this.adminTenants.resendOwnerInvite(id);
  }
}
