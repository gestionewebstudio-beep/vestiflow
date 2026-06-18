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
