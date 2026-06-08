import type { EntityId, IsoDateString } from '@core/models/common.model';
import type { InventoryLevel } from '@core/models/inventory-level.model';
import type { Location } from '@core/models/location.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';

// Dataset mock inventario (tenant-aware), allineato a varianti e store demo.
// NB temporaneo: il mock degli Store non esiste ancora; `storeId` punta a id
// convenzionali ('store-napoli'/'store-milano') che il futuro mock Store dovrà
// rispettare. Il Magazzino Centrale è una location senza store associato.

const TENANT_ID: EntityId = 'tenant-demo';
const CREATED_AT: IsoDateString = '2025-09-01T08:00:00.000Z';
const UPDATED_AT: IsoDateString = '2026-05-20T10:00:00.000Z';

const LOC_NAPOLI: EntityId = 'loc-napoli';
const LOC_MILANO: EntityId = 'loc-milano';
const LOC_WAREHOUSE: EntityId = 'loc-magazzino';

/** Location mock: due negozi (con store) + un magazzino centrale (senza store). */
export const MOCK_LOCATIONS: readonly Location[] = [
  {
    id: LOC_NAPOLI,
    tenantId: TENANT_ID,
    name: 'Negozio Napoli',
    code: 'NA-01',
    isActive: true,
    storeId: 'store-napoli',
    shopify: { status: ShopifySyncStatus.Synced, shopifyId: 'gid://shopify/Location/1001' },
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  },
  {
    id: LOC_MILANO,
    tenantId: TENANT_ID,
    name: 'Negozio Milano',
    code: 'MI-01',
    isActive: true,
    storeId: 'store-milano',
    shopify: { status: ShopifySyncStatus.NotConnected },
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  },
  {
    id: LOC_WAREHOUSE,
    tenantId: TENANT_ID,
    name: 'Magazzino Centrale',
    code: 'WH-01',
    isActive: true,
    // Nessuno storeId: location di solo stock, non un punto vendita.
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  },
];

interface LevelQuantities {
  readonly onHand: number;
  readonly available: number;
  readonly committed?: number;
  readonly incoming?: number;
  readonly reserved?: number;
  readonly minThreshold?: number;
}

// Builder esplicito: i valori "significativi" del caso restano leggibili, gli
// stati non rilevanti default a 0 (minThreshold default 5).
function lvl(variantId: EntityId, locationId: EntityId, q: LevelQuantities): InventoryLevel {
  return {
    id: `inv-${locationId}-${variantId}`,
    variantId,
    locationId,
    onHand: q.onHand,
    available: q.available,
    committed: q.committed ?? 0,
    incoming: q.incoming ?? 0,
    reserved: q.reserved ?? 0,
    minThreshold: q.minThreshold ?? 5,
  };
}

/**
 * Giacenze mock per variante × location. Casi coperti esplicitamente:
 * - normale, low-stock, zero stock, oversell (available < 0), incoming presente.
 * Più alcune righe multi-location per mostrare la distribuzione cross-store.
 */
export const MOCK_INVENTORY_LEVELS: readonly InventoryLevel[] = [
  // ── Negozio Napoli: i cinque casi richiesti ────────────────────────────────
  // normale
  lvl('tee-basic-m-bia', LOC_NAPOLI, { onHand: 40, available: 40 }),
  // low-stock (available <= minThreshold, ma > 0)
  lvl('tee-basic-s-ner', LOC_NAPOLI, { onHand: 5, available: 3, committed: 2 }),
  // zero stock
  lvl('tee-basic-xl-blu', LOC_NAPOLI, { onHand: 0, available: 0 }),
  // oversell (available negativo: venduto oltre il disponibile)
  lvl('tee-stripe-m-blu', LOC_NAPOLI, { onHand: 1, available: -2, committed: 3 }),
  // incoming presente (riassortimento in arrivo)
  lvl('tee-stripe-l-ros', LOC_NAPOLI, { onHand: 12, available: 12, incoming: 30 }),
  // normale con committed + reserved (realismo)
  lvl('jeans-slim-m-blu', LOC_NAPOLI, {
    onHand: 22,
    available: 18,
    committed: 2,
    reserved: 2,
    minThreshold: 4,
  }),

  // ── Negozio Milano: stesse varianti, distribuzione diversa ─────────────────
  lvl('tee-basic-m-bia', LOC_MILANO, { onHand: 15, available: 15 }),
  // Esaurita a Napoli ma disponibile a Milano (storia cross-location)
  lvl('tee-basic-xl-blu', LOC_MILANO, { onHand: 6, available: 6 }),
  lvl('tee-stripe-m-blu', LOC_MILANO, { onHand: 4, available: 4 }),

  // ── Magazzino Centrale: backstock + incoming ───────────────────────────────
  lvl('tee-basic-xl-blu', LOC_WAREHOUSE, { onHand: 50, available: 50, minThreshold: 10 }),
  lvl('tee-stripe-l-ros', LOC_WAREHOUSE, {
    onHand: 0,
    available: 0,
    incoming: 60,
    minThreshold: 10,
  }),
  lvl('jeans-slim-m-blu', LOC_WAREHOUSE, { onHand: 100, available: 100, minThreshold: 10 }),
];
