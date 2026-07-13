/**
 * Quantità vendibile da pubblicare su Shopify (policy post-audit §4).
 *
 * API utilizzata: REST `POST /inventory_levels/set.json` — campo `available`
 * (quantità vendibile del canale, NON giacenza fisica `on_hand`).
 *
 * Formula: shopifyPublishableAvailable = max(0, onHand - committed - safetyStock)
 * VestiFlow conserva internamente Giacenza/Impegnata/Disponibile senza clamp.
 */
export function computeShopifyPublishableAvailable(
  onHand: number,
  committed: number,
  safetyStock = 0,
): number {
  const internalAvailable = onHand - committed;
  return Math.max(0, internalAvailable - safetyStock);
}
