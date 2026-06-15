import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ShopifyConnectionDto {
  readonly id: string;
  readonly tenantId: string;
  readonly status: string;
  readonly shopDomain?: string | null;
  readonly displayName?: string | null;
  readonly apiVersion?: string | null;
  readonly scopes?: readonly string[];
  readonly lastConnectedAt?: string | null;
  readonly lastSyncAt?: string | null;
  readonly lastError?: {
    readonly message: string;
    readonly occurredAt: string;
    readonly code?: string;
  } | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

@Injectable()
export class ShopifyConfigService {
  constructor(private readonly config: ConfigService) {}

  isOAuthConfigured(): boolean {
    return Boolean(
      this.apiKey &&
      this.apiSecret &&
      this.callbackUrl &&
      this.encryptionConfigured &&
      this.apiVersion,
    );
  }

  get apiKey(): string | undefined {
    return this.config.get<string>('SHOPIFY_API_KEY');
  }

  get apiSecret(): string | undefined {
    return this.config.get<string>('SHOPIFY_API_SECRET');
  }

  get apiVersion(): string {
    return this.config.get<string>('SHOPIFY_API_VERSION') ?? '2025-01';
  }

  get scopes(): string {
    return (
      this.config.get<string>('SHOPIFY_SCOPES') ??
      'read_orders,read_customers,read_inventory,read_locations,read_products'
    );
  }

  get callbackUrl(): string | undefined {
    const explicit = this.config.get<string>('SHOPIFY_OAUTH_CALLBACK_URL');
    if (explicit) {
      return explicit;
    }
    const appUrl = this.config.get<string>('SHOPIFY_APP_URL');
    return appUrl ? `${appUrl.replace(/\/$/, '')}/api/v1/shopify/auth/callback` : undefined;
  }

  get webhookUrl(): string | undefined {
    const explicit = this.config.get<string>('SHOPIFY_WEBHOOK_URL');
    if (explicit) {
      return explicit;
    }
    const appUrl = this.config.get<string>('SHOPIFY_APP_URL');
    return appUrl ? `${appUrl.replace(/\/$/, '')}/api/v1/shopify/webhooks` : undefined;
  }

  get frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';
  }

  get encryptionConfigured(): boolean {
    return Boolean(this.config.get<string>('SHOPIFY_TOKEN_ENCRYPTION_KEY'));
  }

  normalizeShopDomain(shop: string): string {
    const trimmed = shop.trim().toLowerCase();
    if (trimmed.endsWith('.myshopify.com')) {
      return trimmed;
    }
    return `${trimmed}.myshopify.com`;
  }
}
