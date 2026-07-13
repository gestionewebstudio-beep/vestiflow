import { Injectable, Logger } from '@nestjs/common';
import { ReservationStatus, SalesOrderSource } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { computeShopifyPublishableAvailable } from './shopify-publishable-available.util';

/** Esito riconciliazione webhook `inventory_levels/update` (casi A–D, §6). */
export type ShopifyInventoryReconcileOutcome =
  | 'skipped'
  | 'reconciled' // Caso A — valore coincidente
  | 'echo_confirmed' // Caso B — echo del push VestiFlow
  | 'deferred' // Caso C — ordine Shopify non ancora elaborato
  | 'mismatch_republish'; // Caso D — disallineamento manuale, ripubblicare VF

/** Finestra in cui un webhook con lo stesso valore del push è considerato eco (anti-loop). */
const ECHO_WINDOW_MS = 5 * 60 * 1000;

/**
 * Riconciliazione inventario Shopify in ingresso.
 *
 * Il webhook NON sovrascrive Giacenza, Impegnata o Disponibile VestiFlow.
 * Registra il valore osservato, classifica il caso e — solo in D — segnala
 * la necessità di ripubblicare il valore VestiFlow.
 */
@Injectable()
export class ShopifyInventoryReconciliationService {
  private readonly logger = new Logger(ShopifyInventoryReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async reconcileFromShopifyWebhook(
    tenantId: string,
    shopifyInventoryItemId: string,
    shopifyLocationId: string,
    shopifyAvailable: number,
  ): Promise<ShopifyInventoryReconcileOutcome> {
    if (!Number.isFinite(shopifyAvailable)) {
      return 'skipped';
    }

    const variant = await this.prisma.productVariant.findFirst({
      where: { tenantId, shopifyInventoryItemId },
      select: { id: true, sku: true },
    });
    const location = await this.prisma.location.findFirst({
      where: { tenantId, shopifyLocationId },
      select: { id: true },
    });

    if (!variant || !location) {
      this.logger.debug(
        `Riconciliazione saltata: mapping mancante item=${shopifyInventoryItemId} loc=${shopifyLocationId}`,
      );
      return 'skipped';
    }

    const observed = Math.max(0, Math.trunc(shopifyAvailable));
    const level = await this.prisma.inventoryLevel.findUnique({
      where: { variantId_locationId: { variantId: variant.id, locationId: location.id } },
      select: { onHand: true, committed: true },
    });

    const onHand = level?.onHand ?? 0;
    const committed = level?.committed ?? 0;
    const expected = computeShopifyPublishableAvailable(onHand, committed, 0);
    const now = new Date();

    const syncState = await this.prisma.shopifyInventorySyncState.upsert({
      where: {
        tenantId_variantId_locationId: {
          tenantId,
          variantId: variant.id,
          locationId: location.id,
        },
      },
      create: {
        tenantId,
        variantId: variant.id,
        locationId: location.id,
        lastObservedShopifyAvailable: observed,
        lastObservedAt: now,
      },
      update: {
        lastObservedShopifyAvailable: observed,
        lastObservedAt: now,
      },
      select: {
        lastPushedAvailable: true,
        lastPushedAt: true,
      },
    });

    // Caso B — eco del push appena inviato da VestiFlow.
    if (
      syncState.lastPushedAvailable === observed &&
      syncState.lastPushedAt != null &&
      now.getTime() - syncState.lastPushedAt.getTime() <= ECHO_WINDOW_MS
    ) {
      await this.clearMismatch(tenantId, variant.id, location.id);
      this.logger.debug(
        `Eco push confermato (${tenantId}): ${variant.sku} @ ${location.id} → ${observed}`,
      );
      return 'echo_confirmed';
    }

    // Caso A — Shopify coincide con il valore pubblicabile atteso da VestiFlow.
    if (observed === expected) {
      await this.clearMismatch(tenantId, variant.id, location.id);
      return 'reconciled';
    }

    // Caso C — quantità inferiore ma impegni Shopify attivi non ancora allineati.
    if (observed < expected) {
      const pending = await this.hasActiveShopifyReservations(
        tenantId,
        variant.id,
        location.id,
      );
      if (pending) {
        this.logger.debug(
          `Riconciliazione differita (${tenantId}): ${variant.sku} osservato ${observed}, atteso ${expected} — impegni attivi`,
        );
        return 'deferred';
      }
    }

    // Caso D — disallineamento non giustificato: VF resta fonte di verità.
    const note =
      `Disallineamento Shopify: osservato ${observed}, pubblicabile VestiFlow ${expected} ` +
      `(Giacenza ${onHand}, Impegnata ${committed}). Ripubblicazione programmata.`;
    await this.prisma.shopifyInventorySyncState.update({
      where: {
        tenantId_variantId_locationId: {
          tenantId,
          variantId: variant.id,
          locationId: location.id,
        },
      },
      data: { mismatchDetected: true, mismatchNote: note },
    });
    this.logger.warn(`Caso D (${tenantId}): ${variant.sku} — ${note}`);
    return 'mismatch_republish';
  }

  /** Registra un push outbound per anti-loop (Caso B). */
  async recordSuccessfulPush(
    tenantId: string,
    variantId: string,
    locationId: string,
    pushedAvailable: number,
  ): Promise<void> {
    await this.prisma.shopifyInventorySyncState.upsert({
      where: {
        tenantId_variantId_locationId: { tenantId, variantId, locationId },
      },
      create: {
        tenantId,
        variantId,
        locationId,
        lastPushedAvailable: pushedAvailable,
        lastPushedAt: new Date(),
      },
      update: {
        lastPushedAvailable: pushedAvailable,
        lastPushedAt: new Date(),
        mismatchDetected: false,
        mismatchNote: null,
      },
    });
  }

  private async clearMismatch(
    tenantId: string,
    variantId: string,
    locationId: string,
  ): Promise<void> {
    await this.prisma.shopifyInventorySyncState.updateMany({
      where: { tenantId, variantId, locationId, mismatchDetected: true },
      data: { mismatchDetected: false, mismatchNote: null },
    });
  }

  private async hasActiveShopifyReservations(
    tenantId: string,
    variantId: string,
    locationId: string,
  ): Promise<boolean> {
    const count = await this.prisma.stockReservation.count({
      where: {
        tenantId,
        variantId,
        locationId,
        status: ReservationStatus.active,
        remainingQuantity: { gt: 0 },
        channel: { in: [SalesOrderSource.shopify_online, SalesOrderSource.shopify_pos] },
      },
    });
    return count > 0;
  }
}
