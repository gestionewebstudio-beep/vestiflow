import type { EntityId } from '@core/models/common.model';

/** Giacenza pronta per la dashboard (title già composto dal backend). */
export interface DashboardLevel {
  readonly variantId: EntityId;
  readonly locationId: EntityId;
  readonly sku: string;
  readonly title: string;
  readonly available: number;
  readonly minThreshold: number;
  readonly locationName: string;
}

/** Location minima per i filtri/etichette della dashboard. */
export interface DashboardLocation {
  readonly id: EntityId;
  readonly name: string;
}

/** Payload aggregato della dashboard (GET /dashboard/summary). */
export interface DashboardSummary {
  readonly productCount: number;
  readonly incomingSupplierOrders: number;
  /** Somma unità disponibili (per location attiva o intero tenant). */
  readonly availableUnits: number;
  /** Righe con giacenza <= soglia minima (stesso scope di availableUnits). */
  readonly lowStockCount: number;
  readonly levels: readonly DashboardLevel[];
  readonly locations: readonly DashboardLocation[];
}
