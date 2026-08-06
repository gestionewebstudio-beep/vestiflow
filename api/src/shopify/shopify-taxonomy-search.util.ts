import type { ShopifyTaxonomyCategory } from './shopify-graphql.client';

export interface LocalizedTaxonomyCategoryEntry {
  readonly fullName: string;
  readonly name: string;
  readonly isLeaf: boolean;
}

export function normalizeTaxonomySearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Indica quali fullName hanno figli nella taxonomy (non selezionabili come foglia). */
export function buildTaxonomyParentFullNames(
  categoryFullNames: readonly string[],
): ReadonlySet<string> {
  const parents = new Set<string>();
  for (const fullName of categoryFullNames) {
    const segments = fullName.split(' > ').map((segment) => segment.trim());
    for (let index = 0; index < segments.length - 1; index += 1) {
      parents.add(segments.slice(0, index + 1).join(' > '));
    }
  }
  return parents;
}

export function toLocalizedTaxonomyCategoryEntry(
  fullName: string,
  parentFullNames: ReadonlySet<string>,
): LocalizedTaxonomyCategoryEntry {
  const segments = fullName.split(' > ').map((segment) => segment.trim());
  return {
    fullName,
    name: segments.at(-1) ?? fullName,
    isLeaf: !parentFullNames.has(fullName),
  };
}

function searchScore(nameNorm: string, fullNorm: string, queryNorm: string): number {
  if (nameNorm === queryNorm) {
    return 120;
  }
  if (nameNorm.startsWith(queryNorm)) {
    return 100;
  }
  if (nameNorm.includes(queryNorm)) {
    return 80;
  }
  if (fullNorm.includes(queryNorm)) {
    return 60;
  }
  return 0;
}

/** Ricerca categorie sulla taxonomy localizzata (IT), indipendente dalla lingua Shopify API. */
export function searchLocalizedTaxonomyCategories(
  categoriesByGid: ReadonlyMap<string, LocalizedTaxonomyCategoryEntry>,
  query: string,
  limit = 50,
): ShopifyTaxonomyCategory[] {
  const queryNorm = normalizeTaxonomySearchText(query);
  if (!queryNorm) {
    return [];
  }

  const matches: {
    readonly id: string;
    readonly entry: LocalizedTaxonomyCategoryEntry;
    readonly score: number;
  }[] = [];

  for (const [id, entry] of categoriesByGid) {
    const nameNorm = normalizeTaxonomySearchText(entry.name);
    const fullNorm = normalizeTaxonomySearchText(entry.fullName);
    const score = searchScore(nameNorm, fullNorm, queryNorm);
    if (score === 0) {
      continue;
    }
    matches.push({ id, entry, score });
  }

  return matches
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.entry.fullName.localeCompare(right.entry.fullName, 'it');
    })
    .slice(0, limit)
    .map(({ id, entry }) => ({
      id,
      name: entry.name,
      fullName: entry.fullName,
      isLeaf: entry.isLeaf,
    }));
}
