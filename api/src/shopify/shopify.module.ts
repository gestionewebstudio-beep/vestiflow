import { Module } from '@nestjs/common';

import { LocationLicensingModule } from '../inventory/location-licensing.module';
import { MediaModule } from '../media/media.module';
import { OrderReservationsModule } from '../order-reservations/order-reservations.module';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyAdminHttpClient } from './shopify-admin-http.client';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyController } from './shopify.controller';
import { ShopifyCryptoService } from './shopify-crypto.service';
import { ShopifyInventoryPullService } from './shopify-inventory-pull.service';
import { ShopifyCustomersPullService } from './shopify-customers-pull.service';
import { ShopifyOrdersPullService } from './shopify-orders-pull.service';
import { ShopifyInventoryPushService } from './shopify-inventory-push.service';
import { ShopifyInventoryReconciliationService } from './shopify-inventory-reconciliation.service';
import { ShopifyInventoryAlignService } from './shopify-inventory-align.service';
import { ShopifyInventoryRepublishService } from './shopify-inventory-republish.service';
import { ShopifyFulfillmentOrdersService } from './shopify-fulfillment-orders.service';
import { ShopifyMissingOrdersService } from './shopify-missing-orders.service';
import { ShopifyLocationLinkService } from './shopify-location-link.service';
import { ShopifyLocationSyncService } from './shopify-location-sync.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyLinkHistoryService } from './shopify-link-history.service';
import { ShopifyStoricoBackfillService } from './shopify-storico-backfill.service';
import { ShopifyShopIdentityService } from './shopify-shop-identity.service';
import { ShopifyRateLimiterService } from './shopify-rate-limiter.service';
import { ShopifyProductEnrichmentService } from './shopify-product-enrichment.service';
import { ShopifyProductPullService } from './shopify-product-pull.service';
import { ShopifyProductPushService } from './shopify-product-push.service';
import { ShopifySyncService } from './shopify-sync.service';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import { ShopifyTaxonomyService } from './shopify-taxonomy.service';
import { ShopifyCategoryMetafieldsService } from './shopify-category-metafields.service';
import { ShopifyTaxonomyLocalizationService } from './shopify-taxonomy-localization.service';
import { ShopifyWebhookReaderClient } from './shopify-webhook-reader.client';
import { ShopifyWebhookRepairService } from './shopify-webhook-repair.service';
import { ShopifyWebhookService } from './shopify-webhook.service';
import { ShopifyWebhookStatusService } from './shopify-webhook-status.service';
import { ShopifyWebhooksController } from './shopify-webhooks.controller';
import { ShopifySetupTransferService } from './shopify-setup-transfer.service';
import { ShopifySetupService } from './shopify-setup.service';
import { ShopifyShopChangeService } from './shopify-shop-change.service';

@Module({
  imports: [LocationLicensingModule, MediaModule, OrderReservationsModule],
  controllers: [ShopifyController, ShopifyWebhooksController],
  providers: [
    ShopifyConfigService,
    ShopifyCryptoService,
    ShopifyAdminHttpClient,
    ShopifyAdminClient,
    ShopifyWebhookReaderClient,
    ShopifyGraphqlClient,
    ShopifyRateLimiterService,
    ShopifyConnectionService,
    ShopifyOAuthService,
    ShopifyShopIdentityService,
    // ⭐ B2-B3-B4 · lo storico dei collegamenti, scritto da import, push ed
    //    eliminazione: un servizio solo, esportato perché lo usa anche
    //    `ProductsService` per sganciare prima di eliminare una variante.
    ShopifyLinkHistoryService,
    // ⭐ B7 · il collegamento ESPLICITO sede ↔ location (coppia + periodo):
    //    lo scrive la sincronizzazione sedi per id e lo scrivono le scelte
    //    della prima connessione. ⛔ Senza questa riga il servizio sedi non
    //    si istanzia e l'API non parte (misurato l'11/09/2026 sera).
    ShopifyLocationLinkService,
    ShopifyLocationSyncService,
    // ⭐ La PRIMA CONNESSIONE (`docs/27`): stato e scelte, e il trasferimento.
    ShopifySetupService,
    ShopifySetupTransferService,
    ShopifyInventoryPullService,
    ShopifyCustomersPullService,
    ShopifyOrdersPullService,
    ShopifyMissingOrdersService,
    ShopifyFulfillmentOrdersService,
    ShopifyInventoryAlignService,
    ShopifyInventoryRepublishService,
    ShopifyInventoryReconciliationService,
    ShopifyInventoryPushService,
    ShopifyProductPushService,
    ShopifyProductPullService,
    ShopifyProductEnrichmentService,
    ShopifyTaxonomyService,
    ShopifyTaxonomyLocalizationService,
    ShopifyCategoryMetafieldsService,
    ShopifySyncService,
    ShopifyWebhookService,
    ShopifyWebhookStatusService,
    ShopifyWebhookRepairService,
    ShopifyShopChangeService,
    // ⭐ Fase 3-4 dello storico (`docs/24` §8.5.8): il backfill dei collegamenti
    //    fatti prima, con controlli bloccanti e verifica. Lo usa lo script
    //    `backfill-storico-shopify.mjs` via contesto applicativo; esportato per quello.
    ShopifyStoricoBackfillService,
  ],
  exports: [
    ShopifyConnectionService,
    ShopifyLinkHistoryService,
    ShopifyStoricoBackfillService,
    ShopifyInventoryPushService,
    ShopifyInventoryReconciliationService,
    ShopifyProductPushService,
    ShopifyProductPullService,
    ShopifyTaxonomyLocalizationService,
  ],
})
export class ShopifyModule {}
