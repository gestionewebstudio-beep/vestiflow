import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  SalesOrderFinancialStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
  ShopifyConnectionStatus,
  ShopifySyncStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyCryptoService } from './shopify-crypto.service';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class ShopifyOAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly shopifyCrypto: ShopifyCryptoService,
    private readonly shopifyAdmin: ShopifyAdminClient,
  ) {}

  async beginAuth(tenantId: string, shopInput: string): Promise<{ authorizeUrl: string }> {
    this.shopifyAdmin.assertConfigured();
    if (!this.shopifyCrypto.isConfigured()) {
      throw new ServiceUnavailableException('SHOPIFY_TOKEN_ENCRYPTION_KEY non configurata');
    }

    const shopDomain = this.shopifyConfig.normalizeShopDomain(shopInput);
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

    const scopes = tokenJson.scope
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean);
    const encrypted = this.shopifyCrypto.encrypt(tokenJson.access_token);
    const tenantId = oauthState.tenantId;

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

    await this.syncLocations(tenantId, shopDomain, tokenJson.access_token);

    const webhookUrl = this.shopifyConfig.webhookUrl;
    if (webhookUrl) {
      await this.shopifyAdmin.registerWebhooks(shopDomain, tokenJson.access_token, webhookUrl);
    }

    return `${this.shopifyConfig.frontendUrl}/app/settings?shopify=connected`;
  }

  async disconnect(tenantId: string): Promise<void> {
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

  private async syncLocations(
    tenantId: string,
    shopDomain: string,
    accessToken: string,
  ): Promise<void> {
    const locations = await this.shopifyAdmin.listLocations(shopDomain, accessToken);
    const tenantLocations = await this.prisma.location.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });

    for (const shopifyLocation of locations) {
      const shopifyId = String(shopifyLocation.id);
      const match =
        tenantLocations.find(
          (loc) => loc.shopifyLocationId === shopifyId || loc.name === shopifyLocation.name,
        ) ?? tenantLocations[0];

      if (!match) {
        continue;
      }

      await this.prisma.location.update({
        where: { id: match.id },
        data: {
          shopifyLocationId: shopifyId,
          shopifySyncStatus: ShopifySyncStatus.synced,
          shopifyLastSyncAt: new Date(),
          shopifyLastError: null,
        },
      });
    }
  }
}
