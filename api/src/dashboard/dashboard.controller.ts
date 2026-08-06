import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { TenantPermission } from '../auth/tenant-permission.constants';
import { RequirePermissions } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { DashboardSummaryQueryDto } from './dto/dashboard-summary.query.dto';
import { DashboardService, type DashboardSummary } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @RequirePermissions(TenantPermission.ReportsView)
  getSummary(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: DashboardSummaryQueryDto,
  ): Promise<DashboardSummary> {
    return this.dashboard.getSummary(tenantId, query.locationId, user);
  }
}
