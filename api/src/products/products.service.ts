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
  TenantChannelProfile,
  type Product,
  type ProductImage,
  type ProductVariant,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { sameAmountAtCent } from '../common/money.util';
import { canViewPurchaseCosts } from '../auth/user-permissions.util';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import { buildInventoryVariantSearchWhere } from '../inventory/inventory-variant-search.util';
import { buildVariantTitle } from '../inventory/import/inventory-csv.util';
import { toShopifyUserMessage } from '../shopify/shopify-user-error.util';
import { normalizeProductDescription } from '../shopify/shopify-html.util';
import type { ShopifyProductPushResult } from '../shopify/shopify-product-push.service';
import { ShopifyTaxonomyLocalizationService } from '../shopify/shopify-taxonomy-localization.service';
import type { Paginated } from '../common/dto/pagination.dto';
import {
  ARTICLE_CODE_REQUIRED_MESSAGE,
  articleCodeTakenMessage,
  assertArticleCodeAvailableInTx,
  assertValidArticleCodeFormat,
  nextArticleCodeInTx,
  normalizeArticleCode,
  resolveArticleCodeForCreateInTx,
} from './article-code.util';
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
  articleCode: true,
  name: true,
  description: true,
  brand: true,
  category: true,
  subcategory: true,
  sellingPriceMinor: true,
  compareAtPriceMinor: true,
  purchasePriceMinor: true,
  shopifyPriceMinor: true,
  listino1PriceMinor: true,
  listino2PriceMinor: true,
  listino3PriceMinor: true,
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
  shopifySyncEnabled: true,
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
  kind: true,
  internalNotes: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ProductListRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_LIST_SELECT }>;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
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
              { articleCode: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              { brand: { contains: query.search, mode: 'insensitive' } },
              { variants: { some: { sku: { contains: query.search, mode: 'insensitive' } } } },
              // Barcode/EAN: criterio primario in magazzino (scanner alla mano).
              { variants: { some: { barcode: { contains: query.search, mode: 'insensitive' } } } },
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

  /**
   * Vista leggera varianti per select/report (paginata, ricerca server-side).
   *
   * `purchasePrice` è un dato sensibile (§permessi): viene incluso solo per
   * chi ha "Visualizza costi d'acquisto". Il filtro sta qui e non nella UI
   * perché il costo, se serializzato, resterebbe leggibile nella risposta HTTP
   * anche quando l'interfaccia non lo mostra.
   *
   * `user` è opzionale per non rompere i chiamanti interni; quando è assente
   * il costo NON viene esposto (default prudente).
   */
  async listVariantSummaries(
    tenantId: string,
    query: ListVariantSummariesQueryDto,
    user?: UserProfileDto,
  ): Promise<Paginated<VariantSummaryDto>> {
    const showPurchaseCosts = canViewPurchaseCosts(user);
    const search = query.search?.trim();
    const where: Prisma.ProductVariantWhereInput = {
      tenantId,
      ...(query.variantId ? { id: query.variantId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
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
          product: {
            select: {
              name: true,
              articleCode: true,
              category: true,
              unitOfMeasure: true,
              compareAtPriceMinor: true,
              // Listini aggiuntivi (§B4): valori di ARTICOLO, uguali per ogni
              // taglia. La riga documento li applica scegliendo il listino.
              listino1PriceMinor: true,
              listino2PriceMinor: true,
              listino3PriceMinor: true,
              defaultVatCodeId: true,
              managesStock: true,
              kind: true,
              images: {
                select: { url: true },
                orderBy: { sortOrder: 'asc' },
                take: 1,
              },
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
          // Con locationId: giacenza della sola sede. Senza: tutte le righe,
          // sommate a valle (totale multi-sede invece di nessun dato).
          inventoryLevels: {
            ...(query.locationId ? { where: { locationId: query.locationId }, take: 1 } : {}),
            select: { onHand: true, available: true, minThreshold: true },
          },
        },
        orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.productVariant.count({ where }),
    ]);

    const items: VariantSummaryDto[] = rows.map((row) => {
      const supplierLink = 'supplierLinks' in row ? row.supplierLinks?.[0] : undefined;
      const levels = row.inventoryLevels ?? [];
      // Con location: giacenza puntuale della sede. Senza: totale multi-sede;
      // null solo se la variante non ha alcuna riga giacenza (mai movimentata).
      const stockOnHand = query.locationId
        ? (levels[0]?.onHand ?? null)
        : levels.length > 0
          ? levels.reduce((sum, level) => sum + level.onHand, 0)
          : null;
      // Disponibile = Giacenza − Impegnata (Ordine cliente §DISPONIBILITÀ).
      const stockAvailable = query.locationId
        ? (levels[0]?.available ?? null)
        : levels.length > 0
          ? levels.reduce((sum, level) => sum + level.available, 0)
          : null;
      // Soglia per colorare la disponibilità: con location quella della sede,
      // senza somma multi-sede (coerente con l'aggregazione di stockAvailable).
      const stockMinThreshold = query.locationId
        ? (levels[0]?.minThreshold ?? null)
        : levels.length > 0
          ? levels.reduce((sum, level) => sum + level.minThreshold, 0)
          : null;
      // Senza permesso il costo non entra proprio nella risposta.
      const purchaseMinor = showPurchaseCosts
        ? (supplierLink?.lastPurchasePriceMinor ?? row.purchasePriceMinor ?? null)
        : null;
      return {
        variantId: row.id,
        productId: row.productId,
        sku: row.sku ?? '',
        articleCode: row.product.articleCode,
        productName: row.product.name,
        title: buildVariantTitle(row.product.name, row.optionValues),
        barcode: row.barcode,
        sellingPrice: {
          // Colonna a sei decimali: il numero esce come tale, chi lo mostra
          // arrotonda (§sei decimali).
          amountMinor: Number(row.sellingPriceMinor),
          currencyCode: row.currency,
        },
        purchasePrice:
          purchaseMinor != null ? { amountMinor: purchaseMinor, currencyCode: row.currency } : null,
        compareAtPrice:
          row.product.compareAtPriceMinor != null
            ? { amountMinor: row.product.compareAtPriceMinor, currencyCode: row.currency }
            : null,
        listinoPrices: {
          1: listinoMoney(row.product.listino1PriceMinor, row.currency),
          2: listinoMoney(row.product.listino2PriceMinor, row.currency),
          3: listinoMoney(row.product.listino3PriceMinor, row.currency),
        },
        supplierSku: supplierLink?.supplierSku ?? null,
        stockOnHand,
        stockAvailable,
        stockMinThreshold,
        imageUrl: row.product.images?.[0]?.url ?? null,
        category: row.product.category?.trim() || null,
        unitOfMeasure: row.product.unitOfMeasure ?? 'pz',
        defaultVatCodeId: row.product.defaultVatCodeId ?? null,
        managesStock: row.product.managesStock ?? true,
        kind: row.product.kind,
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
    // restare un 409 coerente, non un 500. La transazione serve anche al
    // codice articolo: generazione progressivo e insert devono essere
    // atomici (advisory lock per tenant dentro nextArticleCodeInTx).
    const created = await this.prisma
      .$transaction(async (tx) => {
        const articleCode = await resolveArticleCodeForCreateInTx(tx, tenantId, dto.articleCode);
        const product = await tx.product.create({
          data: {
            tenantId,
            articleCode,
            catalogOrigin: CatalogOrigin.vestiflow,
            shopifyCatalogLinkKind: ShopifyCatalogLinkKind.pushed,
            name: dto.name,
          description: normalizeProductDescription(dto.description),
          brand: dto.brand,
          category: dto.category,
          subcategory: dto.subcategory,
          internalNotes: dto.internalNotes,
          shopifyTaxonomyCategoryId: dto.shopifyTaxonomyCategoryId?.trim() || null,
          shopifyTaxonomyCategoryFullName: dto.shopifyTaxonomyCategoryFullName?.trim() || null,
          shopifyCategoryMetafields: (dto.shopifyCategoryMetafields ??
            []) as unknown as Prisma.InputJsonValue,
          tiktokCategoryId: dto.tiktokCategoryId?.trim() || null,
          season: dto.season,
          tags: this.normalizeTags(dto.tags),
          status: dto.status,
          shopifySyncEnabled: dto.shopifySyncEnabled ?? true,
          unitOfMeasure: dto.unitOfMeasure?.trim() || 'pz',
          defaultVatCodeId: dto.defaultVatCodeId ?? null,
          sellingPriceMinor: dto.sellingPrice.amountMinor,
          // Prezzo Shopify: valore proprio (§B). Se il form lo invia (Shopify
          // attivo, operatore che lo tocca) si usa quello; altrimenti nasce
          // precompilato dal prezzo articolo.
          shopifyPriceMinor: dto.shopifyPrice?.amountMinor ?? dto.sellingPrice.amountMinor,
          compareAtPriceMinor: dto.compareAtPrice?.amountMinor ?? null,
          purchasePriceMinor: dto.purchasePrice?.amountMinor ?? null,
          // Listini aggiuntivi (§B): netti, valore unico articolo. Assenti = null.
          listino1PriceMinor: dto.listino1Price?.amountMinor ?? null,
          listino2PriceMinor: dto.listino2Price?.amountMinor ?? null,
          listino3PriceMinor: dto.listino3Price?.amountMinor ?? null,
          inventoryTracking: dto.inventoryTracking ?? undefined,
          managesStock: dto.managesStock ?? true,
          kind: dto.kind ?? undefined,
            options: dto.options as unknown as Prisma.InputJsonValue,
            variants: {
              create: dto.variants.map((variant) => this.toVariantCreateInput(tenantId, variant)),
            },
          },
          include: PRODUCT_INCLUDE,
        });
        await this.mirrorSimpleProductPrice(tx, tenantId, product.id);
        return product;
      })
      .catch(async (error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw await this.uniqueViolationToConflict(tenantId, error, dto);
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
        shopifyPriceMinor: variant.shopifyPriceMinor,
        purchasePriceMinor: variant.purchasePriceMinor,
      });
    }

    // La copia e' un articolo nuovo: il codice articolo e' univoco per
    // tenant, quindi riceve il prossimo progressivo (mai il codice
    // dell'originale). Generazione + insert atomici nella transazione.
    const created = await this.prisma.$transaction(async (tx) => {
      const articleCode = await nextArticleCodeInTx(tx, tenantId);
      return tx.product.create({
        data: {
          tenantId,
          articleCode,
          catalogOrigin: CatalogOrigin.vestiflow,
          shopifyCatalogLinkKind: ShopifyCatalogLinkKind.pushed,
          name: `${original.name} (copia)`,
        description: original.description,
        brand: original.brand,
        category: original.category,
        subcategory: original.subcategory,
        internalNotes: original.internalNotes,
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
        sellingPriceMinor: original.sellingPriceMinor,
        shopifyPriceMinor: original.shopifyPriceMinor,
        compareAtPriceMinor: original.compareAtPriceMinor,
        purchasePriceMinor: original.purchasePriceMinor,
        // Listini aggiuntivi: copiati tali e quali (netti).
        listino1PriceMinor: original.listino1PriceMinor,
        listino2PriceMinor: original.listino2PriceMinor,
        listino3PriceMinor: original.listino3PriceMinor,
        inventoryTracking: original.inventoryTracking,
        managesStock: original.managesStock,
        kind: original.kind,
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

    // Shopify ATTIVO: prezzo articolo e prezzo Shopify sono indipendenti (il form
    // invia entrambi, B3). Shopify DISATTIVO: l'operatore non vede il prezzo
    // Shopify, che segue il prezzo articolo SOLO quando questo cambia valore.
    // Serve solo quando il patch tocca prezzo articolo o varianti: un edit di
    // solo nome/descrizione non paga la query sul canale del tenant.
    const shopifyActive =
      dto.sellingPrice !== undefined || dto.variants !== undefined
        ? await this.isShopifyActive(tenantId)
        : false;

    await this.prisma.$transaction(async (tx) => {
      if (dto.variants) {
        await this.syncVariants(tx, tenantId, id, dto.variants, shopifyActive);
      }

      // Codice articolo: undefined = non toccare; vuoto = bloccato (il campo
      // e' obbligatorio, mai rigenerato in silenzio: la scelta e' esplicita
      // dell'operatore, specifica §obbligatorio); valorizzato = normalizzato
      // in maiuscolo, formato e unicita' verificati.
      let articleCode: string | undefined;
      if (dto.articleCode !== undefined) {
        const normalized = normalizeArticleCode(dto.articleCode);
        if (!normalized) {
          throw new UnprocessableEntityException(ARTICLE_CODE_REQUIRED_MESSAGE);
        }
        assertValidArticleCodeFormat(normalized);
        await assertArticleCodeAvailableInTx(tx, tenantId, normalized, id);
        articleCode = normalized;
      }

      await tx.product.update({
        where: { id },
        data: {
          ...(articleCode !== undefined ? { articleCode } : {}),
          name: dto.name,
          description: normalizeProductDescription(dto.description),
          brand: dto.brand,
          category: dto.category,
          subcategory: dto.subcategory,
          internalNotes: dto.internalNotes,
          // Prezzi/costo articolo. La presenza di sellingPrice segnala che il
          // form ha inviato la sezione prezzi dell'articolo: in quel caso barrato
          // e costo di riferimento assenti valgono "azzera" (null), così
          // l'operatore può rimuoverli. Un patch parziale senza sellingPrice non
          // tocca nessuno dei tre.
          ...(dto.sellingPrice !== undefined
            ? {
                sellingPriceMinor: dto.sellingPrice.amountMinor,
                compareAtPriceMinor: dto.compareAtPrice?.amountMinor ?? null,
                purchasePriceMinor: dto.purchasePrice?.amountMinor ?? null,
                // Prezzo Shopify (§B). Shopify ATTIVO: valore indipendente inviato
                // dal form, persistito così com'è (assente = non toccare). Shopify
                // SPENTO: il campo non esiste in UI e segue il prezzo articolo solo
                // se questo cambia valore (criterio unico e preciso).
                ...(shopifyActive
                  ? dto.shopifyPrice !== undefined
                    ? { shopifyPriceMinor: dto.shopifyPrice.amountMinor }
                    : {}
                  : // «Cambiato» si valuta al centesimo: una coda decimale
                    // diversa non è un prezzo nuovo (§sei decimali).
                    !sameAmountAtCent(dto.sellingPrice.amountMinor, Number(existing.sellingPriceMinor))
                    ? { shopifyPriceMinor: dto.sellingPrice.amountMinor }
                    : {}),
              }
            : {}),
          // Listini aggiuntivi (§B), gating per campo: assente = non toccare,
          // `null` esplicito = azzera (l'operatore ha svuotato il campo). Sempre
          // netti: il frontend scorpora prima di inviare.
          ...(dto.listino1Price !== undefined
            ? { listino1PriceMinor: dto.listino1Price?.amountMinor ?? null }
            : {}),
          ...(dto.listino2Price !== undefined
            ? { listino2PriceMinor: dto.listino2Price?.amountMinor ?? null }
            : {}),
          ...(dto.listino3Price !== undefined
            ? { listino3PriceMinor: dto.listino3Price?.amountMinor ?? null }
            : {}),
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
          ...(dto.shopifySyncEnabled !== undefined
            ? { shopifySyncEnabled: dto.shopifySyncEnabled }
            : {}),
          ...(dto.unitOfMeasure !== undefined
            ? { unitOfMeasure: dto.unitOfMeasure.trim() || 'pz' }
            : {}),
          ...(dto.defaultVatCodeId !== undefined ? { defaultVatCodeId: dto.defaultVatCodeId } : {}),
          ...(dto.inventoryTracking !== undefined
            ? { inventoryTracking: dto.inventoryTracking }
            : {}),
          ...(dto.managesStock !== undefined ? { managesStock: dto.managesStock } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.options ? { options: dto.options as unknown as Prisma.InputJsonValue } : {}),
        },
        include: PRODUCT_INCLUDE,
      });
      await this.mirrorSimpleProductPrice(tx, tenantId, id);
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
      const shopifyDelete = await this.channelSync.deleteProduct(
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

  /**
   * Verifica disponibilità codice articolo per la validazione live del form.
   * Ritorna anche il nome dell'articolo che occupa il codice, per il
   * messaggio "Codice articolo già utilizzato da [nome articolo]."
   */
  async checkArticleCodeAvailability(
    tenantId: string,
    articleCode: string,
    excludeProductId?: string,
  ): Promise<{ articleCode: string; available: boolean; takenBy: string | null }> {
    const normalized = normalizeArticleCode(articleCode);
    if (!normalized) {
      return { articleCode: '', available: false, takenBy: null };
    }
    const existing = await this.prisma.product.findFirst({
      where: {
        tenantId,
        articleCode: { equals: normalized, mode: 'insensitive' },
        ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
      },
      select: { name: true },
    });
    return { articleCode: normalized, available: existing === null, takenBy: existing?.name ?? null };
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

    let variant = await this.prisma.productVariant.findFirst({
      where: {
        tenantId,
        OR: [
          { sku: { equals: trimmed, mode: 'insensitive' } },
          { barcode: { equals: trimmed, mode: 'insensitive' } },
        ],
      },
      include: { product: { select: { id: true, name: true, managesStock: true } } },
    });

    // Codice articolo come criterio di scan (specifica §DOVE VIENE USATO 4a),
    // dopo SKU/barcode: identifica il prodotto, quindi risolve una variante
    // solo se il prodotto ne ha una sola (altrimenti la scelta resta alla
    // ricerca contestuale, che ora include il codice articolo).
    if (!variant) {
      const byArticleCode = await this.prisma.productVariant.findMany({
        where: {
          tenantId,
          product: { articleCode: { equals: trimmed, mode: 'insensitive' } },
        },
        include: { product: { select: { id: true, name: true, managesStock: true } } },
        take: 2,
      });
      if (byArticleCode.length === 1) {
        variant = byArticleCode[0]!;
      }
    }

    if (!variant) {
      throw new NotFoundException('Variante non trovata per SKU, barcode o codice articolo');
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
    shopifyActive: boolean,
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
        await this.updateVariantInTx(tx, tenantId, productId, variant, shopifyActive);
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
    shopifyActive: boolean,
  ): Promise<void> {
    const id = variant.id;
    if (!id) {
      return;
    }

    const current = await tx.productVariant.findFirst({
      where: { id, tenantId, productId },
      select: { id: true, sellingPriceMinor: true },
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
        // Prezzo Shopify della variante (§B). Shopify ATTIVO: valore indipendente
        // inviato dal form (assente = non toccare). Shopify SPENTO: segue il prezzo
        // variante solo se questo cambia valore (stesso criterio dell'articolo).
        ...(shopifyActive
          ? variant.shopifyPrice !== undefined
            ? { shopifyPriceMinor: variant.shopifyPrice.amountMinor }
            : {}
          : !sameAmountAtCent(variant.sellingPrice.amountMinor, Number(current.sellingPriceMinor))
            ? { shopifyPriceMinor: variant.sellingPrice.amountMinor }
            : {}),
        purchasePriceMinor: variant.purchasePrice?.amountMinor,
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
      // Prezzo Shopify: valore proprio (§B). Se il form lo invia si usa quello,
      // altrimenti nasce precompilato dal prezzo variante.
      shopifyPriceMinor: variant.shopifyPrice?.amountMinor ?? variant.sellingPrice.amountMinor,
      purchasePriceMinor: variant.purchasePrice?.amountMinor,
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
      // Prezzo Shopify: valore proprio (§B). Se il form lo invia si usa quello,
      // altrimenti nasce precompilato dal prezzo variante.
      shopifyPriceMinor: variant.shopifyPrice?.amountMinor ?? variant.sellingPrice.amountMinor,
      purchasePriceMinor: variant.purchasePrice?.amountMinor,
    };
  }

  /**
   * Prodotto SEMPLICE (senza opzioni): la sola variante di default anonima
   * rispecchia il prezzo di vendita dell'articolo, così l'export manda il valore
   * giusto. Con opzioni le varianti sono indipendenti → no-op. Il costo NON si
   * rispecchia: la variante ha il suo costo effettivo (aggiornato dai carichi).
   */
  private async mirrorSimpleProductPrice(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
  ): Promise<void> {
    const product = await tx.product.findFirst({
      where: { id: productId, tenantId },
      select: { options: true, sellingPriceMinor: true, shopifyPriceMinor: true },
    });
    if (!product) {
      return;
    }
    const options = Array.isArray(product.options) ? product.options : [];
    if (options.length > 0) {
      return;
    }
    // La variante di default rispecchia sia il prezzo articolo sia il prezzo
    // Shopify: sul prodotto semplice i due livelli coincidono.
    await tx.productVariant.updateMany({
      where: { productId, tenantId },
      data: {
        sellingPriceMinor: product.sellingPriceMinor,
        shopifyPriceMinor: product.shopifyPriceMinor,
      },
    });
  }

  /**
   * Gestione Shopify attiva per il tenant = profilo canale Shopify. Governa se
   * il prezzo Shopify è indipendente (attivo) o segue il prezzo articolo sui
   * cambi di valore (disattivo, §B).
   */
  private async isShopifyActive(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { channelProfile: true },
    });
    return tenant?.channelProfile === TenantChannelProfile.shopify;
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

  /**
   * P2002 in creazione: distingue il vincolo violato per un 409 con
   * messaggio chiaro. Sul codice articolo recupera il nome dell'articolo
   * proprietario (specifica: "Codice articolo già utilizzato da [nome]").
   */
  private async uniqueViolationToConflict(
    tenantId: string,
    error: Prisma.PrismaClientKnownRequestError,
    dto: CreateProductDto,
  ): Promise<ConflictException> {
    const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
    const providedCode = normalizeArticleCode(dto.articleCode);
    if (providedCode && target.some((field) => String(field).includes('article_code'))) {
      const owner = await this.prisma.product.findFirst({
        where: { tenantId, articleCode: { equals: providedCode, mode: 'insensitive' } },
        select: { name: true },
      });
      return new ConflictException(
        owner
          ? articleCodeTakenMessage(owner.name)
          : `Codice articolo già in uso: ${providedCode}`,
      );
    }
    const skus = dto.variants
      .map((variant) => variant.sku?.trim())
      .filter((sku): sku is string => Boolean(sku));
    return new ConflictException(
      skus.length > 0
        ? `SKU già presenti a catalogo: ${skus.join(', ')}`
        : 'Uno o più codici (SKU/barcode) risultano già presenti a catalogo.',
    );
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
    return this.channelSync.pushProductNow(tenantId, id);
  }
}

/**
 * Valore di un listino aggiuntivo per la vista variante (§B4). Assente resta
 * assente: un listino non valorizzato non ripiega sul prezzo articolo — il
 * documento mette la riga a zero e lo segnala, invece di far pagare un prezzo
 * che nessuno ha deciso.
 */
function listinoMoney(
  amountMinor: Prisma.Decimal | null,
  currencyCode: string,
): { amountMinor: number; currencyCode: string } | null {
  return amountMinor == null ? null : { amountMinor: Number(amountMinor), currencyCode };
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

