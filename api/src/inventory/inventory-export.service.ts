import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { ExportInventoryLevelsQueryDto } from './dto/export-inventory-levels.query.dto';
import {
  buildVariantTitle,
  serializeInventoryLevelsCsv,
  type InventoryExportHeader,
} from './import/inventory-csv.util';

@Injectable()
export class InventoryExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportCsv(tenantId: string, query: ExportInventoryLevelsQueryDto): Promise<string> {
    const levels = await this.prisma.inventoryLevel.findMany({
      where: this.buildWhere(tenantId, query),
      include: {
        variant: {
          select: {
            sku: true,
            optionValues: true,
            product: { select: { name: true } },
          },
        },
        location: { select: { name: true } },
      },
      orderBy: [{ variant: { product: { name: 'asc' } } }, { location: { name: 'asc' } }],
    });

    const filtered = query.stockStatus
      ? levels.filter((level) => this.stockStatusOf(level) === query.stockStatus)
      : levels;

    const rows: Record<InventoryExportHeader, string>[] = filtered.map((level) => ({
      Variante: buildVariantTitle(level.variant.product.name, level.variant.optionValues),
      SKU: level.variant.sku,
      Location: level.location.name,
      Disponibile: String(level.available),
      Fisico: String(level.onHand),
      Impegnato: String(level.committed),
      'In arrivo': String(level.incoming),
      'Soglia minima': String(level.minThreshold),
    }));

    return serializeInventoryLevelsCsv(rows);
  }

  private buildWhere(
    tenantId: string,
    query: ExportInventoryLevelsQueryDto,
  ): Prisma.InventoryLevelWhereInput {
    return {
      tenantId,
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.search
        ? {
            variant: {
              OR: [
                { sku: { contains: query.search, mode: 'insensitive' } },
                { product: { name: { contains: query.search, mode: 'insensitive' } } },
              ],
            },
          }
        : {}),
    };
  }

  private stockStatusOf(level: {
    readonly available: number;
    readonly minThreshold: number;
  }): 'ok' | 'low' | 'empty' {
    if (level.available <= 0) {
      return 'empty';
    }
    if (level.available <= level.minThreshold) {
      return 'low';
    }
    return 'ok';
  }
}
