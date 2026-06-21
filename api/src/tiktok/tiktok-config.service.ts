import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TikTokConnectionDto {
  readonly id: string;
  readonly tenantId: string;
  readonly status: string;
  readonly shopId?: string | null;
  readonly shopCipher?: string | null;
  readonly displayName?: string | null;
  readonly region?: string | null;
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
export class TikTokConfigService {
  constructor(private readonly config: ConfigService) {}

  isOAuthConfigured(): boolean {
    return Boolean(
      this.appKey &&
      this.appSecret &&
      this.serviceId &&
      this.callbackUrl &&
      this.encryptionConfigured &&
      this.apiBaseUrl,
    );
  }

  get appKey(): string | undefined {
    return this.config.get<string>('TIKTOK_APP_KEY');
  }

  get appSecret(): string | undefined {
    return this.config.get<string>('TIKTOK_APP_SECRET');
  }

  get serviceId(): string | undefined {
    return this.config.get<string>('TIKTOK_SERVICE_ID');
  }

  get apiBaseUrl(): string {
    return (
      this.config.get<string>('TIKTOK_API_BASE_URL') ?? 'https://open-api.tiktokglobalshop.com'
    ).replace(/\/$/, '');
  }

  get authBaseUrl(): string {
    return (
      this.config.get<string>('TIKTOK_AUTH_BASE_URL') ?? 'https://auth.tiktok-shops.com'
    ).replace(/\/$/, '');
  }

  get authorizeBaseUrl(): string {
    return (
      this.config.get<string>('TIKTOK_AUTHORIZE_BASE_URL') ??
      'https://services.tiktokshop.com/open/authorize'
    );
  }

  get apiVersion(): string {
    return this.config.get<string>('TIKTOK_API_VERSION') ?? '202309';
  }

  get callbackUrl(): string | undefined {
    const explicit = this.config.get<string>('TIKTOK_OAUTH_CALLBACK_URL');
    if (explicit) {
      return explicit;
    }
    const appUrl =
      this.config.get<string>('TIKTOK_APP_URL') ?? this.config.get<string>('SHOPIFY_APP_URL');
    return appUrl ? `${appUrl.replace(/\/$/, '')}/api/v1/tiktok/auth/callback` : undefined;
  }

  get frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';
  }

  get encryptionConfigured(): boolean {
    return Boolean(this.config.get<string>('TIKTOK_TOKEN_ENCRYPTION_KEY'));
  }

  get defaultCategoryId(): string | undefined {
    return this.config.get<string>('TIKTOK_DEFAULT_CATEGORY_ID');
  }
}
