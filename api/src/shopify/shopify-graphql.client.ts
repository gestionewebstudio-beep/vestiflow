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

/**
 * Politica di vendita oltre disponibilità (docs/24 §10.4): `DENY` non vende a
 * zero, `CONTINUE` ammette l'overselling. È un dato di canale, distinto dallo
 * stato locale e dalla pubblicazione — non si usa per «nascondere» una variante.
 */
export type ShopifyInventoryPolicy = 'DENY' | 'CONTINUE';

/** Riga di `productVariantsBulkUpdate`. Un campo assente non tocca il valore remoto. */
export interface ShopifyVariantBulkInput {
  readonly id: string;
  readonly price?: string;
  readonly compareAtPrice?: string;
  readonly barcode?: string;
  readonly inventoryPolicy?: ShopifyInventoryPolicy;
  readonly inventoryItem?: { readonly sku?: string };
}

/**
 * Riga di `productVariantsBulkCreate`. Niente `id`: qui la variante non esiste
 * ancora, e `optionValues` è ciò che la distingue dalle sorelle.
 */
export interface ShopifyVariantCreateInput {
  readonly optionValues: readonly { readonly optionName: string; readonly name: string }[];
  readonly price?: string;
  readonly compareAtPrice?: string;
  readonly barcode?: string;
  readonly inventoryPolicy?: ShopifyInventoryPolicy;
  readonly inventoryItem?: { readonly sku?: string; readonly tracked?: boolean };
}

/** Prodotto da CREARE con `productSet`. ⛔ Nessun `id`: vedi `createProduct`. */
export interface ShopifyProductSetInput {
  readonly title: string;
  readonly descriptionHtml?: string;
  readonly vendor?: string;
  readonly productType?: string;
  readonly tags?: readonly string[];
  readonly status: ShopifyProductStatus;
  readonly productOptions?: readonly ShopifyProductOptionInput[];
  readonly variants?: readonly ShopifyVariantSetInput[];
}

export interface ShopifyProductOptionInput {
  readonly name: string;
  readonly position?: number;
  readonly values: readonly { readonly name: string }[];
}

/** Variante dentro `productSet`: stessa forma della creazione bulk. */
export interface ShopifyVariantSetInput {
  readonly optionValues: readonly { readonly optionName: string; readonly name: string }[];
  readonly price?: string;
  readonly compareAtPrice?: string;
  readonly barcode?: string;
  readonly inventoryPolicy?: ShopifyInventoryPolicy;
  readonly sku?: string;
}

/** Una publication del negozio (canale di vendita). */
export interface ShopifyPublication {
  readonly id: string;
  readonly name: string;
}

/** Quantità remota di un inventory item in una location, per il confronto. */
export interface ShopifyRemoteQuantity {
  readonly inventoryItemId: string;
  readonly locationId: string;
  /** `available` secondo Shopify. `null` se la location non traccia quell'item. */
  readonly available: number | null;
}

/** Una riga di `inventorySetQuantities`: quantità ASSOLUTA per item e location. */
export interface ShopifyInventoryQuantityInput {
  readonly inventoryItemId: string;
  readonly locationId: string;
  readonly quantity: number;
  /**
   * Quantità che VestiFlow crede ci sia adesso. Shopify rifiuta la scrittura se
   * nel frattempo è cambiata: è il confronto concorrenziale, non un'opzione.
   *
   * ⛔ **Si chiama `changeFromQuantity`, e il nome è quello di Shopify**: in
   *    `2026-07` `compareQuantity` non esiste più e `ignoreCompareQuantity` è
   *    stato tolto da `InventorySetQuantitiesInput` — chi vuole scrivere senza
   *    confronto OMETTE il campo, non alza una bandiera. Tenere qui un nome
   *    diverso avrebbe richiesto un mapper fra due vocabolari per la stessa
   *    cosa. Misurato per introspezione sullo shop di sviluppo il 03/09/2026.
   */
  readonly changeFromQuantity: number;
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

  // ══════════════════════════════════════════════════════════════════════════
  //  Tranche 2A — primitive del catalogo (docs/24 §8.6)
  //
  //  Tutte passano da `graphql()` e `throwOnUserErrors()`: autenticazione,
  //  throttle, retry sul 429 e traduzione degli `userErrors` restano in un
  //  posto solo. ⛔ Nessun client parallelo, nessun `fetch` scritto qui.
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * CREA un prodotto con `productSet`.
   *
   * ⛔ **Solo creazione, e la firma lo impone**: `ShopifyProductSetInput` non ha
   *    `id`, quindi questo metodo non può aggiornare nemmeno per sbaglio.
   *    `productSet` ha semantica SOSTITUTIVA sulle liste — opzioni, varianti,
   *    media: usato su un prodotto esistente con una lista parziale, Shopify
   *    **elimina** ciò che si è omesso (docs/24 §8.6). L'aggiornamento passa da
   *    `productUpdate` e dalle mutation per intenzione.
   */
  async createProduct(
    shopDomain: string,
    accessToken: string,
    input: ShopifyProductSetInput,
  ): Promise<{ id: string; status: ShopifyProductStatus }> {
    const mutation = `
      mutation ProductCreateWithSet($input: ProductSetInput!) {
        productSet(input: $input, synchronous: true) {
          product { id status }
          userErrors { field message }
        }
      }
    `;
    const data = await this.graphql<{
      productSet: {
        product: { id: string; status: ShopifyProductStatus } | null;
        userErrors: readonly { field: string[] | null; message: string }[];
      } | null;
    }>(shopDomain, accessToken, mutation, { input });
    this.throwOnUserErrors('productSet', data.productSet?.userErrors);
    const product = data.productSet?.product;
    if (!product) {
      throw new InternalServerErrorException('Shopify productSet: nessun prodotto restituito');
    }
    return product;
  }

  /** Crea varianti su un prodotto esistente. Non tocca quelle già presenti. */
  async bulkCreateVariants(
    shopDomain: string,
    accessToken: string,
    productGid: string,
    variants: readonly ShopifyVariantCreateInput[],
  ): Promise<readonly ShopifyRemoteVariant[]> {
    const mutation = `
      mutation ProductVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          productVariants {
            id
            sku
            barcode
            inventoryItem { id }
            selectedOptions { name value }
          }
          userErrors { field message }
        }
      }
    `;
    const data = await this.graphql<{
      productVariantsBulkCreate: {
        productVariants: readonly {
          id: string;
          sku: string | null;
          barcode: string | null;
          inventoryItem: { id: string } | null;
          selectedOptions: readonly { name: string; value: string }[];
        }[];
        userErrors: readonly { field: string[] | null; message: string }[];
      } | null;
    }>(shopDomain, accessToken, mutation, { productId: productGid, variants });
    this.throwOnUserErrors('productVariantsBulkCreate', data.productVariantsBulkCreate?.userErrors);
    return (data.productVariantsBulkCreate?.productVariants ?? []).map((node) => ({
      id: node.id,
      sku: node.sku,
      barcode: node.barcode,
      inventoryItemId: node.inventoryItem?.id ?? null,
      selectedOptions: node.selectedOptions,
    }));
  }

  /**
   * Aggiunge opzioni al prodotto. `variantStrategy: LEAVE_AS_IS` — le varianti
   * remote NON vengono ricreate né cancellate: è il vincolo di §8.6, e il
   * default di Shopify (`CREATE`) genererebbe combinazioni che nessuno ha chiesto.
   */
  async createProductOptions(
    shopDomain: string,
    accessToken: string,
    productGid: string,
    options: readonly ShopifyProductOptionInput[],
  ): Promise<void> {
    const mutation = `
      mutation ProductOptionsCreate($productId: ID!, $options: [OptionCreateInput!]!) {
        productOptionsCreate(productId: $productId, options: $options, variantStrategy: LEAVE_AS_IS) {
          userErrors { field message }
        }
      }
    `;
    const data = await this.graphql<{
      productOptionsCreate: {
        userErrors: readonly { field: string[] | null; message: string }[];
      } | null;
    }>(shopDomain, accessToken, mutation, { productId: productGid, options });
    this.throwOnUserErrors('productOptionsCreate', data.productOptionsCreate?.userErrors);
  }

  /**
   * Rinomina un'opzione e/o ne aggiorna i valori.
   *
   * ⛔ `variantStrategy: LEAVE_AS_IS` anche qui: `MANAGE` cancellerebbe le
   *    varianti che usano un valore rimosso. Questa tranche non elimina niente
   *    di remoto, per nessuna via.
   */
  async updateProductOption(
    shopDomain: string,
    accessToken: string,
    productGid: string,
    option: {
      readonly id: string;
      readonly name?: string;
      readonly optionValuesToAdd?: readonly { readonly name: string }[];
      readonly optionValuesToUpdate?: readonly { readonly id: string; readonly name: string }[];
    },
  ): Promise<void> {
    const mutation = `
      mutation ProductOptionUpdate(
        $productId: ID!
        $option: OptionUpdateInput!
        $optionValuesToAdd: [OptionValueCreateInput!]
        $optionValuesToUpdate: [OptionValueUpdateInput!]
      ) {
        productOptionUpdate(
          productId: $productId
          option: $option
          optionValuesToAdd: $optionValuesToAdd
          optionValuesToUpdate: $optionValuesToUpdate
          variantStrategy: LEAVE_AS_IS
        ) {
          userErrors { field message }
        }
      }
    `;
    const data = await this.graphql<{
      productOptionUpdate: {
        userErrors: readonly { field: string[] | null; message: string }[];
      } | null;
    }>(shopDomain, accessToken, mutation, {
      productId: productGid,
      option: { id: option.id, ...(option.name ? { name: option.name } : {}) },
      optionValuesToAdd: option.optionValuesToAdd,
      optionValuesToUpdate: option.optionValuesToUpdate,
    });
    this.throwOnUserErrors('productOptionUpdate', data.productOptionUpdate?.userErrors);
  }

  /**
   * Riordina le opzioni. Nessuna variante viene toccata: cambia solo la posizione.
   *
   * ⛔ **`OptionReorderInput` vuole ESATTAMENTE UNO fra `id` e `name`**, e il
   *    tipo lo impone: l'unione rende impossibile passarli insieme. La firma
   *    precedente li ammetteva entrambi e Shopify rifiutava — misurato sullo
   *    shop di sviluppo il 03/09/2026:
   *    «OptionReorderInput requires exactly one of id, name».
   */
  async reorderProductOptions(
    shopDomain: string,
    accessToken: string,
    productGid: string,
    options: readonly ({ readonly id: string } | { readonly name: string })[],
  ): Promise<void> {
    const mutation = `
      mutation ProductOptionsReorder($productId: ID!, $options: [OptionReorderInput!]!) {
        productOptionsReorder(productId: $productId, options: $options) {
          userErrors { field message }
        }
      }
    `;
    const data = await this.graphql<{
      productOptionsReorder: {
        userErrors: readonly { field: string[] | null; message: string }[];
      } | null;
    }>(shopDomain, accessToken, mutation, { productId: productGid, options });
    this.throwOnUserErrors('productOptionsReorder', data.productOptionsReorder?.userErrors);
  }

  /** Le publication del negozio: i canali su cui si può pubblicare. */
  async listPublications(
    shopDomain: string,
    accessToken: string,
  ): Promise<readonly ShopifyPublication[]> {
    const query = `
      query Publications {
        publications(first: 50) {
          nodes { id name }
        }
      }
    `;
    const data = await this.graphql<{
      publications: { nodes: readonly { id: string; name: string }[] } | null;
    }>(shopDomain, accessToken, query);
    return data.publications?.nodes ?? [];
  }

  /**
   * Pubblica una risorsa su una o più publication.
   *
   * ⭐ Il GID può essere di un PRODOTTO o di una VARIANTE: da `2026-07` anche
   *    `ProductVariant` implementa `Publishable`, ed è ciò che permette di
   *    ritirare una singola taglia **senza** toccare quantità o
   *    `inventoryPolicy` (docs/24 §10.1, §3.1).
   */
  async publishablePublish(
    shopDomain: string,
    accessToken: string,
    publishableGid: string,
    publicationIds: readonly string[],
  ): Promise<void> {
    const mutation = `
      mutation PublishablePublish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          userErrors { field message }
        }
      }
    `;
    const data = await this.graphql<{
      publishablePublish: {
        userErrors: readonly { field: string[] | null; message: string }[];
      } | null;
    }>(shopDomain, accessToken, mutation, {
      id: publishableGid,
      input: publicationIds.map((publicationId) => ({ publicationId })),
    });
    this.throwOnUserErrors('publishablePublish', data.publishablePublish?.userErrors);
  }

  /**
   * Ritira una risorsa da una o più publication: è l'atto COMMERCIALE con cui
   * una variante smette di essere acquistabile (docs/24 §10.2). ⛔ Non è una
   * cancellazione: la variante resta, e il suo GID resta risolvibile (§11.1).
   */
  async publishableUnpublish(
    shopDomain: string,
    accessToken: string,
    publishableGid: string,
    publicationIds: readonly string[],
  ): Promise<void> {
    const mutation = `
      mutation PublishableUnpublish($id: ID!, $input: [PublicationInput!]!) {
        publishableUnpublish(id: $id, input: $input) {
          userErrors { field message }
        }
      }
    `;
    const data = await this.graphql<{
      publishableUnpublish: {
        userErrors: readonly { field: string[] | null; message: string }[];
      } | null;
    }>(shopDomain, accessToken, mutation, {
      id: publishableGid,
      input: publicationIds.map((publicationId) => ({ publicationId })),
    });
    this.throwOnUserErrors('publishableUnpublish', data.publishableUnpublish?.userErrors);
  }

  /**
   * Appartenenza alle collezioni MANUALI (docs/24 §9.6): si aggiunge o si toglie
   * il prodotto, non si crea né si rinomina la collezione.
   *
   * ⚠️ Su una collezione AUTOMATICA Shopify rifiuta, ed è giusto così: là
   *    l'appartenenza la calcolano le regole del negozio, e VestiFlow la mostra
   *    soltanto. L'errore arriva come `userErrors`, con il suo messaggio.
   *
   * ⚠️ **Entrambe sono DEPRECATE in `2026-07`, e si usano lo stesso.** Shopify
   *    rimanda a `collectionUpdate` con `inclusion.selectionsToAdd`, ma in
   *    questa versione quel campo NON esiste in `CollectionInput` — e
   *    `products` è valido «only with `collectionCreate`». Non c'è altra via
   *    per cambiare l'appartenenza a una collezione manuale. Il gate di
   *    contratto porta la sveglia: la sua prova diventa rossa il giorno in cui
   *    le inclusioni compaiono nello schema (docs/24 §16, 2A lavoro 8).
   */
  async addProductToCollection(
    shopDomain: string,
    accessToken: string,
    collectionGid: string,
    productGids: readonly string[],
  ): Promise<void> {
    const mutation = `
      mutation CollectionAddProducts($id: ID!, $productIds: [ID!]!) {
        collectionAddProducts(id: $id, productIds: $productIds) {
          userErrors { field message }
        }
      }
    `;
    const data = await this.graphql<{
      collectionAddProducts: {
        userErrors: readonly { field: string[] | null; message: string }[];
      } | null;
    }>(shopDomain, accessToken, mutation, { id: collectionGid, productIds: productGids });
    this.throwOnUserErrors('collectionAddProducts', data.collectionAddProducts?.userErrors);
  }

  /** Toglie il prodotto da una collezione manuale. Il prodotto non viene toccato. */
  async removeProductFromCollection(
    shopDomain: string,
    accessToken: string,
    collectionGid: string,
    productGids: readonly string[],
  ): Promise<void> {
    const mutation = `
      mutation CollectionRemoveProducts($id: ID!, $productIds: [ID!]!) {
        collectionRemoveProducts(id: $id, productIds: $productIds) {
          userErrors { field message }
        }
      }
    `;
    const data = await this.graphql<{
      collectionRemoveProducts: {
        userErrors: readonly { field: string[] | null; message: string }[];
      } | null;
    }>(shopDomain, accessToken, mutation, { id: collectionGid, productIds: productGids });
    this.throwOnUserErrors('collectionRemoveProducts', data.collectionRemoveProducts?.userErrors);
  }

  /**
   * La quantità che Shopify ha ADESSO, per il confronto prima di scrivere.
   *
   * ⭐ Serve a `inventorySetQuantities`, che rifiuta la scrittura se il valore è
   *    cambiato: senza questa lettura non si avrebbe un `compareQuantity` da
   *    passare, e si tornerebbe a sovrascrivere alla cieca.
   */
  async getRemoteQuantities(
    shopDomain: string,
    accessToken: string,
    inventoryItemGid: string,
  ): Promise<readonly ShopifyRemoteQuantity[]> {
    const query = `
      query InventoryItemQuantities($id: ID!) {
        inventoryItem(id: $id) {
          id
          inventoryLevels(first: 250) {
            nodes {
              location { id }
              quantities(names: ["available"]) { name quantity }
            }
          }
        }
      }
    `;
    const data = await this.graphql<{
      inventoryItem: {
        id: string;
        inventoryLevels: {
          nodes: readonly {
            location: { id: string };
            quantities: readonly { name: string; quantity: number }[];
          }[];
        };
      } | null;
    }>(shopDomain, accessToken, query, { id: inventoryItemGid });

    const item = data.inventoryItem;
    if (!item) {
      return [];
    }
    return item.inventoryLevels.nodes.map((node) => ({
      inventoryItemId: item.id,
      locationId: node.location.id,
      available: node.quantities.find((q) => q.name === 'available')?.quantity ?? null,
    }));
  }

  /**
   * Scrive le giacenze come quantità ASSOLUTE (docs/24 §10.5).
   *
   * ⛔ **Il confronto si dichiara SEMPRE** (`changeFromQuantity`): è il modo in
   *    cui due scritture concorrenti non si sovrascrivono in silenzio. Se la
   *    quantità remota è cambiata dopo la lettura, Shopify rifiuta e l'errore
   *    arriva come `userErrors` — che è ciò che si vuole sapere.
   *
   * ⚠️ **Qui c'era `ignoreCompareQuantity: false`, e in `2026-07` quel campo NON
   *    ESISTE**: `InventorySetQuantitiesInput` non lo dichiara, quindi mandarlo
   *    fa rifiutare l'intera mutation. Il contratto è cambiato di forma — non si
   *    alza più una bandiera per saltare il confronto: si OMETTE il campo. Il
   *    tipo lo rende obbligatorio proprio perché ometterlo sia una decisione.
   *
   * ⚠️ **`referenceDocumentUri` è obbligatorio** e deve essere riconducibile a
   *    VestiFlow: è ciò che rende la scrittura auditabile nell'admin Shopify.
   *
   * ⭐ **L'idempotency key la richiede `2026-07`**: la stessa chiave sulla stessa
   *    richiesta non applica l'effetto due volte. La decide il chiamante, che è
   *    l'unico a sapere quale operazione sta ripetendo.
   *
   * ⛔ **`@idempotent` sta sul CAMPO, non sull'operazione.** Lo schema la dichiara
   *    valida solo in posizione `FIELD`: scritta dopo le variabili della
   *    `mutation` viene rifiutata con «'@idempotent' can't be applied to
   *    mutations (allowed: fields)». Misurato sullo shop di sviluppo il
   *    03/09/2026 — nessun test con mock poteva accorgersene.
   */
  async setInventoryQuantities(
    shopDomain: string,
    accessToken: string,
    input: {
      readonly reason: string;
      readonly referenceDocumentUri: string;
      readonly idempotencyKey: string;
      readonly quantities: readonly ShopifyInventoryQuantityInput[];
    },
  ): Promise<void> {
    const mutation = `
      mutation InventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
        inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
          userErrors { field message }
        }
      }
    `;
    const data = await this.graphql<{
      inventorySetQuantities: {
        userErrors: readonly { field: string[] | null; message: string }[];
      } | null;
    }>(shopDomain, accessToken, mutation, {
      idempotencyKey: input.idempotencyKey,
      input: {
        name: 'available',
        reason: input.reason,
        referenceDocumentUri: input.referenceDocumentUri,
        quantities: input.quantities.map((entry) => ({
          inventoryItemId: entry.inventoryItemId,
          locationId: entry.locationId,
          quantity: entry.quantity,
          changeFromQuantity: entry.changeFromQuantity,
        })),
      },
    });
    this.throwOnUserErrors('inventorySetQuantities', data.inventorySetQuantities?.userErrors);
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
