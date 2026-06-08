import type { Address, EntityId, TenantScoped, Timestamped } from './common.model';
import type { ShopifyLink } from './shopify.model';

/**
 * Location = luogo fisico/logico che "porta" l'inventario (semantica Shopify:
 * lo stock vive nelle location, non nel canale commerciale). Distinta dallo
 * `Store` (entità POS/commerciale): nel caso comune 1 store ↔ 1 location, ma un
 * magazzino può non avere store associato. L'inventario per variante vive in
 * `InventoryLevel` (per coppia variante × location).
 */
export interface Location extends TenantScoped, Timestamped {
  readonly id: EntityId;
  readonly name: string;
  /** Codice breve identificativo (es. 'NA-WH-01'). */
  readonly code?: string;
  readonly address?: Address;
  readonly isActive: boolean;
  /** Store servito da questa location (opzionale: un magazzino può non averne). */
  readonly storeId?: EntityId;
  /** Collegamento alla Shopify Location (id pubblico, nessun segreto). */
  readonly shopify?: ShopifyLink;
}
