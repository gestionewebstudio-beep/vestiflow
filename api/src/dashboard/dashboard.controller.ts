import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { DashboardService, type DashboardSummary } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  getSummary(@CurrentTenant() tenantId: string): Promise<DashboardSummary> {
    return this.dashboard.getSummary(tenantId);
  }
}
