import { Injectable, Logger } from '@nestjs/common';

import type { ShopifyAdminProduct } from './shopify-admin.client';
import { ShopifyAdminClient } from './shopify-admin.client';
import type { ProductShopifyEnrichment } from './shopify-product-metadata.types';
import {
  extractSeasonFromMetafields,
  extractSeoFromMetafields,
  mapMetafieldRows,
  parseShopifyTags,
} from './shopify-product-metadata.util';
import { shopifyDecimalToMinor } from './shopify-money.util';

export interface EnrichProductOptions {
  /** Su import catalogo massivo i costi varianti possono essere saltati (N chiamate API). */
  readonly fetchVariantCosts?: boolean;
}

const EMPTY_ENRICHMENT: ProductShopifyEnrichment = {
  tags: [],
  seoTitle: null,
  seoDescription: null,
  season: null,
  collections: [],
  metafields: [],
  variantPurchasePriceMinor: new Map(),
};

@Injectable()
export class ShopifyProductEnrichmentService {
  private readonly logger = new Logger(ShopifyProductEnrichmentService.name);

  constructor(private readonly shopifyAdmin: ShopifyAdminClient) {}

  async enrichProduct(
    shopDomain: string,
    accessToken: string,
    remote: ShopifyAdminProduct,
    options: EnrichProductOptions = {},
  ): Promise<ProductShopifyEnrichment> {
    const shopifyProductId = String(remote.id);
    const tags = parseShopifyTags(remote.tags);

    try {
      const [collectRows, metafieldRows] = await Promise.all([
        this.shopifyAdmin
          .listProductCollects(shopDomain, accessToken, shopifyProductId)
          .catch(() => []),
        this.shopifyAdmin
          .listProductMetafields(shopDomain, accessToken, shopifyProductId)
          .catch(() => []),
      ]);

      const collections = await this.shopifyAdmin
        .resolveCollectionTitles(shopDomain, accessToken, collectRows)
        .catch(() => []);

      const metafields = mapMetafieldRows(metafieldRows);
      const { seoTitle, seoDescription } = extractSeoFromMetafields(metafields);
      const season = extractSeasonFromMetafields(metafields);

      const variantPurchasePriceMinor = options.fetchVariantCosts
        ? await this.fetchVariantCosts(shopDomain, accessToken, remote)
        : new Map<number, number>();

      return {
        tags,
        seoTitle,
        seoDescription,
        season,
        collections,
        metafields,
        variantPurchasePriceMinor,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Enrichment fallito';
      this.logger.warn(`Enrichment prodotto ${shopifyProductId} parziale: ${message}`);
      return { ...EMPTY_ENRICHMENT, tags };
    }
  }

  private async fetchVariantCosts(
    shopDomain: string,
    accessToken: string,
    remote: ShopifyAdminProduct,
  ): Promise<Map<number, number>> {
    const costs = new Map<number, number>();
    for (const variant of remote.variants) {
      if (!variant.inventory_item_id) {
        continue;
      }
      try {
        const item = await this.shopifyAdmin.getInventoryItem(
          shopDomain,
          accessToken,
          String(variant.inventory_item_id),
        );
        if (item.cost != null && item.cost !== '') {
          costs.set(variant.id, shopifyDecimalToMinor(item.cost));
        }
      } catch {
        // Costo opzionale: non blocca l'import.
      }
    }
    return costs;
  }
}
