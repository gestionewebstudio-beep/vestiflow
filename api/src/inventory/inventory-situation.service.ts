import { Injectable } from '@nestjs/common';
import { AdjustmentDirection, ProductStatus, StockMovementType } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import type { Paginated } from '../common/dto/pagination.dto';
import { partyDisplayName } from '../common/party/party.util';
import { PrismaService } from '../prisma/prisma.service';
import type {
  InventoryStockStatus,
  ListInventorySituationQueryDto,
} from './dto/list-inventory-situation.query.dto';
import { buildVariantTitle } from './import/inventory-csv.util';
import { buildInventoryVariantSearchWhere } from './inventory-variant-search.util';
import {
  INVENTORY_VIEW_SCOPE_MODE,
  locationScopeToInventoryLevelFilter,
  locationScopeToMovementFilter,
  resolveOperationalLocationScope,
} from './licensed-location-scope.util';

/** Riga riepilogo per variante: quantità aggregate sulle location in scope. */
export interface InventorySituationRowDto {
  readonly variantId: string;
  readonly productId: string;
  readonly title: string;
  readonly articleCode: string;
  readonly sku: string | null;
  readonly category: string | null;
  readonly supplierId: string | null;
  readonly supplierName: string | null;
  readonly currency: string;
  readonly sellingPriceMinor: number;
  readonly purchasePriceMinor: number | null;
  readonly available: number;
  readonly onHand: number;
  readonly committed: number;
  readonly incoming: number;
  readonly minThreshold: number;
  /** Totale quantità movimentate in entrata (carichi, resi, rettifiche +). */
  readonly totalIn: number;
  /** Totale quantità movimentate in uscita (scarichi, vendite, rettifiche −). */
  readonly totalOut: number;
  readonly stockStatus: InventoryStockStatus;
}

/**
 * Situazione magazzino (tab Situazione): fotografia per variante con giacenze
 * aggregate, dati economici, fornitore preferito e stato scorte.
 *
 * L'aggregazione e il filtro stato avvengono in memoria sull'intero catalogo
 * filtrato: lo stato dipende dalle somme per variante e non è esprimibile in
 * un `where` Prisma. Cataloghi da boutique (migliaia di varianti) reggono
 * senza problemi; i totali movimenti sono calcolati solo per la pagina.
 */
@Injectable()
export class InventorySituationService {
  constructor(private readonly prisma: PrismaService) {}

  async listSituation(
    tenantId: string,
    query: ListInventorySituationQueryDto,
    user?: UserProfileDto,
  ): Promise<Paginated<InventorySituationRowDto>> {
    const scope = await resolveOperationalLocationScope(
      this.prisma,
      tenantId,
      user,
      query.locationId,
      INVENTORY_VIEW_SCOPE_MODE,
    );
    if (!scope) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }

    // Fotografia operativa: fuori i prodotti archiviati.
    const filters: Prisma.ProductVariantWhereInput[] = [
      { product: { status: { not: ProductStatus.archived } } },
    ];
    if (query.search) {
      filters.push(buildInventoryVariantSearchWhere(query.search));
    }
    if (query.category) {
      filters.push({ product: { category: query.category } });
    }
    if (query.supplierId) {
      filters.push({ supplierLinks: { some: { supplierId: query.supplierId } } });
    }

    const variants = await this.prisma.productVariant.findMany({
      where: { tenantId, AND: filters },
      select: {
        id: true,
        productId: true,
        sku: true,
        optionValues: true,
        currency: true,
        sellingPriceMinor: true,
        purchasePriceMinor: true,
        product: { select: { name: true, articleCode: true, category: true } },
        supplierLinks: {
          select: {
            supplierId: true,
            supplier: {
              select: {
                party: {
                  select: {
                    companyName: true,
                    firstName: true,
                    lastName: true,
                    contactName: true,
                    email: true,
                  },
                },
              },
            },
          },
          // Fornitore associato: il preferito, altrimenti il primo collegato.
          orderBy: [{ isPreferred: 'desc' }, { createdAt: 'asc' }],
          take: 1,
        },
        inventoryLevels: {
          where: locationScopeToInventoryLevelFilter(scope),
          select: {
            available: true,
            onHand: true,
            committed: true,
            incoming: true,
            minThreshold: true,
          },
        },
      },
      orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }],
    });

    const rows = variants
      .map((variant): InventorySituationRowDto => {
        const totals = variant.inventoryLevels.reduce(
          (acc, level) => ({
            available: acc.available + level.available,
            onHand: acc.onHand + level.onHand,
            committed: acc.committed + level.committed,
            incoming: acc.incoming + level.incoming,
            minThreshold: acc.minThreshold + level.minThreshold,
          }),
          { available: 0, onHand: 0, committed: 0, incoming: 0, minThreshold: 0 },
        );
        const link = variant.supplierLinks[0];
        return {
          variantId: variant.id,
          productId: variant.productId,
          title: buildVariantTitle(variant.product.name, variant.optionValues),
          articleCode: variant.product.articleCode,
          sku: variant.sku,
          category: variant.product.category,
          supplierId: link?.supplierId ?? null,
          supplierName: link ? partyDisplayName(link.supplier.party) : null,
          currency: variant.currency,
          sellingPriceMinor: variant.sellingPriceMinor,
          purchasePriceMinor: variant.purchasePriceMinor,
          ...totals,
          totalIn: 0,
          totalOut: 0,
          stockStatus: this.stockStatusOf(totals),
        };
      })
      .filter((row) => !query.stockStatus || row.stockStatus === query.stockStatus);

    const total = rows.length;
    const start = (query.page - 1) * query.pageSize;
    const pageRows = rows.slice(start, start + query.pageSize);
    const movementTotals = await this.movementTotals(
      tenantId,
      scope,
      pageRows.map((row) => row.variantId),
    );

    return {
      items: pageRows.map((row) => ({
        ...row,
        totalIn: movementTotals.get(row.variantId)?.totalIn ?? 0,
        totalOut: movementTotals.get(row.variantId)?.totalOut ?? 0,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * Somme movimenti in entrata/uscita per variante (solo pagina corrente).
   * I trasferimenti restano fuori: spostano stock tra location, non sono né
   * un'entrata né un'uscita dal magazzino.
   */
  private async movementTotals(
    tenantId: string,
    scope: readonly string[],
    variantIds: readonly string[],
  ): Promise<ReadonlyMap<string, { totalIn: number; totalOut: number }>> {
    const result = new Map<string, { totalIn: number; totalOut: number }>();
    if (variantIds.length === 0) {
      return result;
    }

    const baseWhere: Prisma.StockMovementWhereInput = {
      tenantId,
      variantId: { in: [...variantIds] },
      ...locationScopeToMovementFilter(scope),
    };

    const [inbound, outbound] = await this.prisma.$transaction([
      this.prisma.stockMovement.groupBy({
        by: ['variantId'],
        where: {
          ...baseWhere,
          OR: [
            { type: { in: [StockMovementType.load, StockMovementType.return] } },
            { type: StockMovementType.adjustment, direction: AdjustmentDirection.increase },
          ],
        },
        _sum: { quantity: true },
        orderBy: { variantId: 'asc' },
      }),
      this.prisma.stockMovement.groupBy({
        by: ['variantId'],
        where: {
          ...baseWhere,
          OR: [
            {
              type: {
                in: [
                  StockMovementType.unload,
                  StockMovementType.sale,
                  StockMovementType.online_sale,
                ],
              },
            },
            { type: StockMovementType.adjustment, direction: AdjustmentDirection.decrease },
          ],
        },
        _sum: { quantity: true },
        orderBy: { variantId: 'asc' },
      }),
    ]);

    for (const group of inbound) {
      result.set(group.variantId, { totalIn: group._sum?.quantity ?? 0, totalOut: 0 });
    }
    for (const group of outbound) {
      const totalOut = group._sum?.quantity ?? 0;
      const entry = result.get(group.variantId);
      if (entry) {
        entry.totalOut = totalOut;
      } else {
        result.set(group.variantId, { totalIn: 0, totalOut });
      }
    }
    return result;
  }

  /** Stessa regola di stockStatusOf frontend (inventory.util). */
  private stockStatusOf(totals: {
    readonly available: number;
    readonly minThreshold: number;
  }): InventoryStockStatus {
    if (totals.available <= 0) {
      return 'empty';
    }
    if (totals.available <= totals.minThreshold) {
      return 'low';
    }
    return 'ok';
  }
}
