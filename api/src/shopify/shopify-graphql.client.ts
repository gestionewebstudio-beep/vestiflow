import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { ShopifyConfigService } from './shopify-config.service';
import {
  standardMetafieldDefinitionTemplateGid,
  templateNumericIdToAttributeNumericId,
  matchCategoryAttributeToMetafieldTemplate,
} from './shopify-category-metafields.util';
import { ShopifyRateLimiterService } from './shopify-rate-limiter.service';
import {
  parseGraphQlCostExtensions,
  parseShopifyRetryAfterHeader,
} from './shopify-rate-limiter.util';
import { toShopifyGid } from './shopify-money.util';
import type { ShopifyProductStatus } from './shopify-product-payload.util';

export interface ShopifyTaxonomyCategory {
  readonly id: string;
  readonly name: string;
  readonly fullName: string;
  readonly isLeaf: boolean;
}

export interface ShopifyTaxonomyAttributeValue {
  readonly id: string;
  readonly name: string;
}

export interface ShopifyStandardMetafieldDefinition {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly namespace: string;
  readonly typeName: string;
}

export interface ShopifyTaxonomyCategoryAttribute {
  readonly id: string;
  readonly name: string;
  readonly namespace: string;
  readonly key: string;
  readonly metafieldType: string;
  readonly values: readonly ShopifyTaxonomyAttributeValue[];
}

export interface ShopifyMetaobjectNode {
  readonly id: string;
  readonly type: string;
  readonly fields: readonly { readonly key: string; readonly value: string | null }[];
}

export interface MetafieldsSetInput {
  readonly ownerId: string;
  readonly namespace: string;
  readonly key: string;
  readonly type: string;
  readonly value: string;
}

interface GraphQlResponse<T> {
  readonly data?: T;
  readonly errors?: readonly { message: string }[];
  readonly extensions?: unknown;
}

/** I campi prodotto che il push catalogo aggiorna con `productUpdate`. */
export interface ShopifyProductCatalogInput {
  /** GID del prodotto. */
  readonly id: string;
  readonly title: string;
  readonly descriptionHtml: string;
  readonly vendor?: string;
  readonly productType?: string;
  readonly tags?: readonly string[];
  readonly status: ShopifyProductStatus;
}

export type { ShopifyProductStatus } from './shopify-product-payload.util';

/** Una variante come Shopify la restituisce, nella forma che serve all'abbinamento. */
export interface ShopifyRemoteVariant {
  readonly id: string;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly inventoryItemId: string | null;
  readonly selectedOptions: readonly { readonly name: string; readonly value: string }[];
}

/** Riga di `productVariantsBulkUpdate`. Un campo assente non tocca il valore remoto. */
export interface ShopifyVariantBulkInput {
  readonly id: string;
  readonly price?: string;
  readonly compareAtPrice?: string;
  readonly barcode?: string;
  readonly inventoryItem?: { readonly sku?: string };
}

/** Un media del prodotto. Solo l'id: è l'unica cosa stabile che Shopify espone. */
export interface ShopifyRemoteMedia {
  readonly id: string;
}

// ⛔ NIENTE `originalSource { url }`: Shopify ri-ospita il file e restituisce un
//    URL firmato che CAMBIA A OGNI LETTURA (misurato il 03/09/2026 sullo shop di
//    sviluppo: due letture consecutive, due firme diverse, scadenza 5 minuti) — e
//    subito dopo il caricamento è `null`. Non è un identificatore: l'unico è l'id.
const MEDIA_SELECTION = `media(first: 250) { nodes { id } }`;

@Injectable()
export class ShopifyGraphqlClient {
  constructor(
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly rateLimiter: ShopifyRateLimiterService,
  ) {}

  async listTaxonomyCategories(
    shopDomain: string,
    accessToken: string,
    options: {
      readonly search?: string;
      readonly childrenOf?: string;
      readonly first?: number;
    } = {},
  ): Promise<readonly ShopifyTaxonomyCategory[]> {
    const first = options.first ?? 50;
    const query = `
      query TaxonomyCategories($search: String, $childrenOf: ID, $first: Int!) {
        taxonomy {
          categories(search: $search, childrenOf: $childrenOf, first: $first) {
            nodes {
              id
              name
              fullName
              isLeaf
            }
          }
        }
      }
    `;

    const variables: Record<string, unknown> = { first };
    if (options.search?.trim()) {
      variables['search'] = options.search.trim();
    }
    if (options.childrenOf?.trim()) {
      variables['childrenOf'] = options.childrenOf.trim();
    }

    const data = await this.graphql<{
      taxonomy: { categories: { nodes: ShopifyTaxonomyCategory[] } };
    }>(shopDomain, accessToken, query, variables);

    return data.taxonomy?.categories?.nodes ?? [];
  }

  async getProductTaxonomyCategory(
    shopDomain: string,
    accessToken: string,
    shopifyProductId: string,
  ): Promise<ShopifyTaxonomyCategory | null> {
    const productGid = toShopifyGid('Product', shopifyProductId);
    const query = `
      query ProductTaxonomyCategory($id: ID!) {
        product(id: $id) {
          category {
            id
            name
            fullName
            isLeaf
          }
        }
      }
    `;

    const data = await this.graphql<{
      product: { category: ShopifyTaxonomyCategory | null } | null;
    }>(shopDomain, accessToken, query, { id: productGid });

    return data.product?.category ?? null;
  }

  async updateProductTaxonomyCategory(
    shopDomain: string,
    accessToken: string,
    shopifyProductId: string,
    categoryGid: string | null,
  ): Promise<ShopifyTaxonomyCategory | null> {
    const product: Record<string, unknown> = { id: toShopifyGid('Product', shopifyProductId) };
    if (categoryGid) {
      product['category'] = categoryGid;
    }
    const result = await this.runProductUpdate<{ category: ShopifyTaxonomyCategory | null }>(
      shopDomain,
      accessToken,
      product,
      'category { id name fullName isLeaf }',
    );
    return result?.category ?? null;
  }

  async getCategoryAttributes(
    shopDomain: string,
    accessToken: string,
    categoryGid: string,
  ): Promise<readonly ShopifyTaxonomyCategoryAttribute[]> {
    const query = `
      query CategoryAttributes($id: ID!) {
        node(id: $id) {
          ... on TaxonomyCategory {
            attributes(first: 50) {
              nodes {
                __typename
                ... on TaxonomyChoiceListAttribute {
                  id
                  name
                  values(first: 250) {
                    nodes {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      node: {
        attributes: {
          nodes: readonly {
            id?: string;
            name?: string;
            values?: { nodes: ShopifyTaxonomyAttributeValue[] };
          }[];
        };
      } | null;
    }>(shopDomain, accessToken, query, { id: categoryGid });

    const nodes = data.node?.attributes?.nodes ?? [];
    const choiceListNodes = nodes.flatMap((node) =>
      node.id && node.name
        ? [{ id: node.id, name: node.name, values: node.values?.nodes ?? [] }]
        : [],
    );

    if (choiceListNodes.length === 0) {
      return [];
    }

    const categoryTemplates = await this.listStandardMetafieldTemplatesForCategory(
      shopDomain,
      accessToken,
      categoryGid,
    );

    return choiceListNodes.flatMap((node) => {
      const definition = matchCategoryAttributeToMetafieldTemplate(node.name, categoryTemplates);
      if (!definition) {
        return [];
      }
      return [
        {
          id: node.id,
          name: node.name,
          namespace: definition.namespace,
          key: definition.key,
          metafieldType: definition.typeName,
          values: node.values,
        },
      ];
    });
  }

  async listStandardMetafieldTemplatesForCategory(
    shopDomain: string,
    accessToken: string,
    categoryGid: string,
  ): Promise<readonly ShopifyStandardMetafieldDefinition[]> {
    const query = `
      query CategoryStandardMetafieldTemplates($categoryGid: String!) {
        standardMetafieldDefinitionTemplates(
          first: 50,
          constraintSubtype: { key: "category", value: $categoryGid }
        ) {
          nodes {
            id
            name
            key
            namespace
            type {
              name
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      standardMetafieldDefinitionTemplates: {
        nodes: readonly {
          id: string;
          name: string;
          key: string;
          namespace: string;
          type: { name: string };
        }[];
      };
    }>(shopDomain, accessToken, query, { categoryGid });

    return (data.standardMetafieldDefinitionTemplates?.nodes ?? []).map((node) => ({
      id: node.id,
      name: node.name,
      key: node.key,
      namespace: node.namespace,
      typeName: node.type.name,
    }));
  }

  async getStandardMetafieldDefinitionForAttribute(
    shopDomain: string,
    accessToken: string,
    attributeGid: string,
  ): Promise<ShopifyStandardMetafieldDefinition | null> {
    const templateGid = standardMetafieldDefinitionTemplateGid(attributeGid);
    if (!templateGid) {
      return null;
    }

    const templates = await this.resolveStandardMetafieldTemplatesForAttributes(
      shopDomain,
      accessToken,
      [attributeGid],
    );

    return templates.get(attributeGid) ?? null;
  }

  private async resolveStandardMetafieldTemplatesForAttributes(
    shopDomain: string,
    accessToken: string,
    attributeGids: readonly string[],
  ): Promise<Map<string, ShopifyStandardMetafieldDefinition>> {
    const templateGids = attributeGids.flatMap((attributeGid) => {
      const templateGid = standardMetafieldDefinitionTemplateGid(attributeGid);
      return templateGid ? [templateGid] : [];
    });

    if (templateGids.length === 0) {
      return new Map();
    }

    const query = `
      query StandardMetafieldDefinitionTemplates($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on StandardMetafieldDefinitionTemplate {
            id
            name
            key
            namespace
            type {
              name
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      nodes: readonly ({
        id: string;
        name: string;
        key: string;
        namespace: string;
        type: { name: string };
      } | null)[];
    }>(shopDomain, accessToken, query, { ids: [...templateGids] });

    const templateByAttributeId = new Map<string, ShopifyStandardMetafieldDefinition>();

    for (const node of data.nodes ?? []) {
      if (!node?.id) {
        continue;
      }
      const attributeNumericId = templateNumericIdToAttributeNumericId(node.id);
      if (attributeNumericId == null) {
        continue;
      }
      const attributeGid = `gid://shopify/TaxonomyAttribute/${attributeNumericId}`;
      templateByAttributeId.set(attributeGid, {
        id: node.id,
        name: node.name,
        key: node.key,
        namespace: node.namespace,
        typeName: node.type.name,
      });
    }

    return templateByAttributeId;
  }

  async resolveMetaobjects(
    shopDomain: string,
    accessToken: string,
    metaobjectGids: readonly string[],
  ): Promise<readonly ShopifyMetaobjectNode[]> {
    if (metaobjectGids.length === 0) {
      return [];
    }

    const query = `
      query ResolveMetaobjects($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Metaobject {
            id
            type
            fields {
              key
              value
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      nodes: readonly (ShopifyMetaobjectNode | null)[];
    }>(shopDomain, accessToken, query, { ids: [...metaobjectGids] });

    return (data.nodes ?? []).flatMap((node) => (node?.id ? [node] : []));
  }

  async getMetaobjectDefinitionFieldDefinitions(
    shopDomain: string,
    accessToken: string,
    metaobjectType: string,
  ): Promise<
    readonly { readonly key: string; readonly typeName: string; readonly required: boolean }[]
  > {
    const query = `
      query MetaobjectDefinitionByType($type: String!) {
        metaobjectDefinitionByType(type: $type) {
          fieldDefinitions {
            key
            required
            type {
              name
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      metaobjectDefinitionByType: {
        fieldDefinitions: readonly {
          key: string;
          required: boolean;
          type: { name: string };
        }[];
      } | null;
    }>(shopDomain, accessToken, query, { type: metaobjectType });

    return (data.metaobjectDefinitionByType?.fieldDefinitions ?? []).map((field) => ({
      key: field.key,
      typeName: field.type.name,
      required: field.required,
    }));
  }

  async ensureStandardMetafieldDefinitionEnabled(
    shopDomain: string,
    accessToken: string,
    options: {
      readonly templateGid?: string;
      readonly namespace?: string;
      readonly key?: string;
    },
  ): Promise<void> {
    const mutationById = `
      mutation StandardMetafieldDefinitionEnableById($id: ID!, $ownerType: MetafieldOwnerType!) {
        standardMetafieldDefinitionEnable(id: $id, ownerType: $ownerType) {
          createdDefinition {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    const mutationByKey = `
      mutation StandardMetafieldDefinitionEnableByKey(
        $namespace: String!
        $key: String!
        $ownerType: MetafieldOwnerType!
      ) {
        standardMetafieldDefinitionEnable(namespace: $namespace, key: $key, ownerType: $ownerType) {
          createdDefinition {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    if (options.templateGid) {
      const data = await this.graphql<{
        standardMetafieldDefinitionEnable: {
          createdDefinition: { id: string } | null;
          userErrors: readonly { field: string[] | null; message: string }[];
        };
      }>(shopDomain, accessToken, mutationById, {
        id: options.templateGid,
        ownerType: 'PRODUCT',
      });
      if (
        !this.hasBlockingStandardMetafieldDefinitionErrors(data.standardMetafieldDefinitionEnable)
      ) {
        return;
      }
    }

    if (options.namespace && options.key) {
      const data = await this.graphql<{
        standardMetafieldDefinitionEnable: {
          createdDefinition: { id: string } | null;
          userErrors: readonly { field: string[] | null; message: string }[];
        };
      }>(shopDomain, accessToken, mutationByKey, {
        namespace: options.namespace,
        key: options.key,
        ownerType: 'PRODUCT',
      });
      if (
        this.hasBlockingStandardMetafieldDefinitionErrors(data.standardMetafieldDefinitionEnable)
      ) {
        const message = (data.standardMetafieldDefinitionEnable?.userErrors ?? [])
          .map((entry) => entry.message)
          .join('; ');
        throw new InternalServerErrorException(
          `Shopify standardMetafieldDefinitionEnable (${options.namespace}.${options.key}): ${message}`,
        );
      }
      return;
    }

    throw new InternalServerErrorException(
      'Shopify standardMetafieldDefinitionEnable: template o namespace/key mancanti',
    );
  }

  private hasBlockingStandardMetafieldDefinitionErrors(
    payload: {
      userErrors: readonly { message: string }[];
    } | null,
  ): boolean {
    const userErrors = payload?.userErrors ?? [];
    const blockingErrors = userErrors.filter(
      (entry) => !isIgnorableStandardMetafieldDefinitionEnableError(entry.message),
    );
    return blockingErrors.length > 0;
  }

  async ensureStandardMetaobjectDefinitionEnabled(
    shopDomain: string,
    accessToken: string,
    metaobjectType: string,
  ): Promise<void> {
    const mutation = `
      mutation StandardMetaobjectDefinitionEnable($type: String!) {
        standardMetaobjectDefinitionEnable(type: $type) {
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.graphql<{
      standardMetaobjectDefinitionEnable: {
        userErrors: readonly { field: string[] | null; message: string }[];
      };
    }>(shopDomain, accessToken, mutation, { type: metaobjectType });

    const userErrors = data.standardMetaobjectDefinitionEnable?.userErrors ?? [];
    if (userErrors.length > 0) {
      const message = userErrors.map((entry) => entry.message).join('; ');
      throw new InternalServerErrorException(
        `Shopify standardMetaobjectDefinitionEnable (${metaobjectType}): ${message}`,
      );
    }
  }

  async upsertCategoryMetaobject(
    shopDomain: string,
    accessToken: string,
    metaobjectType: string,
    handle: string,
    fields: readonly { readonly key: string; readonly value: string }[],
  ): Promise<string | null> {
    const mutation = `
      mutation MetaobjectUpsert($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.graphql<{
      metaobjectUpsert: {
        metaobject: { id: string } | null;
        userErrors: readonly { field: string[] | null; message: string }[];
      };
    }>(shopDomain, accessToken, mutation, {
      handle: { type: metaobjectType, handle },
      metaobject: { fields: [...fields] },
    });

    this.throwOnUserErrors('metaobjectUpsert', data.metaobjectUpsert?.userErrors);

    return data.metaobjectUpsert?.metaobject?.id ?? null;
  }

  async getMetaobjectIdByHandle(
    shopDomain: string,
    accessToken: string,
    metaobjectType: string,
    handle: string,
  ): Promise<string | null> {
    const query = `
      query MetaobjectByHandle($handle: MetaobjectHandleInput!) {
        metaobjectByHandle(handle: $handle) {
          id
        }
      }
    `;

    const data = await this.graphql<{
      metaobjectByHandle: { id: string } | null;
    }>(shopDomain, accessToken, query, {
      handle: { type: metaobjectType, handle },
    });

    return data.metaobjectByHandle?.id ?? null;
  }

  async setProductMetafields(
    shopDomain: string,
    accessToken: string,
    metafields: readonly MetafieldsSetInput[],
  ): Promise<void> {
    if (metafields.length === 0) {
      return;
    }

    const mutation = `
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.graphql<{
      metafieldsSet: {
        userErrors: readonly { field: string[] | null; message: string }[];
      };
    }>(shopDomain, accessToken, mutation, { metafields: [...metafields] });

    this.throwOnUserErrors('metafieldsSet', data.metafieldsSet?.userErrors);
  }

  // ── Push catalogo (docs/24 §1.6, primo pezzo della Tranche 2) ─────────────

  /** Campi prodotto e stato di un prodotto già collegato. */
  async updateProductCatalog(
    shopDomain: string,
    accessToken: string,
    input: ShopifyProductCatalogInput,
  ): Promise<{ id: string; status: ShopifyProductStatus }> {
    const product = await this.runProductUpdate<{ id: string; status: ShopifyProductStatus }>(
      shopDomain,
      accessToken,
      { ...input },
      'id status',
    );
    if (!product) {
      throw new InternalServerErrorException('Shopify productUpdate: nessun prodotto restituito');
    }
    return product;
  }

  /** Solo lo stato: è ciò che «Sincronizza con Shopify» spento porta in ARCHIVED. */
  async setProductStatus(
    shopDomain: string,
    accessToken: string,
    productGid: string,
    status: ShopifyProductStatus,
  ): Promise<void> {
    await this.runProductUpdate(shopDomain, accessToken, { id: productGid, status }, 'id status');
  }

  /** Le varianti del prodotto: servono ad abbinare quelle locali senza id. */
  async listProductVariants(
    shopDomain: string,
    accessToken: string,
    productGid: string,
  ): Promise<readonly ShopifyRemoteVariant[]> {
    const query = `
      query ProductVariantsForLink($id: ID!) {
        product(id: $id) {
          variants(first: 250) {
            nodes {
              id
              sku
              barcode
              inventoryItem { id }
              selectedOptions { name value }
            }
          }
        }
      }
    `;
    const data = await this.graphql<{
      product: {
        variants: {
          nodes: readonly {
            id: string;
            sku: string | null;
            barcode: string | null;
            inventoryItem: { id: string } | null;
            selectedOptions: readonly { name: string; value: string }[];
          }[];
        };
      } | null;
    }>(shopDomain, accessToken, query, { id: productGid });
    return (data.product?.variants.nodes ?? []).map((node) => ({
      id: node.id,
      sku: node.sku,
      barcode: node.barcode,
      inventoryItemId: node.inventoryItem?.id ?? null,
      selectedOptions: node.selectedOptions,
    }));
  }

  /**
   * Aggiorna varianti esistenti. `allowPartialUpdates: false`: o tutte o
   * nessuna — un aggiornamento a metà lascerebbe il prodotto in uno stato che
   * nessuno ha chiesto (docs/24 §8.6).
   */
  async bulkUpdateVariants(
    shopDomain: string,
    accessToken: string,
    productGid: string,
    variants: readonly ShopifyVariantBulkInput[],
  ): Promise<void> {
    const mutation = `
      mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: false) {
          productVariants { id }
          userErrors { field message }
        }
      }
    `;
    const data = await this.graphql<{
      productVariantsBulkUpdate: {
        userErrors: readonly { field: string[] | null; message: string }[];
      } | null;
    }>(shopDomain, accessToken, mutation, { productId: productGid, variants });
    this.throwOnUserErrors('productVariantsBulkUpdate', data.productVariantsBulkUpdate?.userErrors);
  }

  /**
   * Il titolo attuale su Shopify. Serve a inizializzare il «Nome Shopify» dei
   * prodotti già collegati senza toccarlo: si legge, non si deduce.
   */
  async getProductTitle(
    shopDomain: string,
    accessToken: string,
    productGid: string,
  ): Promise<string | null> {
    const query = `
      query ProductOnlineTitle($id: ID!) {
        product(id: $id) { title }
      }
    `;
    const data = await this.graphql<{ product: { title: string } | null }>(
      shopDomain,
      accessToken,
      query,
      { id: productGid },
    );
    return data.product?.title ?? null;
  }

  /** I media già presenti: è l'insieme «prima», da cui si ricavano i nuovi per differenza. */
  async listProductMedia(
    shopDomain: string,
    accessToken: string,
    productGid: string,
  ): Promise<readonly ShopifyRemoteMedia[]> {
    const query = `
      query ProductMediaForLink($id: ID!) {
        product(id: $id) { ${MEDIA_SELECTION} }
      }
    `;
    const data = await this.graphql<{ product: { media: MediaNodes } | null }>(
      shopDomain,
      accessToken,
      query,
      { id: productGid },
    );
    return mapMedia(data.product?.media);
  }

  /**
   * Aggiunge immagini da URL con `productUpdate(media:)` — la via non
   * deprecata (`productCreateMedia` lo è). Restituisce i media del prodotto
   * DOPO l'aggiunta, per abbinare ogni immagine al suo id remoto.
   */
  async addProductMedia(
    shopDomain: string,
    accessToken: string,
    productGid: string,
    media: readonly { readonly originalSource: string; readonly alt?: string }[],
  ): Promise<readonly ShopifyRemoteMedia[]> {
    const product = await this.runProductUpdate<{ media: MediaNodes }>(
      shopDomain,
      accessToken,
      { id: productGid },
      MEDIA_SELECTION,
      media.map((entry) => ({ ...entry, mediaContentType: 'IMAGE' })),
    );
    return mapMedia(product?.media);
  }

  /**
   * `productUpdate` con controllo degli `userErrors`, in un posto solo.
   *
   * Era scritto dentro la mutation della tassonomia; il push catalogo ne
   * aveva bisogno una seconda volta, e una terza per le immagini. La
   * selezione cambia, la gestione dell'errore no.
   */
  private async runProductUpdate<T>(
    shopDomain: string,
    accessToken: string,
    product: Record<string, unknown>,
    selection: string,
    media?: readonly Record<string, unknown>[],
  ): Promise<T | null> {
    const withMedia = media !== undefined && media.length > 0;
    const mutation = `
      mutation ProductUpdate($product: ProductUpdateInput!${withMedia ? ', $media: [CreateMediaInput!]' : ''}) {
        productUpdate(product: $product${withMedia ? ', media: $media' : ''}) {
          product { ${selection} }
          userErrors { field message }
        }
      }
    `;
    const data = await this.graphql<{
      productUpdate: {
        product: T | null;
        userErrors: readonly { field: string[] | null; message: string }[];
      } | null;
    }>(shopDomain, accessToken, mutation, withMedia ? { product, media } : { product });
    this.throwOnUserErrors('productUpdate', data.productUpdate?.userErrors);
    return data.productUpdate?.product ?? null;
  }

  /** `userErrors` di una mutation → eccezione con il nome della mutation. Una volta sola. */
  private throwOnUserErrors(
    mutation: string,
    userErrors: readonly { readonly message: string }[] | undefined,
  ): void {
    if (userErrors && userErrors.length > 0) {
      const message = userErrors.map((entry) => entry.message).join('; ');
      throw new InternalServerErrorException(`Shopify ${mutation}: ${message}`);
    }
  }

  private async graphql<T>(
    shopDomain: string,
    accessToken: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const apiVersion = this.shopifyConfig.apiVersion;
    const url = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;
    const maxRetries = this.shopifyConfig.apiMaxRetries;

    for (let attempt = 0; ; attempt += 1) {
      await this.rateLimiter.beforeGraphqlRequest(shopDomain);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (response.status === 429) {
        if (attempt >= maxRetries) {
          throw new HttpException(
            'Shopify ha limitato temporaneamente le richieste API. Riprova tra qualche minuto.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        const retryAfter = parseShopifyRetryAfterHeader(response.headers.get('retry-after'));
        await response.text().catch(() => undefined);
        await this.rateLimiter.waitForRetry(shopDomain, attempt, retryAfter);
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new InternalServerErrorException(
          `Shopify GraphQL error (${response.status}): ${body.slice(0, 300)}`,
        );
      }

      const json = (await response.json()) as GraphQlResponse<T>;
      this.rateLimiter.onGraphQlCost(shopDomain, parseGraphQlCostExtensions(json.extensions));
      if (json.errors?.length) {
        throw new InternalServerErrorException(
          `Shopify GraphQL: ${json.errors.map((entry) => entry.message).join('; ')}`,
        );
      }
      if (!json.data) {
        throw new InternalServerErrorException('Shopify GraphQL: risposta senza data');
      }

      return json.data;
    }
  }
}

function isIgnorableStandardMetafieldDefinitionEnableError(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes('already') ||
    normalized.includes('enabled') ||
    normalized.includes('exists') ||
    normalized.includes('has been taken')
  );
}

type MediaNodes = { nodes: readonly { id: string }[] };

function mapMedia(media: MediaNodes | undefined): readonly ShopifyRemoteMedia[] {
  // Da quando il media porta il solo id, qui non c'è più niente da tradurre: resta
  // la normalizzazione dell'assenza, che i due chiamanti si aspettano.
  return media?.nodes ?? [];
}
