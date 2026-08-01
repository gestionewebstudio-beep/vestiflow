import type { VariantSummary } from '../models/variant-summary.model';

/** Unisce varianti già selezionate con i risultati di ricerca (dedup per variantId). */
export function mergeVariantSummaries(
  pinned: readonly VariantSummary[],
  searched: readonly VariantSummary[],
): readonly VariantSummary[] {
  const byId = new Map<string, VariantSummary>();
  for (const variant of pinned) {
    byId.set(variant.variantId, variant);
  }
  for (const variant of searched) {
    byId.set(variant.variantId, variant);
  }
  return [...byId.values()];
}
