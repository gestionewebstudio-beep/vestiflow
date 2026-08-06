import { describe, expect, it } from 'vitest';

import {
  buildTaxonomyParentFullNames,
  normalizeTaxonomySearchText,
  searchLocalizedTaxonomyCategories,
  toLocalizedTaxonomyCategoryEntry,
} from './shopify-taxonomy-search.util';

describe('normalizeTaxonomySearchText', () => {
  it('normalizza maiuscole e accenti', () => {
    expect(normalizeTaxonomySearchText('  Abbigliamento  ')).toBe('abbigliamento');
  });
});

describe('searchLocalizedTaxonomyCategories', () => {
  const parentFullNames = buildTaxonomyParentFullNames([
    'Abbigliamento e accessori',
    'Abbigliamento e accessori > Abbigliamento',
    'Abbigliamento e accessori > Abbigliamento > Indumenti superiori > T-shirt',
  ]);

  const categories = new Map([
    [
      'gid://shopify/TaxonomyCategory/aa',
      toLocalizedTaxonomyCategoryEntry('Abbigliamento e accessori', parentFullNames),
    ],
    [
      'gid://shopify/TaxonomyCategory/aa-1-13-8',
      toLocalizedTaxonomyCategoryEntry(
        'Abbigliamento e accessori > Abbigliamento > Indumenti superiori > T-shirt',
        parentFullNames,
      ),
    ],
  ]);

  it('trova Abbigliamento con prefisso abb', () => {
    const results = searchLocalizedTaxonomyCategories(categories, 'abb');
    expect(results.some((entry) => entry.name === 'Abbigliamento e accessori')).toBe(true);
  });

  it('trova T-shirt con prefisso t-sh', () => {
    const results = searchLocalizedTaxonomyCategories(categories, 't-sh');
    expect(results.some((entry) => entry.name === 'T-shirt')).toBe(true);
  });

  it('marca le categorie con figli come non foglia', () => {
    const results = searchLocalizedTaxonomyCategories(categories, 'abb');
    const root = results.find((entry) => entry.name === 'Abbigliamento e accessori');
    expect(root?.isLeaf).toBe(false);
  });
});
