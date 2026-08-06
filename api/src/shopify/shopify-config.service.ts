import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { normalizeShopInput } from './shopify-shop.util';
import { parseShopifyScopesString } from './shopify-scopes.util';

export interface ShopifyConnectionDto {
  readonly id: string;
  readonly tenantId: string;
  readonly status: string;
  readonly shopDomain?: string | null;
  readonly displayName?: string | null;
  readonly apiVersion?: string | null;
  readonly scopes?: readonly string[];
  readonly scopeDiagnostics?: ShopifyScopeDiagnosticsDto | null;
  readonly lastConnectedAt?: string | null;
  readonly lastSyncAt?: string | null;
  readonly webhooksActivatedAt?: string | null;
  readonly webhooksActiveCount?: number | null;
  readonly autoSyncEnabled?: boolean;
  readonly lastError?: {
    readonly message: string;
    readonly occurredAt: string;
    readonly code?: string;
  } | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Confronto ambiti richiesti (server) vs concessi (token OAuth del negozio). */
export interface ShopifyScopeDiagnosticsDto {
  readonly requested: readonly string[];
  readonly granted: readonly string[];
  readonly missingFromGrant: readonly string[];
  readonly missingForCatalogImport: readonly string[];
  readonly catalogImportBlockedReason: 'none' | 'not_requested' | 'not_granted';
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
      'read_orders,read_customers,read_inventory,write_inventory,read_locations,read_products,write_products,read_metaobject_definitions,write_metaobjects'
    );
  }

  /** Ambiti OAuth richiesti al negozio (da SHOPIFY_SCOPES o default). */
  get requestedScopes(): readonly string[] {
    return parseShopifyScopesCsv(this.scopes);
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

  /**
   * Ritardo massimo REST quando il bucket è vicino al pieno (~2 req/s sostenibili su Basic).
   * Con bucket headroom il limiter non applica questo intervallo fisso (burst fino a 40 slot).
   */
  get apiMinIntervalMs(): number {
    const raw = this.config.get<string>('SHOPIFY_API_MIN_INTERVAL_MS');
    const parsed = raw != null ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
  }

  /** Sotto questa quota used/max le richieste REST partono senza ritardo artificiale. */
  get apiBucketBurstRatio(): number {
    const raw = this.config.get<string>('SHOPIFY_API_BUCKET_BURST_RATIO');
    const parsed = raw != null ? Number.parseFloat(raw) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 0 && parsed < 1 ? parsed : 0.25;
  }

  /** Ritardo REST finché non arriva il primo header bucket (poi throttling adattivo). */
  get apiColdStartIntervalMs(): number {
    const raw = this.config.get<string>('SHOPIFY_API_COLD_START_INTERVAL_MS');
    const parsed = raw != null ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 150;
  }

  /** Intervallo minimo tra query GraphQL (leggero; il costo reale è in throttleStatus). */
  get graphqlMinIntervalMs(): number {
    const raw = this.config.get<string>('SHOPIFY_GRAPHQL_MIN_INTERVAL_MS');
    const parsed = raw != null ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 50;
  }

  /** Punti costo GraphQL da tenere liberi prima della prossima query. */
  get graphqlCostReservePoints(): number {
    const raw = this.config.get<string>('SHOPIFY_GRAPHQL_COST_RESERVE');
    const parsed = raw != null ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
  }

  /** Retry massimi su HTTP 429 prima di fallire. */
  get apiMaxRetries(): number {
    const raw = this.config.get<string>('SHOPIFY_API_MAX_RETRIES');
    const parsed = raw != null ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
  }

  /** Soglia bucket (used/max) oltre cui inserire una pausa breve. */
  get apiBucketHighWatermark(): number {
    const raw = this.config.get<string>('SHOPIFY_API_BUCKET_HIGH_WATERMARK');
    const parsed = raw != null ? Number.parseFloat(raw) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : 0.85;
  }

  /** Pausa (ms) quando il bucket Shopify è quasi pieno. */
  get apiBucketPauseMs(): number {
    const raw = this.config.get<string>('SHOPIFY_API_BUCKET_PAUSE_MS');
    const parsed = raw != null ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
  }

  get encryptionConfigured(): boolean {
    return Boolean(this.config.get<string>('SHOPIFY_TOKEN_ENCRYPTION_KEY'));
  }

  normalizeShopDomain(shop: string): string {
    return normalizeShopInput(shop);
  }
}

function parseShopifyScopesCsv(raw: string): readonly string[] {
  return parseShopifyScopesString(raw);
}
