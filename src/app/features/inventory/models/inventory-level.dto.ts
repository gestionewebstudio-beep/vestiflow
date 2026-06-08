import type { EntityId } from '@core/models/common.model';

// DTO di lettura giacenza (backend NestJS + PostgreSQL/Supabase). Le quantità
// rispecchiano il sottoinsieme minimo dei named states Shopify; sono interi e
// stored (nessuna invariante rigida tra loro, vedi InventoryLevel del dominio).

/** Giacenza per variante × location restituita dal backend. */
export interface InventoryLevelDto {
  readonly id: EntityId;
  readonly variantId: EntityId;
  readonly locationId: EntityId;
  readonly onHand: number;
  readonly available: number;
  readonly committed: number;
  readonly incoming: number;
  readonly reserved: number;
  readonly minThreshold: number;
}
