import { Body, Controller, Delete, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { BeginShopifyAuthDto } from './dto/begin-shopify-auth.dto';
import type { ShopifyConnectionDto } from './shopify-config.service';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyOAuthService } from './shopify-oauth.service';

@Controller('shopify')
@UseGuards(JwtAuthGuard)
export class ShopifyController {
  constructor(
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyConfig: ShopifyConfigService,
  ) {}

  @Get('connection')
  getConnection(@CurrentTenant() tenantId: string): Promise<ShopifyConnectionDto> {
    return this.shopifyConnection.getForTenant(tenantId);
  }

  @Post('auth/begin')
  beginAuth(
    @CurrentTenant() tenantId: string,
    @Body() dto: BeginShopifyAuthDto,
  ): Promise<{ authorizeUrl: string }> {
    return this.shopifyOAuth.beginAuth(tenantId, dto.shop);
  }

  @Public()
  @Get('auth/callback')
  async authCallback(
    @Query() query: Record<string, string | undefined>,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const redirectUrl = await this.shopifyOAuth.handleCallback(query);
      response.redirect(redirectUrl);
    } catch {
      response.redirect(`${this.shopifyConfig.frontendUrl}/app/settings?shopify=error`);
    }
  }

  @Delete('connection')
  async disconnect(@CurrentTenant() tenantId: string): Promise<{ disconnected: true }> {
    await this.shopifyOAuth.disconnect(tenantId);
    return { disconnected: true };
  }
}
