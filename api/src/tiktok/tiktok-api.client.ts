import { Injectable, Logger } from '@nestjs/common';

import { TikTokConfigService } from './tiktok-config.service';
import { buildTikTokQuery, signTikTokRequest } from './tiktok-sign.util';

interface TikTokApiEnvelope<T> {
  readonly code: number;
  readonly message?: string;
  readonly data?: T;
  readonly request_id?: string;
}

export interface TikTokTokenData {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly access_token_expire_in: number;
  readonly refresh_token_expire_in: number;
  readonly open_id?: string;
  readonly seller_name?: string;
  readonly seller_base_region?: string;
  readonly shop_cipher: string;
  readonly shop_id: string;
}

export interface TikTokProductSkuPayload {
  readonly seller_sku: string;
  readonly price: {
    readonly amount: string;
    readonly currency: string;
  };
  readonly stock_infos: readonly {
    readonly warehouse_id?: string;
    readonly available_stock: number;
  }[];
}

export interface TikTokCreateProductPayload {
  readonly title: string;
  readonly description: string;
  readonly category_id: string;
  readonly skus: readonly TikTokProductSkuPayload[];
}

export interface TikTokCreateProductResponse {
  readonly product_id: string;
  readonly skus?: readonly { readonly id: string; readonly seller_sku: string }[];
}

export interface TikTokUpdateInventoryPayload {
  readonly product_id: string;
  readonly skus: readonly {
    readonly id: string;
    readonly stock_infos: readonly { readonly available_stock: number }[];
  }[];
}

@Injectable()
export class TikTokApiClient {
  private readonly logger = new Logger(TikTokApiClient.name);

  constructor(private readonly tiktokConfig: TikTokConfigService) {}

  assertConfigured(): void {
    if (!this.tiktokConfig.isOAuthConfigured()) {
      throw new Error('Integrazione TikTok Shop non configurata sul server');
    }
  }

  async exchangeAuthCode(authCode: string): Promise<TikTokTokenData> {
    this.assertConfigured();
    const url = `${this.tiktokConfig.authBaseUrl}/api/v2/token/get`;
    const body = {
      app_key: this.tiktokConfig.appKey,
      app_secret: this.tiktokConfig.appSecret,
      auth_code: authCode,
      grant_type: 'authorized_code',
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = (await response.json()) as TikTokApiEnvelope<TikTokTokenData>;
    if (!response.ok || json.code !== 0 || !json.data) {
      throw new Error(json.message ?? 'Scambio token TikTok fallito');
    }
    return json.data;
  }

  async refreshAccessToken(refreshToken: string): Promise<TikTokTokenData> {
    this.assertConfigured();
    const url = `${this.tiktokConfig.authBaseUrl}/api/v2/token/refresh`;
    const body = {
      app_key: this.tiktokConfig.appKey,
      app_secret: this.tiktokConfig.appSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = (await response.json()) as TikTokApiEnvelope<TikTokTokenData>;
    if (!response.ok || json.code !== 0 || !json.data) {
      throw new Error(json.message ?? 'Refresh token TikTok fallito');
    }
    return json.data;
  }

  async createProduct(
    accessToken: string,
    shopCipher: string,
    payload: TikTokCreateProductPayload,
  ): Promise<TikTokCreateProductResponse> {
    const path = `/product/${this.tiktokConfig.apiVersion}/products`;
    return this.postSigned(accessToken, shopCipher, path, payload);
  }

  async updateProduct(
    accessToken: string,
    shopCipher: string,
    productId: string,
    payload: Partial<TikTokCreateProductPayload>,
  ): Promise<{ readonly product_id: string }> {
    const path = `/product/${this.tiktokConfig.apiVersion}/products/${productId}`;
    return this.putSigned(accessToken, shopCipher, path, payload);
  }

  async updateInventory(
    accessToken: string,
    shopCipher: string,
    payload: TikTokUpdateInventoryPayload,
  ): Promise<{ readonly product_id: string }> {
    const path = `/product/${this.tiktokConfig.apiVersion}/products/inventory/update`;
    return this.postSigned(accessToken, shopCipher, path, payload);
  }

  private async postSigned<T>(
    accessToken: string,
    shopCipher: string,
    path: string,
    body: unknown,
  ): Promise<T> {
    const bodyText = JSON.stringify(body);
    return this.requestSigned<T>('POST', accessToken, shopCipher, path, bodyText);
  }

  private async putSigned<T>(
    accessToken: string,
    shopCipher: string,
    path: string,
    body: unknown,
  ): Promise<T> {
    const bodyText = JSON.stringify(body);
    return this.requestSigned<T>('PUT', accessToken, shopCipher, path, bodyText);
  }

  private async requestSigned<T>(
    method: 'POST' | 'PUT',
    accessToken: string,
    shopCipher: string,
    path: string,
    bodyText: string,
  ): Promise<T> {
    this.assertConfigured();
    const timestamp = Math.floor(Date.now() / 1000);
    const query = buildTikTokQuery(this.tiktokConfig.appKey!, timestamp, {
      shop_cipher: shopCipher,
    });
    query.sign = signTikTokRequest(this.tiktokConfig.appSecret!, path, query, bodyText);

    const url = new URL(`${this.tiktokConfig.apiBaseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-tts-access-token': accessToken,
      },
      body: bodyText,
    });

    const json = (await response.json()) as TikTokApiEnvelope<T>;
    if (!response.ok || json.code !== 0) {
      const message = json.message ?? `Richiesta TikTok fallita (${response.status})`;
      this.logger.warn(`${method} ${path}: ${message}`);
      throw new Error(message);
    }
    if (json.data == null) {
      throw new Error('Risposta TikTok senza dati');
    }
    return json.data;
  }
}
