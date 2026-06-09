import type { EntityId } from '@core/models/common.model';
import type { StockMovement } from '@core/models/stock-movement.model';
import { AdjustmentDirection, StockMovementType } from '@core/models/stock-movement.model';

// Storico movimenti mock (tenant-aware), coerente con MOCK_INVENTORY_LEVELS e
// con gli utenti auth mock. Copre tutti i tipi: load, unload, transfer,
// adjustment (con motivo), sale, return.

const TENANT_ID: EntityId = 'tenant-demo';

interface MovementSeed {
  readonly id: string;
  readonly type: StockMovement['type'];
  readonly variantId: EntityId;
  readonly sku: string;
  readonly locationId: EntityId;
  readonly quantity: number;
  readonly direction?: StockMovement['direction'];
  readonly reason?: string;
  readonly targetLocationId?: EntityId;
  readonly createdAt: string;
  readonly createdBy: EntityId;
  readonly createdByName: string;
}

const SEEDS: readonly MovementSeed[] = [
  {
    id: 'mov-001',
    type: StockMovementType.Load,
    variantId: 'tee-basic-m-bia',
    sku: 'TEE-BASIC-M-BIA',
    locationId: 'loc-napoli',
    quantity: 40,
    reason: 'Ricezione riassortimento',
    createdAt: '2026-05-28T09:00:00.000Z',
    createdBy: 'user-manager',
    createdByName: 'Marco Conti',
  },
  {
    id: 'mov-002',
    type: StockMovementType.Sale,
    variantId: 'tee-stripe-m-blu',
    sku: 'TEE-STRIPE-M-BLU',
    locationId: 'loc-napoli',
    quantity: 2,
    createdAt: '2026-05-30T16:20:00.000Z',
    createdBy: 'user-clerk',
    createdByName: 'Carla Russo',
  },
  {
    id: 'mov-003',
    type: StockMovementType.Transfer,
    variantId: 'tee-basic-xl-blu',
    sku: 'TEE-BASIC-XL-BLU',
    locationId: 'loc-magazzino',
    targetLocationId: 'loc-milano',
    quantity: 6,
    reason: 'Riequilibrio stock negozio Milano',
    createdAt: '2026-06-02T10:45:00.000Z',
    createdBy: 'user-manager',
    createdByName: 'Marco Conti',
  },
  {
    id: 'mov-004',
    type: StockMovementType.Adjustment,
    variantId: 'tee-basic-s-ner',
    sku: 'TEE-BASIC-S-NER',
    locationId: 'loc-napoli',
    quantity: 1,
    direction: AdjustmentDirection.Decrease,
    reason: 'Capo danneggiato in negozio',
    createdAt: '2026-06-04T18:05:00.000Z',
    createdBy: 'user-owner',
    createdByName: 'Olivia Bianchi',
  },
  {
    id: 'mov-005',
    type: StockMovementType.Return,
    variantId: 'jeans-slim-m-blu',
    sku: 'JEANS-SLIM-M-BLU',
    locationId: 'loc-napoli',
    quantity: 1,
    reason: 'Reso cliente (taglia errata)',
    createdAt: '2026-06-06T11:30:00.000Z',
    createdBy: 'user-clerk',
    createdByName: 'Carla Russo',
  },
  {
    id: 'mov-006',
    type: StockMovementType.Unload,
    variantId: 'tee-stripe-l-ros',
    sku: 'TEE-STRIPE-L-ROS',
    locationId: 'loc-napoli',
    quantity: 3,
    reason: 'Merce per shooting fotografico',
    createdAt: '2026-06-08T08:50:00.000Z',
    createdBy: 'user-manager',
    createdByName: 'Marco Conti',
  },
];

/** Movimenti mock; il service li ordina per data discendente alla lettura. */
export const MOCK_STOCK_MOVEMENTS: readonly StockMovement[] = SEEDS.map((seed) => ({
  tenantId: TENANT_ID,
  ...seed,
}));
