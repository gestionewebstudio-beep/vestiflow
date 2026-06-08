// Helper puri (framework-agnostici) per le giacenze. Unica regola di stock
// status / low-stock: basata su `available` vs `minThreshold`.

import type { InventoryLevel } from '../models/inventory-level.model';
import { StockStatus } from '../models/inventory-level.model';

/** Forma minima per valutare lo stock status (sottoinsieme di InventoryLevel). */
interface StockEvaluable {
  readonly available: number;
  readonly minThreshold: number;
}

/**
 * Regola unica di stock status:
 * - `available <= 0`            -> Empty (copre anche l'oversell negativo)
 * - `available <= minThreshold` -> Low
 * - altrimenti                  -> Ok
 */
export function stockStatusOf(level: StockEvaluable): StockStatus {
  if (level.available <= 0) {
    return StockStatus.Empty;
  }
  if (level.available <= level.minThreshold) {
    return StockStatus.Low;
  }
  return StockStatus.Ok;
}

/** Scorciatoia coerente con la regola unica: true se Low o Empty. */
export function isLowStock(level: StockEvaluable): boolean {
  return stockStatusOf(level) !== StockStatus.Ok;
}

/** Somma del disponibile su più giacenze (es. una variante su tutte le location). */
export function totalAvailable(levels: readonly InventoryLevel[]): number {
  return levels.reduce((sum, level) => sum + level.available, 0);
}

/** Quantità aggregate (somma stato per stato) su un insieme di giacenze. */
export interface AggregatedQuantities {
  readonly onHand: number;
  readonly available: number;
  readonly committed: number;
  readonly incoming: number;
  readonly reserved: number;
}

/**
 * Somma stato-per-stato di più giacenze. Pura aggregazione: lo stock status
 * resta una valutazione per-location (le soglie minThreshold differiscono), qui
 * si sommano solo le quantità.
 */
export function sumInventoryQuantities(levels: readonly InventoryLevel[]): AggregatedQuantities {
  return levels.reduce<AggregatedQuantities>(
    (acc, level) => ({
      onHand: acc.onHand + level.onHand,
      available: acc.available + level.available,
      committed: acc.committed + level.committed,
      incoming: acc.incoming + level.incoming,
      reserved: acc.reserved + level.reserved,
    }),
    { onHand: 0, available: 0, committed: 0, incoming: 0, reserved: 0 },
  );
}
