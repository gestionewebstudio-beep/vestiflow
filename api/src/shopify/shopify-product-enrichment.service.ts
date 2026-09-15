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
import {
  ShopifyGraphqlClient,
  type ShopifyRemoteVariantConIdentita,
} from './shopify-graphql.client';
import { IDENTITA_PRODOTTO, IDENTITA_VARIANTE } from './shopify-identita-catalogo.util';
import { ShopifyCategoryMetafieldsService } from './shopify-category-metafields.service';
import { ShopifyTaxonomyLocalizationService } from './shopify-taxonomy-localization.service';

export interface EnrichProductOptions {
  /** Su import catalogo massivo i costi varianti possono essere saltati (N chiamate API). */
  readonly fetchVariantCosts?: boolean;
  /**
   * ⭐ Con `fetchVariantCosts`, i SOLI id remoti di variante di cui leggere il costo.
   *
   * Il costo è una chiamata REST per variante (`GET /inventory_items/{id}`) e in
   * aggiornamento si scrive solo sulle varianti che VestiFlow non ha ancora
   * (`docs/24` §9.11): chiederlo per tutte pagava 2 + C + V chiamate a ≥ 500 ms per un
   * valore scartato, oltre i 5 s del webhook già con otto varianti (`docs/30` #2,
   * dimostrato in `costi-varianti-in-aggiornamento.integration-spec.ts`).
   * Assente = tutte (la prima importazione).
   */
  readonly variantCostsFor?: ReadonlySet<number>;
  /** Import catalogo: solo tag dal payload prodotto, senza metafield/collezioni via API. */
  readonly skipRemoteMetadata?: boolean;
}

const EMPTY_ENRICHMENT: ProductShopifyEnrichment = {
  tags: [],
  seoTitle: null,
  seoDescription: null,
  season: null,
  collections: [],
  metafields: [],
  variantPurchasePriceMinor: new Map(),
  taxonomyCategoryId: null,
  taxonomyCategoryFullName: null,
  categoryMetafields: [],
};

@Injectable()
export class ShopifyProductEnrichmentService {
  private readonly logger = new Logger(ShopifyProductEnrichmentService.name);

  constructor(
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifyGraphql: ShopifyGraphqlClient,
    private readonly categoryMetafieldsService: ShopifyCategoryMetafieldsService,
    private readonly taxonomyLocalization: ShopifyTaxonomyLocalizationService,
  ) {}

  /**
   * L'identità VestiFlow (`vestiflow.product_id`) del prodotto remoto, RILETTA da Shopify:
   * il payload del webhook non la porta. ⛔ **Un errore di lettura NON è «assente»**: qui
   * non c'è `catch`, e chi chiama decide — a differenza dell'arricchimento, dove un
   * metafield mancante degrada e basta.
   */
  identitaVestiflowDelProdotto(
    shopDomain: string,
    accessToken: string,
    productGid: string,
  ): Promise<string | null> {
    return this.shopifyGraphql.productIdentity(shopDomain, accessToken, productGid, {
      namespace: IDENTITA_PRODOTTO.namespace,
      key: IDENTITA_PRODOTTO.key,
    });
  }

  /** Le varianti remote con la loro identità VestiFlow, per l'adozione degli id. */
  variantiConIdentita(
    shopDomain: string,
    accessToken: string,
    productGid: string,
  ): Promise<readonly ShopifyRemoteVariantConIdentita[]> {
    return this.shopifyGraphql.listProductVariantsWithIdentity(
      shopDomain,
      accessToken,
      productGid,
      {
        namespace: IDENTITA_VARIANTE.namespace,
        key: IDENTITA_VARIANTE.key,
      },
    );
  }

  async enrichProduct(
    shopDomain: string,
    accessToken: string,
    remote: ShopifyAdminProduct,
    options: EnrichProductOptions = {},
  ): Promise<ProductShopifyEnrichment> {
    const shopifyProductId = String(remote.id);
    const tags = parseShopifyTags(remote.tags);
    const taxonomy = await this.fetchTaxonomyCategorySafe(
      shopDomain,
      accessToken,
      shopifyProductId,
    );

    if (options.skipRemoteMetadata) {
      return {
        ...EMPTY_ENRICHMENT,
        tags,
        taxonomyCategoryId: taxonomy?.id ?? null,
        taxonomyCategoryFullName: taxonomy?.fullName ?? null,
      };
    }

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
        ? await this.fetchVariantCosts(shopDomain, accessToken, remote, options.variantCostsFor)
        : new Map<number, number>();

      const categoryMetafields = await this.categoryMetafieldsService
        .parseFromProductMetafields(shopDomain, accessToken, metafields, taxonomy?.id ?? null)
        .catch(() => []);

      return {
        tags,
        seoTitle,
        seoDescription,
        season,
        collections,
        metafields,
        variantPurchasePriceMinor,
        taxonomyCategoryId: taxonomy?.id ?? null,
        taxonomyCategoryFullName: taxonomy?.fullName ?? null,
        categoryMetafields,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Enrichment fallito';
      this.logger.warn(`Enrichment prodotto ${shopifyProductId} parziale: ${message}`);
      return {
        ...EMPTY_ENRICHMENT,
        tags,
        taxonomyCategoryId: taxonomy?.id ?? null,
        taxonomyCategoryFullName: taxonomy?.fullName ?? null,
      };
    }
  }

  private async fetchTaxonomyCategorySafe(
    shopDomain: string,
    accessToken: string,
    shopifyProductId: string,
  ) {
    try {
      return await this.taxonomyLocalization.localizeCategory(
        await this.shopifyGraphql.getProductTaxonomyCategory(
          shopDomain,
          accessToken,
          shopifyProductId,
        ),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Taxonomy non disponibile';
      this.logger.warn(`Taxonomy prodotto ${shopifyProductId}: ${message}`);
      return null;
    }
  }

  private async fetchVariantCosts(
    shopDomain: string,
    accessToken: string,
    remote: ShopifyAdminProduct,
    soltanto?: ReadonlySet<number>,
  ): Promise<Map<number, number>> {
    const costs = new Map<number, number>();
    for (const variant of remote.variants) {
      if (!variant.inventory_item_id || (soltanto && !soltanto.has(variant.id))) {
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
