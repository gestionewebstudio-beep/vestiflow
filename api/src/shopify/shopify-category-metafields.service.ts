import { Injectable, Logger } from '@nestjs/common';

import type { ShopifyCategoryMetafieldValue } from './shopify-category-metafields.types';
import {
  isShopifyCategoryMetafield,
  parseCategoryMetafieldsJson,
  parseMetafieldGidList,
  serializeMetaobjectGidList,
  serializeTaxonomyValueListGids,
} from './shopify-category-metafields.util';
import type { MetafieldsSetInput } from './shopify-graphql.client';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import type { ShopifyMetafieldRef } from './shopify-product-metadata.types';
import { ShopifyOAuthService } from './shopify-oauth.service';

@Injectable()
export class ShopifyCategoryMetafieldsService {
  private readonly logger = new Logger(ShopifyCategoryMetafieldsService.name);

  constructor(
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyGraphql: ShopifyGraphqlClient,
  ) {}

  parseStored(raw: unknown): ShopifyCategoryMetafieldValue[] {
    return parseCategoryMetafieldsJson(raw);
  }

  async parseFromProductMetafields(
    shopDomain: string,
    accessToken: string,
    metafields: readonly ShopifyMetafieldRef[],
    categoryGid: string | null,
  ): Promise<ShopifyCategoryMetafieldValue[]> {
    const categoryFields = metafields.filter(isShopifyCategoryMetafield);
    if (categoryFields.length === 0) {
      return [];
    }

    const attributes = categoryGid
      ? await this.shopifyGraphql
          .getCategoryAttributes(shopDomain, accessToken, categoryGid)
          .catch(() => [])
      : [];

    const attributeByKey = new Map(attributes.map((entry) => [entry.key, entry]));
    const metaobjectGids = categoryFields.flatMap((field) => parseMetafieldGidList(field.value));
    const metaobjects = metaobjectGids.some((gid) => gid.includes('/Metaobject/'))
      ? await this.shopifyGraphql.resolveMetaobjects(shopDomain, accessToken, metaobjectGids)
      : [];

    const taxonomyNamesById = new Map<string, string>();
    for (const attribute of attributes) {
      for (const value of attribute.values) {
        taxonomyNamesById.set(value.id, value.name);
      }
    }

    return categoryFields.flatMap((field) => {
      const attribute = attributeByKey.get(field.key);
      const gids = parseMetafieldGidList(field.value);
      const taxonomyValues = this.extractTaxonomyValues(gids, metaobjects, taxonomyNamesById);

      if (taxonomyValues.length === 0) {
        return [];
      }

      return [
        {
          attributeId: attribute?.id ?? `unknown:${field.key}`,
          attributeName: attribute?.name ?? field.key,
          namespace: field.namespace,
          key: field.key,
          metafieldType: attribute?.metafieldType ?? field.type ?? 'list.metaobject_reference',
          values: taxonomyValues,
        },
      ];
    });
  }

  async pushProductCategoryMetafields(
    tenantId: string,
    shopifyProductId: string,
    categoryMetafields: readonly ShopifyCategoryMetafieldValue[],
  ): Promise<void> {
    if (categoryMetafields.length === 0) {
      return;
    }

    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    const productGid = shopifyProductId.startsWith('gid://')
      ? shopifyProductId
      : `gid://shopify/Product/${shopifyProductId}`;

    const inputs: MetafieldsSetInput[] = [];

    for (const field of categoryMetafields) {
      if (field.values.length === 0) {
        continue;
      }

      try {
        const payload = await this.buildMetafieldSetInput(
          shopDomain,
          accessToken,
          productGid,
          shopifyProductId,
          field,
        );
        if (payload) {
          inputs.push(payload);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Push category metafield fallito';
        this.logger.warn(
          `Category metafield ${field.key} non sincronizzato (${shopifyProductId}): ${message}`,
        );
      }
    }

    if (inputs.length > 0) {
      await this.shopifyGraphql.setProductMetafields(shopDomain, accessToken, inputs);
    }
  }

  private async buildMetafieldSetInput(
    shopDomain: string,
    accessToken: string,
    productGid: string,
    shopifyProductId: string,
    field: ShopifyCategoryMetafieldValue,
  ): Promise<MetafieldsSetInput | null> {
    const type = field.metafieldType || 'list.metaobject_reference';

    if (type.includes('product_taxonomy_value_reference')) {
      return {
        ownerId: productGid,
        namespace: field.namespace,
        key: field.key,
        type,
        value: serializeTaxonomyValueListGids(field.values),
      };
    }

    if (!type.includes('metaobject_reference')) {
      return null;
    }

    const metaobjectType = `shopify--${field.key}`;
    const metaobjectGids: string[] = [];

    for (const taxonomyValue of field.values) {
      const handle = `${field.key}-${taxonomyValue.id.replace(/\W+/g, '-')}-${shopifyProductId.slice(0, 8)}`;
      const metaobjectId = await this.shopifyGraphql.upsertCategoryMetaobject(
        shopDomain,
        accessToken,
        metaobjectType,
        handle.slice(0, 240),
        [{ key: 'taxonomy_reference', value: taxonomyValue.id }],
      );
      if (metaobjectId) {
        metaobjectGids.push(metaobjectId);
      }
    }

    if (metaobjectGids.length === 0) {
      return null;
    }

    return {
      ownerId: productGid,
      namespace: field.namespace,
      key: field.key,
      type,
      value: serializeMetaobjectGidList(metaobjectGids),
    };
  }

  private extractTaxonomyValues(
    gids: readonly string[],
    metaobjects: readonly {
      readonly id: string;
      readonly fields: readonly { readonly key: string; readonly value: string | null }[];
    }[],
    taxonomyNamesById: ReadonlyMap<string, string>,
  ): { id: string; name: string }[] {
    const metaobjectById = new Map(metaobjects.map((entry) => [entry.id, entry]));
    const results: { id: string; name: string }[] = [];
    const seen = new Set<string>();

    for (const gid of gids) {
      if (gid.includes('/TaxonomyValue/')) {
        if (!seen.has(gid)) {
          seen.add(gid);
          results.push({ id: gid, name: taxonomyNamesById.get(gid) ?? gid });
        }
        continue;
      }

      if (!gid.includes('/Metaobject/')) {
        continue;
      }

      const metaobject = metaobjectById.get(gid);
      if (!metaobject) {
        continue;
      }

      for (const metaField of metaobject.fields) {
        if (!metaField.key.includes('taxonomy_reference') || !metaField.value) {
          continue;
        }
        const taxonomyGids = parseMetafieldGidList(metaField.value);
        for (const taxonomyGid of taxonomyGids) {
          if (!seen.has(taxonomyGid)) {
            seen.add(taxonomyGid);
            results.push({
              id: taxonomyGid,
              name: taxonomyNamesById.get(taxonomyGid) ?? taxonomyGid,
            });
          }
        }
      }
    }

    return results;
  }
}
