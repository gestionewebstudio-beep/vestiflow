import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CatalogOrigin, Prisma, ShopifyCatalogLinkKind, type Product, type ProductImage, type ProductVariant } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import { toShopifyUserMessage } from '../shopify/shopify-user-error.util';
import { normalizeProductDescription } from '../shopify/shopify-html.util';
import {
  ShopifyProductPushService,
  type ShopifyProductPushResult,
} from '../shopify/shopify-product-push.service';
import { ShopifyTaxonomyLocalizationService } from '../shopify/shopify-taxonomy-localization.service';
import type { Paginated } from '../common/dto/pagination.dto';
import {
  assertShopifyCatalogDeleteAllowed,
  assertShopifyCatalogManualSyncAllowed,
  assertShopifyCatalogUpdateAllowed,
} from './catalog-origin.util';
import type { CreateProductDto, CreateVariantDto } from './dto/create-product.dto';
import type { ListProductsQueryDto } from './dto/list-products.query.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import type { UpdateVariantDto } from './dto/update-variant.dto';

export type ProductWithVariants = Product & {
  variants: ProductVariant[];
  images: ProductImage[];
};

const PRODUCT_INCLUDE = {
  variants: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.ProductInclude;

/** Select leggero per GET /products (lista catalogo): niente varianti né immagini. */
const PRODUCT_LIST_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  description: true,
  brand: true,
  category: true,
  shopifyTaxonomyCategoryId: true,
  shopifyTaxonomyCategoryFullName: true,
  shopifyCategoryMetafields: true,
  season: true,
  tags: true,
  seoTitle: true,
  seoDescription: true,
  shopifyCollections: true,
  shopifyMetafields: true,
  status: true,
  catalogOrigin: true,
  shopifyCatalogLinkKind: true,
  options: true,
  shopifyProductId: true,
  shopifySyncStatus: true,
  shopifyLastSyncAt: true,
  shopifyLastError: true,
  tiktokCategoryId: true,
  tiktokProductId: true,
  tiktokSyncStatus: true,
  tiktokLastSyncAt: true,
  tiktokLastError: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

type ProductListRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_LIST_SELECT }>;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyProductPush: ShopifyProductPushService,
    private readonly channelSync: ChannelSyncFacade,
    private readonly taxonomyLocalization: ShopifyTaxonomyLocalizationService,
  ) {}

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

    const paging = {
      where,
      orderBy: { updatedAt: 'desc' as const },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    };

    const [items, total] = await Promise.all([
      query.includeVariants
        ? this.prisma.product.findMany({ ...paging, include: PRODUCT_INCLUDE })
        : this.prisma.product.findMany({ ...paging, select: PRODUCT_LIST_SELECT }),
      this.prisma.product.count({ where }),
    ]);

    await this.taxonomyLocalization.prepareProductLocalization();

    return {
      items: items.map((item) =>
        withReadableShopifyErrors(
          this.taxonomyLocalization.localizeProductForResponseSync(
            normalizeListProductRow(item),
          ),
        ),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getById(tenantId: string, id: string): Promise<ProductWithVariants> {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: PRODUCT_INCLUDE,
    });
    if (!product) {
      throw new NotFoundException('Prodotto non trovato');
    }

    await this.taxonomyLocalization.prepareProductLocalization();
    const normalized = withReadableShopifyErrors(
      this.taxonomyLocalization.localizeProductForResponseSync(product),
    );
    await this.healProductDescriptionIfNeeded(id, product.description, normalized.description);
    return normalized;
  }

  async create(tenantId: string, dto: CreateProductDto): Promise<ProductWithVariants> {
    this.assertNoDuplicateSkusInPayload(dto.variants);
    this.assertNoDuplicateBarcodesInPayload(dto.variants);
    await this.assertSkusAvailable(
      tenantId,
      dto.variants.map((variant) => variant.sku),
    );
    await this.assertBarcodesAvailable(
      tenantId,
      dto.variants.map((variant) => variant.barcode),
    );
    this.assertSingleCurrency(dto.variants);

    const created = await this.prisma.product.create({
      data: {
        tenantId,
        catalogOrigin: CatalogOrigin.vestiflow,
        shopifyCatalogLinkKind: ShopifyCatalogLinkKind.pushed,
        name: dto.name,
        description: normalizeProductDescription(dto.description),
        brand: dto.brand,
        category: dto.category,
        shopifyTaxonomyCategoryId: dto.shopifyTaxonomyCategoryId?.trim() || null,
        shopifyTaxonomyCategoryFullName: dto.shopifyTaxonomyCategoryFullName?.trim() || null,
        shopifyCategoryMetafields: (dto.shopifyCategoryMetafields ??
          []) as unknown as Prisma.InputJsonValue,
        tiktokCategoryId: dto.tiktokCategoryId?.trim() || null,
        season: dto.season,
        tags: this.normalizeTags(dto.tags),
        status: dto.status,
        options: dto.options as unknown as Prisma.InputJsonValue,
        variants: {
          create: dto.variants.map((variant) => this.toVariantCreateInput(tenantId, variant)),
        },
      },
      include: PRODUCT_INCLUDE,
    });

    await this.pushProductToShopifySafe(tenantId, created.id);
    return this.getById(tenantId, created.id);
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto): Promise<ProductWithVariants> {
    const existing = await this.getById(tenantId, id);
    assertShopifyCatalogUpdateAllowed(existing, dto);

    await this.prisma.$transaction(async (tx) => {
      if (dto.variants) {
        await this.syncVariants(tx, tenantId, id, dto.variants);
      }

      return tx.product.update({
        where: { id },
        data: {
          name: dto.name,
          description: normalizeProductDescription(dto.description),
          brand: dto.brand,
          category: dto.category,
          ...(dto.shopifyTaxonomyCategoryId !== undefined
            ? {
                shopifyTaxonomyCategoryId: dto.shopifyTaxonomyCategoryId?.trim() || null,
              }
            : {}),
          ...(dto.shopifyTaxonomyCategoryFullName !== undefined
            ? {
                shopifyTaxonomyCategoryFullName:
                  dto.shopifyTaxonomyCategoryFullName?.trim() || null,
              }
            : {}),
          ...(dto.shopifyCategoryMetafields !== undefined
            ? {
                shopifyCategoryMetafields:
                  dto.shopifyCategoryMetafields as unknown as Prisma.InputJsonValue,
              }
            : {}),
          ...(dto.tiktokCategoryId !== undefined
            ? { tiktokCategoryId: dto.tiktokCategoryId?.trim() || null }
            : {}),
          season: dto.season,
          tags: dto.tags !== undefined ? this.normalizeTags(dto.tags) : undefined,
          status: dto.status,
          ...(dto.options ? { options: dto.options as unknown as Prisma.InputJsonValue } : {}),
        },
        include: PRODUCT_INCLUDE,
      });
    });

    await this.pushProductToShopifySafe(tenantId, id);
    return this.getById(tenantId, id);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      select: { id: true, shopifyProductId: true, catalogOrigin: true },
    });
    if (!product) {
      throw new NotFoundException('Prodotto non trovato');
    }
    assertShopifyCatalogDeleteAllowed(product.catalogOrigin);

    const movementCount = await this.prisma.stockMovement.count({
      where: { tenantId, variant: { productId: id } },
    });
    if (movementCount > 0) {
      throw new ConflictException(
        'Il prodotto ha movimenti di magazzino registrati: archivialo invece di eliminarlo.',
      );
    }

    if (product.shopifyProductId) {
      this.logger.log(
        `Eliminazione prodotto ${id}: sync Shopify id=${product.shopifyProductId} (${tenantId})`,
      );
      const shopifyDelete = await this.shopifyProductPush.deleteProduct(
        tenantId,
        product.shopifyProductId,
      );
      if (shopifyDelete.reason === 'not_connected') {
        throw new UnprocessableEntityException(
          'Shopify non è connesso: il prodotto non può essere eliminato dal negozio online. Ricollega Shopify e riprova.',
        );
      }
      if (shopifyDelete.reason === 'missing_write_products_scope') {
        throw new UnprocessableEntityException(
          'Impossibile eliminare su Shopify: manca il permesso di scrittura catalogo. Ricollega il negozio e riprova.',
        );
      }
      if (shopifyDelete.reason === 'shopify_error') {
        throw new UnprocessableEntityException(
          'Eliminazione su Shopify non riuscita. Il prodotto non è stato rimosso dal gestionale: riprova tra qualche minuto.',
        );
      }
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

  /** Verifica disponibilità barcode per la validazione live del form. */
  async checkBarcodeAvailability(
    tenantId: string,
    barcode: string,
    excludeProductId?: string,
  ): Promise<{ barcode: string; available: boolean }> {
    const normalized = normalizeBarcodeInput(barcode);
    if (!normalized) {
      return { barcode: '', available: true };
    }

    const existing = await this.prisma.productVariant.findFirst({
      where: {
        tenantId,
        barcode: { equals: normalized, mode: 'insensitive' },
        ...(excludeProductId ? { productId: { not: excludeProductId } } : {}),
      },
      select: { id: true },
    });
    return { barcode: normalized, available: existing === null };
  }

  async findVariantByCode(
    tenantId: string,
    code: string,
  ): Promise<{
    variantId: string;
    productId: string;
    sku: string;
    barcode: string | null;
    productName: string;
  }> {
    const trimmed = code.trim();
    if (!trimmed) {
      throw new NotFoundException('Variante non trovata');
    }

    const variant = await this.prisma.productVariant.findFirst({
      where: {
        tenantId,
        OR: [
          { sku: { equals: trimmed, mode: 'insensitive' } },
          { barcode: { equals: trimmed, mode: 'insensitive' } },
        ],
      },
      include: { product: { select: { id: true, name: true } } },
    });

    if (!variant) {
      throw new NotFoundException('Variante non trovata per SKU o barcode');
    }

    return {
      variantId: variant.id,
      productId: variant.productId,
      sku: variant.sku,
      barcode: variant.barcode,
      productName: variant.product.name,
    };
  }

  /** Allinea il set varianti al payload: create, update, delete (senza movimenti). */
  private async syncVariants(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    variants: readonly UpdateVariantDto[],
  ): Promise<void> {
    this.assertNoDuplicateSkusInPayload(variants);
    this.assertNoDuplicateBarcodesInPayload(variants);
    this.assertSingleCurrency(variants);

    const existing = await tx.productVariant.findMany({
      where: { tenantId, productId },
      select: { id: true },
    });
    const payloadIds = new Set(
      variants.map((variant) => variant.id).filter((id): id is string => Boolean(id)),
    );

    for (const variant of existing) {
      if (!payloadIds.has(variant.id)) {
        await this.deleteVariantInTx(tx, tenantId, productId, variant.id);
      }
    }

    for (const variant of variants) {
      if (variant.id) {
        await this.updateVariantInTx(tx, tenantId, productId, variant);
      } else {
        await this.createVariantInTx(tx, tenantId, productId, variant);
      }
    }
  }

  private async createVariantInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    variant: CreateVariantDto,
  ): Promise<void> {
    await this.assertSkuAvailable(tx, tenantId, variant.sku);
    await this.assertBarcodeAvailable(tx, tenantId, variant.barcode);
    await tx.productVariant.create({
      data: this.toVariantCreateData(tenantId, productId, variant),
    });
  }

  private async updateVariantInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    variant: UpdateVariantDto,
  ): Promise<void> {
    const id = variant.id;
    if (!id) {
      return;
    }

    const current = await tx.productVariant.findFirst({
      where: { id, tenantId, productId },
      select: { id: true },
    });
    if (!current) {
      throw new NotFoundException(`Variante ${id} non trovata sul prodotto`);
    }

    await this.assertSkuAvailable(tx, tenantId, variant.sku, id);
    await this.assertBarcodeAvailable(tx, tenantId, variant.barcode, id);
    await tx.productVariant.update({
      where: { id },
      data: {
        sku: variant.sku.trim(),
        optionValues: variant.optionValues as unknown as Prisma.InputJsonValue,
        barcode: normalizeBarcodeInput(variant.barcode),
        currency: variant.sellingPrice.currency,
        sellingPriceMinor: variant.sellingPrice.amountMinor,
        purchasePriceMinor: variant.purchasePrice?.amountMinor,
        compareAtPriceMinor: variant.compareAtPrice?.amountMinor,
      },
    });
  }

  private async deleteVariantInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    variantId: string,
  ): Promise<void> {
    const variant = await tx.productVariant.findFirst({
      where: { id: variantId, tenantId, productId },
      select: { id: true },
    });
    if (!variant) {
      return;
    }

    const movementCount = await tx.stockMovement.count({
      where: { tenantId, variantId },
    });
    if (movementCount > 0) {
      throw new ConflictException(
        'Una o più varianti da rimuovere hanno movimenti di magazzino: non eliminabili.',
      );
    }

    await tx.inventoryLevel.deleteMany({ where: { variantId } });
    await tx.productVariant.delete({ where: { id: variantId } });
  }

  private async assertSkuAvailable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    sku: string,
    excludeVariantId?: string,
  ): Promise<void> {
    const normalized = sku.trim();
    const existing = await tx.productVariant.findFirst({
      where: {
        tenantId,
        sku: { equals: normalized, mode: 'insensitive' },
        ...(excludeVariantId ? { id: { not: excludeVariantId } } : {}),
      },
      select: { sku: true },
    });
    if (existing) {
      throw new ConflictException(`SKU già presente a catalogo: ${existing.sku}`);
    }
  }

  private async assertBarcodeAvailable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    barcode: string | null | undefined,
    excludeVariantId?: string,
  ): Promise<void> {
    const normalized = normalizeBarcodeInput(barcode);
    if (!normalized) {
      return;
    }

    const existing = await tx.productVariant.findFirst({
      where: {
        tenantId,
        barcode: { equals: normalized, mode: 'insensitive' },
        ...(excludeVariantId ? { id: { not: excludeVariantId } } : {}),
      },
      select: { barcode: true },
    });
    if (existing?.barcode) {
      throw new ConflictException(`Barcode già presente a catalogo: ${existing.barcode}`);
    }
  }

  private toVariantCreateData(
    tenantId: string,
    productId: string,
    variant: CreateVariantDto,
  ): Prisma.ProductVariantUncheckedCreateInput {
    return {
      tenantId,
      productId,
      sku: variant.sku.trim(),
      optionValues: variant.optionValues as unknown as Prisma.InputJsonValue,
      barcode: normalizeBarcodeInput(variant.barcode),
      currency: variant.sellingPrice.currency,
      sellingPriceMinor: variant.sellingPrice.amountMinor,
      purchasePriceMinor: variant.purchasePrice?.amountMinor,
      compareAtPriceMinor: variant.compareAtPrice?.amountMinor,
    };
  }

  private toVariantCreateInput(
    tenantId: string,
    variant: CreateVariantDto,
  ): Prisma.ProductVariantCreateWithoutProductInput {
    return {
      tenant: { connect: { id: tenantId } },
      sku: variant.sku.trim(),
      optionValues: variant.optionValues as unknown as Prisma.InputJsonValue,
      barcode: normalizeBarcodeInput(variant.barcode),
      currency: variant.sellingPrice.currency,
      sellingPriceMinor: variant.sellingPrice.amountMinor,
      purchasePriceMinor: variant.purchasePrice?.amountMinor,
      compareAtPriceMinor: variant.compareAtPrice?.amountMinor,
    };
  }

  /** Duplicati nel payload stesso → errore di validazione (422). */
  private assertNoDuplicateBarcodesInPayload(variants: readonly CreateVariantDto[]): void {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const variant of variants) {
      const normalized = normalizeBarcodeInput(variant.barcode);
      if (!normalized) {
        continue;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        duplicates.add(normalized);
      }
      seen.add(key);
    }
    if (duplicates.size > 0) {
      throw new UnprocessableEntityException(
        `Barcode duplicati nel payload: ${[...duplicates].join(', ')}`,
      );
    }
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
  private async assertBarcodesAvailable(
    tenantId: string,
    barcodes: readonly (string | null | undefined)[],
  ): Promise<void> {
    const normalized = [
      ...new Set(
        barcodes
          .map((barcode) => normalizeBarcodeInput(barcode))
          .filter((barcode): barcode is string => barcode !== null),
      ),
    ];
    if (normalized.length === 0) {
      return;
    }

    const existing = await this.prisma.productVariant.findMany({
      where: { tenantId, barcode: { in: normalized, mode: 'insensitive' } },
      select: { barcode: true },
    });
    if (existing.length > 0) {
      throw new ConflictException(
        `Barcode già presenti a catalogo: ${existing
          .map((variant) => variant.barcode)
          .filter((barcode): barcode is string => barcode !== null)
          .join(', ')}`,
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

  private normalizeTags(tags: readonly string[] | undefined): string[] {
    if (!tags) {
      return [];
    }
    return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
  }

  private async healProductDescriptionIfNeeded(
    productId: string,
    stored: string | null,
    normalized: string | null,
  ): Promise<void> {
    const storedPlain = stored?.trim() || null;
    const normalizedPlain = normalized?.trim() || null;
    if (storedPlain === normalizedPlain) {
      return;
    }

    await this.prisma.product.update({
      where: { id: productId },
      data: { description: normalizedPlain },
    });
  }

  private pushProductToShopifySafe(tenantId: string, productId: string): void {
    this.channelSync.enqueueProductPush(tenantId, productId);
  }

  async syncToShopify(tenantId: string, id: string): Promise<ShopifyProductPushResult> {
    const product = await this.getById(tenantId, id);
    assertShopifyCatalogManualSyncAllowed(product.catalogOrigin);
    return this.shopifyProductPush.enqueuePush(tenantId, id);
  }
}

function withReadableShopifyErrors(product: ProductWithVariants): ProductWithVariants {
  const normalized: ProductWithVariants = {
    ...product,
    description: normalizeProductDescription(product.description),
  };
  if (!product.shopifyLastError) {
    return normalized;
  }
  return {
    ...normalized,
    shopifyLastError: toShopifyUserMessage(undefined, product.shopifyLastError),
  };
}

/** Allinea righe lista (senza join varianti/immagini) al tipo ProductWithVariants. */
function normalizeListProductRow(
  item: ProductWithVariants | ProductListRow,
): ProductWithVariants {
  if ('variants' in item && Array.isArray(item.variants)) {
    return item as ProductWithVariants;
  }
  return {
    ...item,
    variants: [],
    images: [],
  };
}

function normalizeBarcodeInput(barcode: string | null | undefined): string | null {
  const trimmed = barcode?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}
