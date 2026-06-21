import { Controller, Delete, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ADMIN_ROLES, Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { TikTokConnectionDto } from './tiktok-config.service';
import { TikTokConfigService } from './tiktok-config.service';
import type { ClearTikTokErrorsResult } from './tiktok-connection.service';
import { TikTokConnectionService } from './tiktok-connection.service';
import { TikTokOAuthService } from './tiktok-oauth.service';

@Controller('tiktok')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TikTokController {
  constructor(
    private readonly tiktokConnection: TikTokConnectionService,
    private readonly tiktokOAuth: TikTokOAuthService,
    private readonly tiktokConfig: TikTokConfigService,
  ) {}

  @Get('connection')
  getConnection(@CurrentTenant() tenantId: string): Promise<TikTokConnectionDto> {
    return this.tiktokConnection.getForTenant(tenantId);
  }

  @Post('auth/begin')
  @Roles(...ADMIN_ROLES)
  beginAuth(@CurrentTenant() tenantId: string): Promise<{ authorizeUrl: string }> {
    return this.tiktokOAuth.beginAuth(tenantId);
  }

  @Public()
  @Get('auth/callback')
  async authCallback(
    @Query() query: Record<string, string | undefined>,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const redirectUrl = await this.tiktokOAuth.handleCallback(query);
      response.redirect(redirectUrl);
    } catch {
      response.redirect(`${this.tiktokConfig.frontendUrl}/app/settings?tiktok=error`);
    }
  }

  @Delete('connection')
  @Roles(...ADMIN_ROLES)
  async disconnect(@CurrentTenant() tenantId: string): Promise<{ disconnected: true }> {
    await this.tiktokOAuth.disconnect(tenantId);
    return { disconnected: true };
  }

  @Post('connection/clear-errors')
  @Roles(...ADMIN_ROLES)
  clearErrors(@CurrentTenant() tenantId: string): Promise<ClearTikTokErrorsResult> {
    return this.tiktokConnection.clearErrors(tenantId);
  }
}
