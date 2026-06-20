/** Attributi taxonomy Shopify il cui metafield key/name identifica il colore. */
const COLOR_ATTRIBUTE_KEYS = new Set(['color', 'colour', 'color-pattern']);
const COLOR_ATTRIBUTE_NAMES = new Set(['color', 'colore', 'colour']);

/** Valori standard taxonomy Shopify (EN) → CSS color / gradient. */
const SHOPIFY_TAXONOMY_COLOR_MAP: Readonly<Record<string, string>> = {
  beige: '#f5f5dc',
  black: '#000000',
  blue: '#0000ff',
  bronze: '#cd7f32',
  brown: '#8b4513',
  burgundy: '#800020',
  camo: '#78866b',
  clear: 'transparent',
  coral: '#ff7f50',
  cream: '#fffdd0',
  gold: '#ffd700',
  gray: '#808080',
  grey: '#808080',
  green: '#008000',
  khaki: '#c3b091',
  maroon: '#800000',
  mint: '#98ff98',
  multicolor: 'conic-gradient(from 0deg, #e53935, #fdd835, #43a047, #1e88e5, #8e24aa, #e53935)',
  multi: 'conic-gradient(from 0deg, #e53935, #fdd835, #43a047, #1e88e5, #8e24aa, #e53935)',
  navy: '#000080',
  olive: '#808000',
  orange: '#ffa500',
  pink: '#ffc0cb',
  purple: '#800080',
  red: '#ff0000',
  silver: '#c0c0c0',
  tan: '#d2b48c',
  teal: '#008080',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  white: '#ffffff',
  yellow: '#ffff00',
  // Localizzazioni IT comuni (taxonomy può restituire label tradotte).
  bianco: '#ffffff',
  nero: '#000000',
  blu: '#0000ff',
  rosso: '#ff0000',
  verde: '#008000',
  giallo: '#ffff00',
  rosa: '#ffc0cb',
  viola: '#800080',
  grigio: '#808080',
  marrone: '#8b4513',
  arancione: '#ffa500',
};

export function isShopifyColorCategoryAttribute(attribute: {
  readonly key: string;
  readonly name: string;
}): boolean {
  const key = attribute.key.trim().toLowerCase();
  const name = attribute.name.trim().toLowerCase();
  return COLOR_ATTRIBUTE_KEYS.has(key) || COLOR_ATTRIBUTE_NAMES.has(name);
}

export function findShopifyColorCategoryMetafield(
  metafields: readonly {
    readonly key: string;
    readonly attributeName: string;
    readonly values: readonly { readonly name: string }[];
  }[],
): { readonly attributeName: string; readonly valueLabel: string } | null {
  for (const field of metafields) {
    if (!isShopifyColorCategoryAttribute({ key: field.key, name: field.attributeName })) {
      continue;
    }
    const valueLabel = field.values
      .map((value) => value.name)
      .join(', ')
      .trim();
    if (!valueLabel) {
      continue;
    }
    return { attributeName: field.attributeName, valueLabel };
  }
  return null;
}

function normalizeColorLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '');
}

/** Restituisce un valore CSS per lo swatch, o undefined se il nome non è mappabile. */
export function shopifyTaxonomyColorSwatch(label: string): string | undefined {
  const normalized = normalizeColorLabel(label);
  if (!normalized) {
    return undefined;
  }
  return SHOPIFY_TAXONOMY_COLOR_MAP[normalized];
}
