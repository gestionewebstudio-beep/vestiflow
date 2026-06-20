import type { ShopifyMetafieldRef } from './shopify-product-metadata.types';
import type { ShopifyCategoryMetafieldValue } from './shopify-category-metafields.types';
import { SHOPIFY_CATEGORY_METAFIELD_NAMESPACE } from './shopify-category-metafields.types';

function parseStoredShopifyMetafields(raw: unknown): ShopifyMetafieldRef[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }
    const row = entry as Record<string, unknown>;
    const namespace = typeof row['namespace'] === 'string' ? row['namespace'] : '';
    const key = typeof row['key'] === 'string' ? row['key'] : '';
    const value = typeof row['value'] === 'string' ? row['value'] : '';
    const type = typeof row['type'] === 'string' ? row['type'] : undefined;
    if (!namespace || !key) {
      return [];
    }
    return [{ namespace, key, value, type }];
  });
}

/**
 * Durante import/webhook l'enrichment può tornare `[]` se il webhook arriva prima
 * del push dei category metafields: in quel caso conserviamo i valori già salvati
 * in VestiFlow invece di cancellarli.
 */
export function resolveImportedShopifyCategoryMetafields(
  enrichmentCategoryMetafields: readonly ShopifyCategoryMetafieldValue[] | undefined,
  existingRaw: unknown,
): ShopifyCategoryMetafieldValue[] {
  if (enrichmentCategoryMetafields && enrichmentCategoryMetafields.length > 0) {
    return [...enrichmentCategoryMetafields];
  }
  return parseCategoryMetafieldsJson(existingRaw);
}

/** Stessa logica del merge category metafields, applicata allo snapshot metafield grezzo. */
export function resolveImportedShopifyMetafields(
  enrichmentMetafields: readonly ShopifyMetafieldRef[] | undefined,
  existingRaw: unknown,
): ShopifyMetafieldRef[] {
  if (enrichmentMetafields && enrichmentMetafields.length > 0) {
    return [...enrichmentMetafields];
  }
  return parseStoredShopifyMetafields(existingRaw);
}

export function isShopifyCategoryMetafield(metafield: ShopifyMetafieldRef): boolean {
  return metafield.namespace === SHOPIFY_CATEGORY_METAFIELD_NAMESPACE;
}

export function parseMetafieldGidList(raw: string): readonly string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return trimmed.startsWith('gid://') ? [trimmed] : [];
    }
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  } catch {
    return trimmed.startsWith('gid://') ? [trimmed] : [];
  }
}

export function parseCategoryMetafieldsJson(raw: unknown): ShopifyCategoryMetafieldValue[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }
    const row = entry as Record<string, unknown>;
    const attributeId = typeof row['attributeId'] === 'string' ? row['attributeId'] : '';
    const attributeName = typeof row['attributeName'] === 'string' ? row['attributeName'] : '';
    const namespace = typeof row['namespace'] === 'string' ? row['namespace'] : '';
    const key = typeof row['key'] === 'string' ? row['key'] : '';
    const metafieldType = typeof row['metafieldType'] === 'string' ? row['metafieldType'] : '';
    const valuesRaw = row['values'];
    const values = Array.isArray(valuesRaw)
      ? valuesRaw.flatMap((value) => {
          if (typeof value !== 'object' || value === null) {
            return [];
          }
          const item = value as Record<string, unknown>;
          const id = typeof item['id'] === 'string' ? item['id'] : '';
          const name = typeof item['name'] === 'string' ? item['name'] : '';
          return id ? [{ id, name: name || id }] : [];
        })
      : [];

    if (!attributeId || !key || !namespace) {
      return [];
    }

    return [
      {
        attributeId,
        attributeName: attributeName || key,
        namespace,
        key,
        metafieldType,
        values,
      },
    ];
  });
}

export function taxonomyAttributeNumericId(attributeGid: string): number | null {
  const match = /TaxonomyAttribute\/(\d+)/.exec(attributeGid);
  if (!match?.[1]) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function standardMetafieldDefinitionTemplateGid(attributeGid: string): string | null {
  const numericId = taxonomyAttributeNumericId(attributeGid);
  if (numericId == null) {
    return null;
  }
  return `gid://shopify/StandardMetafieldDefinitionTemplate/${numericId + 10_000}`;
}

export function templateNumericIdToAttributeNumericId(templateGid: string): number | null {
  const match = /StandardMetafieldDefinitionTemplate\/(\d+)/.exec(templateGid);
  if (!match?.[1]) {
    return null;
  }
  const templateNumericId = Number.parseInt(match[1], 10);
  if (!Number.isFinite(templateNumericId) || templateNumericId < 10_000) {
    return null;
  }
  return templateNumericId - 10_000;
}

export function serializeTaxonomyValueListGids(values: readonly { readonly id: string }[]): string {
  return JSON.stringify(values.map((entry) => entry.id));
}

export function serializeMetaobjectGidList(gids: readonly string[]): string {
  return JSON.stringify([...gids]);
}

export function buildStandardMetaobjectType(metafieldKey: string): string {
  return `shopify--${metafieldKey.trim()}`;
}

function normalizeTaxonomyLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Abbina un attributo taxonomy al template metafield standard della categoria. */
export function matchCategoryAttributeToMetafieldTemplate(
  attributeName: string,
  templates: readonly {
    readonly id: string;
    readonly name: string;
    readonly key: string;
    readonly namespace: string;
    readonly typeName: string;
  }[],
): {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly namespace: string;
  readonly typeName: string;
} | null {
  const attributeNorm = normalizeTaxonomyLabel(attributeName);
  if (!attributeNorm) {
    return null;
  }

  const shopifyTemplates = templates.filter(
    (template) => template.namespace === SHOPIFY_CATEGORY_METAFIELD_NAMESPACE,
  );
  if (shopifyTemplates.length === 0) {
    return null;
  }

  let best: (typeof shopifyTemplates)[number] | null = null;
  let bestScore = 0;

  for (const template of shopifyTemplates) {
    const templateNorm = normalizeTaxonomyLabel(template.name);
    if (!templateNorm) {
      continue;
    }

    if (templateNorm === attributeNorm) {
      return template;
    }

    let score = 0;
    if (templateNorm.includes(attributeNorm) || attributeNorm.includes(templateNorm)) {
      score = Math.min(templateNorm.length, attributeNorm.length) + 10;
    } else {
      const attributeTokens = attributeNorm.split(' ').filter(Boolean);
      const templateTokens = templateNorm.split(' ').filter(Boolean);
      score = attributeTokens.filter((token) =>
        templateTokens.some((entry) => entry.includes(token) || token.includes(entry)),
      ).length;
    }

    if (score > bestScore) {
      bestScore = score;
      best = template;
    }
  }

  return bestScore > 0 ? best : null;
}

/**
 * Allinea metafield salvati (namespace/key/type) alle definizioni corrette della categoria.
 * Ripara prodotti creati con mapping template obsoleto (attributeId + 10000).
 */
export function reconcileCategoryMetafieldsWithAttributes(
  stored: readonly ShopifyCategoryMetafieldValue[],
  attributes: readonly {
    readonly id: string;
    readonly name: string;
    readonly namespace: string;
    readonly key: string;
    readonly metafieldType: string;
  }[],
): ShopifyCategoryMetafieldValue[] {
  const attributeById = new Map(attributes.map((entry) => [entry.id, entry]));

  return stored.flatMap((field) => {
    if (field.values.length === 0) {
      return [];
    }
    const attribute = attributeById.get(field.attributeId);
    if (!attribute) {
      return [field];
    }
    return [
      {
        ...field,
        attributeName: attribute.name,
        namespace: attribute.namespace,
        key: attribute.key,
        metafieldType: attribute.metafieldType,
      },
    ];
  });
}

export function isDirectTaxonomyMetafieldType(type: string): boolean {
  const normalized = type.trim().toLowerCase();
  return (
    normalized.includes('product_taxonomy_value_reference') ||
    normalized.includes('taxonomy_value_reference')
  );
}

export function isMetaobjectReferenceMetafieldType(type: string): boolean {
  return type.trim().toLowerCase().includes('metaobject_reference');
}

/** Qualifica il tipo metafield con il metaobject standard Shopify (richiesto da metafieldsSet). */
export function qualifyMetaobjectReferenceMetafieldType(
  metafieldType: string,
  metaobjectType: string,
): string {
  const normalized = metafieldType.trim();
  if (normalized.includes('<')) {
    return normalized;
  }

  const lower = normalized.toLowerCase();
  if (lower === 'list.metaobject_reference') {
    return `list.metaobject_reference<${metaobjectType}>`;
  }
  if (lower === 'metaobject_reference') {
    return `metaobject_reference<${metaobjectType}>`;
  }
  return normalized;
}

export interface MetaobjectTaxonomyFieldCandidate {
  readonly key: string;
  readonly typeName: string;
  readonly required?: boolean;
}

const DEFAULT_SECONDARY_TAXONOMY_VALUE_NAMES = [
  'solid',
  'plain',
  'unicolor',
  'uni',
  'tinta unita',
] as const;

function isTaxonomyReferenceMetaobjectFieldType(typeName: string): boolean {
  return typeName.trim().toLowerCase().includes('taxonomy');
}

/** Campo taxonomy primario noto per metaobject standard Shopify (metafield key → field key). */
const PRIMARY_TAXONOMY_FIELD_BY_METAFIELD_KEY: Readonly<Record<string, string>> = {
  'color-pattern': 'color_taxonomy_reference',
};

/** Sceglie il campo taxonomy dentro uno standard metaobject (es. color_taxonomy_reference). */
export function pickMetaobjectTaxonomyFieldKey(
  attributeKey: string,
  attributeName: string,
  candidates: readonly MetaobjectTaxonomyFieldCandidate[],
): string | null {
  const taxonomyFields = candidates.filter((field) =>
    isTaxonomyReferenceMetaobjectFieldType(field.typeName),
  );
  if (taxonomyFields.length === 0) {
    return null;
  }
  if (taxonomyFields.length === 1) {
    return taxonomyFields[0]?.key ?? null;
  }

  const explicitPrimary = PRIMARY_TAXONOMY_FIELD_BY_METAFIELD_KEY[attributeKey.toLowerCase()];
  if (explicitPrimary && taxonomyFields.some((field) => field.key === explicitPrimary)) {
    return explicitPrimary;
  }

  const keyTokens = attributeKey
    .toLowerCase()
    .split('-')
    .map((token) => token.trim())
    .filter(Boolean);
  const nameTokens = attributeName
    .toLowerCase()
    .split(/[\s-/]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const attributeKeyNorm = attributeKey.toLowerCase();
  const attributeNameNorm = attributeName.toLowerCase();
  const isColorAttribute =
    attributeKeyNorm.includes('color') ||
    attributeNameNorm.includes('color') ||
    attributeNameNorm.includes('colore');

  let bestKey: string | null = null;
  let bestScore = -1;

  for (const field of taxonomyFields) {
    const fieldNorm = field.key.toLowerCase().replace(/_/g, '-');
    let score = 0;
    for (const token of nameTokens) {
      if (fieldNorm.includes(token)) {
        score += 2;
      }
    }
    for (const token of keyTokens) {
      if (fieldNorm.includes(token)) {
        score += 1;
      }
    }
    if (isColorAttribute && fieldNorm.includes('pattern') && !fieldNorm.includes('color')) {
      score -= 4;
    }
    if (score > bestScore) {
      bestScore = score;
      bestKey = field.key;
    }
  }

  return bestKey ?? taxonomyFields[0]?.key ?? null;
}

function isTextMetaobjectFieldType(typeName: string): boolean {
  const normalized = typeName.trim().toLowerCase();
  return normalized.includes('single_line_text') || normalized.includes('multi_line_text');
}

export function serializeMetaobjectTaxonomyReferenceValue(
  typeName: string,
  taxonomyGid: string,
): string {
  const normalized = typeName.trim().toLowerCase();
  if (normalized.startsWith('list.')) {
    return serializeTaxonomyValueListGids([{ id: taxonomyGid }]);
  }
  return taxonomyGid;
}

/** Cerca valori taxonomy per nome negli attributi già caricati per la categoria prodotto. */
export function searchTaxonomyValuesInCategoryAttributes(
  attributes: readonly {
    readonly key: string;
    readonly name: string;
    readonly values: readonly { readonly id: string; readonly name: string }[];
  }[],
  searchTerms: readonly string[],
): readonly { readonly id: string; readonly name: string }[] {
  const normalizedTerms = searchTerms.map((term) => term.trim().toLowerCase()).filter(Boolean);
  if (normalizedTerms.length === 0) {
    return [];
  }

  const matches: { id: string; name: string }[] = [];
  const seen = new Set<string>();

  for (const attribute of attributes) {
    const attributeTokens = [attribute.key.toLowerCase(), attribute.name.toLowerCase()];
    for (const value of attribute.values) {
      const valueNorm = value.name.toLowerCase();
      const matched = normalizedTerms.some(
        (term) =>
          valueNorm.includes(term) ||
          attributeTokens.some((token) => token.includes(term) || term.includes(token)),
      );
      if (matched && !seen.has(value.id)) {
        seen.add(value.id);
        matches.push({ id: value.id, name: value.name });
      }
    }
  }

  return matches;
}

export function pickPreferredTaxonomyValueId(
  values: readonly { readonly id: string; readonly name: string }[],
  preferredNames: readonly string[] = DEFAULT_SECONDARY_TAXONOMY_VALUE_NAMES,
): string | null {
  for (const preferred of preferredNames) {
    const match = values.find((entry) => entry.name.toLowerCase().includes(preferred));
    if (match) {
      return match.id;
    }
  }
  return values[0]?.id ?? null;
}

/** Risolve un valore taxonomy di default per campi metaobject secondari (es. pattern). */
export function resolveSecondaryTaxonomyGidForMetaobjectField(
  fieldKey: string,
  categoryAttributes: readonly {
    readonly key: string;
    readonly name: string;
    readonly values: readonly { readonly id: string; readonly name: string }[];
  }[],
): string | null {
  const fieldNorm = fieldKey.toLowerCase().replace(/_/g, '-');

  for (const attribute of categoryAttributes) {
    const attributeKeyNorm = attribute.key.toLowerCase();
    const attributeNameNorm = attribute.name.toLowerCase();
    const matchesPattern =
      fieldNorm.includes('pattern') &&
      (attributeKeyNorm.includes('pattern') || attributeNameNorm.includes('pattern'));
    const matchesFabric =
      fieldNorm.includes('fabric') &&
      (attributeKeyNorm.includes('fabric') ||
        attributeNameNorm.includes('fabric') ||
        attributeNameNorm.includes('tessuto'));

    if (matchesPattern || matchesFabric) {
      return pickPreferredTaxonomyValueId(attribute.values);
    }
  }

  return null;
}

/** Costruisce tutti i campi richiesti da uno standard metaobject categoria Shopify. */
export function buildCategoryMetaobjectFieldsPayload(
  fieldDefinitions: readonly MetaobjectTaxonomyFieldCandidate[],
  primaryTaxonomyFieldKey: string,
  taxonomyValue: { readonly id: string; readonly name: string },
  secondaryTaxonomyByFieldKey: ReadonlyMap<string, string>,
): { readonly key: string; readonly value: string }[] {
  const payload: { key: string; value: string }[] = [];

  for (const definition of fieldDefinitions) {
    const typeName = definition.typeName;
    const typeNorm = typeName.trim().toLowerCase();

    if (definition.key === 'label' || isTextMetaobjectFieldType(typeName)) {
      payload.push({ key: definition.key, value: taxonomyValue.name });
      continue;
    }

    if (!isTaxonomyReferenceMetaobjectFieldType(typeName)) {
      continue;
    }

    const taxonomyGid =
      definition.key === primaryTaxonomyFieldKey
        ? taxonomyValue.id
        : secondaryTaxonomyByFieldKey.get(definition.key);

    if (!taxonomyGid) {
      if (definition.required) {
        throw new Error(`Campo taxonomy obbligatorio mancante per metaobject: ${definition.key}`);
      }
      continue;
    }

    payload.push({
      key: definition.key,
      value: serializeMetaobjectTaxonomyReferenceValue(typeName, taxonomyGid),
    });
  }

  if (payload.length === 0) {
    throw new Error(`Nessun campo metaobject compilabile per taxonomy ${primaryTaxonomyFieldKey}`);
  }

  return payload;
}

export function countCategoryMetafieldsWithValues(
  fields: readonly ShopifyCategoryMetafieldValue[],
): number {
  return fields.filter((field) => field.values.length > 0).length;
}

export function categoryMetafieldsSyncErrorMessage(
  localFields: readonly ShopifyCategoryMetafieldValue[],
  remoteFields: readonly ShopifyCategoryMetafieldValue[],
  existingError?: string | null,
): string | null {
  if (existingError?.trim()) {
    return existingError.trim();
  }

  const localWithValues = localFields.filter((field) => field.values.length > 0);
  if (localWithValues.length === 0) {
    return null;
  }

  const remoteKeys = new Set(
    remoteFields.filter((field) => field.values.length > 0).map((field) => field.key),
  );
  const missingKeys = localWithValues
    .filter((field) => !remoteKeys.has(field.key))
    .map((field) => field.key);

  if (missingKeys.length === 0) {
    return null;
  }

  return `Alcuni attributi categoria non sono stati sincronizzati su Shopify (${missingKeys.join(', ')}).`;
}
