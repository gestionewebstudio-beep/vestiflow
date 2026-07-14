import { Injectable } from '@nestjs/common';
import { Prisma, SupplierOrderStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import {
  locationScopeToInventoryLevelFilter,
  resolveOperationalLocationScope,
} from '../inventory/licensed-location-scope.util';

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
  /** Somma `available` per location (o tenant intero se nessun filtro). */
  readonly availableUnits: number;
  /** Conteggio righe con available <= minThreshold (stesso scope location). */
  readonly lowStockCount: number;
  readonly levels: readonly DashboardLevelRow[];
  readonly locations: readonly { id: string; name: string }[];
}

/** Massimo righe sotto soglia restituite (la UI ne mostra 8; il conteggio è in lowStockCount). */
const LOW_STOCK_ROWS_LIMIT = 100;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    tenantId: string,
    locationId: string | undefined,
    user?: UserProfileDto,
  ): Promise<DashboardSummary> {
    const scope = await resolveOperationalLocationScope(this.prisma, tenantId, user, locationId);
    if (!scope) {
      return {
        productCount: 0,
        incomingSupplierOrders: 0,
        availableUnits: 0,
        lowStockCount: 0,
        levels: [],
        locations: [],
      };
    }

    const scopedWhere: Prisma.InventoryLevelWhereInput = {
      tenantId,
      ...locationScopeToInventoryLevelFilter(scope),
    };

    const lowStockWhere: Prisma.InventoryLevelWhereInput = {
      ...scopedWhere,
      available: { lte: this.prisma.inventoryLevel.fields.minThreshold },
    };

    const [
      productCount,
      incomingSupplierOrders,
      availableAgg,
      lowStockCount,
      levels,
      locations,
    ] = await this.prisma.$transaction([
      this.prisma.product.count({ where: { tenantId } }),
      this.prisma.supplierOrder.count({
        where: {
          tenantId,
          status: {
            in: [SupplierOrderStatus.sent, SupplierOrderStatus.partially_received],
          },
        },
      }),
      this.prisma.inventoryLevel.aggregate({
        where: scopedWhere,
        _sum: { available: true },
      }),
      this.prisma.inventoryLevel.count({ where: lowStockWhere }),
      this.prisma.inventoryLevel.findMany({
        where: lowStockWhere,
        include: {
          variant: {
            select: { sku: true, optionValues: true, product: { select: { name: true } } },
          },
          location: { select: { name: true } },
        },
        orderBy: { available: 'asc' },
        take: LOW_STOCK_ROWS_LIMIT,
      }),
      this.prisma.location.findMany({
        where: {
          tenantId,
          licensedInVf: true,
          isActive: true,
          id: { in: [...scope] },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      productCount,
      incomingSupplierOrders,
      availableUnits: availableAgg._sum.available ?? 0,
      lowStockCount,
      locations,
      levels: levels.map((level) => ({
        variantId: level.variantId,
        locationId: level.locationId,
        sku: level.variant.sku ?? '',
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
