import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyRateLimiterService } from './shopify-rate-limiter.service';
import { parseShopifyRetryAfterHeader } from './shopify-rate-limiter.util';
import {
  SHOPIFY_WEBHOOK_TOPICS,
  type ShopifyWebhookRegistrationResult,
  type ShopifyWebhookTopic,
} from './shopify-webhook-topics';

interface ShopifyAdminResponse<T> {
  readonly data?: T;
  readonly errors?: string;
}

export interface ShopifyProductPayload {
  readonly id: number;
  readonly variants: readonly {
    readonly id: number;
    readonly sku: string | null;
    readonly inventory_item_id: number;
  }[];
}

export interface ShopifyAdminProduct {
  readonly id: number;
  readonly title: string;
  readonly body_html: string | null;
  readonly vendor: string | null;
  readonly product_type: string | null;
  readonly tags?: string | null;
  readonly status: string;
  readonly options: readonly { readonly name: string; readonly values: readonly string[] }[];
  readonly variants: readonly {
    readonly id: number;
    readonly title: string;
    readonly sku: string | null;
    readonly barcode: string | null;
    readonly price: string;
    readonly compare_at_price: string | null;
    readonly inventory_item_id: number;
    readonly option1: string | null;
    readonly option2: string | null;
    readonly option3: string | null;
  }[];
  readonly images: readonly {
    readonly id: number;
    readonly src: string;
    readonly alt: string | null;
    readonly position: number;
  }[];
}

export interface ShopifyProductImagePayload {
  readonly id: number;
  readonly src: string;
}

export interface ShopifyAdminLocation {
  readonly id: number;
  readonly name: string;
  readonly address1?: string | null;
  readonly address2?: string | null;
  readonly city?: string | null;
  readonly zip?: string | null;
  readonly province?: string | null;
  readonly country?: string | null;
  readonly country_code?: string | null;
  readonly active: boolean;
}

export interface ShopifyCollectRow {
  readonly id: number;
  readonly collection_id: number;
  readonly product_id: number;
}

export interface ShopifyMetafieldRow {
  readonly id?: number;
  readonly namespace: string;
  readonly key: string;
  readonly value: string;
  readonly type?: string;
}

export interface ShopifyInventoryItemRow {
  readonly id: number;
  readonly cost: string | null;
}

@Injectable()
export class ShopifyAdminClient {
  constructor(
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly rateLimiter: ShopifyRateLimiterService,
  ) {}

  async getShop(shopDomain: string, accessToken: string): Promise<{ name: string }> {
    const response = await this.request<{ shop: { name: string } }>(
      shopDomain,
      accessToken,
      '/shop.json',
    );
    return { name: response.shop.name };
  }

  async listLocations(
    shopDomain: string,
    accessToken: string,
  ): Promise<readonly ShopifyAdminLocation[]> {
    const response = await this.request<{ locations: ShopifyAdminLocation[] }>(
      shopDomain,
      accessToken,
      '/locations.json',
    );
    return response.locations ?? [];
  }

  async getVariant(
    shopDomain: string,
    accessToken: string,
    variantId: string,
  ): Promise<{ inventory_item_id: number }> {
    const response = await this.request<{ variant: { inventory_item_id: number } }>(
      shopDomain,
      accessToken,
      `/variants/${variantId}.json`,
    );
    return response.variant;
  }

  /** Imposta la quantità disponibile assoluta su una location Shopify. */
  async setInventoryAvailable(
    shopDomain: string,
    accessToken: string,
    inventoryItemId: string,
    locationId: string,
    available: number,
  ): Promise<void> {
    await this.request(shopDomain, accessToken, '/inventory_levels/set.json', {
      method: 'POST',
      body: JSON.stringify({
        location_id: Number(locationId),
        inventory_item_id: Number(inventoryItemId),
        available: Math.max(0, Math.trunc(available)),
      }),
    });
  }

  async registerWebhooks(
    shopDomain: string,
    accessToken: string,
    address: string,
  ): Promise<ShopifyWebhookRegistrationResult> {
    const existing = await this.request<{ webhooks: { topic: string; address: string }[] }>(
      shopDomain,
      accessToken,
      '/webhooks.json',
    );
    const alreadyRegistered = new Set(
      (existing.webhooks ?? [])
        .filter((hook) => hook.address === address)
        .map((hook) => hook.topic),
    );

    const registered: ShopifyWebhookTopic[] = [];
    const skipped: ShopifyWebhookTopic[] = [];
    const failed: { topic: ShopifyWebhookTopic; message: string }[] = [];

    for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
      if (alreadyRegistered.has(topic)) {
        skipped.push(topic);
        continue;
      }

      try {
        await this.request(shopDomain, accessToken, '/webhooks.json', {
          method: 'POST',
          body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
        });
        registered.push(topic);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Registrazione fallita';
        failed.push({ topic, message: message.slice(0, 300) });
      }
    }

    return { registered, skipped, failed };
  }

  /** Rimuove i webhook registrati verso l'URL VestiFlow (disattiva sync automatica). */
  async deleteWebhooksForAddress(
    shopDomain: string,
    accessToken: string,
    address: string,
  ): Promise<{ deletedCount: number; failed: readonly { id: number; message: string }[] }> {
    const existing = await this.request<{ webhooks: { id: number; address: string }[] }>(
      shopDomain,
      accessToken,
      '/webhooks.json',
    );

    const targets = (existing.webhooks ?? []).filter((hook) => hook.address === address);
    const failed: { id: number; message: string }[] = [];
    let deletedCount = 0;

    for (const hook of targets) {
      try {
        await this.request(shopDomain, accessToken, `/webhooks/${hook.id}.json`, {
          method: 'DELETE',
        });
        deletedCount += 1;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Eliminazione fallita';
        failed.push({ id: hook.id, message: message.slice(0, 300) });
      }
    }

    return { deletedCount, failed };
  }

  async createProduct(
    shopDomain: string,
    accessToken: string,
    product: Record<string, unknown>,
  ): Promise<ShopifyProductPayload> {
    const response = await this.request<{ product: ShopifyProductPayload }>(
      shopDomain,
      accessToken,
      '/products.json',
      {
        method: 'POST',
        body: JSON.stringify({ product }),
      },
    );
    return response.product;
  }

  async updateProduct(
    shopDomain: string,
    accessToken: string,
    shopifyProductId: string,
    product: Record<string, unknown>,
  ): Promise<ShopifyProductPayload> {
    const response = await this.request<{ product: ShopifyProductPayload }>(
      shopDomain,
      accessToken,
      `/products/${shopifyProductId}.json`,
      {
        method: 'PUT',
        body: JSON.stringify({ product }),
      },
    );
    return response.product;
  }

  async listAllProducts(
    shopDomain: string,
    accessToken: string,
  ): Promise<readonly ShopifyAdminProduct[]> {
    const products: ShopifyAdminProduct[] = [];
    let sinceId = 0;

    for (;;) {
      const page = await this.request<{ products: ShopifyAdminProduct[] }>(
        shopDomain,
        accessToken,
        `/products.json?limit=250&since_id=${sinceId}`,
      );
      const batch = page.products ?? [];
      if (batch.length === 0) {
        break;
      }
      products.push(...batch);
      sinceId = batch[batch.length - 1]!.id;
      if (batch.length < 250) {
        break;
      }
    }

    return products;
  }

  async createProductImage(
    shopDomain: string,
    accessToken: string,
    shopifyProductId: string,
    image: { src: string; alt?: string; position?: number },
  ): Promise<ShopifyProductImagePayload> {
    const response = await this.request<{ image: ShopifyProductImagePayload }>(
      shopDomain,
      accessToken,
      `/products/${shopifyProductId}/images.json`,
      {
        method: 'POST',
        body: JSON.stringify({ image }),
      },
    );
    return response.image;
  }

  async listProductCollects(
    shopDomain: string,
    accessToken: string,
    shopifyProductId: string,
  ): Promise<readonly ShopifyCollectRow[]> {
    const response = await this.request<{ collects: ShopifyCollectRow[] }>(
      shopDomain,
      accessToken,
      `/collects.json?product_id=${shopifyProductId}&limit=250`,
    );
    return response.collects ?? [];
  }

  async listProductMetafields(
    shopDomain: string,
    accessToken: string,
    shopifyProductId: string,
  ): Promise<readonly ShopifyMetafieldRow[]> {
    const response = await this.request<{ metafields: ShopifyMetafieldRow[] }>(
      shopDomain,
      accessToken,
      `/products/${shopifyProductId}/metafields.json?limit=250`,
    );
    return response.metafields ?? [];
  }

  async upsertProductMetafield(
    shopDomain: string,
    accessToken: string,
    shopifyProductId: string,
    metafield: { namespace: string; key: string; value: string; type: string },
    existingId?: string,
  ): Promise<void> {
    if (existingId) {
      await this.request(
        shopDomain,
        accessToken,
        `/products/${shopifyProductId}/metafields/${existingId}.json`,
        {
          method: 'PUT',
          body: JSON.stringify({ metafield: { value: metafield.value, type: metafield.type } }),
        },
      );
      return;
    }

    await this.request(shopDomain, accessToken, `/products/${shopifyProductId}/metafields.json`, {
      method: 'POST',
      body: JSON.stringify({ metafield }),
    });
  }

  async getInventoryItem(
    shopDomain: string,
    accessToken: string,
    inventoryItemId: string,
  ): Promise<ShopifyInventoryItemRow> {
    const response = await this.request<{ inventory_item: ShopifyInventoryItemRow }>(
      shopDomain,
      accessToken,
      `/inventory_items/${inventoryItemId}.json`,
    );
    return response.inventory_item;
  }

  async updateInventoryItemCost(
    shopDomain: string,
    accessToken: string,
    inventoryItemId: string,
    cost: string,
  ): Promise<void> {
    await this.request(shopDomain, accessToken, `/inventory_items/${inventoryItemId}.json`, {
      method: 'PUT',
      body: JSON.stringify({ inventory_item: { id: Number(inventoryItemId), cost } }),
    });
  }

  /** Risolve i titoli delle collezioni a partire dai collect del prodotto. */
  async resolveCollectionTitles(
    shopDomain: string,
    accessToken: string,
    collects: readonly ShopifyCollectRow[],
  ): Promise<{ id: string; title: string }[]> {
    const uniqueIds = [...new Set(collects.map((row) => row.collection_id))];
    const results: { id: string; title: string }[] = [];

    for (const collectionId of uniqueIds) {
      const title = await this.fetchCollectionTitle(shopDomain, accessToken, collectionId);
      if (title) {
        results.push({ id: String(collectionId), title });
      }
    }

    return results;
  }

  private async fetchCollectionTitle(
    shopDomain: string,
    accessToken: string,
    collectionId: number,
  ): Promise<string | null> {
    try {
      const custom = await this.request<{ custom_collection: { title: string } }>(
        shopDomain,
        accessToken,
        `/custom_collections/${collectionId}.json`,
      );
      return custom.custom_collection?.title ?? null;
    } catch {
      try {
        const smart = await this.request<{ smart_collection: { title: string } }>(
          shopDomain,
          accessToken,
          `/smart_collections/${collectionId}.json`,
        );
        return smart.smart_collection?.title ?? null;
      } catch {
        return null;
      }
    }
  }

  private async request<T>(
    shopDomain: string,
    accessToken: string,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const apiVersion = this.shopifyConfig.apiVersion;
    const url = `https://${shopDomain}/admin/api/${apiVersion}${path}`;
    const maxRetries = this.shopifyConfig.apiMaxRetries;

    for (let attempt = 0; ; attempt += 1) {
      await this.rateLimiter.beforeRequest(shopDomain);

      const response = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
          ...(init.headers ?? {}),
        },
      });

      this.rateLimiter.onCallLimitHeader(
        shopDomain,
        response.headers.get('x-shopify-shop-api-call-limit'),
      );

      if (response.status === 429) {
        if (attempt >= maxRetries) {
          throw new HttpException(
            'Shopify ha limitato temporaneamente le richieste API. Riprova tra qualche minuto.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        const retryAfter = parseShopifyRetryAfterHeader(response.headers.get('retry-after'));
        await response.text().catch(() => undefined);
        await this.rateLimiter.waitForRetry(shopDomain, attempt, retryAfter);
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new InternalServerErrorException(
          `Shopify Admin API error (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      if (response.status === 204) {
        return {} as T;
      }

      const json = (await response.json()) as ShopifyAdminResponse<T> | T;
      if (typeof json === 'object' && json !== null && 'errors' in json && json.errors) {
        throw new InternalServerErrorException(`Shopify Admin API: ${json.errors}`);
      }
      return json as T;
    }
  }

  assertConfigured(): void {
    if (!this.shopifyConfig.isOAuthConfigured()) {
      throw new ServiceUnavailableException(
        'Integrazione Shopify non configurata sul server (variabili SHOPIFY_* mancanti)',
      );
    }
  }
}
