import { Injectable, Logger } from '@nestjs/common';

import type { ShopifyCategoryMetafieldValue } from './shopify-category-metafields.types';
import {
  buildStandardMetaobjectType,
  buildCategoryMetaobjectFieldsPayload,
  isDirectTaxonomyMetafieldType,
  isMetaobjectReferenceMetafieldType,
  isShopifyCategoryMetafield,
  parseCategoryMetafieldsJson,
  parseMetafieldGidList,
  pickMetaobjectTaxonomyFieldKey,
  pickPreferredTaxonomyValueId,
  resolveSecondaryTaxonomyGidForMetaobjectField,
  serializeMetaobjectGidList,
  serializeTaxonomyValueListGids,
  standardMetafieldDefinitionTemplateGid,
} from './shopify-category-metafields.util';
import type { MetafieldsSetInput } from './shopify-graphql.client';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import type { ShopifyMetafieldRef } from './shopify-product-metadata.types';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { SHOPIFY_WRITE_METAOBJECTS_SCOPE, shopifyHasScope } from './shopify-scopes.util';

export interface ShopifyCategoryMetafieldsPushResult {
  readonly attempted: number;
  readonly synced: number;
  readonly warning: string | null;
}

@Injectable()
export class ShopifyCategoryMetafieldsService {
  private readonly logger = new Logger(ShopifyCategoryMetafieldsService.name);
  private readonly metaobjectFieldKeyCache = new Map<string, string>();
  private readonly metafieldDefinitionEnabledCache = new Set<string>();

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
    categoryGid: string | null,
  ): Promise<ShopifyCategoryMetafieldsPushResult> {
    const attempted = categoryMetafields.filter((field) => field.values.length > 0).length;
    if (attempted === 0) {
      return { attempted: 0, synced: 0, warning: null };
    }

    const { shopDomain, accessToken, scopes } =
      await this.shopifyOAuth.getAccessTokenWithScopes(tenantId);
    if (!shopifyHasScope(scopes, SHOPIFY_WRITE_METAOBJECTS_SCOPE)) {
      const warning =
        `Attributi categoria non sincronizzati: manca il permesso ${SHOPIFY_WRITE_METAOBJECTS_SCOPE}. ` +
        'Aggiorna SHOPIFY_SCOPES, riconnetti Shopify da Impostazioni e ri-sincronizza.';
      this.logger.warn(`Category metafields non sincronizzati (${shopifyProductId}): ${warning}`);
      return { attempted, synced: 0, warning };
    }

    const productGid = shopifyProductId.startsWith('gid://')
      ? shopifyProductId
      : `gid://shopify/Product/${shopifyProductId}`;

    const categoryAttributes =
      categoryGid != null
        ? await this.shopifyGraphql
            .getCategoryAttributes(shopDomain, accessToken, categoryGid)
            .catch(() => [])
        : [];

    const inputs: MetafieldsSetInput[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];

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
          categoryAttributes,
        );
        if (payload) {
          inputs.push(payload);
        } else {
          skipped.push(field.key);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Push category metafield fallito';
        failed.push(field.key);
        this.logger.warn(
          `Category metafield ${field.key} non sincronizzato (${shopifyProductId}): ${message}`,
        );
      }
    }

    if (skipped.length > 0) {
      this.logger.warn(
        `Category metafields saltati (${shopifyProductId}): ${skipped.join(', ')} (tipo non supportato o metaobject non creato)`,
      );
    }
    if (failed.length > 0) {
      this.logger.warn(`Category metafields falliti (${shopifyProductId}): ${failed.join(', ')}`);
    }

    if (inputs.length > 0) {
      await this.shopifyGraphql.setProductMetafields(shopDomain, accessToken, inputs);
    }

    let warning: string | null = null;
    if (inputs.length === 0) {
      warning =
        'Nessun attributo categoria inviato a Shopify. Verifica permessi write_metaobjects e ri-sincronizza.';
      this.logger.warn(`${warning} (${shopifyProductId})`);
    } else if (skipped.length > 0 || failed.length > 0 || inputs.length < attempted) {
      const parts = [...failed, ...skipped];
      warning = `Alcuni attributi categoria non sono stati sincronizzati su Shopify (${parts.join(', ') || 'parziale'}).`;
    }

    return { attempted, synced: inputs.length, warning };
  }

  private async buildMetafieldSetInput(
    shopDomain: string,
    accessToken: string,
    productGid: string,
    shopifyProductId: string,
    field: ShopifyCategoryMetafieldValue,
    categoryAttributes: readonly {
      readonly id: string;
      readonly name: string;
      readonly key: string;
      readonly namespace: string;
      readonly metafieldType: string;
      readonly values: readonly { readonly id: string; readonly name: string }[];
    }[],
  ): Promise<MetafieldsSetInput | null> {
    await this.ensureCategoryMetafieldDefinitionEnabled(shopDomain, accessToken, field);

    const type = field.metafieldType || 'list.metaobject_reference';

    if (isDirectTaxonomyMetafieldType(type)) {
      return {
        ownerId: productGid,
        namespace: field.namespace,
        key: field.key,
        type,
        value: serializeTaxonomyValueListGids(field.values),
      };
    }

    if (!isMetaobjectReferenceMetafieldType(type)) {
      this.logger.warn(
        `Tipo metafield categoria non gestito (${field.key}: ${type}) per prodotto ${shopifyProductId}`,
      );
      return null;
    }

    const metaobjectType = buildStandardMetaobjectType(field.key);
    const fieldDefinitions = await this.loadMetaobjectFieldDefinitions(
      shopDomain,
      accessToken,
      metaobjectType,
    );
    const taxonomyFieldKey = pickMetaobjectTaxonomyFieldKey(
      field.key,
      field.attributeName,
      fieldDefinitions,
    );
    if (!taxonomyFieldKey) {
      throw new Error(`Campo taxonomy non trovato per metaobject ${metaobjectType}`);
    }

    const metaobjectGids: string[] = [];

    for (const taxonomyValue of field.values) {
      const secondaryTaxonomyByFieldKey = new Map<string, string>();
      for (const definition of fieldDefinitions) {
        if (definition.key === taxonomyFieldKey) {
          continue;
        }
        if (!definition.typeName.toLowerCase().includes('taxonomy')) {
          continue;
        }
        const secondaryGid = resolveSecondaryTaxonomyGidForMetaobjectField(
          definition.key,
          categoryAttributes,
        );
        if (secondaryGid) {
          secondaryTaxonomyByFieldKey.set(definition.key, secondaryGid);
        }
      }

      for (const definition of fieldDefinitions) {
        if (
          definition.key === taxonomyFieldKey ||
          !definition.typeName.toLowerCase().includes('taxonomy')
        ) {
          continue;
        }
        if (secondaryTaxonomyByFieldKey.has(definition.key)) {
          continue;
        }
        const fallbackGid = await this.resolveFallbackSecondaryTaxonomyGid(
          shopDomain,
          accessToken,
          definition.key,
        );
        if (fallbackGid) {
          secondaryTaxonomyByFieldKey.set(definition.key, fallbackGid);
        }
      }

      const metaobjectFields = buildCategoryMetaobjectFieldsPayload(
        fieldDefinitions,
        taxonomyFieldKey,
        taxonomyValue,
        secondaryTaxonomyByFieldKey,
      );
      const handle = `${field.key}-${taxonomyValue.id.replace(/\W+/g, '-')}-${shopifyProductId.slice(0, 8)}`;
      const metaobjectId = await this.shopifyGraphql.upsertCategoryMetaobject(
        shopDomain,
        accessToken,
        metaobjectType,
        handle.slice(0, 240),
        metaobjectFields,
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

  private async loadMetaobjectFieldDefinitions(
    shopDomain: string,
    accessToken: string,
    metaobjectType: string,
  ): Promise<
    readonly { readonly key: string; readonly typeName: string; readonly required: boolean }[]
  > {
    let fieldDefinitions = await this.shopifyGraphql.getMetaobjectDefinitionFieldDefinitions(
      shopDomain,
      accessToken,
      metaobjectType,
    );

    if (fieldDefinitions.length === 0) {
      await this.shopifyGraphql.ensureStandardMetaobjectDefinitionEnabled(
        shopDomain,
        accessToken,
        metaobjectType,
      );
      fieldDefinitions = await this.shopifyGraphql.getMetaobjectDefinitionFieldDefinitions(
        shopDomain,
        accessToken,
        metaobjectType,
      );
    }

    return fieldDefinitions;
  }

  private async resolveMetaobjectTaxonomyFieldKey(
    shopDomain: string,
    accessToken: string,
    metaobjectType: string,
    attributeKey: string,
    attributeName: string,
  ): Promise<string | null> {
    const cacheKey = `${shopDomain}:${metaobjectType}:${attributeKey}:${attributeName}`;
    const cached = this.metaobjectFieldKeyCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const fieldDefinitions = await this.loadMetaobjectFieldDefinitions(
      shopDomain,
      accessToken,
      metaobjectType,
    );

    const picked = pickMetaobjectTaxonomyFieldKey(attributeKey, attributeName, fieldDefinitions);
    if (picked) {
      this.metaobjectFieldKeyCache.set(cacheKey, picked);
    }
    return picked;
  }

  private async ensureCategoryMetafieldDefinitionEnabled(
    shopDomain: string,
    accessToken: string,
    field: ShopifyCategoryMetafieldValue,
  ): Promise<void> {
    const templateGid = standardMetafieldDefinitionTemplateGid(field.attributeId);
    const cacheKey = `${shopDomain}:${field.namespace}.${field.key}:${templateGid ?? 'key'}`;
    if (this.metafieldDefinitionEnabledCache.has(cacheKey)) {
      return;
    }

    await this.shopifyGraphql.ensureStandardMetafieldDefinitionEnabled(shopDomain, accessToken, {
      templateGid: templateGid ?? undefined,
      namespace: field.namespace,
      key: field.key,
    });
    this.metafieldDefinitionEnabledCache.add(cacheKey);
  }

  private async resolveFallbackSecondaryTaxonomyGid(
    shopDomain: string,
    accessToken: string,
    fieldKey: string,
  ): Promise<string | null> {
    const fieldNorm = fieldKey.toLowerCase();
    const searchTerms = fieldNorm.includes('pattern')
      ? ['solid', 'plain', 'unicolor']
      : [fieldKey.replace(/_/g, ' ')];

    for (const term of searchTerms) {
      const values = await this.shopifyGraphql.searchTaxonomyValues(shopDomain, accessToken, term);
      const picked = pickPreferredTaxonomyValueId(values, [term, 'solid', 'plain']);
      if (picked) {
        return picked;
      }
    }

    return null;
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
        if (!metaField.key.toLowerCase().includes('taxonomy') || !metaField.value) {
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
