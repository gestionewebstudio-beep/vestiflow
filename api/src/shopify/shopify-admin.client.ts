import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ShopifyConfigService } from './shopify-config.service';
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

@Injectable()
export class ShopifyAdminClient {
  constructor(private readonly shopifyConfig: ShopifyConfigService) {}

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
  ): Promise<readonly { id: number; name: string }[]> {
    const response = await this.request<{ locations: { id: number; name: string }[] }>(
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

  private async request<T>(
    shopDomain: string,
    accessToken: string,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const apiVersion = this.shopifyConfig.apiVersion;
    const url = `https://${shopDomain}/admin/api/${apiVersion}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
        ...(init.headers ?? {}),
      },
    });

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

  assertConfigured(): void {
    if (!this.shopifyConfig.isOAuthConfigured()) {
      throw new ServiceUnavailableException(
        'Integrazione Shopify non configurata sul server (variabili SHOPIFY_* mancanti)',
      );
    }
  }
}
