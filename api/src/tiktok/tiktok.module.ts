import { Module } from '@nestjs/common';

import { TikTokApiClient } from './tiktok-api.client';
import { TikTokConfigService } from './tiktok-config.service';
import { TikTokConnectionService } from './tiktok-connection.service';
import { TikTokController } from './tiktok.controller';
import { TikTokCryptoService } from './tiktok-crypto.service';
import { TikTokInventoryPushService } from './tiktok-inventory-push.service';
import { TikTokOAuthService } from './tiktok-oauth.service';
import { TikTokProductPushService } from './tiktok-product-push.service';

@Module({
  controllers: [TikTokController],
  providers: [
    TikTokConfigService,
    TikTokCryptoService,
    TikTokApiClient,
    TikTokConnectionService,
    TikTokOAuthService,
    TikTokInventoryPushService,
    TikTokProductPushService,
  ],
  exports: [TikTokConnectionService, TikTokInventoryPushService, TikTokProductPushService],
})
export class TikTokModule {}
