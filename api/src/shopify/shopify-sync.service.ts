import { Injectable, Logger } from '@nestjs/common';
import {
  OnlineOrderEventType,
  SalesOrderFinancialStatus,
  SalesOrderFiscalStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { OnlineOrderLifecycleService } from '../order-reservations/online-order-lifecycle.service';
import type { ReservationLineInput } from '../order-reservations/stock-reservation.service';
import { ShopifyInventoryPushService } from './shopify-inventory-push.service';
import { ShopifyInventoryReconciliationService } from './shopify-inventory-reconciliation.service';
import { shopifyDecimalToMinor, shopifyGid } from './shopify-money.util';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyOrderDocumentService } from './shopify-order-document.service';
import { resolveShopifyOrderLocationId } from './shopify-order-location.util';
import { ShopifyProductPullService } from './shopify-product-pull.service';

@Injectable()
export class ShopifySyncService {
  private readonly logger = new Logger(ShopifySyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyProductPull: ShopifyProductPullService,
    private readonly shopifyOrderDocument: ShopifyOrderDocumentService,
    private readonly onlineOrderLifecycle: OnlineOrderLifecycleService,
    private readonly inventoryReconciliation: ShopifyInventoryReconciliationService,
    private readonly inventoryPush: ShopifyInventoryPushService,
  ) {}

  async handleWebhook(tenantId: string, topic: string, payload: unknown): Promise<void> {
    const data = payload as Record<string, unknown>;

    switch (topic) {
      case 'customers/create':
      case 'customers/update':
        await this.applyCustomerFromShopify(tenantId, data);
        break;
      case 'orders/create':
      case 'orders/updated':
      case 'orders/cancelled':
        await this.applyOrderFromShopify(tenantId, data);
        break;
      case 'inventory_levels/update':
        await this.applyInventoryLevelFromShopify(
          tenantId,
          String(data.inventory_item_id),
          String(data.location_id),
          Number(data.available),
          'Sync inventario Shopify',
        );
        break;
      case 'products/create':
      case 'products/update':
        await this.shopifyProductPull.importProductFromWebhook(tenantId, data);
        break;
      default:
        this.logger.debug(`Webhook Shopify ignorato: ${topic}`);
        return;
    }

    await this.shopifyConnection.touchSync(tenantId);
  }

  /** Allinea un cliente Shopify in locale (webhook o import bulk). */
  async applyCustomerFromShopify(
    tenantId: string,
    customer: Record<string, unknown>,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const shopifyId = this.shopifyCustomerId(customer);
    if (!shopifyId) {
      return 'skipped';
    }

    const existing = await this.prisma.customer.findUnique({
      where: { tenantId_shopifyCustomerId: { tenantId, shopifyCustomerId: shopifyId } },
      select: { id: true, partyId: true },
    });

    const address = customer.default_address as Record<string, unknown> | undefined;

    // I dati anagrafici Shopify vivono sul soggetto canonico (Party);
    // il ruolo cliente conserva solo il mapping canale (shopifyCustomerId).
    const partyData = {
      firstName: String(customer.first_name ?? 'Cliente'),
      lastName: String(customer.last_name ?? 'Shopify'),
      email: (customer.email as string | undefined) ?? null,
      phone: (customer.phone as string | undefined) ?? null,
      notes: (customer.note as string | undefined) ?? null,
      addressLine1: (address?.address1 as string | undefined) ?? null,
      addressLine2: (address?.address2 as string | undefined) ?? null,
      city: (address?.city as string | undefined) ?? null,
      province: (address?.province as string | undefined) ?? null,
      postalCode: (address?.zip as string | undefined) ?? null,
      countryCode: (address?.country_code as string | undefined) ?? null,
    };

    if (existing) {
      await this.prisma.party.update({
        where: { id: existing.partyId },
        data: partyData,
      });
      return 'updated';
    }

    await this.prisma.$transaction(async (tx) => {
      const party = await tx.party.create({
        data: { tenantId, ...partyData },
        select: { id: true },
      });
      await tx.customer.create({
        data: { tenantId, partyId: party.id, shopifyCustomerId: shopifyId },
      });
    });

    return 'created';
  }

  /** Allinea un ordine Shopify in locale (webhook o import bulk). */
  async applyOrderFromShopify(
    tenantId: string,
    order: Record<string, unknown>,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const shopifyOrderId = this.shopifyOrderId(order);
    if (!shopifyOrderId) {
      return 'skipped';
    }

    const existingBefore = await this.prisma.salesOrder.findFirst({
      where: { tenantId, shopifyOrderId },
      select: { id: true },
    });

    const customer = order.customer as Record<string, unknown> | undefined;
    let customerId: string | null = null;
    const shopifyCustomerId = customer ? this.shopifyCustomerId(customer) : null;
    if (shopifyCustomerId) {
      await this.applyCustomerFromShopify(tenantId, customer!);
      const dbCustomer = await this.prisma.customer.findFirst({
        where: { tenantId, shopifyCustomerId },
        select: { id: true },
      });
      customerId = dbCustomer?.id ?? null;
    }

    const currency = String(order.currency ?? 'EUR');
    const subtotalMinor = shopifyDecimalToMinor(
      String(order.subtotal_price ?? order.total_price ?? '0'),
    );
    const totalMinor = shopifyDecimalToMinor(String(order.total_price ?? '0'));
    const taxMinor = shopifyDecimalToMinor(String(order.total_tax ?? '0'));
    const shippingMinor = this.extractShippingMinor(order);
    const discountMinor = shopifyDecimalToMinor(String(order.total_discounts ?? '0'));
    const placedAt = new Date(String(order.created_at ?? new Date().toISOString()));
    const source = this.mapOrderSource(order);

    const customerName = customer
      ? `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || 'Cliente Shopify'
      : String(order.email ?? 'Cliente occasionale');

    const lines = (order.line_items as Record<string, unknown>[] | undefined) ?? [];

    let savedOrderId: string | null = null;

    await this.prisma.$transaction(async (tx) => {
      const orderData = {
        orderNumber: String(order.name ?? order.order_number ?? shopifyOrderId),
        source,
        financialStatus: this.mapFinancialStatus(String(order.financial_status ?? 'pending')),
        fulfillmentStatus: this.mapFulfillmentStatus(
          String(order.fulfillment_status ?? 'unfulfilled'),
        ),
        customerId,
        customerName,
        currency,
        subtotalMinor,
        totalMinor,
        taxMinor,
        shippingMinor,
        discountMinor,
        placedAt,
      };

      const saved = existingBefore
        ? await tx.salesOrder.update({
            where: { id: existingBefore.id },
            data: orderData,
          })
        : await tx.salesOrder.create({
            data: {
              tenantId,
              shopifyOrderId,
              ...orderData,
              fiscalStatus:
                source === SalesOrderSource.shopify_pos
                  ? SalesOrderFiscalStatus.excluded_pos_register
                  : SalesOrderFiscalStatus.pending_registration,
            },
          });

      // Upsert per riga con id esterno stabile (line_item Shopify): gli id
      // riga VF restano invariati tra webhook, requisito per gli impegni.
      const lineRows = await Promise.all(
        lines.map(async (line, index) => {
          const variantId = await this.resolveVariantId(
            tenantId,
            line.variant_id as number | undefined,
            line.sku as string | undefined,
          );
          const unitMinor = shopifyDecimalToMinor(String(line.price ?? '0'));
          const qty = Number(line.quantity ?? 0);
          return {
            externalLineId: line.id != null ? String(line.id) : `pos-${index}`,
            variantId,
            sku: String(line.sku ?? '—'),
            title: String(line.title ?? line.name ?? 'Riga ordine'),
            quantity: qty,
            unitPriceMinor: unitMinor,
            totalMinor: unitMinor * qty,
          };
        }),
      );

      // Rimuove righe non più presenti (o legacy senza id esterno): gli
      // eventuali impegni collegati diventano orfani e verranno rilasciati
      // dal dominio, mai cancellati silenziosamente.
      await tx.salesOrderLine.deleteMany({
        where: {
          orderId: saved.id,
          OR: [
            { externalLineId: null },
            { externalLineId: { notIn: lineRows.map((row) => row.externalLineId) } },
          ],
        },
      });

      for (const row of lineRows) {
        await tx.salesOrderLine.upsert({
          where: {
            orderId_externalLineId: { orderId: saved.id, externalLineId: row.externalLineId },
          },
          create: { orderId: saved.id, ...row },
          update: {
            variantId: row.variantId,
            sku: row.sku,
            title: row.title,
            quantity: row.quantity,
            unitPriceMinor: row.unitPriceMinor,
            totalMinor: row.totalMinor,
          },
        });
      }

      savedOrderId = saved.id;
    });

    if (savedOrderId) {
      await this.emitCanonicalOrderEvents(tenantId, savedOrderId, shopifyOrderId, order, {
        isNew: !existingBefore,
      });
    }

    if (savedOrderId) {
      try {
        await this.shopifyOrderDocument.syncFromShopifyOrder({
          tenantId,
          salesOrderId: savedOrderId,
          shopifyOrderId,
          orderPayload: order,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Sync documento ordine fallito';
        this.logger.warn(
          `Documento DDT non creato per ordine Shopify ${shopifyOrderId}: ${message}`,
        );
      }
    }

    return existingBefore ? 'updated' : 'created';
  }

  /**
   * Traduzione connettore → eventi canonici ONLINE_ORDER_* (§8 fase 1).
   * Il dominio quantità (impegni, rilasci, evasioni) non conosce i payload
   * Shopify: riceve solo eventi interni normalizzati e idempotenti.
   */
  private async emitCanonicalOrderEvents(
    tenantId: string,
    salesOrderId: string,
    shopifyOrderId: string,
    order: Record<string, unknown>,
    context: { readonly isNew: boolean },
  ): Promise<void> {
    const channel = this.mapOrderSource(order);
    const base = {
      tenantId,
      channel,
      salesOrderId,
      externalOrderId: shopifyOrderId,
    } as const;

    const savedLines = await this.prisma.salesOrderLine.findMany({
      where: { orderId: salesOrderId },
      select: { id: true, variantId: true, sku: true, quantity: true, externalLineId: true },
    });
    const reservationLines: ReservationLineInput[] = savedLines.flatMap((line) =>
      line.variantId && line.quantity > 0
        ? [
            {
              salesOrderLineId: line.id,
              variantId: line.variantId,
              sku: line.sku,
              quantity: line.quantity,
              externalLineRef: line.externalLineId,
            },
          ]
        : [],
    );

    const locationId =
      reservationLines.length > 0
        ? await resolveShopifyOrderLocationId(this.prisma, tenantId, order)
        : null;

    // updated_at distingue aggiornamenti reali dai retry dello stesso webhook.
    const updatedSuffix =
      typeof order.updated_at === 'string' && order.updated_at
        ? order.updated_at
        : String(Date.now());

    await this.onlineOrderLifecycle.handle({
      ...base,
      type: context.isNew
        ? OnlineOrderEventType.online_order_created
        : OnlineOrderEventType.online_order_updated,
      dedupeSuffix: context.isNew ? undefined : updatedSuffix,
      locationId,
      lines: reservationLines,
    });

    const cancelledAtRaw =
      typeof order.cancelled_at === 'string' && order.cancelled_at ? order.cancelled_at : null;
    const financial = this.mapFinancialStatus(String(order.financial_status ?? 'pending'));
    const fulfillment = this.mapFulfillmentStatus(
      String(order.fulfillment_status ?? 'unfulfilled'),
    );

    if (cancelledAtRaw || financial === SalesOrderFinancialStatus.voided) {
      await this.onlineOrderLifecycle.handle({
        ...base,
        type: OnlineOrderEventType.online_order_cancelled,
        occurredAt: cancelledAtRaw ? new Date(cancelledAtRaw) : undefined,
      });
    } else if (fulfillment === SalesOrderFulfillmentStatus.fulfilled) {
      const fulfillmentInfo = this.extractFulfillmentInfo(order);
      await this.onlineOrderLifecycle.handle({
        ...base,
        type: OnlineOrderEventType.online_order_fulfilled,
        occurredAt: fulfillmentInfo.occurredAt,
        externalFulfillmentId: fulfillmentInfo.externalFulfillmentId,
        locationId,
      });
    } else if (fulfillment === SalesOrderFulfillmentStatus.partially_fulfilled) {
      await this.onlineOrderLifecycle.handle({
        ...base,
        type: OnlineOrderEventType.online_order_partially_fulfilled,
      });
    }

    if (financial === SalesOrderFinancialStatus.refunded) {
      await this.onlineOrderLifecycle.handle({
        ...base,
        type: OnlineOrderEventType.online_order_refunded,
      });
    }

    // Restock REALE (fase 2 §8): solo refund line con restock fisico dichiarato
    // dal canale. Il solo stato "rimborsato" NON genera mai carichi.
    await this.emitRestockEvents(base, order, savedLines);
  }

  /**
   * Eventi canonici `online_order_restocked` dai rimborsi Shopify con
   * `restock_type` fisico (`return`/`legacy_restock`). Un evento per
   * rimborso × location, idempotente via dedupe suffix (id refund + location).
   * `cancel` è escluso: pre-evasione la giacenza non era mai stata scaricata.
   */
  private async emitRestockEvents(
    base: {
      readonly tenantId: string;
      readonly channel: SalesOrderSource;
      readonly salesOrderId: string;
      readonly externalOrderId: string;
    },
    order: Record<string, unknown>,
    savedLines: readonly {
      id: string;
      variantId: string | null;
      sku: string;
      quantity: number;
      externalLineId: string | null;
    }[],
  ): Promise<void> {
    const refunds = Array.isArray(order.refunds)
      ? (order.refunds as Record<string, unknown>[])
      : [];
    if (refunds.length === 0) {
      return;
    }

    const lineByExternalId = new Map(
      savedLines
        .filter((line) => line.externalLineId !== null)
        .map((line) => [line.externalLineId as string, line]),
    );

    for (const refund of refunds) {
      const refundId = refund.id != null ? String(refund.id) : null;
      const refundLineItems = Array.isArray(refund.refund_line_items)
        ? (refund.refund_line_items as Record<string, unknown>[])
        : [];
      if (!refundId || refundLineItems.length === 0) {
        continue;
      }

      // Raggruppa per location Shopify: un evento restock per location.
      const byShopifyLocation = new Map<string, ReservationLineInput[]>();
      for (const item of refundLineItems) {
        const restockType = typeof item.restock_type === 'string' ? item.restock_type : '';
        if (restockType !== 'return' && restockType !== 'legacy_restock') {
          continue;
        }
        const quantity = Number(item.quantity ?? 0);
        const externalLineId = item.line_item_id != null ? String(item.line_item_id) : null;
        const shopifyLocationId = item.location_id != null ? String(item.location_id) : '';
        if (!externalLineId || quantity <= 0) {
          continue;
        }
        const orderLine = lineByExternalId.get(externalLineId);
        if (!orderLine?.variantId) {
          continue;
        }
        const group = byShopifyLocation.get(shopifyLocationId) ?? [];
        group.push({
          salesOrderLineId: orderLine.id,
          variantId: orderLine.variantId,
          sku: orderLine.sku,
          quantity,
          externalLineRef: externalLineId,
        });
        byShopifyLocation.set(shopifyLocationId, group);
      }

      const occurredAtRaw =
        typeof refund.processed_at === 'string'
          ? refund.processed_at
          : typeof refund.created_at === 'string'
            ? refund.created_at
            : null;

      for (const [shopifyLocationId, lines] of byShopifyLocation) {
        const location = shopifyLocationId
          ? await this.prisma.location.findFirst({
              where: { tenantId: base.tenantId, shopifyLocationId },
              select: { id: true },
            })
          : null;

        await this.onlineOrderLifecycle.handle({
          ...base,
          type: OnlineOrderEventType.online_order_restocked,
          dedupeSuffix: `${refundId}:${shopifyLocationId || 'default'}`,
          occurredAt: occurredAtRaw ? new Date(occurredAtRaw) : undefined,
          locationId: location?.id ?? null,
          lines,
        });
      }
    }
  }

  /** Data e id evasione dal payload ordine (primo fulfillment disponibile). */
  private extractFulfillmentInfo(order: Record<string, unknown>): {
    occurredAt: Date | undefined;
    externalFulfillmentId: string | null;
  } {
    const fulfillments = order.fulfillments as Record<string, unknown>[] | undefined;
    const first = fulfillments?.[0];
    if (!first) {
      return { occurredAt: undefined, externalFulfillmentId: null };
    }
    const createdAt = typeof first.created_at === 'string' ? new Date(first.created_at) : undefined;
    const externalId =
      typeof first.admin_graphql_api_id === 'string'
        ? first.admin_graphql_api_id
        : first.id != null
          ? String(first.id)
          : null;
    return { occurredAt: createdAt, externalFulfillmentId: externalId };
  }

  /**
   * Riconcilia un valore `available` osservato su Shopify (webhook o import bulk).
   * NON sovrascrive Giacenza/Impegnata/Disponibile VestiFlow (policy post-audit §6).
   */
  async applyInventoryLevelFromShopify(
    tenantId: string,
    shopifyInventoryItemId: string,
    shopifyLocationId: string,
    available: number,
    _reason: string,
  ): Promise<'created' | 'updated' | 'unchanged' | 'skipped'> {
    const outcome = await this.inventoryReconciliation.reconcileFromShopifyWebhook(
      tenantId,
      shopifyInventoryItemId,
      shopifyLocationId,
      available,
    );

    if (outcome === 'mismatch_republish') {
      const variant = await this.prisma.productVariant.findFirst({
        where: { tenantId, shopifyInventoryItemId },
        select: { id: true },
      });
      const location = await this.prisma.location.findFirst({
        where: { tenantId, shopifyLocationId },
        select: { id: true },
      });
      if (variant && location) {
        void this.inventoryPush
          .pushLevel(tenantId, variant.id, location.id)
          .catch((error: unknown) => {
            const message =
              error instanceof Error ? error.message : 'Ripubblicazione inventario fallita';
            this.logger.warn(`Caso D ripubblicazione (${tenantId}): ${message}`);
          });
      }
      return 'updated';
    }

    switch (outcome) {
      case 'reconciled':
      case 'echo_confirmed':
        return 'unchanged';
      case 'deferred':
        return 'skipped';
      default:
        return 'skipped';
    }
  }

  private async resolveVariantId(
    tenantId: string,
    shopifyVariantId?: number,
    sku?: string,
  ): Promise<string | null> {
    if (shopifyVariantId != null) {
      const byShopify = await this.prisma.productVariant.findFirst({
        where: { tenantId, shopifyVariantId: String(shopifyVariantId) },
        select: { id: true },
      });
      if (byShopify) {
        return byShopify.id;
      }
    }
    if (sku) {
      const bySku = await this.prisma.productVariant.findFirst({
        where: { tenantId, sku },
        select: { id: true },
      });
      if (bySku) {
        return bySku.id;
      }
    }
    return null;
  }

  private shopifyCustomerId(customer: Record<string, unknown>): string | null {
    if (typeof customer.admin_graphql_api_id === 'string') {
      return customer.admin_graphql_api_id;
    }
    if (customer.id != null) {
      return shopifyGid('Customer', String(customer.id));
    }
    return null;
  }

  private shopifyOrderId(order: Record<string, unknown>): string | null {
    if (typeof order.admin_graphql_api_id === 'string') {
      return order.admin_graphql_api_id;
    }
    if (order.id != null) {
      return shopifyGid('Order', String(order.id));
    }
    return null;
  }

  private mapOrderSource(order: Record<string, unknown>): SalesOrderSource {
    const source = String(order.source_name ?? '').toLowerCase();
    return source === 'pos' ? SalesOrderSource.shopify_pos : SalesOrderSource.shopify_online;
  }

  private extractShippingMinor(order: Record<string, unknown>): number {
    const shippingSet = order.total_shipping_price_set as
      | { shop_money?: { amount?: string } }
      | undefined;
    if (shippingSet?.shop_money?.amount != null) {
      return shopifyDecimalToMinor(String(shippingSet.shop_money.amount));
    }
    return shopifyDecimalToMinor(String(order.total_shipping ?? '0'));
  }

  private mapFinancialStatus(status: string): SalesOrderFinancialStatus {
    switch (status) {
      case 'paid':
        return SalesOrderFinancialStatus.paid;
      case 'partially_refunded':
        return SalesOrderFinancialStatus.partially_refunded;
      case 'refunded':
        return SalesOrderFinancialStatus.refunded;
      case 'voided':
        return SalesOrderFinancialStatus.voided;
      case 'authorized':
        return SalesOrderFinancialStatus.authorized;
      case 'pending':
      default:
        return SalesOrderFinancialStatus.pending;
    }
  }

  private mapFulfillmentStatus(status: string): SalesOrderFulfillmentStatus {
    switch (status) {
      case 'partial':
      case 'partially_fulfilled':
        return SalesOrderFulfillmentStatus.partially_fulfilled;
      case 'fulfilled':
        return SalesOrderFulfillmentStatus.fulfilled;
      case 'unfulfilled':
      default:
        return SalesOrderFulfillmentStatus.unfulfilled;
    }
  }
}
