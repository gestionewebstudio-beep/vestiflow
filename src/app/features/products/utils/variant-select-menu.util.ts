import type { VariantSummary } from '../models/variant-summary.model';

import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/** Opzioni select-menu per varianti: titolo leggibile + SKU su seconda riga. */
export function toVariantSelectMenuOptions(
  variants: readonly VariantSummary[],
): readonly SelectMenuOption[] {
  return variants.map((variant) => ({
    value: variant.variantId,
    label: variant.title,
    detail: variant.sku,
  }));
}
