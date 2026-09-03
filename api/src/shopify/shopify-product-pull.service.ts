import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import {
  CatalogOrigin,
  ProductStatus,
  ShopifyCatalogLinkKind,
  ShopifyConnectionStatus,
  ShopifySyncStatus,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { nextArticleCodeInTx } from '../products/article-code.util';
import {
  resolveCatalogOriginForShopifyImport,
  resolveShopifyCatalogLinkKindForImport,
  shouldSkipShopifyCatalogImport,
} from '../products/catalog-origin.util';
import { syncProductImagesFromShopify } from '../products/product-images.sync';
import type { ShopifyAdminProduct } from './shopify-admin.client';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyProductEnrichmentService } from './shopify-product-enrichment.service';
import type { ProductShopifyEnrichment } from './shopify-product-metadata.types';
import { PRODUCT_IMPORT_TX } from './shopify-product-metadata.types';
import {
  categoryMetafieldsSyncErrorMessage,
  countCategoryMetafieldsWithValues,
  parseCategoryMetafieldsJson,
  resolveImportedShopifyCategoryMetafields,
  resolveImportedShopifyMetafields,
} from './shopify-category-metafields.util';
import { parseShopifyTags } from './shopify-product-metadata.util';
import { shopifyDecimalToMinor } from './shopify-money.util';
import { shopifyBodyHtmlToPlainText } from './shopify-html.util';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { toShopifyUserMessage } from './shopify-user-error.util';
import {
  mergeShopifyScopes,
  buildShopifyScopeDiagnostics,
  shopifyCatalogImportBlockMessage,
} from './shopify-scopes.util';

export interface ShopifyCatalogSyncResult {
  readonly imported: number;
  readonly updated: number;
  readonly skipped: number;
  readonly remoteProductCount: number;
  readonly failed: readonly { shopifyProductId: string; message: string }[];
}

type VariantOptionRow = { readonly name: string; readonly value: string };

@Injectable()
export class ShopifyProductPullService {
  private readonly logger = new Logger(ShopifyProductPullService.name);

  /** Evita import catalogo paralleli per lo stesso tenant (process-local). */
  private readonly catalogPullInFlight = new Map<string, Promise<ShopifyCatalogSyncResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyEnrichment: ShopifyProductEnrichmentService,
  ) {}

  async pullCatalog(tenantId: string): Promise<ShopifyCatalogSyncResult> {
    const inflight = this.catalogPullInFlight.get(tenantId);
    if (inflight) {
      this.logger.log(`Import catalogo già in corso (${tenantId}): join richiesta parallela`);
      return inflight;
    }

    const job = this.executePullCatalog(tenantId).finally(() => {
      this.catalogPullInFlight.delete(tenantId);
    });
    this.catalogPullInFlight.set(tenantId, job);
    return job;
  }

  private async executePullCatalog(tenantId: string): Promise<ShopifyCatalogSyncResult> {
    await this.shopifyConnection.healStaleErrorStatus(tenantId);

    const connection = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { status: true, scopes: true },
    });

    if (!connection || connection.status !== ShopifyConnectionStatus.connected) {
      throw new UnprocessableEntityException(
        'Connessione Shopify non attiva. Ricollega lo store da Impostazioni e riprova.',
      );
    }

    const credential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { scopes: true },
    });
    const effectiveScopes = mergeShopifyScopes(connection.scopes, credential?.scopes);
    const scopeDiagnostics = buildShopifyScopeDiagnostics(
      this.shopifyConfig.requestedScopes,
      effectiveScopes,
    );
    const readScopeError = shopifyCatalogImportBlockMessage(scopeDiagnostics);
    if (readScopeError) {
      this.logger.warn(
        `Import catalogo bloccato (${tenantId}): read_products assente (scopes: ${effectiveScopes.join(', ')})`,
      );
      throw new UnprocessableEntityException(readScopeError);
    }

    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    let remoteProducts: readonly ShopifyAdminProduct[];
    try {
      remoteProducts = await this.shopifyAdmin.listAllProducts(shopDomain, accessToken);
    } catch (error: unknown) {
      await this.shopifyConnection.recordApiFailure(tenantId, error);
      throw error;
    }
    this.logger.log(
      `Import catalogo Shopify (${tenantId}): ${remoteProducts.length} prodotti da ${shopDomain}`,
    );

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const failed: { shopifyProductId: string; message: string }[] = [];

    for (const remote of remoteProducts) {
      try {
        // ⛔ PRIMA dell'arricchimento: `enrichProduct` interroga Shopify, e un suo
        //    fallimento finisce nel catch qui sotto, che scrive sul prodotto. La
        //    guardia di `importProduct` non si raggiungerebbe mai.
        if (await this.syncSpentaPerRemoto(tenantId, String(remote.id))) {
          skipped += 1;
          continue;
        }
        const enrichment = await this.shopifyEnrichment.enrichProduct(
          shopDomain,
          accessToken,
          remote,
          { fetchVariantCosts: false, skipRemoteMetadata: true },
        );
        const outcome = await this.importProduct(tenantId, remote, enrichment);
        if (outcome === 'imported') {
          imported += 1;
        } else if (outcome === 'updated') {
          updated += 1;
        } else {
          skipped += 1;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Import fallito';
        failed.push({
          shopifyProductId: String(remote.id),
          message: toShopifyUserMessage(undefined, message).slice(0, 300),
        });
        await this.recordProductImportError(tenantId, String(remote.id), message);
      }
    }

    await this.shopifyConnection.touchSync(tenantId);
    return {
      imported,
      updated,
      skipped,
      remoteProductCount: remoteProducts.length,
      failed,
    };
  }

  async importProductFromWebhook(
    tenantId: string,
    payload: Record<string, unknown>,
  ): Promise<'imported' | 'updated' | 'skipped'> {
    const remote = this.normalizeWebhookProduct(payload);
    if (!remote) {
      return 'skipped';
    }

    // ⛔ Anche qui prima dell'arricchimento: un prodotto spento non deve costare
    //    nemmeno una chiamata a Shopify. Qui il fallimento dell'enrichment è già
    //    catturato e non scrive, ma la chiamata partiva lo stesso.
    if (await this.syncSpentaPerRemoto(tenantId, String(remote.id))) {
      this.logger.debug(
        `Webhook Shopify ignorato: sincronizzazione spenta sul prodotto (${remote.id})`,
      );
      return 'skipped';
    }

    let enrichment: ProductShopifyEnrichment | undefined;
    try {
      const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
      enrichment = await this.shopifyEnrichment.enrichProduct(shopDomain, accessToken, remote, {
        fetchVariantCosts: true,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Enrichment webhook fallito';
      this.logger.warn(`Enrichment webhook prodotto ${remote.id}: ${message}`);
    }

    try {
      return await this.importProduct(tenantId, remote, enrichment);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Import webhook fallito';
      await this.recordProductImportError(tenantId, String(remote.id), message);
      throw error;
    }
  }

  private async importProduct(
    tenantId: string,
    remote: ShopifyAdminProduct,
    enrichment?: ProductShopifyEnrichment,
  ): Promise<'imported' | 'updated' | 'skipped'> {
    const shopifyProductId = String(remote.id);
    const existing = await this.prisma.product.findFirst({
      where: { tenantId, shopifyProductId },
      include: {
        variants: true,
        images: { select: { storagePath: true } },
      },
    });

    const options = this.mapOptions(remote);
    const status = this.mapStatus(remote.status);
    const tags = enrichment?.tags ?? parseShopifyTags(remote.tags);
    const localCategoryMetafields = parseCategoryMetafieldsJson(
      existing?.shopifyCategoryMetafields,
    );
    const importedCategoryMetafields = resolveImportedShopifyCategoryMetafields(
      enrichment?.categoryMetafields,
      existing?.shopifyCategoryMetafields,
    );

    // ⛔ Sincronizzazione SPENTA: il prodotto si ignora INTEGRALMENTE — niente
    //    nome, descrizione, stato, opzioni, varianti o immagini. Spegnere
    //    l'interruttore significa «questo prodotto non si tocca da Shopify», e
    //    una guardia che ne lasciasse passare metà sarebbe peggio di nessuna.
    if (this.isSyncSpenta(existing)) {
      this.logger.debug(
        `Import Shopify saltato: sincronizzazione spenta sul prodotto (${shopifyProductId})`,
      );
      return 'skipped';
    }

    if (existing?.shopifySyncStatus === ShopifySyncStatus.syncing) {
      this.logger.debug(
        `Import webhook saltato: sync VestiFlow→Shopify in corso (${shopifyProductId})`,
      );
      return 'skipped';
    }

    // Il NOME SHOPIFY: il titolo con cui il prodotto si vende (docs/24 §1.9).
    //
    // ⛔ Sta QUI, dopo le guardie, e non più in cima: `normalizeWebhookProduct`
    //    non valida il payload — `payload as ShopifyAdminProduct` — quindi
    //    `remote.title` può essere `undefined` a runtime. Letto prima della
    //    guardia, il `.trim()` lanciava, il catch chiamava
    //    `recordProductImportError`, e quello scriveva `shopifySyncStatus: error`
    //    **su un prodotto a sincronizzazione spenta**: la scrittura che la
    //    guardia esiste per impedire.
    const titoloShopify = remote.title.trim() || 'Prodotto Shopify';

    if (existing && shouldSkipShopifyCatalogImport(existing)) {
      // ⭐ Il catalogo resta di VestiFlow, ma il **Nome Shopify** no: è il titolo
      //    della vetrina, ed è bidirezionale per contratto (docs/24 §1.9). Passa
      //    solo lui: `Product.name` e il resto del catalogo restano fermi.
      if (existing.shopifyTitle !== titoloShopify) {
        await this.prisma.product.updateMany({
          where: { id: existing.id, tenantId },
          data: { shopifyTitle: titoloShopify },
        });
      }
      this.logger.debug(
        `Import Shopify saltato: catalogo di origine VestiFlow (${shopifyProductId})`,
      );
      return 'skipped';
    }

    const categorySyncError = categoryMetafieldsSyncErrorMessage(
      countCategoryMetafieldsWithValues(localCategoryMetafields),
      countCategoryMetafieldsWithValues(importedCategoryMetafields),
      existing?.shopifyLastError,
    );
    // ⭐ Il titolo remoto è il NOME SHOPIFY, e da qui in poi solo quello: il nome
    //    interno appartiene a chi lavora in magazzino, e un ri-sync non glielo
    //    riscrive più (docs/24 §1.9). `name` sta fuori dall'allowlist apposta —
    //    stesso pattern del codice articolo — e lo aggiunge la sola creazione.
    const productData = {
      shopifyTitle: titoloShopify,
      description: shopifyBodyHtmlToPlainText(remote.body_html),
      brand: remote.vendor?.trim() || null,
      category: remote.product_type?.trim() || null,
      shopifyTaxonomyCategoryId:
        enrichment?.taxonomyCategoryId ?? existing?.shopifyTaxonomyCategoryId ?? null,
      shopifyTaxonomyCategoryFullName:
        enrichment?.taxonomyCategoryFullName ?? existing?.shopifyTaxonomyCategoryFullName ?? null,
      season: enrichment?.season ?? existing?.season ?? null,
      tags: [...tags],
      seoTitle: enrichment?.seoTitle ?? null,
      seoDescription: enrichment?.seoDescription ?? null,
      shopifyCollections: (enrichment?.collections ?? []) as unknown as Prisma.InputJsonValue,
      shopifyMetafields: resolveImportedShopifyMetafields(
        enrichment?.metafields,
        existing?.shopifyMetafields,
      ) as unknown as Prisma.InputJsonValue,
      shopifyCategoryMetafields: importedCategoryMetafields as unknown as Prisma.InputJsonValue,
      status,
      options: options as unknown as Prisma.InputJsonValue,
      shopifyProductId,
      shopifySyncStatus: categorySyncError
        ? ShopifySyncStatus.out_of_sync
        : ShopifySyncStatus.synced,
      shopifyLastSyncAt: new Date(),
      shopifyLastError: categorySyncError,
      catalogOrigin: existing
        ? resolveCatalogOriginForShopifyImport(existing)
        : CatalogOrigin.shopify,
      shopifyCatalogLinkKind: existing
        ? resolveShopifyCatalogLinkKindForImport(existing)
        : ShopifyCatalogLinkKind.imported,
    };

    if (!existing) {
      const reservedSkus = await this.loadTenantSkus(tenantId);
      await this.prisma.$transaction(async (tx) => {
        // Codice articolo: proprietà interna VestiFlow, mai mappata su campi
        // Shopify. Generato SOLO alla prima sincronizzazione (prodotto non
        // ancora in VestiFlow); gli update successivi non lo toccano perché
        // non compare nell'allowlist `productData` (stesso pattern di `kind`).
        const articleCode = await nextArticleCodeInTx(tx, tenantId);
        // Campi articolo popolati dalla prima variante (Shopify li mostra come
        // prezzo/barrato/costo del prodotto): il barrato è SOLO dell'articolo.
        const first = remote.variants[0];
        // Primo import: il prezzo Shopify E il prezzo articolo (gestionale)
        // nascono entrambi dal prezzo Shopify — non c'è altra fonte. Da qui in
        // poi la sync tocca solo il prezzo Shopify; il prezzo articolo è
        // dell'operatore.
        const firstPriceMinor = first ? shopifyDecimalToMinor(first.price ?? '0') : 0;
        const product = await tx.product.create({
          data: {
            tenantId,
            articleCode,
            // Primo import: i due nomi nascono uguali, e da qui vivono separati.
            name: titoloShopify,
            ...productData,
            sellingPriceMinor: firstPriceMinor,
            shopifyPriceMinor: firstPriceMinor,
            compareAtPriceMinor: first?.compare_at_price
              ? shopifyDecimalToMinor(first.compare_at_price)
              : null,
            purchasePriceMinor: first
              ? (enrichment?.variantPurchasePriceMinor.get(first.id) ?? 0)
              : 0,
          },
        });

        for (const variant of remote.variants) {
          const sku = this.resolveImportSku(reservedSkus, variant.sku, variant.id);
          reservedSkus.add(sku.toLowerCase());
          const variantPriceMinor = shopifyDecimalToMinor(variant.price ?? '0');
          await tx.productVariant.create({
            data: {
              tenantId,
              productId: product.id,
              sku,
              optionValues: this.mapVariantOptions(remote, variant),
              barcode: variant.barcode ?? null,
              currency: 'EUR',
              sellingPriceMinor: variantPriceMinor,
              shopifyPriceMinor: variantPriceMinor,
              purchasePriceMinor: enrichment?.variantPurchasePriceMinor.get(variant.id) ?? 0,
              shopifyVariantId: String(variant.id),
              shopifyInventoryItemId: String(variant.inventory_item_id),
            },
          });
        }

        await syncProductImagesFromShopify(tx, tenantId, product.id, remote.images);
      }, PRODUCT_IMPORT_TX);
      return 'imported';
    }

    const reservedSkus = await this.loadTenantSkus(tenantId, existing.id);
    const byShopifyVariantId = new Map(
      existing.variants.filter((v) => v.shopifyVariantId).map((v) => [v.shopifyVariantId!, v]),
    );

    const firstRemote = remote.variants[0];
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: existing.id },
        data: {
          ...productData,
          // Ri-sync: si aggiorna SOLO il prezzo Shopify (dalla prima variante).
          // Il prezzo articolo (gestionale) è dell'operatore, non si tocca più.
          // Il barrato è dell'articolo ma resta sincronizzato (una sola versione).
          shopifyPriceMinor: firstRemote ? shopifyDecimalToMinor(firstRemote.price ?? '0') : 0,
          compareAtPriceMinor: firstRemote?.compare_at_price
            ? shopifyDecimalToMinor(firstRemote.compare_at_price)
            : null,
          purchasePriceMinor: firstRemote
            ? (enrichment?.variantPurchasePriceMinor.get(firstRemote.id) ?? 0)
            : 0,
        },
      });

      for (const variant of remote.variants) {
        const shopifyVariantId = String(variant.id);
        const matched = byShopifyVariantId.get(shopifyVariantId);
        const purchasePriceMinor =
          enrichment?.variantPurchasePriceMinor.get(variant.id) ?? matched?.purchasePriceMinor ?? 0;
        const variantPriceMinor = shopifyDecimalToMinor(variant.price ?? '0');
        // Comune a match/nuova: il prezzo Shopify e i collegamenti si allineano.
        const variantSyncData = {
          optionValues: this.mapVariantOptions(remote, variant) as unknown as Prisma.InputJsonValue,
          barcode: variant.barcode ?? null,
          shopifyPriceMinor: variantPriceMinor,
          purchasePriceMinor,
          shopifyVariantId,
          shopifyInventoryItemId: String(variant.inventory_item_id),
        };

        if (matched) {
          // Variante esistente: NON si tocca il prezzo articolo (gestionale).
          await tx.productVariant.update({
            where: { id: matched.id },
            data: variantSyncData,
          });
        } else {
          // Variante nuova comparsa su Shopify: prezzo articolo seminato dal
          // prezzo Shopify (nessun'altra fonte), poi indipendente.
          const sku = this.resolveImportSku(reservedSkus, variant.sku, variant.id);
          reservedSkus.add(sku.toLowerCase());
          await tx.productVariant.create({
            data: {
              tenantId,
              productId: existing.id,
              sku,
              currency: 'EUR',
              sellingPriceMinor: variantPriceMinor,
              ...variantSyncData,
            },
          });
        }
      }

      await syncProductImagesFromShopify(tx, tenantId, existing.id, remote.images);
    }, PRODUCT_IMPORT_TX);

    return 'updated';
  }

  /**
   * «Questo prodotto è spento?» — la decisione sta qui, e la leggono tutti i
   * punti che la applicano: i due ingressi e `importProduct`.
   */
  private isSyncSpenta(snapshot: { readonly shopifySyncEnabled: boolean } | null): boolean {
    return snapshot?.shopifySyncEnabled === false;
  }

  /**
   * Lo stesso, per chi il prodotto non l'ha ancora in mano: costa una query, e
   * si paga PRIMA di `enrichProduct` — che altrimenti interroga Shopify per un
   * prodotto che stiamo per ignorare, e fallendo fa scrivere l'errore addosso.
   */
  private async syncSpentaPerRemoto(tenantId: string, shopifyProductId: string): Promise<boolean> {
    return this.isSyncSpenta(
      await this.prisma.product.findFirst({
        where: { tenantId, shopifyProductId },
        select: { shopifySyncEnabled: true },
      }),
    );
  }

  private async recordProductImportError(
    tenantId: string,
    shopifyProductId: string,
    message: string,
  ): Promise<void> {
    // ⛔ Difesa in profondità: se un percorso non ancora previsto arrivasse qui
    //    con un prodotto spento, il filtro impedisce comunque la scrittura.
    await this.prisma.product.updateMany({
      where: { tenantId, shopifyProductId, shopifySyncEnabled: true },
      data: {
        shopifySyncStatus: ShopifySyncStatus.error,
        shopifyLastError: message.slice(0, 500),
      },
    });
  }

  private async loadTenantSkus(tenantId: string, excludeProductId?: string): Promise<Set<string>> {
    const rows = await this.prisma.productVariant.findMany({
      where: {
        tenantId,
        sku: { not: null },
        ...(excludeProductId ? { productId: { not: excludeProductId } } : {}),
      },
      select: { sku: true },
    });
    return new Set(
      rows
        .map((row) => row.sku)
        .filter((sku): sku is string => Boolean(sku))
        .map((sku) => sku.toLowerCase()),
    );
  }

  private resolveImportSku(
    reserved: Set<string>,
    rawSku: string | null,
    shopifyVariantId: number,
  ): string {
    const trimmed = rawSku?.trim();
    if (trimmed && !reserved.has(trimmed.toLowerCase())) {
      return trimmed;
    }
    const fallback = trimmed ? `${trimmed}-${shopifyVariantId}` : `SHOPIFY-${shopifyVariantId}`;
    if (!reserved.has(fallback.toLowerCase())) {
      return fallback;
    }
    return `SHOPIFY-${shopifyVariantId}-${Date.now()}`;
  }

  private mapOptions(remote: ShopifyAdminProduct): { name: string; values: string[] }[] {
    return (remote.options ?? [])
      .filter((option) => option.name !== 'Title' || (option.values?.length ?? 0) > 1)
      .slice(0, 3)
      .map((option) => ({
        name: option.name,
        values: [...(option.values ?? [])],
      }));
  }

  private mapVariantOptions(
    remote: ShopifyAdminProduct,
    variant: ShopifyAdminProduct['variants'][number],
  ): VariantOptionRow[] {
    const options = this.mapOptions(remote);
    if (options.length === 0) {
      return [{ name: 'Title', value: variant.title ?? 'Default Title' }];
    }

    const values = [variant.option1, variant.option2, variant.option3];
    return options.flatMap((option, index) => {
      const value = values[index];
      return value ? [{ name: option.name, value }] : [];
    });
  }

  private mapStatus(status: string): ProductStatus {
    switch (status) {
      case 'active':
        return ProductStatus.active;
      case 'archived':
        return ProductStatus.archived;
      default:
        return ProductStatus.draft;
    }
  }

  private normalizeWebhookProduct(payload: Record<string, unknown>): ShopifyAdminProduct | null {
    if (payload.id == null) {
      return null;
    }
    return payload as unknown as ShopifyAdminProduct;
  }
}
