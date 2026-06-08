import type { Address, EntityId, IsoDateString } from '@core/models/common.model';
import type { ShopifyLink } from '@core/models/shopify.model';

// DTO di lettura location (backend NestJS + PostgreSQL/Supabase). Forma "wire":
// il backend popola tenantId e i timestamp. Nessun token/segreto Shopify, solo
// identificativi pubblici opzionali.

/** Location restituita dal backend. */
export interface LocationDto {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly name: string;
  readonly code?: string;
  readonly address?: Address;
  readonly isActive: boolean;
  /** Store servito (opzionale: un magazzino può non averne). */
  readonly storeId?: EntityId;
  readonly shopify?: ShopifyLink;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
}
