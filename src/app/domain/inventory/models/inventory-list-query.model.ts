import type { MovementOrigin, StockMovementType } from '@core/models/stock-movement.model';

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
  /** Ricerca su SKU, barcode, nome prodotto o codice articolo. */
  readonly search?: string;
  readonly type?: StockMovementType;
  readonly origin?: MovementOrigin;
  readonly variantId?: string;
  /** Cliente o fornitore del documento origine del movimento. */
  readonly partyId?: string;
  /** Operatore: snapshot `createdByName` del movimento (match esatto). */
  readonly createdBy?: string;
  readonly from?: string;
  readonly to?: string;
}
