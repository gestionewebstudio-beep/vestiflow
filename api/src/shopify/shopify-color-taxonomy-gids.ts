import { SHOPIFY_COLOR_PATTERN_METAFIELD_KEY } from './shopify-category-metafields.util';

/** Alias IT/EN → chiave taxonomy globale Shopify (values.yml, friendly_id color__*). */
const COLOR_TAXONOMY_KEY_ALIASES: Readonly<Record<string, string>> = {
  blu: 'blue',
  nero: 'black',
  bianco: 'white',
  rosso: 'red',
  verde: 'green',
  giallo: 'yellow',
  rosa: 'pink',
  viola: 'purple',
  grigio: 'gray',
  grey: 'gray',
  marrone: 'brown',
  arancione: 'orange',
  oro: 'gold',
  argento: 'silver',
  rosa_oro: 'rose_gold',
  rosegold: 'rose_gold',
  multicolore: 'multicolor',
  multi: 'multicolor',
};

/**
 * GID taxonomy colore globali Shopify (product-taxonomy data/values.yml).
 * Il metaobject color-pattern accetta solo valori dell'attributo taxonomy "color".
 */
const SHOPIFY_GLOBAL_COLOR_TAXONOMY_GIDS: Readonly<Record<string, string>> = {
  black: 'gid://shopify/TaxonomyValue/1',
  blue: 'gid://shopify/TaxonomyValue/2',
  white: 'gid://shopify/TaxonomyValue/3',
  gold: 'gid://shopify/TaxonomyValue/4',
  silver: 'gid://shopify/TaxonomyValue/5',
  beige: 'gid://shopify/TaxonomyValue/6',
  brown: 'gid://shopify/TaxonomyValue/7',
  gray: 'gid://shopify/TaxonomyValue/8',
  green: 'gid://shopify/TaxonomyValue/9',
  orange: 'gid://shopify/TaxonomyValue/10',
  pink: 'gid://shopify/TaxonomyValue/11',
  purple: 'gid://shopify/TaxonomyValue/12',
  red: 'gid://shopify/TaxonomyValue/13',
  yellow: 'gid://shopify/TaxonomyValue/14',
  navy: 'gid://shopify/TaxonomyValue/15',
  rose_gold: 'gid://shopify/TaxonomyValue/16',
  clear: 'gid://shopify/TaxonomyValue/17',
  bronze: 'gid://shopify/TaxonomyValue/657',
  multicolor: 'gid://shopify/TaxonomyValue/2865',
};

function normalizeColorTaxonomyKey(colorName: string): string {
  const normalized = colorName
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  return COLOR_TAXONOMY_KEY_ALIASES[normalized] ?? normalized;
}

/** Risolve il GID taxonomy colore globale per metaobject shopify--color-pattern. */
export function resolveGlobalColorTaxonomyGid(
  colorName: string,
  fallbackGid?: string,
  categoryAttributes?: readonly {
    readonly key: string;
    readonly values: readonly { readonly id: string; readonly name: string }[];
  }[],
): string {
  const taxonomyKey = normalizeColorTaxonomyKey(colorName);
  const fromGlobalMap = SHOPIFY_GLOBAL_COLOR_TAXONOMY_GIDS[taxonomyKey];
  if (fromGlobalMap) {
    return fromGlobalMap;
  }

  const colorAttribute = categoryAttributes?.find(
    (attribute) => attribute.key === SHOPIFY_COLOR_PATTERN_METAFIELD_KEY,
  );
  if (colorAttribute) {
    const match = colorAttribute.values.find(
      (value) => normalizeColorTaxonomyKey(value.name) === taxonomyKey,
    );
    if (match?.id.includes('/TaxonomyValue/')) {
      return match.id;
    }
  }

  if (fallbackGid?.includes('/TaxonomyValue/')) {
    return fallbackGid;
  }

  throw new Error(`GID colore taxonomy non risolto per "${colorName}"`);
}
