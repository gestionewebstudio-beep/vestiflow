import { Injectable, Logger } from '@nestjs/common';
import {
  ProductStatus,
  TikTokConnectionStatus,
  TikTokSyncStatus,
  type Product,
  type ProductVariant,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { TikTokCreateProductPayload } from './tiktok-api.client';
import { TikTokApiClient } from './tiktok-api.client';
import { TikTokConfigService } from './tiktok-config.service';
import { TikTokConnectionService } from './tiktok-connection.service';
import { TikTokOAuthService } from './tiktok-oauth.service';

type ProductWithVariants = Product & { variants: ProductVariant[] };

export type TikTokProductPushSkipReason = 'not_connected' | 'archived' | 'missing_category';

export interface TikTokProductPushResult {
  readonly pushed: boolean;
  readonly reason?: TikTokProductPushSkipReason | 'tiktok_error';
  readonly followUpInBackground?: boolean;
}

@Injectable()
export class TikTokProductPushService {
  private readonly logger = new Logger(TikTokProductPushService.name);
  private readonly pushInFlight = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tiktokOAuth: TikTokOAuthService,
    private readonly tiktokApi: TikTokApiClient,
    private readonly tiktokConfig: TikTokConfigService,
    private readonly tiktokConnection: TikTokConnectionService,
  ) {}

  async enqueuePush(tenantId: string, productId: string): Promise<TikTokProductPushResult> {
    const guard = await this.evaluatePushGuard(tenantId, productId);
    if (!guard.ok) {
      return { pushed: false, reason: guard.reason };
    }

    const lockKey = `${tenantId}:${productId}`;
    if (this.pushInFlight.has(lockKey)) {
      return { pushed: true, followUpInBackground: true };
    }

    await this.markProductSyncing(productId);
    void this.executePushWork(tenantId, productId, lockKey);
    return { pushed: true, followUpInBackground: true };
  }

  private async evaluatePushGuard(
    tenantId: string,
    productId: string,
  ): Promise<
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: TikTokProductPushSkipReason | 'tiktok_error' }
  > {
    const connection = await this.prisma.tikTokConnection.findUnique({
      where: { tenantId },
      select: { status: true },
    });

    if (!connection || connection.status !== TikTokConnectionStatus.connected) {
      return { ok: false, reason: 'not_connected' };
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      select: { status: true, tiktokCategoryId: true },
    });
    if (!product) {
      return { ok: false, reason: 'tiktok_error' };
    }
    if (product.status === ProductStatus.archived) {
      return { ok: false, reason: 'archived' };
    }

    const categoryId = product.tiktokCategoryId?.trim() || this.tiktokConfig.defaultCategoryId;
    if (!categoryId) {
      return { ok: false, reason: 'missing_category' };
    }

    return { ok: true };
  }

  private async executePushWork(
    tenantId: string,
    productId: string,
    lockKey: string,
  ): Promise<void> {
    this.pushInFlight.add(lockKey);
    try {
      const product = await this.prisma.product.findFirst({
        where: { id: productId, tenantId },
        include: { variants: true },
      });
      if (!product) {
        return;
      }

      const categoryId = product.tiktokCategoryId?.trim() || this.tiktokConfig.defaultCategoryId;
      if (!categoryId) {
        await this.markProductError(productId, 'missing_category', 'Categoria TikTok mancante');
        return;
      }

      const { accessToken, shopCipher } = await this.tiktokOAuth.getAccessContext(tenantId);
      const payload = await this.buildPayload(product, categoryId);

      if (product.tiktokProductId) {
        const updated = await this.tiktokApi.updateProduct(
          accessToken,
          shopCipher,
          product.tiktokProductId,
          payload,
        );
        await this.persistSkuIds(product, updated.product_id, payload);
      } else {
        const created = await this.tiktokApi.createProduct(accessToken, shopCipher, payload);
        await this.persistSkuIds(product, created.product_id, payload, created.skus);
      }

      await this.prisma.product.update({
        where: { id: productId },
        data: {
          tiktokSyncStatus: TikTokSyncStatus.synced,
          tiktokLastSyncAt: new Date(),
          tiktokLastError: null,
        },
      });
      await this.tiktokConnection.touchSync(tenantId);
      this.logger.log(`Prodotto TikTok sincronizzato (${tenantId}): ${product.name}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore push prodotto TikTok';
      await this.markProductError(productId, 'tiktok_error', message);
      this.logger.warn(`Push prodotto TikTok fallito (${tenantId}/${productId}): ${message}`);
    } finally {
      this.pushInFlight.delete(lockKey);
    }
  }

  private async buildPayload(
    product: ProductWithVariants,
    categoryId: string,
  ): Promise<TikTokCreateProductPayload> {
    const stockByVariant = await this.loadAvailableStock(product);

    // Varianti senza SKU (facoltativo alla creazione, specifica cliente §SKU)
    // non sono pubblicabili su TikTok Shop: il catalogo esterno richiede un
    // seller_sku identificativo. Restano escluse dal push finche' non ne
    // ricevono uno (manuale o via "Genera SKU"), invece di inviare un
    // seller_sku vuoto che l'API TikTok rifiuterebbe comunque.
    const skuVariants = product.variants.filter(
      (variant): variant is typeof variant & { sku: string } => Boolean(variant.sku),
    );
    if (skuVariants.length === 0) {
      throw new Error(
        'Nessuna variante con SKU: assegna uno SKU ad almeno una variante prima del push TikTok.',
      );
    }

    return {
      title: product.name,
      description: product.description?.trim() || product.name,
      category_id: categoryId,
      skus: skuVariants.map((variant) => ({
        seller_sku: variant.sku,
        price: {
          amount: (variant.sellingPriceMinor / 100).toFixed(2),
          currency: variant.currency,
        },
        stock_infos: [{ available_stock: stockByVariant.get(variant.id) ?? 0 }],
      })),
    };
  }

  private async loadAvailableStock(product: ProductWithVariants): Promise<Map<string, number>> {
    const levels = await this.prisma.inventoryLevel.findMany({
      where: {
        tenantId: product.tenantId,
        variantId: { in: product.variants.map((variant) => variant.id) },
      },
      select: { variantId: true, available: true },
    });

    const totals = new Map<string, number>();
    for (const level of levels) {
      totals.set(level.variantId, (totals.get(level.variantId) ?? 0) + level.available);
    }
    return totals;
  }

  private async persistSkuIds(
    product: ProductWithVariants,
    productId: string,
    payload: TikTokCreateProductPayload,
    createdSkus?: readonly { readonly id: string; readonly seller_sku: string }[],
  ): Promise<void> {
    await this.prisma.product.update({
      where: { id: product.id },
      data: { tiktokProductId: productId },
    });

    if (!createdSkus?.length) {
      return;
    }

    const skuToId = new Map(createdSkus.map((row) => [row.seller_sku, row.id]));
    for (const variant of product.variants) {
      if (!variant.sku) {
        continue;
      }
      const tiktokSkuId = skuToId.get(variant.sku);
      if (!tiktokSkuId) {
        continue;
      }
      await this.prisma.productVariant.update({
        where: { id: variant.id },
        data: { tiktokSkuId },
      });
    }
  }

  private async markProductSyncing(productId: string): Promise<void> {
    await this.prisma.product.updateMany({
      where: { id: productId },
      data: { tiktokSyncStatus: TikTokSyncStatus.syncing },
    });
  }

  private async markProductError(productId: string, code: string, message: string): Promise<void> {
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        tiktokSyncStatus: TikTokSyncStatus.error,
        tiktokLastError: `${code}:${message}`.slice(0, 500),
      },
    });
  }
}
