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
} from './shopify-category-metafields.util';
import { ShopifyRateLimiterService } from './shopify-rate-limiter.service';
import { parseShopifyRetryAfterHeader } from './shopify-rate-limiter.util';

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
}

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
    const productGid = toProductGid(shopifyProductId);
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
    const productGid = toProductGid(shopifyProductId);
    const mutation = `
      mutation ProductUpdateTaxonomyCategory($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            category {
              id
              name
              fullName
              isLeaf
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const product: Record<string, unknown> = { id: productGid };
    if (categoryGid) {
      product['category'] = categoryGid;
    }

    const data = await this.graphql<{
      productUpdate: {
        product: { category: ShopifyTaxonomyCategory | null } | null;
        userErrors: readonly { field: string[] | null; message: string }[];
      };
    }>(shopDomain, accessToken, mutation, { product });

    const userErrors = data.productUpdate?.userErrors ?? [];
    if (userErrors.length > 0) {
      const message = userErrors.map((entry) => entry.message).join('; ');
      throw new InternalServerErrorException(`Shopify productUpdate: ${message}`);
    }

    return data.productUpdate?.product?.category ?? null;
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

    const templateByAttributeId = await this.resolveStandardMetafieldTemplatesForAttributes(
      shopDomain,
      accessToken,
      choiceListNodes.map((node) => node.id),
    );

    return choiceListNodes.flatMap((node) => {
      const definition = templateByAttributeId.get(node.id);
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

    const userErrors = data.metaobjectUpsert?.userErrors ?? [];
    if (userErrors.length > 0) {
      const message = userErrors.map((entry) => entry.message).join('; ');
      throw new InternalServerErrorException(`Shopify metaobjectUpsert: ${message}`);
    }

    return data.metaobjectUpsert?.metaobject?.id ?? null;
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

    const userErrors = data.metafieldsSet?.userErrors ?? [];
    if (userErrors.length > 0) {
      const message = userErrors.map((entry) => entry.message).join('; ');
      throw new InternalServerErrorException(`Shopify metafieldsSet: ${message}`);
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
      await this.rateLimiter.beforeRequest(shopDomain);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      this.rateLimiter.onCallLimitHeader(
        shopDomain,
        response.headers.get('x-shopify-shop-api-call-limit'),
      );

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

function toProductGid(shopifyProductId: string): string {
  return shopifyProductId.startsWith('gid://')
    ? shopifyProductId
    : `gid://shopify/Product/${shopifyProductId}`;
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
