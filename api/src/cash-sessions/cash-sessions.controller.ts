import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantPermission } from '../auth/tenant-permission.constants';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';

import { CashSessionsService, type CashSessionSummary } from './cash-sessions.service';
import {
  CloseCashSessionDto,
  CreateCashMovementDto,
  ListCashSessionsQueryDto,
  OpenCashSessionDto,
} from './dto/cash-session.dto';

/**
 * Sessioni di cassa: le operazioni (apri/chiudi/movimenti) sono di chi sta al
 * banco; l'elenco delle chiusure serve anche a chi legge i report.
 */
@Controller('cash-sessions')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class CashSessionsController {
  constructor(private readonly cashSessions: CashSessionsService) {}

  @Get()
  @RequireAnyPermissions([TenantPermission.SectionReports, TenantPermission.RetailRegister])
  list(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ListCashSessionsQueryDto,
  ): Promise<CashSessionSummary[]> {
    return this.cashSessions.list(tenantId, query, user);
  }

  @Get('current')
  @RequirePermissions(TenantPermission.RetailRegister)
  current(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<CashSessionSummary | null> {
    return this.cashSessions.current(tenantId, locationId, user);
  }

  @Post('open')
  @RequirePermissions(TenantPermission.RetailRegister)
  open(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: OpenCashSessionDto,
  ): Promise<CashSessionSummary> {
    return this.cashSessions.open(tenantId, dto, user);
  }

  @Post(':id/movements')
  @RequirePermissions(TenantPermission.RetailRegister)
  addMovement(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() dto: CreateCashMovementDto,
  ): Promise<CashSessionSummary> {
    return this.cashSessions.addMovement(tenantId, sessionId, dto, user);
  }

  @Post(':id/close')
  @RequirePermissions(TenantPermission.RetailRegister)
  close(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() dto: CloseCashSessionDto,
  ): Promise<CashSessionSummary> {
    return this.cashSessions.close(tenantId, sessionId, dto, user);
  }
}
