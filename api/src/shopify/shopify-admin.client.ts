import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ShopifyConfigService } from './shopify-config.service';

interface ShopifyAdminResponse<T> {
  readonly data?: T;
  readonly errors?: string;
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

  async registerWebhooks(shopDomain: string, accessToken: string, address: string): Promise<void> {
    const topics = [
      'orders/create',
      'orders/updated',
      'customers/create',
      'customers/update',
      'inventory_levels/update',
    ];

    const existing = await this.request<{ webhooks: { topic: string; address: string }[] }>(
      shopDomain,
      accessToken,
      '/webhooks.json',
    );
    const registered = new Set(
      (existing.webhooks ?? [])
        .filter((hook) => hook.address === address)
        .map((hook) => hook.topic),
    );

    for (const topic of topics) {
      if (registered.has(topic)) {
        continue;
      }
      await this.request(shopDomain, accessToken, '/webhooks.json', {
        method: 'POST',
        body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
      });
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
