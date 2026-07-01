import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantPermission } from '../auth/tenant-permission.constants';
import { RequirePermissions } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import {
  AccountantRegisterService,
  type AccountantRegisterSummaryDto,
} from './accountant-register.service';
import { AccountantRegisterQueryDto } from './dto/accountant-register.query.dto';

@Controller('accountant-register')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class AccountantRegisterController {
  constructor(private readonly accountantRegister: AccountantRegisterService) {}

  @Get('summary')
  @RequirePermissions(TenantPermission.ReportsView)
  getSummary(
    @CurrentTenant() tenantId: string,
    @Query() query: AccountantRegisterQueryDto,
  ): Promise<AccountantRegisterSummaryDto> {
    return this.accountantRegister.getSummary(tenantId, query);
  }
}
