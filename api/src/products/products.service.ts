import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CatalogOrigin,
  Prisma,
  ShopifyCatalogLinkKind,
  type Product,
  type ProductImage,
  type ProductVariant,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import { buildInventoryVariantSearchWhere } from '../inventory/inventory-variant-search.util';
import { buildVariantTitle } from '../inventory/import/inventory-csv.util';
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
import {
  assertVariantBarcodeAvailableInTx,
  assertVariantSkuAvailableInTx,
  normalizeBarcodeInput,
  normalizeOptionalSku,
} from './quick-product-create.util';
import type { ListProductsQueryDto } from './dto/list-products.query.dto';
import type { ListVariantSummariesQueryDto } from './dto/list-variant-summaries.query.dto';
import type { ProductFacetsDto } from './dto/product-facets.dto';
import type { VariantSummaryDto } from './dto/variant-summary.dto';
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
  importHandle: true,
  shopifyProductId: true,
  shopifySyncStatus: true,
  shopifyLastSyncAt: true,
  shopifyLastError: true,
  tiktokCategoryId: true,
  tiktokProductId: true,
  tiktokSyncStatus: true,
  tiktokLastSyncAt: true,
  tiktokLastError: true,
  unitOfMeasure: true,
  defaultVatCodeId: true,
  inventoryTracking: true,
  managesStock: true,
  createdAt: true,
  updatedAt: true,
} as const;

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
          this.taxonomyLocalization.localizeProductForResponseSync(normalizeListProductRow(item)),
        ),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Facets distinti per filtri lista prodotti (intero catalogo tenant). */
  async getFacets(tenantId: string): Promise<ProductFacetsDto> {
    const baseWhere = { tenantId } as const;

    const [categories, brands, seasons] = await Promise.all([
      this.prisma.product.findMany({
        where: { ...baseWhere, category: { not: null, notIn: [''] } },
        select: { category: true },
        distinct: ['category'],
        orderBy: { category: 'asc' },
      }),
      this.prisma.product.findMany({
        where: { ...baseWhere, brand: { not: null, notIn: [''] } },
        select: { brand: true },
        distinct: ['brand'],
        orderBy: { brand: 'asc' },
      }),
      this.prisma.product.findMany({
        where: { ...baseWhere, season: { not: null, notIn: [''] } },
        select: { season: true },
        distinct: ['season'],
        orderBy: { season: 'asc' },
      }),
    ]);

    return {
      categories: categories
        .map((row) => row.category?.trim())
        .filter((value): value is string => Boolean(value)),
      brands: brands
        .map((row) => row.brand?.trim())
        .filter((value): value is string => Boolean(value)),
      seasons: seasons
        .map((row) => row.season?.trim())
        .filter((value): value is string => Boolean(value)),
    };
  }

  /** Vista leggera varianti per select/report (paginata, ricerca server-side). */
  async listVariantSummaries(
    tenantId: string,
    query: ListVariantSummariesQueryDto,
  ): Promise<Paginated<VariantSummaryDto>> {
    const search = query.search?.trim();
    const where: Prisma.ProductVariantWhereInput = {
      tenantId,
      ...(query.variantId ? { id: query.variantId } : {}),
      ...(search ? buildInventoryVariantSearchWhere(search) : {}),
      ...(query.supplierId
        ? {
            supplierLinks: {
              some: { supplierId: query.supplierId },
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.productVariant.findMany({
        where,
        select: {
          id: true,
          productId: true,
          sku: true,
          barcode: true,
          optionValues: true,
          currency: true,
          sellingPriceMinor: true,
          purchasePriceMinor: true,
          compareAtPriceMinor: true,
          product: {
            select: {
              name: true,
              category: true,
              unitOfMeasure: true,
              defaultVatCodeId: true,
              managesStock: true,
            },
          },
          ...(query.supplierId
            ? {
                supplierLinks: {
                  where: { supplierId: query.supplierId },
                  select: {
                    supplierSku: true,
                    lastPurchasePriceMinor: true,
                  },
                  take: 1,
                },
              }
            : {}),
          ...(query.locationId
            ? {
                inventoryLevels: {
                  where: { locationId: query.locationId },
                  select: { onHand: true },
                  take: 1,
                },
              }
            : {}),
        },
        orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.productVariant.count({ where }),
    ]);

    const items: VariantSummaryDto[] = rows.map((row) => {
      const supplierLink = 'supplierLinks' in row ? row.supplierLinks?.[0] : undefined;
      const level = 'inventoryLevels' in row ? row.inventoryLevels?.[0] : undefined;
      const purchaseMinor = supplierLink?.lastPurchasePriceMinor ?? row.purchasePriceMinor ?? null;
      return {
        variantId: row.id,
        productId: row.productId,
        sku: row.sku ?? '',
        productName: row.product.name,
        title: buildVariantTitle(row.product.name, row.optionValues),
        barcode: row.barcode,
        sellingPrice: {
          amountMinor: row.sellingPriceMinor,
          currencyCode: row.currency,
        },
        purchasePrice:
          purchaseMinor != null ? { amountMinor: purchaseMinor, currencyCode: row.currency } : null,
        compareAtPrice:
          row.compareAtPriceMinor != null
            ? { amountMinor: row.compareAtPriceMinor, currencyCode: row.currency }
            : null,
        supplierSku: supplierLink?.supplierSku ?? null,
        stockOnHand: level?.onHand ?? null,
        category: row.product.category?.trim() || null,
        unitOfMeasure: row.product.unitOfMeasure ?? 'pz',
        defaultVatCodeId: row.product.defaultVatCodeId ?? null,
        managesStock: row.product.managesStock ?? true,
      };
    });

    return { items, total, page: query.page, pageSize: query.pageSize };
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

    // Il pre-check assertSkusAvailable non copre le richieste concorrenti:
    // il vincolo unico (tenant_id, sku) può comunque scattare qui e deve
    // restare un 409 coerente, non un 500.
    const created = await this.prisma.product
      .create({
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
          unitOfMeasure: dto.unitOfMeasure?.trim() || 'pz',
          defaultVatCodeId: dto.defaultVatCodeId ?? null,
          inventoryTracking: dto.inventoryTracking ?? undefined,
          managesStock: dto.managesStock ?? true,
          options: dto.options as unknown as Prisma.InputJsonValue,
          variants: {
            create: dto.variants.map((variant) => this.toVariantCreateInput(tenantId, variant)),
          },
        },
        include: PRODUCT_INCLUDE,
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const skus = dto.variants
            .map((variant) => variant.sku?.trim())
            .filter((sku): sku is string => Boolean(sku));
          throw new ConflictException(
            skus.length > 0
              ? `SKU già presenti a catalogo: ${skus.join(', ')}`
              : 'Uno o più codici (SKU/barcode) risultano già presenti a catalogo.',
          );
        }
        throw error;
      });

    await this.pushProductToShopifySafe(tenantId, created.id);
    return this.getById(tenantId, created.id);
  }

  /**
   * Duplica un'anagrafica prodotto (audit cliente §"Duplica articolo"): nuovo
   * id interno, stesso nome con suffisso "(copia)", stesse varianti/prezzi/
   * categoria/immagini. SKU e barcode sono univoci per tenant (vincolo
   * schema): lo SKU della copia riceve il suffisso incrementale "-COPIA[-n]"
   * (non può restare vuoto, il campo è obbligatorio), il barcode nasce vuoto
   * (nullable: l'utente lo assegna se serve, nessun barcode duplicato).
   * Nessun collegamento canale ereditato (Shopify/TikTok): la copia è un
   * articolo nuovo, mai sincronizzato, e non viene pushata automaticamente
   * per evitare di pubblicare online una scheda ancora da rivedere.
   */
  async duplicateProduct(tenantId: string, id: string): Promise<ProductWithVariants> {
    const original = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: PRODUCT_INCLUDE,
    });
    if (!original) {
      throw new NotFoundException('Prodotto non trovato');
    }

    const variantsData: Prisma.ProductVariantCreateWithoutProductInput[] = [];
    for (const variant of original.variants) {
      const sku = await this.buildDuplicateSku(tenantId, variant.sku);
      variantsData.push({
        tenant: { connect: { id: tenantId } },
        sku,
        optionValues: variant.optionValues as unknown as Prisma.InputJsonValue,
        barcode: null,
        currency: variant.currency,
        sellingPriceMinor: variant.sellingPriceMinor,
        purchasePriceMinor: variant.purchasePriceMinor,
        compareAtPriceMinor: variant.compareAtPriceMinor,
      });
    }

    const created = await this.prisma.product.create({
      data: {
        tenantId,
        catalogOrigin: CatalogOrigin.vestiflow,
        shopifyCatalogLinkKind: ShopifyCatalogLinkKind.pushed,
        name: `${original.name} (copia)`,
        description: original.description,
        brand: original.brand,
        category: original.category,
        shopifyTaxonomyCategoryId: original.shopifyTaxonomyCategoryId,
        shopifyTaxonomyCategoryFullName: original.shopifyTaxonomyCategoryFullName,
        shopifyCategoryMetafields: original.shopifyCategoryMetafields as Prisma.InputJsonValue,
        tiktokCategoryId: original.tiktokCategoryId,
        season: original.season,
        tags: [...original.tags],
        seoTitle: original.seoTitle,
        seoDescription: original.seoDescription,
        status: original.status,
        unitOfMeasure: original.unitOfMeasure,
        defaultVatCodeId: original.defaultVatCodeId,
        inventoryTracking: original.inventoryTracking,
        managesStock: original.managesStock,
        options: original.options as Prisma.InputJsonValue,
        variants: { create: variantsData },
        images: {
          create: original.images.map((image) => ({
            tenantId,
            url: image.url,
            storagePath: image.storagePath,
            altText: image.altText,
            sortOrder: image.sortOrder,
            // shopifyImageId non copiato: l'immagine Shopify appartiene al
            // prodotto originale, la copia non è ancora sincronizzata.
          })),
        },
      },
      include: PRODUCT_INCLUDE,
    });

    return this.getById(tenantId, created.id);
  }

  /**
   * SKU univoco per tenant: suffisso "-COPIA[-n]" finché non è libero. Lo SKU
   * è facoltativo (§audit "Creazione articolo"): se la variante originale non
   * ne ha uno, la copia resta senza SKU (il vincolo unique tenant+sku ammette
   * più righe NULL, nessuna deduplicazione necessaria).
   */
  private async buildDuplicateSku(
    tenantId: string,
    sourceSku: string | null,
  ): Promise<string | null> {
    if (!sourceSku || !sourceSku.trim()) {
      return null;
    }
    const base = `${sourceSku}-COPIA`;
    let candidate = base;
    let attempt = 1;
    // Limite difensivo: evita loop infiniti in scenari patologici (migliaia
    // di copie dello stesso SKU sullo stesso tenant).
    while (attempt <= 1000) {
      const existing = await this.prisma.productVariant.findFirst({
        where: { tenantId, sku: { equals: candidate, mode: 'insensitive' } },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
      attempt += 1;
      candidate = `${base}-${attempt}`;
    }
    throw new ConflictException("Impossibile generare uno SKU univoco per la copia dell'articolo.");
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
          ...(dto.unitOfMeasure !== undefined
            ? { unitOfMeasure: dto.unitOfMeasure.trim() || 'pz' }
            : {}),
          ...(dto.defaultVatCodeId !== undefined ? { defaultVatCodeId: dto.defaultVatCodeId } : {}),
          ...(dto.inventoryTracking !== undefined
            ? { inventoryTracking: dto.inventoryTracking }
            : {}),
          ...(dto.managesStock !== undefined ? { managesStock: dto.managesStock } : {}),
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
    sku: string | null;
    barcode: string | null;
    productName: string;
    managesStock: boolean;
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
      include: { product: { select: { id: true, name: true, managesStock: true } } },
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
      managesStock: variant.product.managesStock ?? true,
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
    await assertVariantSkuAvailableInTx(tx, tenantId, variant.sku);
    await assertVariantBarcodeAvailableInTx(tx, tenantId, variant.barcode);
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

    await assertVariantSkuAvailableInTx(tx, tenantId, variant.sku, id);
    await assertVariantBarcodeAvailableInTx(tx, tenantId, variant.barcode, id);
    await tx.productVariant.update({
      where: { id },
      data: {
        sku: normalizeOptionalSku(variant.sku),
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

  private toVariantCreateData(
    tenantId: string,
    productId: string,
    variant: CreateVariantDto,
  ): Prisma.ProductVariantUncheckedCreateInput {
    return {
      tenantId,
      productId,
      sku: normalizeOptionalSku(variant.sku),
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
      sku: normalizeOptionalSku(variant.sku),
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

  /**
   * Duplicati nel payload stesso → errore di validazione (422). Gli SKU
   * vuoti/assenti sono ignorati: non sono un "duplicato", sono varianti che
   * non hanno ancora uno SKU (specifica cliente §SKU).
   */
  private assertNoDuplicateSkusInPayload(variants: readonly CreateVariantDto[]): void {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const variant of variants) {
      const trimmed = variant.sku?.trim();
      if (!trimmed) {
        continue;
      }
      const key = trimmed.toLowerCase();
      if (seen.has(key)) {
        duplicates.add(trimmed);
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

  /**
   * Conflitto con SKU già a catalogo → 409. Gli SKU vuoti/assenti sono
   * ignorati: nessun controllo di unicità su un valore non ancora scelto.
   */
  private async assertSkusAvailable(
    tenantId: string,
    skus: readonly (string | undefined)[],
  ): Promise<void> {
    const normalized = [
      ...new Set(
        skus.map((sku) => sku?.trim()).filter((sku): sku is string => Boolean(sku)),
      ),
    ];
    if (normalized.length === 0) {
      return;
    }

    const existing = await this.prisma.productVariant.findMany({
      where: { tenantId, sku: { in: normalized, mode: 'insensitive' } },
      select: { sku: true },
    });
    if (existing.length > 0) {
      throw new ConflictException(
        `SKU già presenti a catalogo: ${existing
          .map((variant) => variant.sku)
          .filter((sku): sku is string => sku !== null)
          .join(', ')}`,
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
function normalizeListProductRow(item: ProductWithVariants | ProductListRow): ProductWithVariants {
  if ('variants' in item && Array.isArray(item.variants)) {
    return item;
  }
  return {
    ...item,
    variants: [],
    images: [],
  };
}

