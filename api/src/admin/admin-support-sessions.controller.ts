import { Controller, Delete, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/auth/authenticated-request';
import { PlatformAdminGuard } from '../common/platform-admin/platform-admin.guard';
import type { ActiveSupportSessionContext } from '../support/support-session.types';
import { SupportSessionService } from '../support/support-session.service';

@Controller('admin/support-sessions')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminSupportSessionsController {
  constructor(private readonly supportSessions: SupportSessionService) {}

  @Delete('current')
  endCurrentSession(@Req() request: AuthenticatedRequest): Promise<void> {
    return this.supportSessions.endActiveSessionForOperator(request.appUser.id);
  }
}

@Controller('admin/tenants')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminTenantsSupportController {
  constructor(private readonly supportSessions: SupportSessionService) {}

  @Post(':id/support-session')
  startSupportSession(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) tenantId: string,
  ): Promise<ActiveSupportSessionContext> {
    return this.supportSessions.startSession(
      request.appUser.id,
      request.appUser.email,
      tenantId,
    );
  }
}
