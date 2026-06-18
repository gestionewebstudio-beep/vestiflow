import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { ShopifyConfigService } from './shopify-config.service';
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
    const attributes: ShopifyTaxonomyCategoryAttribute[] = [];

    for (const node of nodes) {
      if (!node.id || !node.name) {
        continue;
      }
      const definition = await this.getStandardMetafieldDefinitionForAttribute(
        shopDomain,
        accessToken,
        node.id,
      );
      if (!definition) {
        continue;
      }
      attributes.push({
        id: node.id,
        name: node.name,
        namespace: definition.namespace,
        key: definition.key,
        metafieldType: definition.typeName,
        values: node.values?.nodes ?? [],
      });
    }

    return attributes;
  }

  async getStandardMetafieldDefinitionForAttribute(
    shopDomain: string,
    accessToken: string,
    attributeGid: string,
  ): Promise<ShopifyStandardMetafieldDefinition | null> {
    const match = /TaxonomyAttribute\/(\d+)/.exec(attributeGid);
    if (!match?.[1]) {
      return null;
    }
    const definitionGid = `gid://shopify/StandardMetafieldDefinition/${Number.parseInt(match[1], 10) + 10_000}`;

    const query = `
      query StandardMetafieldDefinition($id: ID!) {
        node(id: $id) {
          ... on StandardMetafieldDefinition {
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
      node: {
        id: string;
        name: string;
        key: string;
        namespace: string;
        type: { name: string };
      } | null;
    }>(shopDomain, accessToken, query, { id: definitionGid });

    if (!data.node) {
      return null;
    }

    return {
      id: data.node.id,
      name: data.node.name,
      key: data.node.key,
      namespace: data.node.namespace,
      typeName: data.node.type.name,
    };
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
