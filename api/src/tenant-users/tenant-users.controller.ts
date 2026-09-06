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

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantOwnerGuard } from '../common/auth/tenant-owner.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { TenantUsersService } from './tenant-users.service';
import { actorFromProfile } from './tenant-users.types';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import {
  CreateTenantUserDto,
  UpdateTenantUserDto,
  type TenantUserDto,
} from './dto/tenant-user.dto';

/**
 * Gestione utenti in mano al titolare (Impostazioni → Utenti). Il tenant è
 * SEMPRE quello del JWT: nessun id tenant dal client. Gli invarianti di
 * auto-protezione stanno in TenantUsersService.
 */
@Controller('tenant/users')
@UseGuards(JwtAuthGuard, TenantOwnerGuard)
export class TenantUsersController {
  constructor(private readonly tenantUsers: TenantUsersService) {}

  @Get()
  listUsers(@CurrentTenant() tenantId: string): Promise<TenantUserDto[]> {
    return this.tenantUsers.listUsers(tenantId);
  }

  @Post()
  createUser(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateTenantUserDto,
    @CurrentUser() user: UserProfileDto,
  ): Promise<TenantUserDto> {
    return this.tenantUsers.createUser(tenantId, dto, actorFromProfile(user));
  }

  @Patch(':userId')
  updateUser(
    @CurrentTenant() tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateTenantUserDto,
    @CurrentUser() user: UserProfileDto,
  ): Promise<TenantUserDto> {
    return this.tenantUsers.updateUser(tenantId, userId, dto, actorFromProfile(user));
  }

  @Delete(':userId')
  deleteUser(
    @CurrentTenant() tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: UserProfileDto,
  ): Promise<void> {
    return this.tenantUsers.deleteUser(tenantId, userId, actorFromProfile(user));
  }
}
