import { Controller, Delete, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { TikTokConnectionDto } from './tiktok-config.service';
import { TikTokConfigService } from './tiktok-config.service';
import type { ClearTikTokErrorsResult } from './tiktok-connection.service';
import { TikTokConnectionService } from './tiktok-connection.service';
import { TikTokOAuthService } from './tiktok-oauth.service';

@Controller('tiktok')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class TikTokController {
  constructor(
    private readonly tiktokConnection: TikTokConnectionService,
    private readonly tiktokOAuth: TikTokOAuthService,
    private readonly tiktokConfig: TikTokConfigService,
  ) {}

  @Get('connection')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  getConnection(@CurrentTenant() tenantId: string): Promise<TikTokConnectionDto> {
    return this.tiktokConnection.getForTenant(tenantId);
  }

  @Post('auth/begin')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  async disconnect(@CurrentTenant() tenantId: string): Promise<{ disconnected: true }> {
    await this.tiktokOAuth.disconnect(tenantId);
    return { disconnected: true };
  }

  @Post('connection/clear-errors')
  @UseGuards(RolesGuard)
  @Roles(UserRole.owner)
  clearErrors(@CurrentTenant() tenantId: string): Promise<ClearTikTokErrorsResult> {
    return this.tiktokConnection.clearErrors(tenantId);
  }
}
