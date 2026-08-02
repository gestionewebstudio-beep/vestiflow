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

/**
 * Variante di una riga documento fra quelle note al form: prima le già
 * selezionate, poi i risultati di ricerca. Lo facevano cinque form con lo
 * stesso `merge(...).find(...)` copiato.
 */
export function findVariantSummaryById(
  variantId: string | null | undefined,
  pinned: readonly VariantSummary[],
  searched: readonly VariantSummary[],
): VariantSummary | null {
  if (!variantId) {
    return null;
  }
  return (
    mergeVariantSummaries(pinned, searched).find((summary) => summary.variantId === variantId) ??
    null
  );
}
