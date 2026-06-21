import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { TenantChannelProfile, TikTokConnectionStatus } from '@prisma/client';

import { assertTenantChannelProfile } from '../common/tenant-channel-profile.util';
import { PrismaService } from '../prisma/prisma.service';
import { TikTokApiClient } from './tiktok-api.client';
import { TikTokConfigService } from './tiktok-config.service';
import { TikTokConnectionService } from './tiktok-connection.service';
import { TikTokCryptoService } from './tiktok-crypto.service';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class TikTokOAuthService {
  private readonly logger = new Logger(TikTokOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tiktokConfig: TikTokConfigService,
    private readonly tiktokCrypto: TikTokCryptoService,
    private readonly tiktokApi: TikTokApiClient,
    private readonly tiktokConnection: TikTokConnectionService,
  ) {}

  async beginAuth(tenantId: string): Promise<{ authorizeUrl: string }> {
    await assertTenantChannelProfile(this.prisma, tenantId, TenantChannelProfile.tiktok_shop);
    this.tiktokApi.assertConfigured();
    if (!this.tiktokCrypto.isConfigured()) {
      throw new ServiceUnavailableException('TIKTOK_TOKEN_ENCRYPTION_KEY non configurata');
    }

    const state = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);

    await this.prisma.tikTokOAuthState.create({
      data: { tenantId, state, expiresAt },
    });

    const params = new URLSearchParams({
      service_id: this.tiktokConfig.serviceId!,
      state,
    });

    return {
      authorizeUrl: `${this.tiktokConfig.authorizeBaseUrl}?${params.toString()}`,
    };
  }

  async handleCallback(query: Record<string, string | undefined>): Promise<string> {
    this.tiktokApi.assertConfigured();

    const { code, state } = query;
    if (!code || !state) {
      throw new BadRequestException('Parametri OAuth TikTok mancanti');
    }

    const oauthState = await this.prisma.tikTokOAuthState.findUnique({ where: { state } });
    if (!oauthState || oauthState.expiresAt <= new Date()) {
      throw new BadRequestException('Stato OAuth TikTok non valido o scaduto');
    }

    const tokenData = await this.tiktokApi.exchangeAuthCode(code);
    const accessExpiresAt = new Date(Date.now() + tokenData.access_token_expire_in * 1000);
    const refreshExpiresAt = new Date(Date.now() + tokenData.refresh_token_expire_in * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.tikTokConnection.upsert({
        where: { tenantId: oauthState.tenantId },
        create: {
          tenantId: oauthState.tenantId,
          status: TikTokConnectionStatus.connected,
          shopId: tokenData.shop_id,
          shopCipher: tokenData.shop_cipher,
          displayName: tokenData.seller_name ?? null,
          region: tokenData.seller_base_region ?? null,
          lastConnectedAt: new Date(),
        },
        update: {
          status: TikTokConnectionStatus.connected,
          shopId: tokenData.shop_id,
          shopCipher: tokenData.shop_cipher,
          displayName: tokenData.seller_name ?? null,
          region: tokenData.seller_base_region ?? null,
          lastConnectedAt: new Date(),
          lastErrorMessage: null,
          lastErrorCode: null,
          lastErrorAt: null,
        },
      });

      await tx.tikTokCredential.upsert({
        where: { tenantId: oauthState.tenantId },
        create: {
          tenantId: oauthState.tenantId,
          shopId: tokenData.shop_id,
          shopCipher: tokenData.shop_cipher,
          accessTokenEnc: this.tiktokCrypto.encrypt(tokenData.access_token),
          refreshTokenEnc: this.tiktokCrypto.encrypt(tokenData.refresh_token),
          accessTokenExpiresAt: accessExpiresAt,
          refreshTokenExpiresAt: refreshExpiresAt,
        },
        update: {
          shopId: tokenData.shop_id,
          shopCipher: tokenData.shop_cipher,
          accessTokenEnc: this.tiktokCrypto.encrypt(tokenData.access_token),
          refreshTokenEnc: this.tiktokCrypto.encrypt(tokenData.refresh_token),
          accessTokenExpiresAt: accessExpiresAt,
          refreshTokenExpiresAt: refreshExpiresAt,
        },
      });

      await tx.tikTokOAuthState.delete({ where: { id: oauthState.id } });
    });

    this.logger.log(`TikTok Shop collegato (${oauthState.tenantId}): shop ${tokenData.shop_id}`);
    return `${this.tiktokConfig.frontendUrl}/app/settings?tiktok=connected`;
  }

  async disconnect(tenantId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.tikTokCredential.deleteMany({ where: { tenantId } }),
      this.prisma.tikTokOAuthState.deleteMany({ where: { tenantId } }),
      this.prisma.tikTokConnection.updateMany({
        where: { tenantId },
        data: {
          status: TikTokConnectionStatus.not_connected,
          shopId: null,
          shopCipher: null,
          displayName: null,
          region: null,
          scopes: [],
          lastConnectedAt: null,
          lastSyncAt: null,
          lastErrorMessage: null,
          lastErrorCode: null,
          lastErrorAt: null,
        },
      }),
    ]);
  }

  async getAccessContext(tenantId: string): Promise<{
    accessToken: string;
    shopCipher: string;
    shopId: string;
  }> {
    const credential = await this.prisma.tikTokCredential.findUnique({ where: { tenantId } });
    if (!credential) {
      throw new Error('Credenziali TikTok Shop assenti');
    }

    const now = Date.now();
    const expiresAt = credential.accessTokenExpiresAt?.getTime() ?? 0;
    if (expiresAt - now > 60_000) {
      return {
        accessToken: this.tiktokCrypto.decrypt(credential.accessTokenEnc),
        shopCipher: credential.shopCipher,
        shopId: credential.shopId,
      };
    }

    const refreshToken = this.tiktokCrypto.decrypt(credential.refreshTokenEnc);
    const refreshed = await this.tiktokApi.refreshAccessToken(refreshToken);
    const accessExpiresAt = new Date(Date.now() + refreshed.access_token_expire_in * 1000);
    const refreshExpiresAt = new Date(Date.now() + refreshed.refresh_token_expire_in * 1000);

    await this.prisma.tikTokCredential.update({
      where: { tenantId },
      data: {
        shopId: refreshed.shop_id,
        shopCipher: refreshed.shop_cipher,
        accessTokenEnc: this.tiktokCrypto.encrypt(refreshed.access_token),
        refreshTokenEnc: this.tiktokCrypto.encrypt(refreshed.refresh_token),
        accessTokenExpiresAt: accessExpiresAt,
        refreshTokenExpiresAt: refreshExpiresAt,
      },
    });

    await this.prisma.tikTokConnection.updateMany({
      where: { tenantId },
      data: {
        shopId: refreshed.shop_id,
        shopCipher: refreshed.shop_cipher,
        displayName: refreshed.seller_name ?? undefined,
        region: refreshed.seller_base_region ?? undefined,
      },
    });

    return {
      accessToken: refreshed.access_token,
      shopCipher: refreshed.shop_cipher,
      shopId: refreshed.shop_id,
    };
  }
}
