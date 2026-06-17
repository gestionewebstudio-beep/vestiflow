import { Module } from '@nestjs/common';

import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyController } from './shopify.controller';
import { ShopifyCryptoService } from './shopify-crypto.service';
import { ShopifyInventoryPushService } from './shopify-inventory-push.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyProductPullService } from './shopify-product-pull.service';
import { ShopifyProductPushService } from './shopify-product-push.service';
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
    ShopifyInventoryPushService,
    ShopifyProductPushService,
    ShopifyProductPullService,
    ShopifySyncService,
    ShopifyWebhookService,
  ],
  exports: [
    ShopifyConnectionService,
    ShopifyInventoryPushService,
    ShopifyProductPushService,
    ShopifyProductPullService,
  ],
})
export class ShopifyModule {}
