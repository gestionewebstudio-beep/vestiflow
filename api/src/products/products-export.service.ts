import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { ExportProductsQueryDto } from './dto/export-products.query.dto';
import {
  serializeProductsToShopifyCsv,
  type ProductExportRecord,
} from './import/shopify-csv.serialize';

@Injectable()
export class ProductsExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportCsv(tenantId: string, query: ExportProductsQueryDto): Promise<string> {
    const products = await this.prisma.product.findMany({
      where: this.buildWhere(tenantId, query),
      include: {
        variants: { orderBy: { sku: 'asc' } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });

    const records: ProductExportRecord[] = products.map((product) => ({
      product,
      variants: product.variants,
      images: product.images,
    }));

    return serializeProductsToShopifyCsv(records);
  }

  private buildWhere(tenantId: string, query: ExportProductsQueryDto): Prisma.ProductWhereInput {
    return {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: { equals: query.category, mode: 'insensitive' } } : {}),
      ...(query.brand ? { brand: { equals: query.brand, mode: 'insensitive' } } : {}),
      ...(query.season ? { season: { equals: query.season, mode: 'insensitive' } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { brand: { contains: query.search, mode: 'insensitive' } },
              { variants: { some: { sku: { contains: query.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
  }
}
