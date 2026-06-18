import { Injectable, Logger } from '@nestjs/common';
import {
  MovementOrigin,
  SalesOrderFinancialStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
  StockMovementType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { shopifyDecimalToMinor, shopifyGid } from './shopify-money.util';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyProductPullService } from './shopify-product-pull.service';

@Injectable()
export class ShopifySyncService {
  private readonly logger = new Logger(ShopifySyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyProductPull: ShopifyProductPullService,
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
      select: { id: true },
    });

    const address = customer.default_address as Record<string, unknown> | undefined;

    await this.prisma.customer.upsert({
      where: { tenantId_shopifyCustomerId: { tenantId, shopifyCustomerId: shopifyId } },
      update: {
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
      },
      create: {
        tenantId,
        shopifyCustomerId: shopifyId,
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
      },
    });

    return existing ? 'updated' : 'created';
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
    const placedAt = new Date(String(order.created_at ?? new Date().toISOString()));

    const customerName = customer
      ? `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || 'Cliente Shopify'
      : String(order.email ?? 'Cliente occasionale');

    const lines = (order.line_items as Record<string, unknown>[] | undefined) ?? [];

    await this.prisma.$transaction(async (tx) => {
      const orderData = {
        orderNumber: String(order.name ?? order.order_number ?? shopifyOrderId),
        source: this.mapOrderSource(order),
        financialStatus: this.mapFinancialStatus(String(order.financial_status ?? 'pending')),
        fulfillmentStatus: this.mapFulfillmentStatus(
          String(order.fulfillment_status ?? 'unfulfilled'),
        ),
        customerId,
        customerName,
        currency,
        subtotalMinor,
        totalMinor,
        placedAt,
      };

      const saved = existingBefore
        ? await tx.salesOrder.update({
            where: { id: existingBefore.id },
            data: orderData,
          })
        : await tx.salesOrder.create({
            data: { tenantId, shopifyOrderId, ...orderData },
          });

      await tx.salesOrderLine.deleteMany({ where: { orderId: saved.id } });

      if (lines.length > 0) {
        await tx.salesOrderLine.createMany({
          data: await Promise.all(
            lines.map(async (line) => {
              const variantId = await this.resolveVariantId(
                tenantId,
                line.variant_id as number | undefined,
                line.sku as string | undefined,
              );
              const unitMinor = shopifyDecimalToMinor(String(line.price ?? '0'));
              const qty = Number(line.quantity ?? 0);
              return {
                orderId: saved.id,
                variantId,
                sku: String(line.sku ?? '—'),
                title: String(line.title ?? line.name ?? 'Riga ordine'),
                quantity: qty,
                unitPriceMinor: unitMinor,
                totalMinor: unitMinor * qty,
              };
            }),
          ),
        });
      }
    });

    return existingBefore ? 'updated' : 'created';
  }

  /**
   * Allinea una giacenza locale al valore `available` Shopify (webhook o import bulk).
   * @returns esito applicazione; `skipped` se manca mapping variante/location.
   */
  async applyInventoryLevelFromShopify(
    tenantId: string,
    shopifyInventoryItemId: string,
    shopifyLocationId: string,
    available: number,
    reason: string,
  ): Promise<'created' | 'updated' | 'unchanged' | 'skipped'> {
    if (!Number.isFinite(available)) {
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
        `Inventory sync skipped: mapping mancante item=${shopifyInventoryItemId} loc=${shopifyLocationId}`,
      );
      return 'skipped';
    }

    const normalizedAvailable = Math.max(0, Math.trunc(available));

    return this.prisma.$transaction(async (tx) => {
      const level = await tx.inventoryLevel.findUnique({
        where: { variantId_locationId: { variantId: variant.id, locationId: location.id } },
      });

      const before = level?.available ?? 0;
      const delta = normalizedAvailable - before;
      if (delta === 0) {
        return 'unchanged' as const;
      }

      if (level) {
        await tx.inventoryLevel.update({
          where: { id: level.id },
          data: {
            onHand: level.onHand + delta,
            available: normalizedAvailable,
          },
        });
      } else {
        await tx.inventoryLevel.create({
          data: {
            tenantId,
            variantId: variant.id,
            locationId: location.id,
            onHand: normalizedAvailable,
            available: normalizedAvailable,
            minThreshold: 0,
          },
        });
      }

      await tx.stockMovement.create({
        data: {
          tenantId,
          type: delta > 0 ? StockMovementType.load : StockMovementType.unload,
          origin: MovementOrigin.shopify,
          variantId: variant.id,
          sku: variant.sku,
          locationId: location.id,
          quantity: Math.abs(delta),
          reason,
          externalRef: `inventory_item:${shopifyInventoryItemId}`,
          createdByName: 'Shopify',
        },
      });

      return level ? ('updated' as const) : ('created' as const);
    });
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
