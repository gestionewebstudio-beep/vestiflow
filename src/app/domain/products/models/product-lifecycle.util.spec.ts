import { describe, expect, it } from 'vitest';

import { ProductStatus } from '@core/models/product.model';
import { VariantLifecycleStatus } from '@core/models/product-variant.model';

import {
  TRASH_LABEL,
  isInTrash,
  isProductInactive,
  variantLifecycleLabel,
  variantLifecycleTone,
} from './product-lifecycle.util';

describe('product-lifecycle.util', () => {
  it('«Nel cestino» è deciso da deletedAt, non dallo stato', () => {
    expect(isInTrash({ deletedAt: '2026-09-03T10:00:00.000Z' })).toBe(true);
    expect(isInTrash({ deletedAt: null })).toBe(false);
    expect(isInTrash({})).toBe(false);
    expect(TRASH_LABEL).toBe('Nel cestino');
  });

  it('«Non attivo» è solo archived: la bozza non lo è', () => {
    expect(isProductInactive({ status: ProductStatus.Archived })).toBe(true);
    expect(isProductInactive({ status: ProductStatus.Draft })).toBe(false);
    expect(isProductInactive({ status: ProductStatus.Active })).toBe(false);
  });

  it('la variante dice «Attiva» / «Non attiva», mai «Fuori uso»', () => {
    expect(variantLifecycleLabel(VariantLifecycleStatus.Active)).toBe('Attiva');
    expect(variantLifecycleLabel(VariantLifecycleStatus.Inactive)).toBe('Non attiva');
    expect(variantLifecycleTone(VariantLifecycleStatus.Inactive)).toBe('warning');
  });
});
