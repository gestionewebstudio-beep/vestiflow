import { Injectable, Logger } from '@nestjs/common';
import { TenantChannelProfile } from '@prisma/client';

import { retryWithBackoff } from '../common/retry-backoff.util';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyInventoryPushService } from '../shopify/shopify-inventory-push.service';
import {
  ShopifyProductPushService,
  type ShopifyProductDeleteResult,
  type ShopifyProductPushResult,
} from '../shopify/shopify-product-push.service';
import { TikTokInventoryPushService } from '../tiktok/tiktok-inventory-push.service';
import { TikTokProductPushService } from '../tiktok/tiktok-product-push.service';

/** Cache breve del profilo canale: cambia solo dal pannello admin. */
const PROFILE_TTL_MS = 60_000;

/**
 * Attese tra i tentativi del push inventario (errore transitorio di rete o
 * rate limit): dopo una vendita al banco il canale non può restare stale fino
 * al push successivo. Retry in memoria: la rete di sicurezza finale resta la
 * riconciliazione webhook (caso D) e il push della prossima scrittura.
 */
const INVENTORY_PUSH_RETRY_DELAYS_MS = [2_000, 10_000, 30_000] as const;

/**
 * Orchestrazione push verso canali di vendita collegati.
 *
 * Porta UNICA verso Shopify/TikTok: nessun service di dominio inietta i push
 * service direttamente (regole-gestionale, ownership dei dati).
 *
 * Il canale attivo è deciso da `Tenant.channelProfile`, non dallo stato della
 * connessione: un tenant «solo gestionale» non interroga i canali nemmeno per
 * scoprire che non sono collegati. Ogni canale è best-effort e indipendente:
 * un fallimento TikTok non blocca Shopify. L'inventario viene pubblicato
 * post-commit in modo asincrono (§5 eventi VestiFlow).
 */
@Injectable()
export class ChannelSyncFacade {
  private readonly logger = new Logger(ChannelSyncFacade.name);
  private readonly profileCache = new Map<
    string,
    { readonly profile: TenantChannelProfile; readonly expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyInventoryPush: ShopifyInventoryPushService,
    private readonly shopifyProductPush: ShopifyProductPushService,
    private readonly tiktokInventoryPush: TikTokInventoryPushService,
    private readonly tiktokProductPush: TikTokProductPushService,
  ) {}

  /**
   * Da chiamare quando il profilo canale del tenant cambia (pannello admin):
   * senza invalidazione il gating resterebbe stale fino alla scadenza TTL.
   */
  invalidateProfile(tenantId: string): void {
    this.profileCache.delete(tenantId);
  }

  private async resolveProfile(tenantId: string): Promise<TenantChannelProfile | null> {
    const cached = this.profileCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.profile;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { channelProfile: true },
    });
    if (!tenant) {
      return null;
    }

    this.profileCache.set(tenantId, {
      profile: tenant.channelProfile,
      expiresAt: Date.now() + PROFILE_TTL_MS,
    });
    return tenant.channelProfile;
  }

  private async isShopifyTenant(tenantId: string): Promise<boolean> {
    return (await this.resolveProfile(tenantId)) === TenantChannelProfile.shopify;
  }

  private async isTikTokTenant(tenantId: string): Promise<boolean> {
    return (await this.resolveProfile(tenantId)) === TenantChannelProfile.tiktok_shop;
  }

  private warn(channel: string, tenantId: string, error: unknown, action: string): void {
    const message = error instanceof Error ? error.message : `${action} ${channel} fallito`;
    this.logger.warn(`${action} ${channel} non riuscito (${tenantId}): ${message}`);
  }

  // ── Push fire-and-forget (post-commit) ────────────────────────────────────

  enqueueProductPush(tenantId: string, productId: string): void {
    void this.pushProductToChannels(tenantId, productId).catch((error: unknown) => {
      this.warn('canali', tenantId, error, 'Push prodotto');
    });
  }

  /** Post-commit: pubblica inventario senza bloccare la transazione locale. */
  enqueueInventoryPush(
    tenantId: string,
    variantId: string,
    locationIds: readonly string[],
  ): void {
    void this.pushInventoryLevels(tenantId, variantId, locationIds).catch((error: unknown) => {
      this.warn('canali', tenantId, error, 'Push inventario');
    });
  }

  private async pushProductToChannels(tenantId: string, productId: string): Promise<void> {
    if (await this.isShopifyTenant(tenantId)) {
      try {
        await this.shopifyProductPush.enqueuePush(tenantId, productId);
      } catch (error: unknown) {
        this.warn('Shopify', tenantId, error, 'Push prodotto');
      }
      return;
    }

    if (await this.isTikTokTenant(tenantId)) {
      try {
        await this.tiktokProductPush.enqueuePush(tenantId, productId);
      } catch (error: unknown) {
        this.warn('TikTok', tenantId, error, 'Push prodotto');
      }
    }
  }

  async pushInventoryLevels(
    tenantId: string,
    variantId: string,
    locationIds: readonly string[],
  ): Promise<void> {
    if (await this.isShopifyTenant(tenantId)) {
      try {
        await this.withInventoryRetry('Shopify', tenantId, () =>
          this.shopifyInventoryPush.pushLevels(tenantId, variantId, locationIds),
        );
      } catch (error: unknown) {
        this.warn('Shopify', tenantId, error, 'Push inventario');
      }
      return;
    }

    if (await this.isTikTokTenant(tenantId)) {
      try {
        await this.withInventoryRetry('TikTok', tenantId, () =>
          this.tiktokInventoryPush.pushVariantStock(tenantId, variantId),
        );
      } catch (error: unknown) {
        this.warn('TikTok', tenantId, error, 'Push inventario');
      }
    }
  }

  /** Riprova il push inventario sugli errori transitori, loggando i tentativi. */
  private withInventoryRetry<T>(
    channel: string,
    tenantId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return retryWithBackoff(operation, {
      delaysMs: INVENTORY_PUSH_RETRY_DELAYS_MS,
      onRetry: (attempt, error) =>
        this.warn(channel, tenantId, error, `Push inventario (tentativo ${attempt})`),
    });
  }

  // ── Operazioni attese, con esito mostrato all'utente ──────────────────────

  /**
   * Sync manuale di un prodotto richiesta dall'utente: a differenza dei push
   * post-commit l'esito torna al chiamante, che lo traduce in messaggio.
   */
  async pushProductNow(tenantId: string, productId: string): Promise<ShopifyProductPushResult> {
    if (!(await this.isShopifyTenant(tenantId))) {
      return { pushed: false, reason: 'not_connected' };
    }
    return this.shopifyProductPush.enqueuePush(tenantId, productId);
  }

  /**
   * Eliminazione prodotto sul canale: bloccante, perché l'eliminazione locale
   * non deve avvenire se il canale non ha confermato.
   */
  async deleteProduct(
    tenantId: string,
    shopifyProductId: string | null,
  ): Promise<ShopifyProductDeleteResult> {
    if (!(await this.isShopifyTenant(tenantId))) {
      return { deleted: false, reason: 'not_connected' };
    }
    return this.shopifyProductPush.deleteProduct(tenantId, shopifyProductId);
  }
}
