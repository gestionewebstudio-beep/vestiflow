import { describe, expect, it } from 'vitest';

import { resolveGlobalColorTaxonomyGid } from './shopify-color-taxonomy-gids';

describe('resolveGlobalColorTaxonomyGid', () => {
  it('risolve Blue al GID taxonomy globale', () => {
    expect(resolveGlobalColorTaxonomyGid('Blue')).toBe('gid://shopify/TaxonomyValue/2');
  });

  it('risolve alias italiano Blu', () => {
    expect(resolveGlobalColorTaxonomyGid('Blu')).toBe('gid://shopify/TaxonomyValue/2');
  });

  it('risolve Gold e Bronze', () => {
    expect(resolveGlobalColorTaxonomyGid('Gold')).toBe('gid://shopify/TaxonomyValue/4');
    expect(resolveGlobalColorTaxonomyGid('Bronze')).toBe('gid://shopify/TaxonomyValue/657');
  });

  it('usa fallback TaxonomyValue se il nome non è mappato', () => {
    expect(resolveGlobalColorTaxonomyGid('Custom', 'gid://shopify/TaxonomyValue/99999')).toBe(
      'gid://shopify/TaxonomyValue/99999',
    );
  });
});
