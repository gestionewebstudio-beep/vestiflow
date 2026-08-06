import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import type { UserTableViewPreference } from '@prisma/client';

import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { UpsertTableViewDto } from './dto/upsert-table-view.dto';
import { UserTableViewsService } from './user-table-views.service';

@Controller('users/me/table-views')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class UserPreferencesController {
  constructor(private readonly tableViews: UserTableViewsService) {}

  @Get(':viewId')
  getTableView(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('viewId') viewId: string,
  ): Promise<UserTableViewPreference | null> {
    return this.tableViews.getTableView(tenantId, user.id, viewId);
  }

  @Put(':viewId')
  upsertTableView(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('viewId') viewId: string,
    @Body() dto: UpsertTableViewDto,
  ): Promise<UserTableViewPreference> {
    return this.tableViews.upsertTableView(tenantId, user.id, viewId, dto.stateJson);
  }
}
