import type { StockMovementType } from '@core/models/stock-movement.model';

export const DEFAULT_INVENTORY_PAGE_SIZE = 20;
export const INVENTORY_PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50];

/** Query lista giacenze (paginazione e filtri server-side). */
export interface InventoryLevelsListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly locationId?: string;
  /** Ricerca su SKU, barcode o nome prodotto. */
  readonly search?: string;
  readonly variantId?: string;
  readonly lowStockOnly?: boolean;
}

/** Query lista movimenti (paginazione e filtri server-side). */
export interface StockMovementsListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly locationId?: string;
  readonly search?: string;
  readonly type?: StockMovementType;
  readonly variantId?: string;
  readonly from?: string;
  readonly to?: string;
}
