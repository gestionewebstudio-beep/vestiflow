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
import { CreateTenantUserDto, UpdateTenantUserDto, type TenantUserDto } from './dto/tenant-user.dto';
import { AdminTenantUsersService } from './admin-tenant-users.service';

@Controller('admin/tenants')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminTenantsController {
  constructor(
    private readonly adminTenants: AdminTenantsService,
    private readonly adminTenantUsers: AdminTenantUsersService,
  ) {}

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

  @Get(':id/users')
  listTenantUsers(@Param('id', ParseUUIDPipe) id: string): Promise<TenantUserDto[]> {
    return this.adminTenantUsers.listUsers(id);
  }

  @Post(':id/users')
  createTenantUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTenantUserDto,
  ): Promise<TenantUserDto> {
    return this.adminTenantUsers.createUser(id, dto);
  }

  @Patch(':id/users/:userId')
  updateTenantUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateTenantUserDto,
  ): Promise<TenantUserDto> {
    return this.adminTenantUsers.updateUser(id, userId, dto);
  }

  @Delete(':id/users/:userId')
  deleteTenantUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.adminTenantUsers.deleteUser(id, userId);
  }
}
