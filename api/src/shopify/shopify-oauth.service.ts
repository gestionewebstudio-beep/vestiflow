import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  SalesOrderFinancialStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
  ShopifyConnectionStatus,
  ShopifySyncStatus,
  TenantChannelProfile,
} from '@prisma/client';

import { assertTenantChannelProfile } from '../common/tenant-channel-profile.util';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyCryptoService } from './shopify-crypto.service';
import {
  ShopifyLocationSyncService,
  type ShopifyLocationSyncResult,
} from './shopify-location-sync.service';
import {
  buildShopifyScopeDiagnostics,
  mergeShopifyScopes,
  parseShopifyScopesString,
  shopifyCatalogImportBlockMessage,
} from './shopify-scopes.util';
import {
  SHOPIFY_PROTECTED_WEBHOOK_TOPICS,
  type ShopifyWebhookRegistrationResult,
} from './shopify-webhook-topics';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class ShopifyOAuthService {
  private readonly logger = new Logger(ShopifyOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly shopifyCrypto: ShopifyCryptoService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyLocationSync: ShopifyLocationSyncService,
  ) {}

  async beginAuth(tenantId: string, shopInput: string): Promise<{ authorizeUrl: string }> {
    await assertTenantChannelProfile(this.prisma, tenantId, TenantChannelProfile.shopify);
    this.shopifyAdmin.assertConfigured();
    if (!this.shopifyCrypto.isConfigured()) {
      throw new ServiceUnavailableException('SHOPIFY_TOKEN_ENCRYPTION_KEY non configurata');
    }

    const shopDomain = this.shopifyConfig.normalizeShopDomain(shopInput);
    const existingCredential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { shopDomain: true },
    });
    if (existingCredential && existingCredential.shopDomain !== shopDomain) {
      throw new UnprocessableEntityException(
        'Sei già connesso a un altro negozio Shopify. Usa "Cambia negozio" in Impostazioni.',
      );
    }

    const state = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);

    await this.prisma.shopifyOAuthState.create({
      data: { tenantId, state, shopDomain, expiresAt },
    });

    const params = new URLSearchParams({
      client_id: this.shopifyConfig.apiKey!,
      scope: this.shopifyConfig.scopes,
      redirect_uri: this.shopifyConfig.callbackUrl!,
      state,
    });

    return {
      authorizeUrl: `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`,
    };
  }

  async handleCallback(query: Record<string, string | undefined>): Promise<string> {
    this.shopifyAdmin.assertConfigured();

    const { code, state, shop } = query;
    if (!code || !state || !shop) {
      throw new BadRequestException('Parametri OAuth mancanti');
    }

    const shopDomain = this.shopifyConfig.normalizeShopDomain(shop);
    const oauthState = await this.prisma.shopifyOAuthState.findUnique({ where: { state } });
    if (!oauthState || oauthState.expiresAt <= new Date()) {
      throw new BadRequestException('Stato OAuth non valido o scaduto');
    }
    if (oauthState.shopDomain !== shopDomain) {
      throw new BadRequestException('Dominio shop non coerente con lo stato OAuth');
    }

    const tokenResponse = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.shopifyConfig.apiKey,
        client_secret: this.shopifyConfig.apiSecret,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      throw new BadRequestException('Scambio token OAuth fallito');
    }

    const tokenJson = (await tokenResponse.json()) as {
      access_token: string;
      scope: string;
    };

    const scopesFromToken = parseShopifyScopesString(tokenJson.scope);
    let scopes: string[] = [...scopesFromToken];
    try {
      const scopesFromApi = await this.shopifyAdmin.getAccessScopes(
        shopDomain,
        tokenJson.access_token,
      );
      if (scopesFromApi.length > 0) {
        scopes = [...scopesFromApi];
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'access_scopes non disponibile';
      this.logger.warn(`OAuth Shopify: impossibile leggere access_scopes (${message})`);
    }
    const encrypted = this.shopifyCrypto.encrypt(tokenJson.access_token);
    const tenantId = oauthState.tenantId;

    const existingCredential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { shopDomain: true },
    });
    if (existingCredential && existingCredential.shopDomain !== shopDomain) {
      return `${this.shopifyConfig.frontendUrl}/app/settings?shopify=shop_change_blocked&from=${encodeURIComponent(existingCredential.shopDomain)}&to=${encodeURIComponent(shopDomain)}`;
    }

    await this.prisma.$transaction([
      this.prisma.shopifyCredential.upsert({
        where: { tenantId },
        update: { shopDomain, accessTokenEnc: encrypted, scopes },
        create: { tenantId, shopDomain, accessTokenEnc: encrypted, scopes },
      }),
      this.prisma.shopifyOAuthState.delete({ where: { id: oauthState.id } }),
    ]);

    const shopInfo = await this.shopifyAdmin.getShop(shopDomain, tokenJson.access_token);
    const now = new Date();

    await this.prisma.shopifyConnection.upsert({
      where: { tenantId },
      update: {
        status: ShopifyConnectionStatus.connected,
        shopDomain,
        displayName: shopInfo.name,
        apiVersion: this.shopifyConfig.apiVersion,
        scopes,
        lastConnectedAt: now,
        lastErrorMessage: null,
        lastErrorCode: null,
        lastErrorAt: null,
      },
      create: {
        tenantId,
        status: ShopifyConnectionStatus.connected,
        shopDomain,
        displayName: shopInfo.name,
        apiVersion: this.shopifyConfig.apiVersion,
        scopes,
        lastConnectedAt: now,
      },
    });

    const scopeDiagnostics = buildShopifyScopeDiagnostics(
      this.shopifyConfig.requestedScopes,
      scopes,
    );
    const catalogScopeMessage = shopifyCatalogImportBlockMessage(scopeDiagnostics);
    if (catalogScopeMessage) {
      this.logger.warn(
        `OAuth Shopify (${tenantId}): read_products assente. Richiesti=[${scopeDiagnostics.requested.join(', ')}] concessi=[${scopeDiagnostics.granted.join(', ')}]`,
      );
      await this.shopifyConnection.recordSetupWarning(
        tenantId,
        catalogScopeMessage,
        scopeDiagnostics.catalogImportBlockedReason === 'not_requested'
          ? 'oauth_scope_not_requested'
          : 'oauth_scope_not_granted',
      );
    }

    try {
      await this.syncLocations(tenantId, shopDomain, tokenJson.access_token);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Sync location fallita';
      this.logger.warn(`Shopify OAuth post-connect (location): ${message}`);
      await this.shopifyConnection.recordSetupWarning(tenantId, message, 'location_sync_failed');
    }

    const webhookUrl = this.shopifyConfig.webhookUrl;
    if (webhookUrl) {
      await this.registerWebhooksForTenant(
        tenantId,
        shopDomain,
        tokenJson.access_token,
        webhookUrl,
      );
    }

    return `${this.shopifyConfig.frontendUrl}/app/settings?shopify=connected`;
  }

  async disconnect(tenantId: string): Promise<void> {
    await this.revokeShopifyAccessToken(tenantId);
    await this.shopifyConnection.clearSetupStatus(tenantId);
    await this.prisma.$transaction([
      this.prisma.shopifyCredential.deleteMany({ where: { tenantId } }),
      this.prisma.shopifyConnection.updateMany({
        where: { tenantId },
        data: {
          status: ShopifyConnectionStatus.not_connected,
          shopDomain: null,
          displayName: null,
          scopes: [],
          lastConnectedAt: null,
        },
      }),
      this.prisma.location.updateMany({
        where: { tenantId },
        data: {
          shopifyLocationId: null,
          shopifySyncStatus: ShopifySyncStatus.not_connected,
          shopifyLastSyncAt: null,
          shopifyLastError: null,
        },
      }),
    ]);
  }

  async getAccessToken(tenantId: string): Promise<{ shopDomain: string; accessToken: string }> {
    const credential = await this.prisma.shopifyCredential.findUnique({ where: { tenantId } });
    if (!credential) {
      throw new NotFoundException('Shopify non connesso per questo tenant');
    }
    return {
      shopDomain: credential.shopDomain,
      accessToken: this.shopifyCrypto.decrypt(credential.accessTokenEnc),
    };
  }

  async getAccessTokenWithScopes(
    tenantId: string,
  ): Promise<{ shopDomain: string; accessToken: string; scopes: readonly string[] }> {
    const [credential, connection] = await Promise.all([
      this.prisma.shopifyCredential.findUnique({ where: { tenantId } }),
      this.prisma.shopifyConnection.findUnique({
        where: { tenantId },
        select: { scopes: true },
      }),
    ]);
    if (!credential) {
      throw new NotFoundException('Shopify non connesso per questo tenant');
    }
    return {
      shopDomain: credential.shopDomain,
      accessToken: this.shopifyCrypto.decrypt(credential.accessTokenEnc),
      scopes: mergeShopifyScopes(connection?.scopes, credential.scopes),
    };
  }

  async resolveTenantByShopDomain(shopDomain: string): Promise<string> {
    const normalized = this.shopifyConfig.normalizeShopDomain(shopDomain);
    const connection = await this.prisma.shopifyConnection.findFirst({
      where: { shopDomain: normalized },
      select: { tenantId: true },
    });
    if (!connection) {
      throw new NotFoundException('Tenant non trovato per questo shop Shopify');
    }
    return connection.tenantId;
  }

  async resyncLocations(tenantId: string): Promise<ShopifyLocationSyncResult> {
    const { shopDomain, accessToken } = await this.getAccessToken(tenantId);
    return this.syncLocations(tenantId, shopDomain, accessToken);
  }

  async resyncWebhooks(tenantId: string): Promise<ShopifyWebhookRegistrationResult> {
    const webhookUrl = this.shopifyConfig.webhookUrl;
    if (!webhookUrl) {
      throw new ServiceUnavailableException('SHOPIFY_APP_URL non configurato: webhook URL assente');
    }
    const { shopDomain, accessToken } = await this.getAccessToken(tenantId);
    return this.registerWebhooksForTenant(tenantId, shopDomain, accessToken, webhookUrl);
  }

  async disableWebhooks(
    tenantId: string,
  ): Promise<{ deletedCount: number; failed: readonly { id: number; message: string }[] }> {
    const webhookUrl = this.shopifyConfig.webhookUrl;
    if (!webhookUrl) {
      throw new ServiceUnavailableException('SHOPIFY_APP_URL non configurato: webhook URL assente');
    }

    const { shopDomain, accessToken } = await this.getAccessToken(tenantId);
    const result = await this.shopifyAdmin.deleteWebhooksForAddress(
      shopDomain,
      accessToken,
      webhookUrl,
    );

    await this.shopifyConnection.recordAutoSyncDisabled(tenantId);

    if (result.failed.length > 0) {
      const message = `Alcuni webhook non rimossi su Shopify (${result.failed.length}). La sync automatica resta disattivata in VestiFlow.`;
      await this.shopifyConnection.recordSetupWarning(tenantId, message, 'webhook_disable_partial');
    } else {
      await this.prisma.shopifyConnection.updateMany({
        where: { tenantId },
        data: {
          lastErrorMessage: null,
          lastErrorCode: null,
          lastErrorAt: null,
        },
      });
    }

    return result;
  }

  private async registerWebhooksForTenant(
    tenantId: string,
    shopDomain: string,
    accessToken: string,
    webhookUrl: string,
  ): Promise<ShopifyWebhookRegistrationResult> {
    const result = await this.shopifyAdmin.registerWebhooks(shopDomain, accessToken, webhookUrl);
    const activeCount = result.registered.length + result.skipped.length;
    if (activeCount > 0) {
      await this.shopifyConnection.recordWebhooksActivated(tenantId, activeCount);
    }
    const warning = this.formatWebhookRegistrationWarning(result);

    if (warning) {
      this.logger.warn(`Shopify webhook registration (${tenantId}): ${warning.message}`);
      await this.shopifyConnection.recordSetupWarning(tenantId, warning.message, warning.code);
    } else {
      await this.prisma.shopifyConnection.updateMany({
        where: { tenantId },
        data: {
          lastErrorMessage: null,
          lastErrorCode: null,
          lastErrorAt: null,
        },
      });
      await this.shopifyConnection.healStaleErrorStatus(tenantId);
    }

    return result;
  }

  private formatWebhookRegistrationWarning(
    result: ShopifyWebhookRegistrationResult,
  ): { message: string; code: string } | null {
    if (result.failed.length === 0) {
      return null;
    }

    const protectedFailed = result.failed.filter((entry) =>
      SHOPIFY_PROTECTED_WEBHOOK_TOPICS.has(entry.topic),
    );
    const inventoryOk =
      result.registered.includes('inventory_levels/update') ||
      result.skipped.includes('inventory_levels/update');

    if (protectedFailed.length > 0 && inventoryOk) {
      return {
        code: 'webhook_partial_registration',
        message:
          'Webhook giacenze attivo. Ordini e clienti richiedono permesso Protected customer data su Shopify Partners (app VestiFlow): riconnetti dopo averlo abilitato.',
      };
    }

    if (protectedFailed.length > 0) {
      return {
        code: 'webhook_registration_failed',
        message:
          'Webhook ordini/clienti non registrati: Shopify richiede Protected customer data sull’app VestiFlow. Giacenze non ancora attive: verifica SHOPIFY_APP_URL su Railway.',
      };
    }

    const detail = result.failed.map((entry) => entry.topic).join(', ');
    return {
      code: 'webhook_registration_failed',
      message: `Registrazione webhook fallita per: ${detail}.`,
    };
  }

  private syncLocations(
    tenantId: string,
    shopDomain: string,
    accessToken: string,
  ): Promise<ShopifyLocationSyncResult> {
    return this.shopifyLocationSync.syncFromShopify(tenantId, shopDomain, accessToken);
  }

  /** Revoca il token OAuth su Shopify così la riconnessione richiede tutti gli scope aggiornati. */
  private async revokeShopifyAccessToken(tenantId: string): Promise<void> {
    const credential = await this.prisma.shopifyCredential.findUnique({ where: { tenantId } });
    if (!credential) {
      return;
    }

    const apiKey = this.shopifyConfig.apiKey;
    const apiSecret = this.shopifyConfig.apiSecret;
    if (!apiKey || !apiSecret) {
      return;
    }

    try {
      const accessToken = this.shopifyCrypto.decrypt(credential.accessTokenEnc);
      const response = await fetch(`https://${credential.shopDomain}/admin/oauth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: apiKey,
          client_secret: apiSecret,
          token: accessToken,
        }),
      });
      if (!response.ok) {
        this.logger.warn(
          `Revoca token Shopify non riuscita (${tenantId}, HTTP ${response.status}): la riconnessione potrebbe riusare permessi obsoleti`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'revoke fallita';
      this.logger.warn(`Revoca token Shopify ignorata (${tenantId}): ${message}`);
    }
  }
}
