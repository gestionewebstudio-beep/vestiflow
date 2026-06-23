import {
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, CatalogOrigin, ShopifyCatalogLinkKind } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { normalizeProductDescription } from '../shopify/shopify-html.util';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { CreateVariantDto } from './dto/create-product.dto';
import {
  buildImportPreview,
  isImportProductReady,
  type ImportPreviewResult,
  type ParsedImportProduct,
} from './import/shopify-csv.mapper';
import { parseShopifyProductCsv, ShopifyCsvParseError } from './import/shopify-csv.parse';
import type { ProductWithVariants } from './products.service';

export interface ImportProductsOptions {
  readonly handles?: readonly string[];
}

export interface ImportProductsResult {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
  readonly products: readonly {
    readonly handle: string;
    readonly productId?: string;
    readonly name: string;
    readonly status: 'imported' | 'skipped' | 'failed';
    readonly message?: string;
  }[];
}

@Injectable()
export class ProductsImportService {
  private readonly logger = new Logger(ProductsImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelSync: ChannelSyncFacade,
  ) {}

  async previewCsv(tenantId: string, csvText: string): Promise<ImportPreviewResult> {
    const rows = this.parseCsvOrThrow(csvText);
    const existingSkus = await this.loadTenantSkus(tenantId);
    return buildImportPreview(rows, existingSkus);
  }

  async importCsv(
    tenantId: string,
    csvText: string,
    options: ImportProductsOptions = {},
  ): Promise<ImportProductsResult> {
    const rows = this.parseCsvOrThrow(csvText);
    const existingSkus = await this.loadTenantSkus(tenantId);
    const preview = buildImportPreview(rows, existingSkus);
    const handleFilter = options.handles?.length
      ? new Set(options.handles.map((handle) => handle.trim().toLowerCase()))
      : null;

    const results: ImportProductsResult['products'][number][] = [];
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const product of preview.products) {
      if (handleFilter && !handleFilter.has(product.handle.toLowerCase())) {
        continue;
      }

      if (!isImportProductReady(product)) {
        skipped += 1;
        results.push({
          handle: product.handle,
          name: product.dto.name,
          status: 'skipped',
          message: product.issues.map((issue) => issue.message).join(' '),
        });
        continue;
      }

      try {
        const created = await this.createFromParsedProduct(tenantId, product);
        imported += 1;
        results.push({
          handle: product.handle,
          productId: created.id,
          name: created.name,
          status: 'imported',
        });
      } catch (error: unknown) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'Import fallito';
        results.push({
          handle: product.handle,
          name: product.dto.name,
          status: 'failed',
          message,
        });
      }
    }

    return { imported, skipped, failed, products: results };
  }

  private parseCsvOrThrow(csvText: string) {
    try {
      return parseShopifyProductCsv(csvText);
    } catch (error: unknown) {
      if (error instanceof ShopifyCsvParseError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async loadTenantSkus(tenantId: string): Promise<Set<string>> {
    const rows = await this.prisma.productVariant.findMany({
      where: { tenantId },
      select: { sku: true },
    });
    return new Set(rows.map((row) => row.sku.toLowerCase()));
  }

  private async createFromParsedProduct(
    tenantId: string,
    parsed: ParsedImportProduct,
  ): Promise<ProductWithVariants> {
    this.assertNoDuplicateSkusInPayload(parsed.dto.variants);

    const created = await this.prisma.product.create({
      data: {
        tenantId,
        catalogOrigin: CatalogOrigin.vestiflow,
        shopifyCatalogLinkKind: ShopifyCatalogLinkKind.pushed,
        name: parsed.dto.name,
        description: normalizeProductDescription(parsed.dto.description),
        brand: parsed.dto.brand,
        category: parsed.dto.category,
        season: parsed.dto.season,
        tags: parsed.dto.tags ?? [],
        seoTitle: parsed.seoTitle,
        seoDescription: parsed.seoDescription,
        status: parsed.dto.status,
        options: parsed.dto.options as unknown as Prisma.InputJsonValue,
        variants: {
          create: parsed.dto.variants.map((variant) =>
            this.toVariantCreateInput(tenantId, variant),
          ),
        },
        ...(parsed.images.length > 0
          ? {
              images: {
                create: parsed.images.map((image) => ({
                  tenantId,
                  url: image.url,
                  altText: image.altText,
                  sortOrder: image.sortOrder,
                })),
              },
            }
          : {}),
      },
      include: { variants: true, images: { orderBy: { sortOrder: 'asc' } } },
    });

    try {
      this.channelSync.enqueueProductPush(tenantId, created.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Push Shopify fallito';
      this.logger.warn(`Push prodotto import CSV (${tenantId}, ${created.id}): ${message}`);
    }

    return created;
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

  private assertNoDuplicateSkusInPayload(variants: readonly CreateVariantDto[]): void {
    const seen = new Set<string>();
    for (const variant of variants) {
      const key = variant.sku.trim().toLowerCase();
      if (seen.has(key)) {
        throw new UnprocessableEntityException(`SKU duplicati nel prodotto: ${variant.sku}`);
      }
      seen.add(key);
    }
  }
}
