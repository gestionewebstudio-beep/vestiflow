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
    const { handles, names } = await this.loadTenantProductDedupKeys(tenantId);
    return buildImportPreview(rows, existingSkus, { handles, names });
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

    // Anti-duplicato: chiave primaria = handle Shopify (univoco per store, persistito su
    // import_handle). Fallback sul nome per i prodotti pre-migrazione senza handle.
    const { handles: existingHandles, names: existingNames } =
      await this.loadTenantProductDedupKeys(tenantId);

    // Il barcode è univoco per tenant: i CSV Shopify spesso ripetono lo stesso EAN su più
    // varianti/prodotti. Teniamo traccia di quelli già usati per azzerare le collisioni.
    const existingBarcodes = await this.loadTenantBarcodes(tenantId);

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

      const handleKey = product.handle.trim().toLowerCase();
      const nameKey = product.dto.name.trim().toLowerCase();
      const isDuplicate =
        (handleKey.length > 0 && existingHandles.has(handleKey)) || existingNames.has(nameKey);
      if (isDuplicate) {
        skipped += 1;
        results.push({
          handle: product.handle,
          name: product.dto.name,
          status: 'skipped',
          message: 'Prodotto già presente in catalogo: saltato per evitare duplicati.',
        });
        continue;
      }

      try {
        const created = await this.createFromParsedProduct(tenantId, product, existingBarcodes);
        if (handleKey.length > 0) {
          existingHandles.add(handleKey);
        }
        existingNames.add(nameKey);
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

  private async loadTenantBarcodes(tenantId: string): Promise<Set<string>> {
    const rows = await this.prisma.productVariant.findMany({
      where: { tenantId, barcode: { not: null } },
      select: { barcode: true },
    });
    const barcodes = new Set<string>();
    for (const row of rows) {
      const barcode = row.barcode?.trim().toLowerCase();
      if (barcode) {
        barcodes.add(barcode);
      }
    }
    return barcodes;
  }

  private async loadTenantProductDedupKeys(
    tenantId: string,
  ): Promise<{ handles: Set<string>; names: Set<string> }> {
    const rows = await this.prisma.product.findMany({
      where: { tenantId },
      select: { name: true, importHandle: true },
    });
    const handles = new Set<string>();
    const names = new Set<string>();
    for (const row of rows) {
      names.add(row.name.trim().toLowerCase());
      const handle = row.importHandle?.trim().toLowerCase();
      if (handle) {
        handles.add(handle);
      }
    }
    return { handles, names };
  }

  private async createFromParsedProduct(
    tenantId: string,
    parsed: ParsedImportProduct,
    existingBarcodes: Set<string> = new Set<string>(),
  ): Promise<ProductWithVariants> {
    this.assertNoDuplicateSkusInPayload(parsed.dto.variants);

    // Copia locale: i barcode si "consumano" solo se la create va a buon fine.
    const usedBarcodes = new Set(existingBarcodes);
    const variantInputs = parsed.dto.variants.map((variant) =>
      this.toVariantCreateInput(tenantId, variant, usedBarcodes),
    );

    const importHandle = parsed.handle.trim() || null;
    const created = await this.prisma.product.create({
      data: {
        tenantId,
        catalogOrigin: CatalogOrigin.vestiflow,
        shopifyCatalogLinkKind: ShopifyCatalogLinkKind.pushed,
        importHandle,
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
          create: variantInputs,
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

    for (const barcode of usedBarcodes) {
      existingBarcodes.add(barcode);
    }

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
    usedBarcodes: Set<string>,
  ): Prisma.ProductVariantCreateWithoutProductInput {
    return {
      tenant: { connect: { id: tenantId } },
      sku: variant.sku.trim(),
      optionValues: variant.optionValues as unknown as Prisma.InputJsonValue,
      barcode: this.dedupeBarcode(variant.barcode, usedBarcodes),
      currency: variant.sellingPrice.currency,
      sellingPriceMinor: variant.sellingPrice.amountMinor,
      purchasePriceMinor: variant.purchasePrice?.amountMinor,
      compareAtPriceMinor: variant.compareAtPrice?.amountMinor,
    };
  }

  /**
   * Restituisce il barcode solo se non è già usato (nel tenant o nel payload), altrimenti null.
   * Il barcode è univoco per tenant ma opzionale: meglio azzerarlo che far fallire l'import.
   */
  private dedupeBarcode(
    barcode: string | null | undefined,
    usedBarcodes: Set<string>,
  ): string | null {
    const trimmed = barcode?.trim();
    if (!trimmed) {
      return null;
    }
    const key = trimmed.toLowerCase();
    if (usedBarcodes.has(key)) {
      return null;
    }
    usedBarcodes.add(key);
    return trimmed;
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
