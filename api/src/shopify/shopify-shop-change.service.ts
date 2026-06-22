import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InventoryCountStatus, ShopifySyncStatus, SupplierOrderStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { PurgeShopifyDataDto } from './dto/purge-shopify-data.dto';

const OPEN_SUPPLIER_ORDER_STATUSES: readonly SupplierOrderStatus[] = [
  SupplierOrderStatus.draft,
  SupplierOrderStatus.sent,
  SupplierOrderStatus.partially_received,
];

export interface ShopifyShopChangeBlocker {
  readonly code: 'supplier_orders_open';
  readonly message: string;
  readonly references: readonly {
    readonly type: 'supplier_order';
    readonly id: string;
    readonly reference: string;
  }[];
}

export interface ShopifyShopChangePreview {
  readonly currentShopDomain: string | null;
  readonly counts: {
    readonly shopifyProducts: number;
    readonly shopifyVariants: number;
    readonly shopifyCustomers: number;
    readonly shopifySalesOrders: number;
    readonly inventoryLevels: number;
    readonly stockMovements: number;
    readonly shopifyLinkedLocations: number;
    readonly removableShopifyLocations: number;
  };
  readonly blockers: readonly ShopifyShopChangeBlocker[];
}

export interface ShopifyShopChangePurgeResult {
  readonly purged: {
    readonly products: number;
    readonly customers: number;
    readonly salesOrders: number;
    readonly stockMovements: number;
    readonly inventoryLevels: number;
    readonly inventoryCountLines: number;
    readonly locations: number;
  };
}

@Injectable()
export class ShopifyShopChangeService {
  private readonly logger = new Logger(ShopifyShopChangeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async preview(tenantId: string): Promise<ShopifyShopChangePreview> {
    const currentShopDomain = await this.resolveCurrentShopDomain(tenantId);
    const shopifyVariantIds = await this.listShopifyLinkedVariantIds(tenantId);
    const counts = await this.countShopifyData(tenantId, shopifyVariantIds);
    const blockers = await this.findBlockers(tenantId, shopifyVariantIds);

    return {
      currentShopDomain,
      counts,
      blockers,
    };
  }

  async purge(tenantId: string, dto: PurgeShopifyDataDto): Promise<ShopifyShopChangePurgeResult> {
    const currentShopDomain = await this.requireCurrentShopDomain(tenantId);
    if (dto.confirmShopDomain !== currentShopDomain) {
      throw new BadRequestException(
        'Il dominio inserito non corrisponde al negozio Shopify attualmente collegato.',
      );
    }

    if (!dto.purgeCatalog && !dto.purgeCustomers && !dto.purgeOrders) {
      throw new BadRequestException('Seleziona almeno una categoria di dati da rimuovere.');
    }

    if (dto.purgeCustomers && !dto.purgeOrders) {
      const linkedOrders = await this.prisma.salesOrder.count({
        where: {
          tenantId,
          shopifyOrderId: { not: null },
          customer: { shopifyCustomerId: { not: null } },
        },
      });
      if (linkedOrders > 0) {
        throw new BadRequestException(
          'Per rimuovere i clienti Shopify includi anche gli ordini vendita Shopify.',
        );
      }
    }

    const shopifyVariantIds = dto.purgeCatalog
      ? await this.listShopifyLinkedVariantIds(tenantId)
      : [];
    const blockers = dto.purgeCatalog
      ? await this.findBlockers(tenantId, shopifyVariantIds)
      : [];
    if (blockers.length > 0) {
      throw new UnprocessableEntityException({
        message:
          'Impossibile rimuovere il catalogo Shopify: ci sono ordini fornitore aperti collegati a varianti del negozio.',
        blockers,
      });
    }

    const purged = {
      products: 0,
      customers: 0,
      salesOrders: 0,
      stockMovements: 0,
      inventoryLevels: 0,
      inventoryCountLines: 0,
      locations: 0,
    };

    await this.prisma.$transaction(async (tx) => {
      if (dto.purgeCatalog && shopifyVariantIds.length > 0) {
        const countLines = await tx.inventoryCountLine.deleteMany({
          where: { tenantId, variantId: { in: [...shopifyVariantIds] } },
        });
        purged.inventoryCountLines = countLines.count;

        const movements = await tx.stockMovement.deleteMany({
          where: { tenantId, variantId: { in: [...shopifyVariantIds] } },
        });
        purged.stockMovements = movements.count;

        const levels = await tx.inventoryLevel.deleteMany({
          where: { tenantId, variantId: { in: [...shopifyVariantIds] } },
        });
        purged.inventoryLevels = levels.count;
      }

      if (dto.purgeCatalog) {
        const products = await tx.product.deleteMany({
          where: { tenantId, shopifyProductId: { not: null } },
        });
        purged.products = products.count;
      }

      if (dto.purgeOrders) {
        const orders = await tx.salesOrder.deleteMany({
          where: { tenantId, shopifyOrderId: { not: null } },
        });
        purged.salesOrders = orders.count;
      }

      if (dto.purgeCustomers) {
        const customers = await tx.customer.deleteMany({
          where: { tenantId, shopifyCustomerId: { not: null } },
        });
        purged.customers = customers.count;
      }

      if (dto.purgeCatalog || dto.purgeCustomers || dto.purgeOrders) {
        purged.locations = await this.cleanupShopifyLocations(tx, tenantId);
      }
    });

    this.logger.log(
      `Purge dati Shopify (${tenantId}, ${currentShopDomain}): prodotti=${purged.products} clienti=${purged.customers} ordini=${purged.salesOrders} location=${purged.locations}`,
    );

    return { purged };
  }

  private async resolveCurrentShopDomain(tenantId: string): Promise<string | null> {
    const credential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { shopDomain: true },
    });
    if (credential?.shopDomain) {
      return credential.shopDomain;
    }

    const connection = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { shopDomain: true },
    });
    return connection?.shopDomain ?? null;
  }

  private async requireCurrentShopDomain(tenantId: string): Promise<string> {
    const domain = await this.resolveCurrentShopDomain(tenantId);
    if (!domain) {
      throw new NotFoundException('Nessun negozio Shopify collegato per confermare la rimozione.');
    }
    return domain;
  }

  private async listShopifyLinkedVariantIds(tenantId: string): Promise<string[]> {
    const variants = await this.prisma.productVariant.findMany({
      where: { tenantId, product: { shopifyProductId: { not: null } } },
      select: { id: true },
    });
    return variants.map((variant) => variant.id);
  }

  private async countShopifyData(
    tenantId: string,
    shopifyVariantIds: readonly string[],
  ): Promise<ShopifyShopChangePreview['counts']> {
    const [
      shopifyProducts,
      shopifyVariants,
      shopifyCustomers,
      shopifySalesOrders,
      inventoryLevels,
      stockMovements,
      locationStats,
    ] = await Promise.all([
      this.prisma.product.count({
        where: { tenantId, shopifyProductId: { not: null } },
      }),
      this.prisma.productVariant.count({
        where: { tenantId, product: { shopifyProductId: { not: null } } },
      }),
      this.prisma.customer.count({
        where: { tenantId, shopifyCustomerId: { not: null } },
      }),
      this.prisma.salesOrder.count({
        where: { tenantId, shopifyOrderId: { not: null } },
      }),
      shopifyVariantIds.length > 0
        ? this.prisma.inventoryLevel.count({
            where: { tenantId, variantId: { in: [...shopifyVariantIds] } },
          })
        : Promise.resolve(0),
      shopifyVariantIds.length > 0
        ? this.prisma.stockMovement.count({
            where: { tenantId, variantId: { in: [...shopifyVariantIds] } },
          })
        : Promise.resolve(0),
      this.countRemovableShopifyLocations(tenantId),
    ]);

    return {
      shopifyProducts,
      shopifyVariants,
      shopifyCustomers,
      shopifySalesOrders,
      inventoryLevels,
      stockMovements,
      shopifyLinkedLocations: locationStats.linked,
      removableShopifyLocations: locationStats.removable,
    };
  }

  private async countRemovableShopifyLocations(
    tenantId: string,
  ): Promise<{ linked: number; removable: number }> {
    const locations = await this.prisma.location.findMany({
      where: { tenantId },
      select: { id: true, shopifyLocationId: true, code: true },
    });

    let linked = 0;
    let removable = 0;

    for (const location of locations) {
      const shopifyLinked = Boolean(location.shopifyLocationId);
      const shopifyOrphan = !shopifyLinked && this.isShopifyImportedLocationCode(location.code);
      if (!shopifyLinked && !shopifyOrphan) {
        continue;
      }
      if (shopifyLinked) {
        linked += 1;
      }
      if (await this.canDeleteLocation(this.prisma, tenantId, location.id)) {
        removable += 1;
      }
    }

    return { linked, removable };
  }

  private async cleanupShopifyLocations(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<number> {
    const locations = await tx.location.findMany({
      where: { tenantId },
      select: { id: true, shopifyLocationId: true, code: true },
    });

    let deleted = 0;

    for (const location of locations) {
      const shopifyLinked = Boolean(location.shopifyLocationId);
      const shopifyOrphan =
        !shopifyLinked && this.isShopifyImportedLocationCode(location.code);

      if (!shopifyLinked && !shopifyOrphan) {
        continue;
      }

      if (await this.canDeleteLocation(tx, tenantId, location.id)) {
        await tx.location.delete({ where: { id: location.id } });
        deleted += 1;
        continue;
      }

      if (shopifyLinked) {
        await tx.location.update({
          where: { id: location.id },
          data: {
            shopifyLocationId: null,
            shopifySyncStatus: ShopifySyncStatus.not_connected,
            shopifyLastSyncAt: null,
            shopifyLastError: null,
          },
        });
      }
    }

    return deleted;
  }

  private async canDeleteLocation(
    db: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    locationId: string,
  ): Promise<boolean> {
    const [levels, movements, supplierOrders, countSessions] = await Promise.all([
      db.inventoryLevel.count({ where: { tenantId, locationId } }),
      db.stockMovement.count({
        where: {
          tenantId,
          OR: [{ locationId }, { targetLocationId: locationId }],
        },
      }),
      db.supplierOrder.count({ where: { tenantId, destinationLocationId: locationId } }),
      db.inventoryCountSession.count({
        where: {
          tenantId,
          locationId,
          status: InventoryCountStatus.in_progress,
        },
      }),
    ]);

    return levels === 0 && movements === 0 && supplierOrders === 0 && countSessions === 0;
  }

  private isShopifyImportedLocationCode(code: string | null | undefined): boolean {
    return /^LOC-\d+$/i.test(code?.trim() ?? '');
  }

  private async findBlockers(
    tenantId: string,
    shopifyVariantIds: readonly string[],
  ): Promise<ShopifyShopChangeBlocker[]> {
    if (shopifyVariantIds.length === 0) {
      return [];
    }

    const openOrders = await this.prisma.supplierOrder.findMany({
      where: {
        tenantId,
        status: { in: [...OPEN_SUPPLIER_ORDER_STATUSES] },
        lines: {
          some: {
            variantId: { in: [...shopifyVariantIds] },
          },
        },
      },
      select: { id: true, reference: true },
      orderBy: { reference: 'asc' },
    });

    if (openOrders.length === 0) {
      return [];
    }

    return [
      {
        code: 'supplier_orders_open',
        message: `${openOrders.length} ordini fornitore aperti referenziano varianti del catalogo Shopify.`,
        references: openOrders.map((order) => ({
          type: 'supplier_order',
          id: order.id,
          reference: order.reference,
        })),
      },
    ];
  }
}
