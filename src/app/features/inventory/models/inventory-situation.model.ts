import type { EntityId } from '@core/models/common.model';
import type { StockStatus } from '@core/models/inventory-level.model';

/** Riga API GET /inventory/situation (quantità aggregate sulle location). */
export interface InventorySituationApiRow {
  readonly variantId: EntityId;
  readonly productId: EntityId;
  readonly title: string;
  readonly articleCode: string;
  readonly sku: string | null;
  readonly category: string | null;
  readonly supplierId: EntityId | null;
  readonly supplierName: string | null;
  readonly currency: string;
  readonly sellingPriceMinor: number;
  readonly purchasePriceMinor: number | null;
  readonly available: number;
  readonly onHand: number;
  readonly committed: number;
  readonly incoming: number;
  readonly minThreshold: number;
  readonly totalIn: number;
  readonly totalOut: number;
  readonly stockStatus: StockStatus;
}

/** Riga tabella Situazione (display già formattato per le colonne denaro). */
export interface InventorySituationRow {
  readonly variantId: EntityId;
  readonly productId: EntityId;
  readonly title: string;
  /** Cod. articolo VestiFlow con fallback SKU (colonna «Codice»). */
  readonly code: string;
  readonly sku: string;
  readonly category: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly currency: string;
  readonly sellingPriceMinor: number;
  readonly purchasePriceMinor: number | null;
  readonly available: number;
  readonly onHand: number;
  readonly committed: number;
  readonly incoming: number;
  readonly minThreshold: number;
  readonly totalIn: number;
  readonly totalOut: number;
  readonly status: StockStatus;
}

export function mapInventorySituationApiRow(row: InventorySituationApiRow): InventorySituationRow {
  return {
    variantId: row.variantId,
    productId: row.productId,
    title: row.title,
    code: row.articleCode || row.sku || '',
    sku: row.sku ?? '',
    category: row.category ?? '',
    supplierId: row.supplierId ?? '',
    supplierName: row.supplierName ?? '',
    currency: row.currency,
    sellingPriceMinor: row.sellingPriceMinor,
    purchasePriceMinor: row.purchasePriceMinor,
    available: row.available,
    onHand: row.onHand,
    committed: row.committed,
    incoming: row.incoming,
    minThreshold: row.minThreshold,
    totalIn: row.totalIn,
    totalOut: row.totalOut,
    status: row.stockStatus,
  };
}

/** Query lista situazione (paginazione e filtri server-side). */
export interface InventorySituationListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly locationId?: string;
  readonly supplierId?: string;
  readonly category?: string;
  readonly stockStatus?: string;
  readonly search?: string;
}
