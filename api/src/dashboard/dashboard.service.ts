import { Injectable } from '@nestjs/common';
import { Prisma, SupplierOrderStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

interface SelectedOption {
  readonly name: string;
  readonly value: string;
}

/** Riga giacenza pronta per la dashboard (title già composto server-side). */
export interface DashboardLevelRow {
  readonly variantId: string;
  readonly locationId: string;
  readonly sku: string;
  readonly title: string;
  readonly available: number;
  readonly minThreshold: number;
  readonly locationName: string;
}

/** Payload aggregato della dashboard: un solo round-trip per i KPI di magazzino. */
export interface DashboardSummary {
  readonly productCount: number;
  readonly incomingSupplierOrders: number;
  readonly levels: DashboardLevelRow[];
  readonly locations: { id: string; name: string }[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(tenantId: string): Promise<DashboardSummary> {
    const [productCount, incomingSupplierOrders, levels, locations] =
      await this.prisma.$transaction([
        this.prisma.product.count({ where: { tenantId } }),
        this.prisma.supplierOrder.count({
          where: {
            tenantId,
            status: {
              in: [SupplierOrderStatus.sent, SupplierOrderStatus.partially_received],
            },
          },
        }),
        this.prisma.inventoryLevel.findMany({
          where: { tenantId },
          include: {
            variant: {
              select: { sku: true, optionValues: true, product: { select: { name: true } } },
            },
            location: { select: { name: true } },
          },
        }),
        this.prisma.location.findMany({
          where: { tenantId },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ]);

    return {
      productCount,
      incomingSupplierOrders,
      locations,
      levels: levels.map((level) => ({
        variantId: level.variantId,
        locationId: level.locationId,
        sku: level.variant.sku,
        title: this.buildTitle(level.variant.product.name, level.variant.optionValues),
        available: level.available,
        minThreshold: level.minThreshold,
        locationName: level.location.name,
      })),
    };
  }

  /** "Nome prodotto — Valore1 / Valore2" (forma allineata al frontend). */
  private buildTitle(productName: string, optionValues: Prisma.JsonValue): string {
    const options = Array.isArray(optionValues)
      ? (optionValues as unknown as SelectedOption[])
      : [];
    const suffix = options.map((option) => option.value).join(' / ');
    return suffix ? `${productName} — ${suffix}` : productName;
  }
}
