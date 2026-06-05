import type { EntityId } from './common.model';

/**
 * Giacenza di una variante in uno specifico negozio.
 * Lo stock vive QUI, mai come campo su Product/ProductVariant (regole-gestionale).
 */
export interface InventoryLevel {
  readonly id: EntityId;
  readonly variantId: EntityId;
  readonly storeId: EntityId;
  readonly quantity: number;
  /** Soglia minima per segnalare lo stock basso. */
  readonly minThreshold: number;
}

export const StockStatus = {
  Ok: 'ok',
  Low: 'low',
  Empty: 'empty',
} as const;
export type StockStatus = (typeof StockStatus)[keyof typeof StockStatus];
