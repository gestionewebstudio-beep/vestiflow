import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type Product, type ProductVariant } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { Paginated } from '../common/dto/pagination.dto';
import type { CreateProductDto, CreateVariantDto } from './dto/create-product.dto';
import type { ListProductsQueryDto } from './dto/list-products.query.dto';
import type { UpdateProductDto } from './dto/update-product.dto';

export type ProductWithVariants = Product & { variants: ProductVariant[] };

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    query: ListProductsQueryDto,
  ): Promise<Paginated<ProductWithVariants>> {
    const where: Prisma.ProductWhereInput = {
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

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: { variants: true },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(tenantId: string, id: string): Promise<ProductWithVariants> {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: { variants: true },
    });
    if (!product) {
      throw new NotFoundException('Prodotto non trovato');
    }
    return product;
  }

  async create(tenantId: string, dto: CreateProductDto): Promise<ProductWithVariants> {
    this.assertNoDuplicateSkusInPayload(dto.variants);
    await this.assertSkusAvailable(
      tenantId,
      dto.variants.map((variant) => variant.sku),
    );
    this.assertSingleCurrency(dto.variants);

    const created = await this.prisma.product.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        brand: dto.brand,
        category: dto.category,
        season: dto.season,
        status: dto.status,
        options: dto.options as unknown as Prisma.InputJsonValue,
        variants: {
          create: dto.variants.map((variant) => this.toVariantCreateInput(tenantId, variant)),
        },
      },
      include: { variants: true },
    });
    return created;
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto): Promise<ProductWithVariants> {
    await this.getById(tenantId, id);
    return this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        brand: dto.brand,
        category: dto.category,
        season: dto.season,
        status: dto.status,
        ...(dto.options ? { options: dto.options as unknown as Prisma.InputJsonValue } : {}),
      },
      include: { variants: true },
    });
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.getById(tenantId, id);
    const movementCount = await this.prisma.stockMovement.count({
      where: { tenantId, variant: { productId: id } },
    });
    if (movementCount > 0) {
      throw new ConflictException(
        'Il prodotto ha movimenti di magazzino registrati: archivialo invece di eliminarlo.',
      );
    }
    await this.prisma.product.delete({ where: { id } });
  }

  /** Verifica disponibilità SKU per la validazione live del form. */
  async checkSkuAvailability(
    tenantId: string,
    sku: string,
    excludeProductId?: string,
  ): Promise<{ sku: string; available: boolean }> {
    const normalized = sku.trim();
    const existing = await this.prisma.productVariant.findFirst({
      where: {
        tenantId,
        sku: { equals: normalized, mode: 'insensitive' },
        ...(excludeProductId ? { productId: { not: excludeProductId } } : {}),
      },
      select: { id: true },
    });
    return { sku: normalized, available: existing === null };
  }

  private toVariantCreateInput(
    tenantId: string,
    variant: CreateVariantDto,
  ): Prisma.ProductVariantCreateWithoutProductInput {
    return {
      tenant: { connect: { id: tenantId } },
      sku: variant.sku.trim(),
      optionValues: variant.optionValues as unknown as Prisma.InputJsonValue,
      barcode: variant.barcode,
      currency: variant.sellingPrice.currency,
      sellingPriceMinor: variant.sellingPrice.amountMinor,
      purchasePriceMinor: variant.purchasePrice?.amountMinor,
      compareAtPriceMinor: variant.compareAtPrice?.amountMinor,
    };
  }

  /** Duplicati nel payload stesso → errore di validazione (422). */
  private assertNoDuplicateSkusInPayload(variants: readonly CreateVariantDto[]): void {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const variant of variants) {
      const key = variant.sku.trim().toLowerCase();
      if (seen.has(key)) {
        duplicates.add(variant.sku.trim());
      }
      seen.add(key);
    }
    if (duplicates.size > 0) {
      throw new UnprocessableEntityException(
        `SKU duplicati nel payload: ${[...duplicates].join(', ')}`,
      );
    }
  }

  /** Conflitto con SKU già a catalogo → 409. */
  private async assertSkusAvailable(tenantId: string, skus: readonly string[]): Promise<void> {
    const normalized = skus.map((sku) => sku.trim());
    const existing = await this.prisma.productVariant.findMany({
      where: { tenantId, sku: { in: normalized, mode: 'insensitive' } },
      select: { sku: true },
    });
    if (existing.length > 0) {
      throw new ConflictException(
        `SKU già presenti a catalogo: ${existing.map((variant) => variant.sku).join(', ')}`,
      );
    }
  }

  /** Un prodotto con prezzi in valute miste è quasi sempre un errore di input. */
  private assertSingleCurrency(variants: readonly CreateVariantDto[]): void {
    const currencies = new Set(variants.map((variant) => variant.sellingPrice.currency));
    if (currencies.size > 1) {
      throw new UnprocessableEntityException(
        `Valute miste nelle varianti: ${[...currencies].join(', ')}`,
      );
    }
  }
}
