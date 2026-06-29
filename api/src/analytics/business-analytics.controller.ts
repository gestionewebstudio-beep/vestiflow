import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { TenantPermission } from '../auth/tenant-permission.constants';
import { RequirePermissions } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { BusinessAnalyticsService } from './business-analytics.service';
import { BusinessAnalyticsQueryDto } from './dto/business-analytics-query.dto';
import type { BusinessAnalyticsSummaryDto } from './dto/business-analytics-summary.dto';

@Controller('analytics')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class BusinessAnalyticsController {
  constructor(private readonly analytics: BusinessAnalyticsService) {}

  @Get('business-summary')
  @RequirePermissions(TenantPermission.ReportsView)
  getBusinessSummary(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: BusinessAnalyticsQueryDto,
  ): Promise<BusinessAnalyticsSummaryDto> {
    return this.analytics.getSummary(tenantId, query, user);
  }
}
