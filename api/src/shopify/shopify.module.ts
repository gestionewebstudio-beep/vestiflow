import { Module } from '@nestjs/common';

import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyController } from './shopify.controller';
import { ShopifyCryptoService } from './shopify-crypto.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifySyncService } from './shopify-sync.service';
import { ShopifyWebhookService } from './shopify-webhook.service';
import { ShopifyWebhooksController } from './shopify-webhooks.controller';

@Module({
  controllers: [ShopifyController, ShopifyWebhooksController],
  providers: [
    ShopifyConfigService,
    ShopifyCryptoService,
    ShopifyAdminClient,
    ShopifyConnectionService,
    ShopifyOAuthService,
    ShopifySyncService,
    ShopifyWebhookService,
  ],
  exports: [ShopifyConnectionService],
})
export class ShopifyModule {}
